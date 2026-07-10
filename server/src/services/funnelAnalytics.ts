import { db } from "../db.js";
import { funnelAnalytics, postItems, analyticsSnapshots, funnels } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export function recomputeFunnelAnalytics(funnelId: string): number {
  const funnel = db
    .select()
    .from(funnels)
    .where(eq(funnels.id, funnelId))
    .get();
  if (!funnel) return 0;

  const stages: string[] = (() => {
    try {
      return funnel.stages ? JSON.parse(funnel.stages) : [];
    } catch {
      return [];
    }
  })();

  if (stages.length === 0) return 0;

  let count = 0;

  for (let i = 0; i < stages.length; i++) {
    const stageName = stages[i];

    const agg = db
      .select({
        postsCount: sql<number>`count(distinct ${postItems.id})`,
        avgReach: sql<number>`avg(${analyticsSnapshots.metricValue})`,
        avgEngagementRate: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'engagement_rate' then ${analyticsSnapshots.metricValue} end)`,
      })
      .from(postItems)
      .leftJoin(
        analyticsSnapshots,
        eq(analyticsSnapshots.postItemId, postItems.id)
      )
      .where(
        and(
          eq(postItems.funnelId, funnelId),
          eq(postItems.funnelStage, stageName)
        )
      )
      .get();

    if (!agg) continue;

    const postsCount = agg.postsCount ?? 0;

    let conversionToNextStage: number | null = null;
    if (i < stages.length - 1) {
      const nextStageName = stages[i + 1];
      const nextCount = db
        .select({
          count: sql<number>`count(distinct ${postItems.id})`,
        })
        .from(postItems)
        .where(
          and(
            eq(postItems.funnelId, funnelId),
            eq(postItems.funnelStage, nextStageName)
          )
        )
        .get();
      if (nextCount && nextCount.count > 0 && postsCount > 0) {
        conversionToNextStage = nextCount.count / postsCount;
      }
    }

    db.insert(funnelAnalytics)
      .values({
        id: uuid(),
        funnelId,
        stageName,
        postsCount,
        avgReach: agg.avgReach,
        avgEngagementRate: agg.avgEngagementRate,
        conversionToNextStage,
      })
      .onConflictDoNothing()
      .run();

    count++;
  }

  return count;
}

export function getFunnelAnalytics(funnelId: string) {
  return db
    .select()
    .from(funnelAnalytics)
    .where(eq(funnelAnalytics.funnelId, funnelId))
    .orderBy(funnelAnalytics.stageName)
    .all();
}

export function clearFunnelAnalytics(funnelId: string): void {
  db.delete(funnelAnalytics).where(eq(funnelAnalytics.funnelId, funnelId)).run();
}
