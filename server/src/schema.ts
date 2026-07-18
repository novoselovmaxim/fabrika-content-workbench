import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Projects ──────────────────────────────────────────────
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  niche: text("niche"),
  audience: text("audience"),
  pains: text("pains"),
  style: text("style"),
  tone: text("tone"),
  brandStyles: text("brand_styles"),
  knowledgeSummary: text("knowledge_summary"),
  mission: text("mission"),
  valueProp: text("value_prop"),
  customerJourney: text("customer_journey"),
  competitors: text("competitors"),
  keywords: text("keywords"),
  onboardingScenario: text("onboarding_scenario"),
  onboardingComplete: integer("onboarding_complete").default(0),
  primaryLanguage: text("primary_language").default("ru"),
  supportedLanguages: text("supported_languages"),
  status: text("status").default("draft"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Products ──────────────────────────────────────────────
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type"),
  description: text("description"),
  priceCategory: text("price_category").default("middle"),
  values: text("values"),
  pains: text("pains"),
  result: text("result"),
  valuePropJson: text("value_prop_json"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Audiences ─────────────────────────────────────────────
export const audiences = sqliteTable("audiences", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  portrait: text("portrait"),
  demographics: text("demographics"),
  pains: text("pains"),
  hantStages: text("hant_stages"),
  promptUsed: text("prompt_used"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Project Keywords ──────────────────────────────────────
export const projectKeywords = sqliteTable("project_keywords", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  source: text("source").default("ai_extracted"),
  sortOrder: integer("sort_order").default(0),
});

// ── Competitor Searches ───────────────────────────────────
export const competitorSearches = sqliteTable("competitor_searches", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  keywords: text("keywords"),
  searchEngine: text("search_engine").default("tavily"),
  region: text("region"),
  language: text("language"),
  resultJson: text("result_json"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Saved Competitors (accumulated across searches) ─────────
export const savedCompetitors = sqliteTable("saved_competitors", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  positioning: text("positioning"),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  audience: text("audience"),
  contentStrategy: text("content_strategy"),
  source: text("source").default("search"),
  searchKeywords: text("search_keywords"),
  details: text("details"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Excluded Competitors (manually removed) ─────────────────
export const excludedCompetitors = sqliteTable("excluded_competitors", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  reason: text("reason").default("manual_exclude"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Onboarding Steps ──────────────────────────────────────
export const onboardingSteps = sqliteTable("onboarding_steps", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stepKey: text("step_key").notNull(),
  status: text("status").default("pending"),
  aiOutput: text("ai_output"),
  manualOverride: text("manual_override"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Funnels ───────────────────────────────────────────────
export const funnels = sqliteTable("funnels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  stages: text("stages"),
  durationDays: integer("duration_days"),
  rules: text("rules"),
  platformRecommendations: text("platform_recommendations"),
  ordering: integer("ordering").default(0),
  active: integer("active").default(1),
  color: text("color").default("#6366f1"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Content Textures ──────────────────────────────────────
export const contentTextures = sqliteTable("content_textures", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  examplePrompt: text("example_prompt"),
  hantStages: text("hant_stages"),
  ordering: integer("ordering").default(0),
});

// ── Platforms ─────────────────────────────────────────────
export const platforms = sqliteTable("platforms", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .references(() => products.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  accountHandle: text("account_handle"),
  config: text("config_json"),
  status: text("status").default("active"),
  currentFunnelId: text("current_funnel_id").references(() => funnels.id, { onDelete: "set null" }),
  funnelRecommendations: text("funnel_recommendations"),
  suggested: integer("suggested").default(0),
  ordering: integer("ordering").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Strategy Blocks ───────────────────────────────────────
export const strategyBlocks = sqliteTable("strategy_blocks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .references(() => products.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  sectionKey: text("section_key").notNull(),
  title: text("title").notNull(),
  aiContent: text("ai_content"),
  manualContent: text("manual_content"),
  ordering: integer("ordering").default(0),
  approved: integer("approved").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Chat Messages ─────────────────────────────────────────
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  contextStep: text("context_step"),
  applied: integer("applied").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Settings ───────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Rubric Distribution ───────────────────────────────────
export const rubricDistributions = sqliteTable("rubric_distributions", {
  id: text("id").primaryKey(),
  rubricId: text("rubric_id").references(() => rubrics.id, { onDelete: "cascade" }),
  contentTypeCode: text("content_type_code").notNull(),
  percent: real("percent").default(0),
});

// ── Rubrics ────────────────────────────────────────────────
export const rubrics = sqliteTable("rubrics", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  ordering: integer("ordering").default(0),
  active: integer("active").default(1),
  color: text("color").default("#6366f1"),
});

// ── Content Types ──────────────────────────────────────────
export const contentTypes = sqliteTable("content_types", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  platform: text("platform").default("instagram"),
  defaultPipelineTemplate: text("default_pipeline_template"),
  defaultCta: text("default_cta"),
});

// ── Topics ─────────────────────────────────────────────────
export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  rubricId: text("rubric_id").references(() => rubrics.id),
  title: text("title").notNull(),
  description: text("description"),
  painPoint: text("pain_point"),
  promise: text("promise"),
  audienceSegment: text("audience_segment"),
  notes: text("notes"),
  status: text("status").default("active"),
  currentFunnelId: text("current_funnel_id").references(() => funnels.id, { onDelete: "set null" }),
  funnelRecommendations: text("funnel_recommendations"),
  priority: integer("priority").default(0),
  source: text("source"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Post Items ─────────────────────────────────────────────
export const postItems = sqliteTable("post_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  topicId: text("topic_id").references(() => topics.id),
  rubricId: text("rubric_id").references(() => rubrics.id),
  contentTypeId: text("content_type_id").references(() => contentTypes.id),
  campaignId: text("campaign_id"),
  funnelId: text("funnel_id").references(() => funnels.id, { onDelete: "set null" }),
  funnelStage: text("funnel_stage"),
  scheduledDate: text("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  sortOrder: integer("sort_order").default(0),
  status: text("status").default("idea"),
  goal: text("goal"),
  hook: text("hook"),
  keyMessage: text("key_message"),
  cta: text("cta"),
  versionCurrentId: text("version_current_id"),
  owner: text("owner"),
  publishedMediaId: text("published_media_id"),
  reviewStatus: text("review_status").default("none"),
  lastReviewedBy: text("last_reviewed_by"),
  lastReviewedAt: text("last_reviewed_at"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── Draft Versions ─────────────────────────────────────────
export const draftVersions = sqliteTable("draft_versions", {
  id: text("id").primaryKey(),
  postItemId: text("post_item_id")
    .notNull()
    .references(() => postItems.id),
  stage: text("stage").notNull(),
  modelProvider: text("model_provider"),
  modelName: text("model_name"),
  promptSnapshot: text("prompt_snapshot"),
  contentMarkdown: text("content_markdown"),
  contentJson: text("content_json"),
  isManualEdit: integer("is_manual_edit").default(0),
  parentVersionId: text("parent_version_id"),
  usedBrandFacts: text("used_brand_facts"),
  riskScore: real("risk_score"),
  riskTags: text("risk_tags"),
  explanation: text("explanation"),
  language: text("language").default("ru"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Assets ─────────────────────────────────────────────────
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  postItemId: text("post_item_id").references(() => postItems.id),
  type: text("type").notNull(),
  sourceType: text("source_type").default("manual_upload"),
  sourcePath: text("source_path"),
  sourceUrl: text("source_url"),
  promptUsed: text("prompt_used"),
  externalOriginNote: text("external_origin_note"),
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  previewPath: text("preview_path"),
  status: text("status").default("attached"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Pipeline Runs ─────────────────────────────────────────
export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  postItemId: text("post_item_id")
    .notNull()
    .references(() => postItems.id),
  pipelineTemplateId: text("pipeline_template_id"),
  status: text("status").default("pending"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  initiatedBy: text("initiated_by").default("manual"),
  resultSummary: text("result_summary"),
  logsPath: text("logs_path"),
});

// ── Analytics Snapshots ────────────────────────────────────
export const analyticsSnapshots = sqliteTable("analytics_snapshots", {
  id: text("id").primaryKey(),
  postItemId: text("post_item_id").references(() => postItems.id),
  instagramMediaId: text("instagram_media_id"),
  metricName: text("metric_name").notNull(),
  metricValue: real("metric_value"),
  metricPeriod: text("metric_period"),
  snapshotDate: text("snapshot_date"),
  rawPayloadPath: text("raw_payload_path"),
});

// ── Project Knowledge Base ───────────────────────────────
export const projectKnowledge = sqliteTable("project_knowledge", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("note"),
  title: text("title").notNull(),
  content: text("content"),
  sourceUrl: text("source_url"),
  filePath: text("file_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  wordCount: integer("word_count"),
  tags: text("tags"),
  ordering: integer("ordering").default(0),
  processed: integer("processed").default(0),
  processingError: text("processing_error"),
  factsCount: integer("facts_count").default(0),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

// ── License ────────────────────────────────────────────────
export const license = sqliteTable("license", {
  id:           text("id").primaryKey().default("singleton"),
  licenseKey:   text("license_key"),
  email:        text("email"),
  activatedAt:  text("activated_at"),
  expiresAt:    text("expires_at"),
  status:       text("status").default("inactive"),
  lastChecked:  text("last_checked"),
  planName:      text("plan_name"),
  trialStartedAt: text("trial_started_at"),
});

// ── Brand Facts (ядро знаний) ─────────────────────────────
export const brandFacts = sqliteTable("brand_facts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  factText: text("fact_text").notNull(),
  confidence: real("confidence").default(1),
  validated: integer("validated").default(0),
  language: text("language").default("ru"),
  canonicalFactId: text("canonical_fact_id"),
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
  eventType: text("event_type").notNull(),
  payload: text("payload"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Policy Rules (compliance) ─────────────────────────────
export const policyRules = sqliteTable("policy_rules", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  code: text("code").notNull(),
  description: text("description").notNull(),
  pattern: text("pattern"),
  severity: text("severity").default("warning"),
  enabled: integer("enabled").default(1),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Post Analytics (aggregated per post) ────────────────────
export const postAnalytics = sqliteTable("post_analytics", {
  postItemId: text("post_item_id").primaryKey().references(() => postItems.id, { onDelete: "cascade" }),
  reach: real("reach"),
  impressions: real("impressions"),
  engagementRate: real("engagement_rate"),
  saves: real("saves"),
  comments: real("comments"),
  period: text("period").default("lifetime"),
  classification: text("classification"),
  rubricMedianEngagementRate: real("rubric_median_engagement_rate"),
  platformMedianEngagementRate: real("platform_median_engagement_rate"),
  computedAt: text("computed_at").default(sql`(current_timestamp)`),
});

// ── Funnel Analytics (per stage) ───────────────────────────
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

// ── Campaign Goals ─────────────────────────────────────────
export const campaignGoals = sqliteTable("campaign_goals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  metricName: text("metric_name").notNull(),
  targetValue: real("target_value").notNull(),
  period: text("period").notNull(),
  deadlineDate: text("deadline_date"),
  status: text("status").default("on_track"),
  lastEvaluatedAt: text("last_evaluated_at"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// ── Competitor Analytics ───────────────────────────────────
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

// ── Analytics Insights ─────────────────────────────────────
export const analyticsInsights = sqliteTable("analytics_insights", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  insightType: text("insight_type").notNull(),
  payload: text("payload").notNull(),
  generatedAt: text("generated_at").default(sql`(current_timestamp)`),
});
