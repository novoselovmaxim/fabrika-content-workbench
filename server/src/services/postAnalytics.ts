import { db } from "../db.js";
import { postAnalytics, postItems, analyticsSnapshots, platforms } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { computeEngagementRate } from "../constants/engagementFormulas.js";

export function recomputePostAnalytics(postItemId: string): void {
  const post = db.select().from(postItems).where(eq(postItems.id, postItemId)).get();
  if (!post) return;

  let platformType: string | null = null;
  if (post.platformId) {
    const platform = db.select().from(platforms).where(eq(platforms.id, post.platformId)).get();
    if (platform) platformType = platform.type;
  }

  const snapshot = db
    .select({
      reach: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'reach' then ${analyticsSnapshots.metricValue} end)`,
      impressions: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'impressions' then ${analyticsSnapshots.metricValue} end)`,
      engagementRate: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'engagement_rate' then ${analyticsSnapshots.metricValue} end)`,
      saves: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'saves' then ${analyticsSnapshots.metricValue} end)`,
      comments: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'comments' then ${analyticsSnapshots.metricValue} end)`,
      likes: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'likes' then ${analyticsSnapshots.metricValue} end)`,
      shares: sql<number>`avg(case when ${analyticsSnapshots.metricName} = 'shares' then ${analyticsSnapshots.metricValue} end)`,
    })
    .from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.postItemId, postItemId))
    .get();

  if (!snapshot) return;
  if (snapshot.engagementRate == null && snapshot.likes == null && snapshot.comments == null && snapshot.reach == null && snapshot.impressions == null) return;

  let er: number | null = snapshot.engagementRate;

  if (er == null && platformType) {
    er = computeEngagementRate(platformType, {
      likes: snapshot.likes ?? undefined,
      comments: snapshot.comments ?? undefined,
      saves: snapshot.saves ?? undefined,
      shares: snapshot.shares ?? undefined,
      reach: snapshot.reach ?? undefined,
      impressions: snapshot.impressions ?? undefined,
    });
  }

  if (er == null && snapshot.likes != null && snapshot.reach != null && snapshot.reach > 0) {
    er = (snapshot.likes + (snapshot.comments || 0)) / snapshot.reach;
  }
  if (er == null && snapshot.likes != null && snapshot.comments != null) {
    er = (snapshot.likes + snapshot.comments) / Math.max(snapshot.likes + snapshot.comments, 1);
  }

  if (er == null) return;

  let rubricMedian: number | null = null;
  if (post.rubricId) {
    const med = db
      .select({ median: sql<number>`avg(${analyticsSnapshots.metricValue})` })
      .from(analyticsSnapshots)
      .innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
      .where(and(
        eq(postItems.rubricId, post.rubricId),
        eq(analyticsSnapshots.metricName, "engagement_rate"),
        sql`${analyticsSnapshots.metricValue} IS NOT NULL`,
      ))
      .get();
    if (med) rubricMedian = med.median;
  }

  let platformMedian: number | null = null;
  if (post.platformId) {
    const med = db
      .select({ median: sql<number>`avg(${analyticsSnapshots.metricValue})` })
      .from(analyticsSnapshots)
      .innerJoin(postItems, eq(analyticsSnapshots.postItemId, postItems.id))
      .where(and(
        eq(postItems.platformId, post.platformId),
        eq(analyticsSnapshots.metricName, "engagement_rate"),
        sql`${analyticsSnapshots.metricValue} IS NOT NULL`,
      ))
      .get();
    if (med) platformMedian = med.median;
  }

  const reference = rubricMedian ?? platformMedian;
  let classification: string = "normal";
  if (reference != null) {
    if (er >= reference * 1.3) classification = "hit";
    else if (er < reference * 0.7) classification = "underperforming";
  }

  db.insert(postAnalytics)
    .values({
      postItemId,
      reach: snapshot.reach,
      impressions: snapshot.impressions,
      engagementRate: er,
      saves: snapshot.saves,
      comments: snapshot.comments,
      period: "lifetime",
      classification,
      rubricMedianEngagementRate: rubricMedian,
      platformMedianEngagementRate: platformMedian,
    })
    .onConflictDoUpdate({
      target: postAnalytics.postItemId,
      set: {
        reach: snapshot.reach,
        impressions: snapshot.impressions,
        engagementRate: er,
        saves: snapshot.saves,
        comments: snapshot.comments,
        classification,
        rubricMedianEngagementRate: rubricMedian,
        platformMedianEngagementRate: platformMedian,
        computedAt: sql`(current_timestamp)`,
      },
    })
    .run();
}

export function recomputeAllPostAnalytics(projectId: string): number {
  const posts = db
    .select({ id: postItems.id })
    .from(postItems)
    .where(eq(postItems.projectId, projectId))
    .all();
  for (const p of posts) {
    recomputePostAnalytics(p.id);
  }
  return posts.length;
}

export function getPostAnalytics(postItemId: string) {
  const row = db
    .select()
    .from(postAnalytics)
    .where(eq(postAnalytics.postItemId, postItemId))
    .get();
  if (!row) return null;

  let platformType: string | null = null;
  const post = db.select({ platformId: postItems.platformId }).from(postItems).where(eq(postItems.id, postItemId)).get();
  if (post?.platformId) {
    const platform = db.select({ type: platforms.type }).from(platforms).where(eq(platforms.id, post.platformId)).get();
    if (platform) platformType = platform.type;
  }

  return { ...row, platformType };
}

export function getProjectAnalytics(projectId: string) {
  return db
    .select()
    .from(postAnalytics)
    .innerJoin(postItems, eq(postAnalytics.postItemId, postItems.id))
    .where(eq(postItems.projectId, projectId))
    .all();
}
