# Инструкция 5 — Аналитика и Insights (пересмотренная версия)

## Контекст

Это переработка `fabrika_analytics_spec.md` с поправками по трём причинам:

1. В коде уже есть два реальных бага в `services/insights.ts` (см. ниже, раздел 0), которые нужно починить, иначе новая аналитика будет считаться поверх сломанной логики.
2. Таблица `analytics_snapshots` в схеме есть, но её никто не заполняет — ни один адаптер не пишет туда данные. Без этого весь раздел "Aggregates & Goals" из исходного спека будет работать на пустой базе.
3. Путь через официальный Meta Graph API, который стоял за интеграцией `integrations/metaInstagram.ts`, на практике не работает: чтобы получать метрики (`reach`, `impressions`, `saves`) даже для собственного аккаунта, Meta требует Business-верификацию приложения и App Review — именно то, на чём застряли раньше. Хорошая новость: в репозитории уже лежит рабочая альтернатива на `instagrapi` (`scripts/instagram.py`, бинарь `ig-fetcher`, роуты в `api/metrics.ts`), которая просто не была доведена до конца — в `.env` пустые `IG_PROXY_USERNAME`/`IG_PROXY_PASSWORD`. Эту инфраструктуру нужно достроить и подключить, а не искать что-то с нуля.

Порядок работы: сначала раздел 0 (источник данных и починка багов), потом остальные разделы спека по порядку.

---

## Раздел 0 — Источник данных (блокер для всего остального)

### 0.1 Почему Graph API не пошёл и что делать вместо

Meta Graph API для Instagram Insights требует: подключённый Business/Creator-аккаунт, приложение в Meta for Developers, прохождение App Review для разрешений `instagram_manage_insights`, и часто — Business Verification компании. Это долгий процесс с ручной проверкой, рассчитанный на компании с юрлицом и легальным присутствием, а не на инструмент для одного SMM-специалиста. Не нужно продолжать попытки в эту сторону для MVP.

Вместо этого — `instagrapi` (Python-библиотека, оборачивает приватный мобильный API Instagram через логин обычного аккаунта, без App Review и без Meta App). У неё два разных сценария использования, которые нужно развести:

**А. Свой аккаунт (посты, которые публикует сам проект).**
`instagrapi` умеет `cl.insights_account()` и `cl.insights_media(media_pk)` — это даёт `reach`, `impressions` и другие метрики Insights, но требует, чтобы залогиненный аккаунт был переведён в Business/Creator (это делается в самом приложении Instagram за пару минут, без Meta Developer Console). Это даёт то же самое, за чем гнались через Graph API, но без App Review.

**Б. Чужой аккаунт (конкуренты).**
Для аккаунтов, которыми вы не владеете и в которые не можете залогиниться от их имени, Instagram структурно не отдаёт `reach`/`impressions`/`saves` никому — это не ограничение библиотеки, а ограничение платформы (Insights считаются приватными метриками владельца аккаунта). Публично доступны только: `like_count`, `comment_count`, подписчики, число публикаций, текст captions, даты публикаций. `instagrapi.user_medias()` уже возвращает `like_count`/`comment_count` по любому публичному аккаунту — этого достаточно для раздела 5 (конкурентный бенчмаркинг), но нужно явно ограничить ожидания UI этими метриками, не обещать reach/impressions по конкурентам никому.

### 0.2 Что уже есть в коде и что доделать

`scripts/instagram.py` уже реализует:
- `check <username>` — публичный лукап без логина (подписчики, приватность, verified).
- `fetch <username> <limit>` — с логином через `IG_PROXY_USERNAME`/`IG_PROXY_PASSWORD`, возвращает список последних медиа с `like_count`/`comment_count`. Уже работает для любого username, включая конкурентов — просто сейчас используется только в `metrics.ts` для своих подключённых платформ.

Нужно доделать:

