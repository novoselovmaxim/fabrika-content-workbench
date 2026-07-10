import type { PlatformAdapter, PlatformMetrics } from "./types.js";
import { fetchInstagramPosts, fetchInstagramProfile, isApifyConfigured } from "../apify.js";

export const instagramAdapter: PlatformAdapter = {
  platformType: "instagram",
  supportedMetrics: {
    own: [],
    competitor: ["likes", "comments"],
  },
  async fetchOwnPostMetrics(): Promise<PlatformMetrics | null> {
    return null;
  },
  async fetchCompetitorMetrics(identifier: string, limit: number): Promise<PlatformMetrics[]> {
    if (!isApifyConfigured()) return [];
    const posts = await fetchInstagramPosts(identifier, limit);
    if (!posts) return [];
    return posts.map((p) => ({
      metrics: { likes: p.likeCount, comments: p.commentCount },
      externalId: p.id,
      postedAt: p.createdAt,
      caption: p.caption,
    }));
  },
};
