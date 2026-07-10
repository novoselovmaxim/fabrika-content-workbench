# Инструкция 6 — Адаптеры платформ для аналитики

## Контекст

Проект поддерживает и будет поддерживать несколько платформ на пост (Instagram, Telegram, VK, Дзен, YouTube, позже LinkedIn, Facebook, TikTok и другие). Без единого интерфейса сбора метрик каждая новая платформа означает переписывание `analyticsIngest.ts`, `post_analytics`, разметки UI — и так на каждую соцсеть заново. Это не нужно.

Принцип: всё, что построено в Инструкции 5 (`post_analytics`, `funnel_analytics`, `campaign_goals`, `analytics_insights`, `insights.ts`) уже платформонезависимо — работает через `postItems.platformId` и канонический `metricName`/`metricValue` в `analytics_snapshots`. Платформозависим только один слой — сбор и нормализация сырых данных. Эта инструкция описывает именно его: общий интерфейс адаптера, приведение уже существующих интеграций (`services/instagram.ts`, `services/vk.ts`, `services/zen.ts`) к этому интерфейсу, и добавление двух новых — Telegram и YouTube, — которые дают лучший результат при наименьших усилиях.

Выполняется после Инструкции 5 (адаптер для Instagram и таблицы `post_analytics`/`competitor_analytics` там уже должны существовать) — здесь Instagram просто переносится под общий интерфейс, без изменения своей логики.

---

## Раздел 1 — Общий интерфейс адаптера

Новый файл: `server/src/services/platformAdapters/types.ts`

```ts
import type { MetricName } from "../../constants/metrics.js";

export interface PlatformMetrics {
  metrics: Partial<Record<MetricName, number>>;
  externalId?: string; // id медиа/поста на стороне платформы
  postedAt?: string;
  caption?: string;
}

export interface PlatformAdapter {
  platformType: string; // должно совпадать со значением platforms.type в БД

  // Какие метрики в принципе может отдать платформа — используется в UI,
  // чтобы не показывать бейджи/поля для метрик, которых у платформы нет.
  supportedMetrics: {
    own: MetricName[];
    competitor: MetricName[];
  };

  // Метрики для СВОЕГО опубликованного поста (post_items.publishedMediaId известен)
  fetchOwnPostMetrics(externalMediaId: string, config: PlatformAuthConfig): Promise<PlatformMetrics | null>;

  // Метрики последних постов ЧУЖОГО (конкурентного) публичного аккаунта/канала
  fetchCompetitorMetrics(identifier: string, limit: number, config: PlatformAuthConfig): Promise<PlatformMetrics[]>;
}

export interface PlatformAuthConfig {
  // Специфичные для платформы креды — токен VK, прокси-аккаунт Instagram, токен YouTube API и т.д.
  // Каждый адаптер сам знает, какие поля ему нужны из этого объекта.
  [key: string]: string | undefined;
}
```

Новый файл: `server/src/services/platformAdapters/registry.ts`

```ts
import type { PlatformAdapter } from "./types.js";
import { instagramAdapter } from "./instagramAdapter.js";
import { vkAdapter } from "./vkAdapter.js";
import { zenAdapter } from "./zenAdapter.js";
import { telegramAdapter } from "./telegramAdapter.js";
import { youtubeAdapter } from "./youtubeAdapter.js";

const registry: Record<string, PlatformAdapter> = {
  instagram: instagramAdapter,
  vk: vkAdapter,
  zen: zenAdapter,
  telegram: telegramAdapter,
  youtube: youtubeAdapter,
};

export function getAdapter(platformType: string): PlatformAdapter | null {
  return registry[platformType] || null;
}
```

`analyticsIngest.ts` (из Инструкции 5) переписывается так, чтобы не знать про конкретные платформы:

```ts
export async function ingestOwnPostMetrics(postItemId: string): Promise<void> {
  const post = db.select().from(postItems).where(eq(postItems.id, postItemId)).get();
  if (!post?.platformId || !post.publishedMediaId) return;

  const platform = db.select().from(platforms).where(eq(platforms.id, post.platformId)).get();
  if (!platform) return;

  const adapter = getAdapter(platform.type);
  if (!adapter) {
    // платформа без адаптера (например, только что добавлена в UI, но код ещё не написан) —
    // не падать, просто ничего не собирать
    return;
  }

  const result = await adapter.fetchOwnPostMetrics(post.publishedMediaId, resolveAuthConfig(platform));
  if (!result) return; // логин/токен не настроен или временная ошибка — не аварийно

  const now = new Date().toISOString();
  for (const [metricName, metricValue] of Object.entries(result.metrics)) {
    db.insert(analyticsSnapshots).values({
      id: uuid(),
      postItemId,
      metricName,
      metricValue,
      metricPeriod: "lifetime",
      snapshotDate: now,
    }).run();
  }

  await recomputePostAnalytics(postItemId);
}
```

`resolveAuthConfig(platform)` — отдельная маленькая функция, которая достаёт нужные креды из `.env`/`settings`/`connectedPlatforms` в зависимости от `platform.type` (для Instagram — `IG_PROXY_USERNAME`/`PASSWORD`, для VK — токен из `platforms.config`, для YouTube — общий на всё приложение API-ключ из `.env`, и т.д.). Это единственное место, где нужно перечислять платформы по имени — сама бизнес-логика (`ingestOwnPostMetrics`) этого не делает.

---

## Раздел 2 — Приведение существующих интеграций к интерфейсу

### 2.1 Instagram

Новый файл `server/src/services/platformAdapters/instagramAdapter.ts` — тонкая обёртка вокруг уже существующего `runInstagramScript` (вынесенного в `instagramCli.ts` по Инструкции 5) и `services/instagram.ts` (публичный скрейпер конкурентов).

```ts
export const instagramAdapter: PlatformAdapter = {
  platformType: "instagram",
  supportedMetrics: {
    own: ["reach", "impressions", "likes", "comments", "saves", "engagement_rate"],
    competitor: ["likes", "comments"],
  },
  async fetchOwnPostMetrics(externalMediaId, config) {
    const result = await runInstagramScript(["insights", externalMediaId]);
    if (!result?.valid) return null;
    return {
      metrics: {
        reach: result.reach,
        impressions: result.impressions,
        likes: result.likes,
        comments: result.comments,
        saves: result.saves,
      },
      externalId: externalMediaId,
    };
  },
  async fetchCompetitorMetrics(identifier, limit) {
    const result = await runInstagramScript(["fetch", identifier, String(limit)]);
    if (!result?.valid || !result.posts) return [];
    return result.posts.map((p: any) => ({
      metrics: { likes: p.likes, comments: p.comments },
      externalId: String(p.id),
      postedAt: new Date(p.timestamp * 1000).toISOString(),
      caption: p.caption,
    }));
  },
};
```

### 2.2 VK

VK — самая простая платформа: `services/vk.ts` уже возвращает реальные `views`/`likes`/`comments`/`reposts` и для своего сообщества, и для чужого публичного — VK API не делает разницы между владельцем и наблюдателем для публичных стен. Обёртка:

```ts
export const vkAdapter: PlatformAdapter = {
  platformType: "vk",
  supportedMetrics: {
    own: ["reach", "likes", "comments", "shares", "engagement_rate"], // views трактуем как reach
    competitor: ["reach", "likes", "comments", "shares"],
  },
  async fetchOwnPostMetrics(externalMediaId, config) {
    // externalMediaId для VK — это "ownerId_postId", уже в таком формате хранится publishedMediaId
    const { posts } = await fetchVKPosts(config.vkIdentifier!, config.vkAccessToken!);
    const post = posts.find(p => String(p.id) === externalMediaId);
    if (!post) return null;
    return { metrics: { reach: post.views, likes: post.likes, comments: post.comments, shares: post.reposts } };
  },
  async fetchCompetitorMetrics(identifier, limit, config) {
    const { posts } = await fetchVKPosts(identifier, config.vkAccessToken!);
    return posts.slice(0, limit).map(p => ({
      metrics: { reach: p.views, likes: p.likes, comments: p.comments, shares: p.reposts },
      externalId: String(p.id),
      postedAt: p.date,
      caption: p.text,
    }));
  },
};
```