1. **Завести отдельный технический Instagram-аккаунт** (не основной аккаунт бренда), перевести его в Business или Creator (нужно для `insights_*` методов ниже), указать логин/пароль в `.env` (`IG_PROXY_USERNAME`/`IG_PROXY_PASSWORD`). Не использовать для этого личный аккаунт Макса — риск блокировки/ограничений от Instagram существует у любого автоматизированного логина, и это должен быть расходный технический аккаунт, а не основной.

2. **Добавить в `scripts/instagram.py` команду `insights`**:
   ```python
   elif cmd == "insights":
       media_pk = sys.argv[2]
       cl.login(proxy_user, proxy_pass)  # или загрузка сессии, как в fetch
       data = cl.insights_media(media_pk)
       print(json.dumps({
           "valid": True,
           "reach": data.get("reach"),
           "impressions": data.get("impressions"),
           "saves": data.get("saved"),
           "likes": data.get("likes"),
           "comments": data.get("comments"),
       }))
   ```
   Точные ключи ответа `insights_media`/`insights_account` уточнить по фактической версии `instagrapi` (>=2.18.0, зафиксирована в `requirements.txt`) — структура ответа может отличаться, нужно проверить на реальном вызове и подстроить парсинг.

3. **Добавить обработку ошибок логина как ожидаемый, не аварийный кейс.** Аккаунты, через которые логинится `instagrapi`, могут получать `challenge_required` или временную блокировку непредсказуемо — это нормальное поведение платформы, а не баг библиотеки. Скрипт и вызывающий код должны на это реагировать мягко: если `fetch`/`insights` вернул ошибку логина — записать это как "метрики временно недоступны" и не ронять весь процесс сбора аналитики по остальным постам/проектам.

4. **Не гнаться за объёмом.** Собственные посты — собирать метрики по кнопке "Обновить метрики" (не чаще пары раз в день на пост). Конкурентов — не чаще раза в неделю на конкурента. Датацентровые IP (VPS, где хостится сервер, если он не локальный) Instagram блокирует быстрее, чем обычный домашний IP — если сбор метрик запускается не с локальной машины Макса, а с VPS, вероятно понадобится резидентный/мобильный прокси для `instagrapi`-логина; для локального использования на его Mac это не обязательно на первых порах.

### 0.3 Новый сервис: `server/src/services/analyticsIngest.ts`

```ts
async function ingestOwnPostMetrics(postItemId: string): Promise<void>
async function ingestCompetitorMetrics(savedCompetitorId: string): Promise<void>
```

`ingestOwnPostMetrics`:
- Находит `post_items.publishedMediaId` для поста.
- Вызывает `runInstagramScript(["insights", publishedMediaId])` (переиспользовать функцию из `metrics.ts`, вынести её в общий модуль, например `server/src/services/instagramCli.ts`, чтобы не дублировать между `metrics.ts` и `analyticsIngest.ts`).
- Нормализует ответ в канонические метрики (раздел 1 ниже) и вставляет строки в `analytics_snapshots` с `postItemId`, `metricPeriod: "lifetime"` (Instagram Insights по конкретному медиа обычно и есть накопительное значение с момента публикации, не привязано к day/7d/30d — уточнить на реальных данных и скорректировать период, если библиотека вернёт разбивку по времени).

`ingestCompetitorMetrics`:
- Вызывает `runInstagramScript(["fetch", competitorUsername, "12"])`.
- Пишет не в `analytics_snapshots` (это для своих постов), а в новую таблицу `competitor_analytics` (раздел 5).

### 0.4 Починка багов в `services/insights.ts`

Обе ошибки нужно закрыть до написания нового кода на инсайтах:

