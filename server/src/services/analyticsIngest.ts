import { db } from "../db.js";
import { postItems, analyticsSnapshots, savedCompetitors, competitorAnalytics, platforms } from "../schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getAdapter } from "./platformAdapters/registry.js";
import { computeEngagementRate } from "../constants/engagementFormulas.js";

function resolveAuthConfig(platformType: string, platform?: { name: string; config?: string | null }): Record<string, string | undefined> {
  const config: Record<string, string | undefined> = {};
  if (platform?.config) {
    try {
      const parsed = JSON.parse(platform.config);
      Object.assign(config, parsed);
    } catch {}
  }
  if (platformType === "instagram") {
    // Key is read dynamically by apify.ts from DB/env
  } else if (platformType === "vk") {
    config.vkAccessToken ??= process.env.VK_ACCESS_TOKEN;
  } else if (platformType === "youtube") {
    config.youtubeApiKey ??= process.env.YOUTUBE_API_KEY;
  }
  return config;
}

export async function ingestOwnPostMetrics(postItemId: string): Promise<void> {
  const post = db
    .select({ publishedMediaId: postItems.publishedMediaId, platformId: postItems.platformId })
    .from(postItems)
    .where(eq(postItems.id, postItemId))
    .get();

  if (!post || !post.publishedMediaId) return;

  const platform = post.platformId
    ? db.select().from(platforms).where(eq(platforms.id, post.platformId)).get()
    : null;

  if (!platform) return;

  const adapter = getAdapter(platform.type);
  if (!adapter) return;

  if (adapter.supportedMetrics.own.length === 0) return;

  const result = await adapter.fetchOwnPostMetrics(post.publishedMediaId, resolveAuthConfig(platform.type, platform));
  if (!result) return;

  const now = new Date().toISOString();
  for (const [metricName, metricValue] of Object.entries(result.metrics)) {
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

  const er = computeEngagementRate(platform.type, result.metrics);
  if (er != null) {
    db.insert(analyticsSnapshots).values({
      id: uuid(),
      postItemId,
      metricName: "engagement_rate",
      metricValue: er,
      metricPeriod: "lifetime",
      snapshotDate: now,
    }).run();
  }
}

export async function ingestCompetitorMetrics(savedCompetitorId: string): Promise<number> {
  const competitor = db
    .select()
    .from(savedCompetitors)
    .where(eq(savedCompetitors.id, savedCompetitorId))
    .get();

  if (!competitor?.url) return 0;

  const username = competitor.url.split("/").filter(Boolean).pop() || "";
  if (!username) return 0;

  let platformType = "instagram";
  const urlLower = competitor.url.toLowerCase();
  if (urlLower.includes("t.me") || urlLower.includes("telegram")) platformType = "telegram";
  else if (urlLower.includes("youtube") || urlLower.includes("youtu.be")) platformType = "youtube";
  else if (urlLower.includes("vk.com") || urlLower.includes("vk.ru") || urlLower.includes("vkontakte")) platformType = "vk";

  const adapter = getAdapter(platformType);
  if (!adapter) return 0;

  const medias = await adapter.fetchCompetitorMetrics(username, 12, resolveAuthConfig(platformType));
  if (medias.length === 0) return 0;

  const now = new Date().toISOString();
  let count = 0;

  for (const media of medias) {
    if (!media.externalId) continue;
    const existing = db
      .select({ id: competitorAnalytics.id })
      .from(competitorAnalytics)
      .where(eq(competitorAnalytics.mediaExternalId, media.externalId))
      .get();

    if (existing) continue;

    db.insert(competitorAnalytics).values({
      id: uuid(),
      savedCompetitorId,
      mediaExternalId: media.externalId,
      caption: media.caption || null,
      likes: media.metrics.likes ?? null,
      comments: media.metrics.comments ?? null,
      postedAt: media.postedAt || null,
      fetchedAt: now,
    }).run();
    count++;
  }

  return count;
}
