import { db } from "../db.js";
import { postItems, analyticsSnapshots, analyticsInsights, rubrics, contentTypes, funnels } from "../schema.js";
import { sql, eq, and, gte } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export function recomputeInsights(projectId: string): number {
  const now = new Date().toISOString();
  let count = 0;

  // 1. Best formats — which contentTypeId gives best avg engagement_rate
  const bestFormats = db
    .select({
      contentTypeId: postItems.contentTypeId,
      avgMetric: sql<number>`avg(${analyticsSnapshots.metricValue})`,
      postsCount: sql<number>`count(distinct ${postItems.id})`,
    })
    .from(analyticsSnapshots)
    .innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
    .where(and(
      eq(postItems.projectId, projectId),
      eq(analyticsSnapshots.metricName, "engagement_rate"),
      sql`${analyticsSnapshots.metricValue} IS NOT NULL`,
    ))
    .groupBy(postItems.contentTypeId)
    .having(sql`count(distinct ${postItems.id}) >= 2`)
    .orderBy(sql`avg(${analyticsSnapshots.metricValue}) desc`)
    .limit(5)
    .all();

  if (bestFormats.length > 0) {
    const payload = {
      title: "Лучшие типы контента",
      description: "Типы контента с наибольшей вовлечённостью",
      items: bestFormats.map((f: any) => ({ contentTypeId: f.contentTypeId, avgMetric: f.avgMetric, postsCount: f.postsCount })),
      count: bestFormats.length,
    };
    db.delete(analyticsInsights).where(and(
      eq(analyticsInsights.projectId, projectId),
      eq(analyticsInsights.insightType, "best_formats"),
    )).run();
    db.insert(analyticsInsights).values({
      id: uuid(),
      projectId,
      insightType: "best_formats",
      payload: JSON.stringify(payload),
      generatedAt: now,
    }).run();
    count++;
  }

  // 1b. Best rubrics — which rubricId gives best avg engagement_rate
  const bestRubrics = db
    .select({
      rubricId: postItems.rubricId,
      avgMetric: sql<number>`avg(${analyticsSnapshots.metricValue})`,
      postsCount: sql<number>`count(distinct ${postItems.id})`,
    })
    .from(analyticsSnapshots)
    .innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
    .where(and(
      eq(postItems.projectId, projectId),
      eq(analyticsSnapshots.metricName, "engagement_rate"),
      sql`${analyticsSnapshots.metricValue} IS NOT NULL`,
    ))
    .groupBy(postItems.rubricId)
    .having(sql`count(distinct ${postItems.id}) >= 2`)
    .orderBy(sql`avg(${analyticsSnapshots.metricValue}) desc`)
    .limit(5)
    .all();

  if (bestRubrics.length > 0) {
    const payload = {
      title: "Лучшие рубрики",
      description: "Рубрики с наибольшей вовлечённостью",
      items: bestRubrics.map((f: any) => ({ rubricId: f.rubricId, avgMetric: f.avgMetric, postsCount: f.postsCount })),
      count: bestRubrics.length,
    };
    db.delete(analyticsInsights).where(and(
      eq(analyticsInsights.projectId, projectId),
      eq(analyticsInsights.insightType, "best_rubrics"),
    )).run();
    db.insert(analyticsInsights).values({
      id: uuid(),
      projectId,
      insightType: "best_rubrics",
      payload: JSON.stringify(payload),
      generatedAt: now,
    }).run();
    count++;
  }

  // 2. Underused rubrics — rubrics with few posts in last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const rubricCounts = db
    .select({
      rubricId: postItems.rubricId,
      name: rubrics.name,
      color: rubrics.color,
      count: sql<number>`count(*)`,
    })
    .from(postItems)
    .leftJoin(rubrics, eq(postItems.rubricId, rubrics.id))
    .where(and(
      eq(postItems.projectId, projectId),
      gte(postItems.createdAt, sixtyDaysAgo.toISOString()),
    ))
    .groupBy(postItems.rubricId)
    .all();

  if (rubricCounts.length > 0) {
    const maxCount = Math.max(...rubricCounts.map((r: any) => r.count), 1);
    const underused = rubricCounts.filter((r: any) => r.count < maxCount * 0.3);
    if (underused.length > 0) {
      const payload = {
        title: "Недозагруженные рубрики",
        description: "Рубрики, в которых мало постов за последние 60 дней",
        items: underused.map((r: any) => ({ name: r.name || "Без рубрики", color: r.color || "#666", count: r.count })),
      };
      db.delete(analyticsInsights).where(and(
        eq(analyticsInsights.projectId, projectId),
        eq(analyticsInsights.insightType, "underused_rubrics"),
      )).run();
      db.insert(analyticsInsights).values({
        id: uuid(),
        projectId,
        insightType: "underused_rubrics",
        payload: JSON.stringify(payload),
        generatedAt: now,
      }).run();
      count++;
    }
  }

  // 3. Journey coverage — which funnel stages have posts (only funnels used in this project)
  const activeFunnels = db.select({
    id: funnels.id,
    name: funnels.name,
    stages: funnels.stages,
  }).from(funnels).where(and(
    eq(funnels.active, 1),
    sql`${funnels.id} IN (SELECT DISTINCT ${postItems.funnelId} FROM ${postItems} WHERE ${postItems.projectId} = ${projectId})`,
  )).all();

  for (const funnel of activeFunnels) {
    const stages: string[] = (() => { try { if (!funnel.stages) return []; const parsed = JSON.parse(funnel.stages); return Array.isArray(parsed) ? parsed.map((s: any) => typeof s === "string" ? s : s.name || String(s)) : []; } catch { return []; } })();
    if (stages.length === 0) continue;

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

    if (missingStages.length > 0) {
      const payload = {
        title: `Воронка: ${funnel.name}`,
        description: "Этапы воронки без контента",
        funnelName: funnel.name,
        stages: stages,
        covered: stages.filter((s: string) => coveredStages.has(s)),
        missing: missingStages,
      };
      db.delete(analyticsInsights).where(and(
        eq(analyticsInsights.projectId, projectId),
        eq(analyticsInsights.insightType, "journey_coverage"),
        sql`json_extract(payload, '$.funnelName') = ${funnel.name}`,
      )).run();
      db.insert(analyticsInsights).values({
        id: uuid(),
        projectId,
        insightType: "journey_coverage",
        payload: JSON.stringify(payload),
        generatedAt: now,
      }).run();
      count++;
    }
  }

  return count;
}