**Баг 1 — `best_formats` считает не форматы, а отдельные посты.**
```ts
// Было:
const bestFormats = db.select({
  contentTypeId: analyticsSnapshots.postItemId, // ошибка: тут postItemId, а не contentTypeId
  avgMetric: sql<number>`avg(${analyticsSnapshots.metricValue})`,
})
.from(analyticsSnapshots)
.innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
...
.groupBy(analyticsSnapshots.postItemId) // группировка по посту, не по формату
```
Исправить на группировку по `postItems.contentTypeId` (или `postItems.rubricId`, оба варианта полезны — можно сделать два отдельных инсайта: "лучшие типы контента" и "лучшие рубрики"):
```ts
const bestFormats = db.select({
  contentTypeId: postItems.contentTypeId,
  avgMetric: sql<number>`avg(${analyticsSnapshots.metricValue})`,
  postsCount: sql<number>`count(distinct ${postItems.id})`,
})
.from(analyticsSnapshots)
.innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
.where(and(
  eq(postItems.projectId, projectId),
  eq(analyticsSnapshots.metricName, "engagement_rate"), // считать по конкретной метрике, не по всем вперемешку
  sql`${analyticsSnapshots.metricValue} IS NOT NULL`,
))
.groupBy(postItems.contentTypeId)
.having(sql`count(distinct ${postItems.id}) >= 2`) // не делать выводы по одному посту
.orderBy(sql`avg(${analyticsSnapshots.metricValue}) desc`)
.limit(5)
.all();
```
Дополнительно — раньше в запрос попадали строки с любым `metricName` без разбора (`reach`, `likes`, `engagement_rate` вперемешку в одном `avg()`), это тоже нужно поправить: агрегировать по одной конкретной метрике за раз (обычно `engagement_rate`), не мешать метрики с разной шкалой в одном `avg()`.

**Баг 2 — `journey_coverage` не может отличить стадии друг от друга.**
```ts
// Было:
const coveredStages = new Set(funnelPosts.map((p: any) => p.funnelId));
// funnelPosts уже отфильтрован по funnelId = funnel.id, поэтому здесь всегда один и тот же id
```
Причина глубже, чем просто опечатка: в `post_items` нет поля, которое фиксирует стадию воронки конкретного поста, только `funnelId` (какая воронка вообще). Чтобы это заработало, нужно:

1. Добавить в схему (`post_items`): `funnelStage: text("funnel_stage")` — значение должно соответствовать одному из элементов `funnels.stages` (JSON-массив, уже существует).
2. В `generate.ts`, роут `/week-plan`: при создании поста, если AI вернул отдельно шаг воронки для каждого поста (нужно попросить модель явно возвращать `stage` в JSON-плане, сейчас `buildWeekPlanPrompt` просит `format/rubric/goal/hook/keyMessage/cta`, но не просит стадию) — сохранять её в `funnelStage`.
3. В UI карточки поста — если у поста задан `funnelId`, показывать select для `funnelStage` из списка `funnel.stages`, чтобы можно было проставить/поправить вручную.
4. Переписать саму функцию:
```ts
const funnelPosts = db
  .select({ funnelStage: postItems.funnelStage })
  .from(postItems)
  .where(and(
    eq(postItems.projectId, projectId),
    eq(postItems.funnelId, funnel.id),
  ))
  .all();

const coveredStages = new Set(funnelPosts.map((p: any) => p.funnelStage).filter(Boolean));
const missingStages = stages.filter((s: string) => !coveredStages.has(s));
```

Без пунктов 1-3 пункт 4 всё равно не заработает корректно — `funnelStage` должен где-то реально заполняться, иначе снова будет пустой набор и снова "все стадии не покрыты".

---

## Раздел 1 — Нормализация метрик и периодов

Как в исходном спеке, без изменений по сути, только с уточнением источника:

Новый файл `server/src/constants/metrics.ts`:
```ts
export const METRIC_NAMES = [
  "reach", "impressions", "likes", "comments", "saves", "shares",
  "profile_visits", "clicks", "ctr", "engagement_rate",
] as const;
export const METRIC_PERIODS = ["day", "7d", "30d", "lifetime"] as const;
export type MetricName = typeof METRIC_NAMES[number];
export type MetricPeriod = typeof METRIC_PERIODS[number];
```
Использовать эти типы в `analyticsIngest.ts` при записи и в `insights.ts`/агрегатах при чтении. CHECK-constraint на уровне SQLite можно добавить, но так как `analytics_snapshots` — существующая таблица с данными (пусть пока и пустая), делать это через пересборку таблицы в миграции, аккуратно, с сохранением текущих строк (`ALTER TABLE` с CHECK в SQLite не поддерживается напрямую — нужен стандартный паттерн create-new-table / copy / drop-old / rename).

