import { Router } from "express";
import { db } from "../db.js";
import { analyticsInsights, postAnalytics, postItems, projectKnowledge, projects, contentTypes, contentTextures, funnels, savedCompetitors, competitorAnalytics, analyticsSnapshots, funnelAnalytics } from "../schema.js";
import { sql, eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { recomputeInsights } from "../services/insights.js";
import { recomputePostAnalytics, recomputeAllPostAnalytics, getPostAnalytics, getProjectAnalytics } from "../services/postAnalytics.js";
import { recomputeFunnelAnalytics, getFunnelAnalytics, clearFunnelAnalytics } from "../services/funnelAnalytics.js";
import { createGoal, getProjectGoals, evaluateGoals, deleteGoal } from "../services/goals.js";
import { generate, getModelForTask, extractJSON } from "../services/aiGateway.js";
import { buildProjectContext } from "../services/projectContext.js";
import { ingestCompetitorMetrics } from "../services/analyticsIngest.js";

export const analyticsRouter = Router();

analyticsRouter.post("/:projectId/recompute-insights", (req, res) => {
  try {
    const { projectId } = req.params;
    const count = recomputeInsights(projectId);
    res.json({ recomputed: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to recompute insights" });
  }
});

analyticsRouter.get("/:projectId/insights", (req, res) => {
  const { projectId } = req.params;
  const usedFunnelNames = new Set(
    db.select({ name: funnels.name })
      .from(funnels)
      .where(sql`${funnels.id} IN (SELECT DISTINCT ${postItems.funnelId} FROM ${postItems} WHERE ${postItems.projectId} = ${projectId} AND ${postItems.funnelId} IS NOT NULL)`)
      .all()
      .map((r: any) => r.name)
  );
  const rows = db.select().from(analyticsInsights)
    .where(eq(analyticsInsights.projectId, projectId))
    .orderBy(sql`${analyticsInsights.generatedAt} desc`)
    .all();
  const filtered = rows.filter((r: any) => {
    if (r.insightType !== "journey_coverage") return true;
    try {
      const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      return p?.funnelName ? usedFunnelNames.has(p.funnelName) : true;
    } catch { return true; }
  });
  res.json(filtered.map((r: any) => ({
    ...r,
    payload: r.payload ? (() => { try { return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload; } catch { return r.payload; } })() : null,
  })));
});

analyticsRouter.delete("/:projectId/insights", (req, res) => {
  const { projectId } = req.params;
  db.delete(analyticsInsights).where(eq(analyticsInsights.projectId, projectId)).run();
  res.status(204).end();
});

// ── Post Analytics ──────────────────────────────────────────

analyticsRouter.post("/post/:postItemId/recompute", (req, res) => {
  try {
    recomputePostAnalytics(req.params.postItemId);
    const row = getPostAnalytics(req.params.postItemId);
    res.json(row || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.post("/project/:projectId/recompute-all", (req, res) => {
  try {
    const count = recomputeAllPostAnalytics(req.params.projectId);
    res.json({ recomputed: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.post("/post/:postItemId/manual-metrics", (req, res) => {
  try {
    const { postItemId } = req.params;
    const { likes, comments, reach, impressions, saves } = req.body;

    const post = db.select().from(postItems).where(eq(postItems.id, postItemId)).get();
    if (!post) return res.status(404).json({ error: "Post not found" });

    const now = new Date().toISOString();
    const metrics: Record<string, number | null> = { likes, comments, reach, impressions, saves };
    for (const [metricName, metricValue] of Object.entries(metrics)) {
      if (metricValue == null) continue;
      db.insert(analyticsSnapshots).values({
        id: uuid(),
        postItemId,
        metricName,
        metricValue,
        metricPeriod: "lifetime",
        snapshotDate: now,
      }).run();
    }

    recomputePostAnalytics(postItemId);
    const row = getPostAnalytics(postItemId);
    res.json(row || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.get("/post/:postItemId", (req, res) => {
  const row = getPostAnalytics(req.params.postItemId);
  res.json(row || null);
});

analyticsRouter.get("/project/:projectId", (req, res) => {
  const rows = getProjectAnalytics(req.params.projectId);
  res.json(rows);
});

// ── Funnel Analytics ────────────────────────────────────────

analyticsRouter.post("/funnel/:funnelId/recompute", (req, res) => {
  try {
    clearFunnelAnalytics(req.params.funnelId);
    const count = recomputeFunnelAnalytics(req.params.funnelId);
    const rows = getFunnelAnalytics(req.params.funnelId);
    res.json({ recomputed: count, stages: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.get("/funnel/:funnelId", (req, res) => {
  const rows = getFunnelAnalytics(req.params.funnelId);
  res.json(rows);
});

// ── Campaign Goals ──────────────────────────────────────────

analyticsRouter.post("/goals", (req, res) => {
  try {
    const { projectId, metricName, targetValue, period, deadlineDate } = req.body;
    if (!projectId || !metricName || targetValue == null || !period) {
      return res.status(400).json({ error: "projectId, metricName, targetValue, period are required" });
    }
    const id = createGoal({ projectId, metricName, targetValue, period, deadlineDate });
    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.get("/goals/:projectId", (req, res) => {
  const rows = getProjectGoals(req.params.projectId);
  res.json(rows);
});

analyticsRouter.post("/goals/:projectId/evaluate", (req, res) => {
  try {
    const count = evaluateGoals(req.params.projectId);
    const rows = getProjectGoals(req.params.projectId);
    res.json({ evaluated: count, goals: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed" });
  }
});

analyticsRouter.delete("/goals/:id", (req, res) => {
  deleteGoal(req.params.id);
  res.status(204).end();
});

// ── AI: Period Report ────────────────────────────────────────

analyticsRouter.post("/:projectId/period-report", async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = req.body.period || "30d";

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const postCounts = db
      .select({
        classification: postAnalytics.classification,
        count: sql<number>`count(*)`,
      })
      .from(postAnalytics)
      .innerJoin(postItems, eq(postAnalytics.postItemId, postItems.id))
      .where(eq(postItems.projectId, projectId))
      .groupBy(postAnalytics.classification)
      .all();

    const avgEr = db
      .select({
        avg: sql<number>`avg(${postAnalytics.engagementRate})`,
      })
      .from(postAnalytics)
      .innerJoin(postItems, eq(postAnalytics.postItemId, postItems.id))
      .where(eq(postItems.projectId, projectId))
      .get();

    const allFunnels = db
      .select({ id: funnels.id, name: funnels.name })
      .from(funnels)
      .where(and(
        eq(funnels.active, 1),
        sql`${funnels.id} IN (SELECT DISTINCT ${postItems.funnelId} FROM ${postItems} WHERE ${postItems.projectId} = ${projectId})`,
      ))
      .all();

    const funnelData = allFunnels.map((f: any) => {
      const stages = db
        .select()
        .from(funnelAnalytics)
        .where(eq(funnelAnalytics.funnelId, f.id))
        .all();
      return { name: f.name, stages };
    });

    const hits = postCounts.find((p: any) => p.classification === "hit")?.count || 0;
    const normal = postCounts.find((p: any) => p.classification === "normal")?.count || 0;
    const underperforming = postCounts.find((p: any) => p.classification === "underperforming")?.count || 0;
    const total = hits + normal + underperforming;

    const dataBlock = [
      `Проект: ${project.name}`,
      `Период анализа: ${period}`,
      ``,
      `--- ПОСТЫ ---`,
      `Всего постов с метриками: ${total}`,
      `Хиты (ER выше медианы ×1.3): ${hits}`,
      `Средние: ${normal}`,
      `Отстающие (ER ниже медианы ×0.7): ${underperforming}`,
      avgEr?.avg != null ? `Средний Engagement Rate: ${(avgEr.avg * 100).toFixed(2)}%` : "",
      ``,
      `--- ВОРОНКИ ---`,
    ];

    for (const f of funnelData) {
      dataBlock.push(`Воронка: ${f.name}`);
      for (const s of (f.stages as any[]) || []) {
        dataBlock.push(`  • ${s.stageName}: ${s.postsCount} постов, ER ${s.avgEngagementRate ? (s.avgEngagementRate * 100).toFixed(1) + "%" : "—"}, охват ${s.avgReach ? (s.avgReach as number).toFixed(0) : "—"}`);
      }
    }

    dataBlock.push(``);
    dataBlock.push(`Дай развёрнутый анализ ситуации и рекомендации по улучшению. Не используй общие фразы.`);

    const prompt = dataBlock.join("\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt,
      systemPrompt: "Ты — аналитик контент-стратегии. Анализируй данные, давай конкретные рекомендации по типам контента, рубрикам и этапам воронок. Пиши на русском.",
      temperature: 0.5,
      maxTokens: 3000,
    });

    const reportText = result.content;

    // Save structured version to analytics_insights
    const insightId = uuid();
    db.insert(analyticsInsights).values({
      id: insightId,
      projectId,
      insightType: "period_report",
      payload: JSON.stringify({
        title: "Аналитический отчёт",
        period,
        total,
        hits,
        normal,
        underperforming,
        avgEr: avgEr?.avg,
        funnelData,
        summary: reportText.slice(0, 500),
      }),
      generatedAt: new Date().toISOString(),
    }).run();

    // Save full text to project_knowledge
    const knowledgeId = uuid();
    db.insert(projectKnowledge).values({
      id: knowledgeId,
      projectId,
      type: "report",
      title: `Аналитический отчёт (${period}) — ${new Date().toLocaleDateString("ru-RU")}`,
      content: reportText,
      tags: JSON.stringify(["analytics", period]),
    }).run();

    res.json({
      insightId,
      knowledgeId,
      summary: reportText.slice(0, 500),
      fullReport: reportText,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate report" });
  }
});

// ── AI: Post Suggestion ──────────────────────────────────────

analyticsRouter.post("/post/:postItemId/suggest", async (req, res) => {
  try {
    const { postItemId } = req.params;

    const post = db
      .select({
        id: postItems.id,
        title: postItems.title,
        projectId: postItems.projectId,
        contentTypeId: postItems.contentTypeId,
        rubricId: postItems.rubricId,
        goal: postItems.goal,
        hook: postItems.hook,
        keyMessage: postItems.keyMessage,
        cta: postItems.cta,
        funnelStage: postItems.funnelStage,
      })
      .from(postItems)
      .where(eq(postItems.id, postItemId))
      .get();

    if (!post) return res.status(404).json({ error: "Post not found" });

    const pa = db
      .select()
      .from(postAnalytics)
      .where(eq(postAnalytics.postItemId, postItemId))
      .get();

    const textureList = db.select().from(contentTextures).all();

    const ct = post.contentTypeId
      ? db.select().from(contentTypes).where(eq(contentTypes.id, post.contentTypeId)).get()
      : null;

    let prompt = `Пост: "${post.title}"
Статус: ${post.funnelStage ? `Этап воронки: ${post.funnelStage}` : "без этапа"}
Цель: ${post.goal || "—"}
Хук: ${post.hook || "—"}
Ключевое сообщение: ${post.keyMessage || "—"}
CTA: ${post.cta || "—"}
`;

    if (pa) {
      const classificationLabel = pa.classification === "hit" ? "ХИТ (выше медианы)" : pa.classification === "underperforming" ? "ОТСТАЮЩИЙ (ниже медианы)" : "Средний";
      prompt += `\nМетрики:
• Классификация: ${classificationLabel}
• Engagement Rate: ${pa.engagementRate ? (pa.engagementRate * 100).toFixed(2) + "%" : "—"}
• Охват: ${pa.reach || "—"}
• Показы: ${pa.impressions || "—"}
• Медиана рубрики: ${pa.rubricMedianEngagementRate ? (pa.rubricMedianEngagementRate * 100).toFixed(2) + "%" : "—"}
• Медиана площадки: ${pa.platformMedianEngagementRate ? (pa.platformMedianEngagementRate * 100).toFixed(2) + "%" : "—"}
`;
    }

    if (ct?.defaultCta) {
      prompt += `\nРекомендуемый CTA для типа контента: ${ct.defaultCta}\n`;
    }

    if (textureList.length > 0) {
      prompt += `\nДоступные форматы подачи: ${textureList.map((t: any) => t.name).join(", ")}\n`;
    }

    prompt += `\nПредложи 1-3 конкретные рекомендации по улучшению этого поста.
Учитывай классификацию: для ХИТОВ — как масштабировать успех, для ОТСТАЮЩИХ — что конкретно изменить.
Формат ответа — JSON массив:
[{ "title": "короткий заголовок", "description": "развёрнутая рекомендация (1-3 предложения)", "type": "hook|cta|format|content|stage" }]`;

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt,
      systemPrompt: "Ты — контент-аналитик. Давай конкретные, применимые рекомендации по постам. Ответ — ТОЛЬКО JSON массив.",
      temperature: 0.4,
      maxTokens: 2000,
      responseFormat: "json",
    });

    let suggestions: any[] = [];
    try {
      suggestions = JSON.parse(extractJSON(result.content));
    } catch {
      suggestions = [{ title: "Рекомендация", description: result.content.slice(0, 500), type: "content" }];
    }

    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate suggestions" });
  }
});

// ── Competitor Ingest ────────────────────────────────────────

analyticsRouter.post("/competitor/:savedCompetitorId/ingest", async (req, res) => {
  try {
    const count = await ingestCompetitorMetrics(req.params.savedCompetitorId);
    res.json({ ingested: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to ingest competitor metrics" });
  }
});

analyticsRouter.get("/competitor/:savedCompetitorId", (req, res) => {
  const rows = db
    .select()
    .from(competitorAnalytics)
    .where(eq(competitorAnalytics.savedCompetitorId, req.params.savedCompetitorId))
    .orderBy(sql`${competitorAnalytics.postedAt} desc`)
    .all();
  res.json(rows);
});

// ── AI: Competitor Benchmark ─────────────────────────────────

analyticsRouter.post("/:projectId/competitor-benchmark", async (req, res) => {
  try {
    const { projectId } = req.params;
    const competitorIds: string[] = req.body.competitorIds || [];

    const competitors = competitorIds.length > 0
      ? db.select().from(savedCompetitors).where(and(
          eq(savedCompetitors.projectId, projectId),
          inArray(savedCompetitors.id, competitorIds),
        )).all()
      : [];

    const ownAvgEr = db
      .select({ avg: sql<number>`avg(${analyticsSnapshots.metricValue})` })
      .from(analyticsSnapshots)
      .innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
      .where(and(eq(postItems.projectId, projectId), eq(analyticsSnapshots.metricName, "engagement_rate")))
      .get();

    const dataBlock = [
      "--- СВОИ ПОКАЗАТЕЛИ ---",
      ownAvgEr?.avg != null ? `Средний ER: ${(ownAvgEr.avg * 100).toFixed(2)}%` : "Нет данных об ER",
      "",
      "--- КОНКУРЕНТЫ ---",
    ];

    for (const comp of competitors) {
      const posts = db
        .select()
        .from(competitorAnalytics)
        .where(eq(competitorAnalytics.savedCompetitorId, comp.id))
        .all();

      const avgLikes = posts.length > 0 ? posts.reduce((s: number, p: any) => s + (p.likes || 0), 0) / posts.length : 0;
      const avgComments = posts.length > 0 ? posts.reduce((s: number, p: any) => s + (p.comments || 0), 0) / posts.length : 0;
      const freq = posts.length > 0 ? `~${Math.round(30 / posts.length)} дней между постами` : "нет данных";

      dataBlock.push(`\nКонкурент: ${comp.name} (${comp.url})`);
      dataBlock.push(`  • Проанализировано постов: ${posts.length}`);
      dataBlock.push(`  • Средний лайков: ${avgLikes.toFixed(0)}`);
      dataBlock.push(`  • Средний комментов: ${avgComments.toFixed(1)}`);
      dataBlock.push(`  • Частота: ${freq}`);
    }

    dataBlock.push(`
ВАЖНЫЕ ОГРАНИЧЕНИЯ:
- Для аккаунтов конкурентов доступны ТОЛЬКО публичные метрики (лайки, комментарии, частота).
- Reach, impressions, saves, ER для конкурентов недоступны — не упоминай их в анализе.
- Сравнивай только то, что реально измеримо: лайки, комментарии, частоту публикаций.

На основе этих данных дай анализ конкурентной позиции и рекомендации. Не выдумывай цифры, которых нет.`);

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: dataBlock.join("\n"),
      systemPrompt: "Ты — аналитик конкурентной разведки в SMM. Анализируй только те метрики, которые реально доступны. Пиши на русском.",
      temperature: 0.5,
      maxTokens: 3000,
    });

    const insightId = uuid();
    db.insert(analyticsInsights).values({
      id: insightId,
      projectId,
      insightType: "competitor_benchmark",
      payload: JSON.stringify({
        title: "Сравнительный анализ конкурентов",
        competitorIds,
        summary: result.content.slice(0, 500),
      }),
      generatedAt: new Date().toISOString(),
    }).run();

    res.json({
      insightId,
      analysis: result.content,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate benchmark" });
  }
});
