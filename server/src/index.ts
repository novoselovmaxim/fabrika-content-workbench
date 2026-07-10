import express from "express";
import cors from "cors";
import path from "path";
import { exec } from "child_process";
import { PATHS } from "./paths.js";
import { topicsRouter } from "./api/topics.js";
import { rubricsRouter } from "./api/rubrics.js";
import { contentTypesRouter } from "./api/contentTypes.js";
import { postsRouter } from "./api/posts.js";
import { draftsRouter } from "./api/drafts.js";
import { assetsRouter } from "./api/assets.js";
import { pipelineRouter } from "./api/pipeline.js";
import { generateRouter } from "./api/generate.js";
import { projectsRouter } from "./api/projects.js";
import { platformsRouter } from "./api/platforms.js";
import { strategyRouter } from "./api/strategy.js";
import { chatRouter } from "./api/chat.js";
import { settingsRouter } from "./api/settings.js";
import { knowledgeRouter } from "./api/knowledge.js";
import { onboardingRouter } from "./api/onboarding.js";
import { funnelsRouter } from "./api/funnels.js";
import { texturesRouter } from "./api/textures.js";
import { productsRouter } from "./api/products.js";
import { audiencesRouter } from "./api/audiences.js";
import { keywordsRouter } from "./api/keywords.js";
import { brandFactsRouter } from "./api/brandFacts.js";
import { reviewEventsRouter } from "./api/reviewEvents.js";
import { complianceRouter } from "./api/compliance.js";
import { analyticsRouter } from "./api/analytics.js";
import { competitorsRouter } from "./api/competitors.js";
import { licenseRouter } from "./api/license.js";
import { metricsRouter } from "./api/metrics.js";
import { seedContentTextures } from "./seeds/contentTextures.js";
import { seedFunnels } from "./seeds/funnels.js";
import { seedPolicyRules } from "./seeds/policyRules.js";
import { db, runMigrations } from "./db.js";
import { postItems, draftVersions, pipelineRuns, rubrics, contentTypes } from "./schema.js";
import { requireLicense, checkLicenseOnline } from "./services/licenseService.js";
import { checkForUpdates, getCurrentVersion } from "./services/updater.js";

import { sql, eq, and, gte } from "drizzle-orm";

// Мигрируем БД при старте
runMigrations();

const app = express();
const PORT = parseInt(process.env.INITIAL_PORT || "3001", 10);

app.use(cors());
app.use(express.json());