## Раздел 2 — Post-level и Funnel-level агрегаты

### 2.1 `post_analytics` — новая таблица (не JSON-колонка)

```ts
export const postAnalytics = sqliteTable("post_analytics", {
  postItemId: text("post_item_id").primaryKey().references(() => postItems.id, { onDelete: "cascade" }),
  reach: real("reach"),
  impressions: real("impressions"),
  engagementRate: real("engagement_rate"),
  saves: real("saves"),
  comments: real("comments"),
  period: text("period").default("lifetime"),
  classification: text("classification"), // hit | normal | underperforming
  rubricMedianEngagementRate: real("rubric_median_engagement_rate"),
  platformMedianEngagementRate: real("platform_median_engagement_rate"),
  computedAt: text("computed_at").default(sql`(current_timestamp)`),
});
```
Причина отдельной таблицы, а не JSON-колонки на `post_items`: медиану по `rubric_id`/`platform_id` нужно считать SQL-агрегатом сразу по многим постам — с JSON-полем это либо парсинг в приложении построчно, либо невозможный `AVG`/перцентиль прямо в SQL. Отдельная таблица с обычными числовыми колонками решает это без усилий.

Сервис `server/src/services/postAnalytics.ts`:
```ts
function recomputePostAnalytics(postItemId: string): void
```
Логика — как в спеке (раздел 2.1): взять последний снапшот `engagement_rate` для поста и периода, посчитать медиану по постам с тем же `rubricId`+`platformId` за тот же период, классифицировать по порогам ×1.3/×0.7, записать (upsert) в `post_analytics`.

Вызывать эту функцию сразу после `ingestOwnPostMetrics` для этого же поста — не отдельным батчем, чтобы данные в `post_analytics` не расходились с только что записанными `analytics_snapshots`.

### 2.2 `funnel_analytics`

```ts
export const funnelAnalytics = sqliteTable("funnel_analytics", {
  id: text("id").primaryKey(),
  funnelId: text("funnel_id").notNull().references(() => funnels.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull(),
  postsCount: integer("posts_count").default(0),
  avgReach: real("avg_reach"),
  avgEngagementRate: real("avg_engagement_rate"),
  conversionToNextStage: real("conversion_to_next_stage"),
  computedAt: text("computed_at").default(sql`(current_timestamp)`),
});
```
Зависит от починки бага 2 (раздел 0.4) — без `post_items.funnel_stage` эта таблица не сможет корректно группироваться по стадиям. Функция `recomputeFunnelAnalytics(funnelId)` группирует посты по `funnelStage`, считает `postsCount`/`avgReach`/`avgEngagementRate` через join с `post_analytics`/`analytics_snapshots`. `conversionToNextStage` на первой итерации можно считать упрощённо — отношение `postsCount` соседних стадий по порядку в `funnels.stages` (не полноценная конверсия аудитории, а плотность контента по стадиям; честно назвать это в UI "покрытие контентом", а не "конверсия аудитории", если данных о реальном пользовательском пути нет).

### 2.3 `campaign_goals`

```ts
export const campaignGoals = sqliteTable("campaign_goals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(),
  targetValue: real("target_value").notNull(),
  period: text("period").notNull(),
  deadlineDate: text("deadline_date"),
  status: text("status").default("on_track"), // ahead | on_track | behind
  lastEvaluatedAt: text("last_evaluated_at"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});
```
Таблица, не JSON — по той же логике, что и `post_analytics`: нужно сортировать/фильтровать несколько целей проекта сразу.

Сервис `server/src/services/goals.ts`:
```ts
function evaluateGoals(projectId: string): void
```
Берёт текущее среднее значение метрики за указанный `period` из `analytics_snapshots`, сравнивает с `targetValue`, ставит `status`. Пороги (например, "ahead" если факт ≥ 110% от цели, "behind" если факт < 80%) — вынести в константы, не хардкодить магические числа внутри условий без имени.