Обратить внимание: `vkAccessToken` — общий токен приложения ВКонтакте (Standalone/Server приложение, создаётся в личном кабинете VK за пару минут, без ревью) — не токен пользователя. Хранить в `.env` (`VK_ACCESS_TOKEN`), не по проектам, если только не нужны разные токены на разные проекты.

### 2.3 Дзен

`services/zen.ts` пока не умеет доставать реальные `views`/`likes` (см. предыдущую инструкцию — они захардкожены в 0). Приводим к интерфейсу как есть, но честно объявляем в `supportedMetrics` только то, что реально работает сейчас:

```ts
export const zenAdapter: PlatformAdapter = {
  platformType: "zen",
  supportedMetrics: { own: [], competitor: [] }, // пока пусто, ниже — TODO
  async fetchOwnPostMetrics() { return null; },
  async fetchCompetitorMetrics() { return []; },
};
```
Пустой `supportedMetrics` — сознательное решение: пока UI не должен показывать метрики Дзена вообще (ни бейджей, ни попыток посчитать engagement_rate), чтобы не показывать нули как настоящие данные. Отдельная задача (не в этой инструкции) — разобрать встроенный JSON-стейт страницы `dzen.ru` на предмет реальных счётчиков просмотров/лайков, приоритет низкий.

---

## Раздел 3 — Telegram (новый адаптер)

Telegram — на практике один из самых лёгких источников данных, потому что публичные каналы показывают счётчик просмотров на каждом посте без всякой авторизации.

### 3.1 Свой канал

Если у канала есть бот-администратор — Telegram Bot API отдаёт `views`/`forward_count` через `getChat`/пересылку сообщений, но проще и универсальнее (работает для любого публичного канала, включая конкурентов) — раздел 3.2.

### 3.2 Публичный веб-предпросмотр `t.me/s/<channel>`

У любого публичного Telegram-канала есть страница `https://t.me/s/<channel>` — HTML-версия ленты канала без авторизации, на ней у каждого поста указано число просмотров. Это работает одинаково и для своего канала, и для конкурентов — не нужно разделять два метода.

Новый файл `server/src/services/platformAdapters/telegramAdapter.ts`:

```ts
async function fetchTelegramPosts(channelUsername: string, limit: number): Promise<PlatformMetrics[]> {
  const clean = channelUsername.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  const res = await fetch(`https://t.me/s/${clean}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Каждый пост — блок вида <div class="tgme_widget_message" data-post="channel/123">
  const blocks = html.match(/<div class="tgme_widget_message[\s\S]*?(?=<div class="tgme_widget_message|\s*<\/div>\s*<\/div>\s*<\/section>)/g) || [];

  return blocks.slice(0, limit).map((block) => {
    const idMatch = block.match(/data-post="[^/]+\/(\d+)"/);
    const viewsMatch = block.match(/tgme_widget_message_views">([^<]+)</);
    const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/);
    const textMatch = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);

    return {
      metrics: { impressions: parseViewsCount(viewsMatch?.[1]) },
      externalId: idMatch?.[1],
      postedAt: dateMatch?.[1],
      caption: textMatch ? stripTags(textMatch[1]) : undefined,
    };
  });
}

function parseViewsCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase();
  if (s.endsWith("K")) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith("M")) return Math.round(parseFloat(s) * 1_000_000);
  return parseInt(s.replace(/\D/g, ""), 10) || undefined;
}

