# Инструкция 2 — Аудит и расширение схемы БД

## Контекст

Выполняется после Инструкции 1 (чистка хардкода). Первоначальный спек первой волны изменений (см. `docs/specs/spec1_rus-edit_.md` или исходный файл, если он лежит в другом месте) описывает часть схемы как "новую", хотя по факту она уже реализована. Цель этого шага — свести к минимуму дублирование работы: явно зафиксировать, что уже есть, и добавить в схему только то, чего реально не хватает.

## Шаг 2.1 — Аудит текущего состояния `server/src/schema.ts`

Уже реализовано, трогать не нужно:

- Таблица `projects` уже содержит: `mission`, `valueProp`, `customerJourney`, `competitors`, `keywords`, `onboardingScenario`, `onboardingComplete`.
- Таблица `onboarding_steps` — есть, с полями `projectId`, `stepKey`, `status`, `aiOutput`, `manualOverride`, `completedAt`, `updatedAt`.
- Таблица `funnels` — есть, с полями `name`, `type`, `description`, `stages`, `durationDays`, `rules`, `platformRecommendations`, `ordering`, `active` (плюс `color`, которого не было в исходном спеке — не удалять).
- Таблица `content_textures` — есть, с полями `code`, `name`, `description`, `examplePrompt`, `hantStages`, `ordering`.
- Таблицы `audiences`, `products`, `competitorSearches`, `savedCompetitors`, `excludedCompetitors`, `projectKeywords` — есть и покрывают часть того, что в исходном спеке предполагалось хранить внутри `brand_facts` россыпью. Это нормально, `brand_facts` не должна дублировать эти таблицы, а должна извлекать из них (и из `projectKnowledge`) атомарные факты — подробности в Инструкции 3.

Не реализовано, нужно добавить:

- Таблица `brand_facts` — полностью новая, ключевая для Инструкции 3.
- Расширение `draft_versions`: полей `usedBrandFacts`, `riskScore`, `riskTags`, `explanation` нет.
- Таблица `review_events` — нет.
- Расширение `post_items`: полей `reviewStatus`, `lastReviewedBy`, `lastReviewedAt` — нет.
- Таблица `policy_rules` — нет.
- Таблица `analytics_insights` — нет.
- Мультиязычность: в `projects` нет `primaryLanguage`/`supportedLanguages`, в `draft_versions` нет `language`, в будущей `brand_facts` изначально заложить `language`/`canonicalFactId`.

## Шаг 2.2 — Правки в `server/src/schema.ts`

Добавить в конец файла (или логическими блоками рядом с существующими таблицами, которые они расширяют):

```ts
// ── Brand Facts (ядро знаний) ─────────────────────────────
export const brandFacts = sqliteTable("brand_facts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // product|audience|promise|constraint|proof|faq|other
  sourceType: text("source_type").notNull(), // knowledge_file|note|manual|ai_inferred
  sourceRef: text("source_ref"), // id файла/заметки/AI-шага
  factText: text("fact_text").notNull(),
  confidence: real("confidence").default(1),
  validated: integer("validated").default(0),
  language: text("language").default("ru"),
  canonicalFactId: text("canonical_fact_id"), // для мультиязычных пар одного факта
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Review Events (governance) ────────────────────────────
export const reviewEvents = sqliteTable("review_events", {
  id: text("id").primaryKey(),
  postItemId: text("post_item_id")
    .notNull()
    .references(() => postItems.id, { onDelete: "cascade" }),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  eventType: text("event_type").notNull(), // status_change|field_change|risk_override
  payload: text("payload"), // JSON
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Policy Rules (compliance) ─────────────────────────────
export const policyRules = sqliteTable("policy_rules", {
  id: text("id").primaryKey(),
  projectId: text("project_id"), // null = глобальное правило
  code: text("code").notNull(),
  description: text("description").notNull(),
  pattern: text("pattern"), // regex-паттерн, если rule-based
  severity: text("severity").default("warning"), // info|warning|block
  enabled: integer("enabled").default(1),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Analytics Insights ─────────────────────────────────────
export const analyticsInsights = sqliteTable("analytics_insights", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  insightType: text("insight_type").notNull(), // best_formats|underused_rubrics|journey_coverage|cadence
  payload: text("payload").notNull(), // JSON
  generatedAt: text("generated_at").default(sql`(current_timestamp)`),
});
```

Расширить существующую таблицу `draftVersions` (добавить поля в уже существующий блок, не создавать новую таблицу):

```ts
export const draftVersions = sqliteTable("draft_versions", {
  // ...существующие поля без изменений...
  usedBrandFacts: text("used_brand_facts"), // JSON string[] id
  riskScore: real("risk_score"),
  riskTags: text("risk_tags"), // JSON string[]
  explanation: text("explanation"),
  language: text("language").default("ru"),
});
```

Расширить существующую таблицу `postItems`:

```ts
export const postItems = sqliteTable("post_items", {
  // ...существующие поля без изменений...
  reviewStatus: text("review_status").default("none"), // none|internal_review|client_review|approved
  lastReviewedBy: text("last_reviewed_by"),
  lastReviewedAt: text("last_reviewed_at"),
});
```

Расширить существующую таблицу `projects`:

```ts
export const projects = sqliteTable("projects", {
  // ...существующие поля без изменений...
  primaryLanguage: text("primary_language").default("ru"),
  supportedLanguages: text("supported_languages"), // JSON string[]
});
```

## Шаг 2.3 — Миграции

Проект использует Drizzle + SQLite, миграции лежат в `database/migrations`.

1. После правок в `schema.ts` сгенерировать новую миграцию через `drizzle-kit generate` (посмотреть точную команду в `package.json` workspace `server`, если она там уже настроена как npm-скрипт — использовать её, не изобретать заново).
2. Проверить сгенерированный SQL миграции руками перед применением — особенно для `ALTER TABLE ... ADD COLUMN` на `draft_versions`, `post_items`, `projects`. SQLite поддерживает `ADD COLUMN`, но не поддерживает часть других `ALTER` операций — если drizzle-kit сгенерирует что-то с пересозданием таблицы, убедиться, что это делается через временную таблицу с сохранением данных, а не `DROP + CREATE`.
3. Протестировать миграцию на копии существующей боевой базы (скопировать `.db`-файл, прогнать миграцию на копии), прежде чем применять к реальным данным проекта Берег.Микрошаги — там уже есть продакшн-данные, терять их нельзя.
4. Обновить снапшот drizzle (`0002_*.json` поверх текущего) согласно тому, что уже описано в оригинальном спеке (`spec1_rus-edit_.md`, раздел "Шаг 1").

## Шаг 2.4 — Сиды (не обязательно, но полезно)

- Добавить базовые `policy_rules` (глобальные, `projectId: null`): запрет медицинских/психологических гарантий результата, запрет гарантированного финансового результата, флаг избыточно категоричных обещаний ("навсегда", "100% результат"). Это пригодится в Инструкции 4 для compliance-слоя, но саму таблицу и данные можно засеять уже сейчас.

## Критерий готовности

- `schema.ts` компилируется, типы Drizzle генерируются без ошибок.
- Существующий функционал (онбординг, генерация, доски) продолжает работать на базе с применённой миграцией — ничего из старых таблиц/полей не сломано.
- Новые таблицы видны в БД (`sqlite3 <path-to-db> ".schema brand_facts"` и т.д.), но пока пустые — заполнение будет в Инструкции 3.