---

## Раздел 3 — Экраны аналитики в UI

Без принципиальных изменений от исходного спека:

- **Post Insight Panel** (в карточке поста) — метрики за выбранный период, бейдж "выше/ниже медианы" (переиспользовать те же цветовые уровни, что уже используются для `riskScore` в Drafts — зелёный/жёлтый/красный, для консистентности стиля приложения), текстовое резюме на основе `post_analytics`.
- **Funnel Health Dashboard** (в деталях воронки) — визуализация `funnels.stages` с цифрами из `funnel_analytics`, подсветка "слабых" стадий.
- **Project Health & Goals** (обзор проекта) — таймсерия по `analytics_snapshots`, список целей со статусами из `campaign_goals`.

Единственное дополнение: там, где в тексте отображается "конверсия между стадиями" — использовать формулировку "плотность контента по стадиям" или аналогичную, пока `conversionToNextStage` не считается по реальным данным аудитории (см. 2.2) — чтобы не создавать ложное ощущение точности там, где это оценка, а не измерение.

---

## Раздел 4 — AI-Insights

Расширить существующий механизм `analytics_insights`/`insightType`, не изобретать отдельный, плюс явно чинить баг 1 из раздела 0.4 прежде чем добавлять AI-слой поверх `best_formats`.

Новые `insightType`:

- `period_report` — раз в неделю/месяц по кнопке (не по крону, крон-раннера в проекте нет). Собирает JSON-сводку (`post_analytics`, `funnel_analytics`, `campaign_goals` за период), отдаёт в LLM с промптом-аналитиком (как в спеке), сохраняет структурированную версию в `analytics_insights` (для карточки в UI) и полный текст — в `project_knowledge` с `type: "report"`, `tags: ["analytics"]` (двойное хранение, как в исходном спеке — согласен с этим решением: отчёт должен быть и структурно доступен для дэшборда, и текстово доступен для будущего поиска/контекста генерации).
- `post_suggestion` — 1-3 рекомендации по конкретному посту/стадии, на основе `content_textures`, `content_types.default_cta`, факта классификации (`hit`/`underperforming`). Точечный вызов по кнопке в Post Insight Panel, не массовая генерация по всем постам сразу (дорого и почти всегда не читается).
- `competitor_benchmark` — см. раздел 5 ниже, отдельно, потому что зависит от `competitor_analytics`.

---

## Раздел 5 — Конкурентный бенчмаркинг

Переписан с учётом реальных ограничений данных (раздел 0.1).

### 5.1 Новая таблица `competitor_analytics`

```ts
export const competitorAnalytics = sqliteTable("competitor_analytics", {
  id: text("id").primaryKey(),
  savedCompetitorId: text("saved_competitor_id").notNull().references(() => savedCompetitors.id, { onDelete: "cascade" }),
  mediaExternalId: text("media_external_id"),
  caption: text("caption"),
  likes: integer("likes"),
  comments: integer("comments"),
  postedAt: text("posted_at"),
  fetchedAt: text("fetched_at").default(sql`(current_timestamp)`),
});
```
Осознанно нет полей `reach`/`impressions`/`saves` — по чужим аккаунтам их получить нельзя ни одним инструментом, не только текущим. Не заводить эти колонки, чтобы не создавать иллюзию, что их можно будет когда-нибудь заполнить без доступа к самому аккаунту.

### 5.2 Ingest

`ingestCompetitorMetrics(savedCompetitorId)` (раздел 0.3) — вызывает `fetch` через `instagrapi`, парсит `username` из `savedCompetitors.url`, пишет строки в `competitor_analytics`. По кнопке "Обновить метрики конкурента" в UI карточки конкурента, не чаще раза в неделю на конкурента (риск блокировки технического аккаунта при частых запросах на много профилей).

### 5.3 AI-слой