// Статика — ассеты (изображения и т.д.)
app.use("/uploads", express.static(PATHS.uploads));
app.use("/generated", express.static(PATHS.generated));

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Dashboard stats
app.get("/api/dashboard/stats", (req, res) => {
  const now = new Date().toISOString().split("T")[0];
  const projectId = req.query.projectId as string | undefined;
  const period = (req.query.period as string) || "all";

  // Date range filter for period
  let dateFilter: any = undefined;
  if (period === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    dateFilter = gte(postItems.createdAt, weekAgo.toISOString());
  } else if (period === "month") {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    dateFilter = gte(postItems.createdAt, monthAgo.toISOString());
  }

  // Total posts
  const postConditions: any[] = [];
  if (projectId) postConditions.push(eq(postItems.projectId, projectId));
  if (dateFilter) postConditions.push(dateFilter);
  let postQuery: any = db.select({ count: sql<number>`count(*)` }).from(postItems);
  if (postConditions.length > 0) postQuery = postQuery.where(and(...postConditions));
  const totalPosts = postQuery.get();

  // Posts by status
  const statusConditions: any[] = [];
  if (projectId) statusConditions.push(eq(postItems.projectId, projectId));
  if (dateFilter) statusConditions.push(dateFilter);
  let statusQuery: any = db
    .select({ status: postItems.status, count: sql<number>`count(*)` })
    .from(postItems);
  if (statusConditions.length > 0) statusQuery = statusQuery.where(and(...statusConditions));
  const postsByStatus = statusQuery.groupBy(postItems.status).all();

  // Posts by rubric
  const rubricBase: any[] = [];
  if (projectId) rubricBase.push(eq(postItems.projectId, projectId));
  let rubricQuery: any = db
    .select({
      rubricId: rubrics.id,
      name: rubrics.name,
      color: rubrics.color,
      count: sql<number>`count(*)`,
    })
    .from(postItems)
    .leftJoin(rubrics, eq(postItems.rubricId, rubrics.id));
  if (rubricBase.length > 0) rubricQuery = rubricQuery.where(and(...rubricBase));
  const postsByRubric = rubricQuery
    .groupBy(rubrics.id)
    .all()
    .map((r: any) => ({ ...r, rubricId: r.rubricId || "unknown", name: r.name || "Без рубрики", color: r.color || "#666" }));

  // Upcoming posts (next 5)
  const upcomingConditions: any[] = [sql`${postItems.scheduledDate} >= ${now}`];
  if (projectId) upcomingConditions.push(eq(postItems.projectId, projectId));
  const upcomingPosts = (db
    .select({
      id: postItems.id,
      title: postItems.title,
      status: postItems.status,
      reviewStatus: postItems.reviewStatus,
      scheduledDate: postItems.scheduledDate,
      scheduledTime: postItems.scheduledTime,
      contentTypeName: contentTypes.name,
      rubricName: rubrics.name,
      rubricColor: rubrics.color,
    })
    .from(postItems)
    .leftJoin(contentTypes, eq(postItems.contentTypeId, contentTypes.id))
    .leftJoin(rubrics, eq(postItems.rubricId, rubrics.id)) as any)
    .where(and(...upcomingConditions))
    .orderBy(postItems.scheduledDate)
    .limit(10)
    .all();

  // Week distribution (next 7 days)
  const days: { day: string; date: string; count: number; posts: any[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayName = d.toLocaleDateString("ru-RU", { weekday: "short" });
    const dayPosts = upcomingPosts.filter((p: any) => p.scheduledDate === dateStr);
    days.push({ day: dayName, date: dateStr, count: dayPosts.length, posts: dayPosts });
  }

  // Recent activity
  const activityConditions: any[] = [];
  if (projectId) activityConditions.push(eq(postItems.projectId, projectId));
  let activityQuery: any = db
    .select({
      id: postItems.id,
      title: postItems.title,
      status: postItems.status,
      updatedAt: postItems.updatedAt,
      createdAt: postItems.createdAt,
    })
    .from(postItems);
  if (activityConditions.length > 0) activityQuery = activityQuery.where(and(...activityConditions));
  const recentPosts = activityQuery.orderBy(sql`${postItems.updatedAt} desc`).limit(10).all();

  const recentActivity = recentPosts.map((p: any) => ({
    postId: p.id,
    title: p.title,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  // Drafts & runs
  const totalDrafts = (db.select({ count: sql<number>`count(*)` }).from(draftVersions) as any).get();
  const totalRuns = (db.select({ count: sql<number>`count(*)` }).from(pipelineRuns) as any).get();

  res.json({
    totalPosts: totalPosts?.count || 0,
    postsByStatus,
    postsByRubric,
    upcomingPosts,
    weekDistribution: days,
    recentActivity,
    totalDrafts: totalDrafts?.count || 0,
    totalRuns: totalRuns?.count || 0,
  });
});

// Mount metrics router (before license check — always available)
app.use("/api/metrics", metricsRouter);

// License middleware — блокирует API без активной лицензии
app.use(requireLicense);

// Mount routers
app.use("/api/license", licenseRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/rubrics", rubricsRouter);
app.use("/api/content-types", contentTypesRouter);
app.use("/api/posts", postsRouter);
app.use("/api/drafts", draftsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/generate", generateRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/platforms", platformsRouter);
app.use("/api/strategy", strategyRouter);
app.use("/api/chat", chatRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/funnels", funnelsRouter);
app.use("/api/textures", texturesRouter);
app.use("/api/products", productsRouter);
app.use("/api/audiences", audiencesRouter);
app.use("/api/keywords", keywordsRouter);
app.use("/api/review-events", reviewEventsRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/competitors", competitorsRouter);
app.use("/api/brand-facts", brandFactsRouter);

seedContentTextures();
seedFunnels();
try { seedPolicyRules(); } catch (err) { console.warn("⚠ seedPolicyRules failed:", String(err)); }

// Версия и проверка обновлений
app.get("/api/version", async (_req, res) => {
  const update = await checkForUpdates();
  res.json(update);
});

// В продакшене — раздаём собранный фронт
app.use(express.static(PATHS.frontend));

// SPA fallback
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(PATHS.frontend, "index.html"));
});

// Фоновая проверка лицензии
setTimeout(() => checkLicenseOnline(), 5000);

const server = app.listen(PORT, () => {
  console.log(`\n  🏭 Фабрика Контента → http://localhost:${PORT}\n`);
  if (!process.env.ELECTRON_APP) {
    const url = `http://localhost:${PORT}`;
    const browserCmd = process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(browserCmd, (err) => {
      if (err) console.log("  Откройте браузер вручную:", url);
    });
  }
});
server.on("error", (err: any) => {
  console.error("Failed to start server:", err);
});