export const telegramAdapter: PlatformAdapter = {
  platformType: "telegram",
  supportedMetrics: { own: ["impressions"], competitor: ["impressions"] },
  async fetchOwnPostMetrics(externalMediaId, config) {
    const posts = await fetchTelegramPosts(config.telegramChannel!, 30);
    const post = posts.find(p => p.externalId === externalMediaId);
    return post || null;
  },
  async fetchCompetitorMetrics(identifier, limit) {
    return fetchTelegramPosts(identifier, limit);
  },
};
```

Важное ограничение — честно отразить в `supportedMetrics`: Telegram-просмотры на публичной странице — это `impressions` (сколько раз открыли сообщение), не `reach` и точно не `likes`/`comments` (у каналов обычно нет публичных лайков/комментариев в стандартной ленте, если только не настроены отдельные группы обсуждения — это уже отдельная, более сложная функциональность, не включать в первую версию адаптера).

`t.me/s/` — это обычная веб-страница, не официальный API, разметка может измениться без предупреждения. Отнестись к парсингу так же, как к скрейпингу конкурентов Instagram/VK — оборачивать в try/catch, не ронять весь процесс сбора аналитики, если разметка вдруг перестала совпадать с регулярками.

---

## Раздел 4 — YouTube (новый адаптер)

Самый чистый источник данных из всех — официальный YouTube Data API v3, публичный API-ключ (создаётся в Google Cloud Console за несколько минут, без ревью и без верификации бизнеса, квота по умолчанию 10 000 юнитов/день — с большим запасом на масштаб одного пользователя), одинаково работает для своих видео и для чужих публичных.

Новый файл `server/src/services/platformAdapters/youtubeAdapter.ts`:

```ts
async function fetchYouTubeVideoStats(videoIds: string[], apiKey: string): Promise<Map<string, PlatformMetrics>> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data: any = await res.json();
  const map = new Map<string, PlatformMetrics>();
  for (const item of data.items || []) {
    map.set(item.id, {
      metrics: {
        impressions: Number(item.statistics.viewCount),
        likes: Number(item.statistics.likeCount),
        comments: Number(item.statistics.commentCount),
      },
      externalId: item.id,
      postedAt: item.snippet.publishedAt,
      caption: item.snippet.title,
    });
  }
  return map;
}

async function fetchYouTubeChannelVideos(channelIdOrHandle: string, limit: number, apiKey: string): Promise<PlatformMetrics[]> {
  // 1. Резолвим channelId, если передан @handle
  // 2. search.list по channelId, order=date, maxResults=limit — получаем videoId'ы
  // 3. Вызываем fetchYouTubeVideoStats для пачки videoId'ов
  // (детали — стандартный двухшаговый вызов YouTube Data API, search.list не отдаёт статистику напрямую)
}

export const youtubeAdapter: PlatformAdapter = {
  platformType: "youtube",
  supportedMetrics: { own: ["impressions", "likes", "comments"], competitor: ["impressions", "likes", "comments"] },
  async fetchOwnPostMetrics(externalMediaId, config) {
    const map = await fetchYouTubeVideoStats([externalMediaId], config.youtubeApiKey!);
    return map.get(externalMediaId) || null;
  },
  async fetchCompetitorMetrics(identifier, limit, config) {
    return fetchYouTubeChannelVideos(identifier, limit, config.youtubeApiKey!);
  },
};
```

`YOUTUBE_API_KEY` — один ключ на всё приложение в `.env`, не по проектам. Обратить внимание на дневную квоту: `search.list` стоит дороже (100 юнитов за вызов) чем `videos.list` (1 юнит) — при регулярном сборе метрик по многим каналам конкурентов кэшировать `channelId` по `@handle` (не резолвить его каждый раз заново), чтобы не тратить квоту впустую.

---

## Раздел 5 — Конфигурируемая формула engagement_rate

Проблема, которую нужно закрыть отдельно: формула `engagement_rate = (likes + comments + saves) / impressions` из Инструкции 5 — специфична для Instagram. У VK нет `saves`, у Telegram нет `likes`/`comments` вообще (только `impressions`), у YouTube нет `saves`.

Новый файл `server/src/constants/engagementFormulas.ts`:

```ts
import type { MetricName } from "./metrics.js";