Промпт для `competitor_benchmark` явно ограничить тем, что реально есть — лайки, комментарии, частота публикаций, темы (caption). Не просить модель сравнивать "reach" или "impressions" с конкурентами — таких данных нет и не будет, и промпт не должен провоцировать модель придумывать цифры. Пример корректной формулировки инсайта: сравнение среднего числа комментариев на пост между вашим аккаунтом и конкурентом как индикатор вовлечённости в обсуждение, с явной пометкой, что reach/impressions недоступны для чужих аккаунтов и в сравнение не входят.

### 5.4 UI

В блоке конкурентного сравнения — явная подпись мелким текстом: "Для аккаунтов конкурентов доступны только публичные метрики (лайки, комментарии, частота публикаций). Reach и охват недоступны ни для одного инструмента, включая официальный API Instagram, для аккаунтов, которыми вы не владеете." Это не техническое ограничение, которое стоит прятать — наоборот, стоит явно объяснить пользователю (или клиенту агентства), чтобы не было ожиданий, что где-то "просто нашли способ".

---

## Раздел 6 — Чеклист реализации (обновлённый порядок)

1. Технический Instagram-аккаунт: завести, перевести в Business/Creator, заполнить `IG_PROXY_USERNAME`/`IG_PROXY_PASSWORD` в `.env`.
2. `scripts/instagram.py`: добавить команду `insights`, аккуратно обработать ошибки логина как некритичные.
3. Вынести общую обёртку вызова Python-скрипта из `metrics.ts` в отдельный модуль (`services/instagramCli.ts`), чтобы использовать и в `metrics.ts`, и в новом `analyticsIngest.ts`.
4. Написать `analyticsIngest.ts`: `ingestOwnPostMetrics`, `ingestCompetitorMetrics`.
5. Починить баги 1 и 2 в `insights.ts` (раздел 0.4), включая добавление `post_items.funnel_stage` в схему и его заполнение в `/week-plan` и в UI карточки поста.
6. Добавить в схему: `post_analytics`, `funnel_analytics`, `campaign_goals`, `competitor_analytics`. Сгенерировать и протестировать миграцию.
7. Реализовать `postAnalytics.ts` (классификация hit/normal/underperforming) и `goals.ts` (оценка статусов целей).
8. Реализовать `funnelAnalytics.ts` (агрегаты по стадиям, с честной формулировкой "плотность контента", не "конверсия").
9. Добавить константы `metrics.ts` (канонический словарь), использовать во всех местах записи `analytics_snapshots`.
10. UI: Post Insight Panel, Funnel Health Dashboard, Project Health & Goals — три экрана из раздела 3.
11. AI-инсайты: `period_report` (с двойным хранением в `analytics_insights` + `project_knowledge`), `post_suggestion`.
12. Конкурентный бенчмаркинг: `competitor_analytics`, ingest, урезанный по метрикам AI-слой, явная пометка ограничений в UI.

## Критерий готовности

- На тестовом проекте с 5-10 опубликованными постами кнопка "Обновить метрики" реально заполняет `analytics_snapshots` (можно проверить прямым запросом к БД), без ручной правки кода.
- `post_analytics.classification` для тестовых постов совпадает с ожиданием при искусственно заданных значениях метрик (например, пост с engagement_rate в 2 раза выше медианы рубрики помечен как `hit`).
- `journey_coverage`-инсайт для воронки с явно проставленными `funnelStage` на части постов показывает реально непокрытые стадии, а не "все стадии всегда не покрыты" (регрессионный тест на баг 2).
- `best_formats`/аналог по рубрикам показывает разные типы контента с разными средними метриками, а не список отдельных постов под видом форматов (регрессионный тест на баг 1).
- Конкурентный бенчмаркинг для реального публичного конкурентного аккаунта возвращает реальные (не нулевые захардкоженные) лайки/комментарии.
- Отчёт `period_report` для тестового проекта читается как связный текст с конкретными числами из `post_analytics`/`funnel_analytics`, не общими фразами уровня "контент нужно улучшать".