export const ENGAGEMENT_FORMULA_BY_PLATFORM: Record<string, { numerator: MetricName[]; denominator: MetricName }> = {
  instagram: { numerator: ["likes", "comments", "saves"], denominator: "impressions" },
  vk: { numerator: ["likes", "comments", "shares"], denominator: "reach" },
  telegram: { numerator: [], denominator: "impressions" }, // engagement_rate не считается, только impressions
  youtube: { numerator: ["likes", "comments"], denominator: "impressions" },
  zen: { numerator: [], denominator: "impressions" },
};

export function computeEngagementRate(
  platformType: string,
  metrics: Partial<Record<MetricName, number>>
): number | null {
  const formula = ENGAGEMENT_FORMULA_BY_PLATFORM[platformType];
  if (!formula || formula.numerator.length === 0) return null;
  const denom = metrics[formula.denominator];
  if (!denom) return null;
  const numeratorSum = formula.numerator.reduce((sum, m) => sum + (metrics[m] || 0), 0);
  return numeratorSum / denom;
}
```

Использовать эту функцию в `ingestOwnPostMetrics` (Раздел 1) сразу после записи сырых метрик — писать `engagement_rate` в `analytics_snapshots` отдельной строкой, только если функция вернула не `null`. В `postAnalytics.ts` (Инструкция 5, раздел 2.1) медиану считать в рамках одной платформы (`rubricId` + `platformId`, как там и было задумано) — так посты на разных платформах никогда не сравниваются друг с другом напрямую по шкале, которая для них не сопоставима.

---

## Раздел 6 — UI: показывать только то, что реально доступно

В Post Insight Panel и в блоке конкурентного сравнения (Инструкция 5) — перед рендером метрик спрашивать `getAdapter(platform.type)?.supportedMetrics`, и показывать бейджи/поля только для тех `metricName`, которые в этом списке. Не показывать пустые/нулевые карточки "Saves: 0" для Telegram — это выглядит как реальный ноль, а не как "недоступно для этой платформы". Если `supportedMetrics` для платформы пуст (как временно у Дзена) — весь блок аналитики для постов этой платформы можно скрывать целиком с пометкой "Метрики для этой платформы пока не собираются".

---

## Раздел 7 — Чеклист реализации

1. `platformAdapters/types.ts` и `registry.ts` — интерфейс и реестр.
2. Обернуть Instagram (уже есть логика из Инструкции 5) в `instagramAdapter.ts`.
3. Обернуть VK (`services/vk.ts` уже готов) в `vkAdapter.ts`, добавить `VK_ACCESS_TOKEN` в `.env`.
4. Обернуть Дзен как адаптер с пустым `supportedMetrics` (честно, не выдумывая данные).
5. Написать `telegramAdapter.ts` — парсинг `t.me/s/<channel>`.
6. Написать `youtubeAdapter.ts` — YouTube Data API v3, завести `YOUTUBE_API_KEY` в `.env`.
7. Переписать `analyticsIngest.ts` (из Инструкции 5) на использование `getAdapter()` вместо прямых вызовов Instagram-специфичных функций.
8. `constants/engagementFormulas.ts` — конфигурируемая формула, использовать вместо захардкоженной инстаграмной в `postAnalytics.ts`.
9. UI: скрывать/показывать метрики по `supportedMetrics` конкретного адаптера.

## Критерий готовности

- Добавление нового адаптера (например, для будущего LinkedIn) не требует правок в `analyticsIngest.ts`, `postAnalytics.ts`, `insights.ts` — только новый файл адаптера + одна строка в `registry.ts`.
- Для тестового VK-сообщества и тестового Telegram-канала кнопка "Обновить метрики" реально пишет строки в `analytics_snapshots` с корректными каноническими именами метрик.
- `engagement_rate` для Telegram-поста не считается (остаётся `null`), а не падает с ошибкой деления и не показывает вводящий в заблуждение ноль.
- В UI для Дзен-постов не отображается ни одного пустого/нулевого бейджа метрики.
