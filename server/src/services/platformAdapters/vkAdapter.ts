import type { PlatformAdapter, PlatformMetrics, PlatformAuthConfig } from "./types.js";
import { fetchVKPosts, fetchVKPostById } from "../vk.js";

function parseVKExternalId(externalMediaId: string): { ownerId: string; postId: string } | null {
  const parts = externalMediaId.split("_");
  if (parts.length < 2) return null;
  return { ownerId: parts[0], postId: parts.slice(1).join("_") };
}

export const vkAdapter: PlatformAdapter = {
  platformType: "vk",
  supportedMetrics: {
    own: ["reach", "likes", "comments", "shares", "engagement_rate"],
    competitor: ["reach", "likes", "comments", "shares"],
  },
  async fetchOwnPostMetrics(externalMediaId: string, config: PlatformAuthConfig): Promise<PlatformMetrics | null> {
    if (!config.vkAccessToken) return null;
    const parsed = parseVKExternalId(externalMediaId);
    if (!parsed) return null;
    try {
      const post = await fetchVKPostById(parsed.ownerId, parsed.postId, config.vkAccessToken);
      if (!post) return null;
      return {
        metrics: {
          reach: post.views,
          likes: post.likes,
          comments: post.comments,
          shares: post.reposts,
        },
        externalId: `${parsed.ownerId}_${post.id}`,
        postedAt: post.date,
      };
    } catch {
      return null;
    }
  },
  async fetchCompetitorMetrics(identifier: string, limit: number, config: PlatformAuthConfig): Promise<PlatformMetrics[]> {
    if (!config.vkAccessToken) return [];
    try {
      const { posts } = await fetchVKPosts(identifier, config.vkAccessToken);
      return posts.slice(0, limit).map((p: any) => ({
        metrics: {
          reach: p.views,
          likes: p.likes,
          comments: p.comments,
          shares: p.reposts,
        },
        externalId: String(p.id),
        postedAt: p.date,
        caption: p.text,
      }));
    } catch {
      return [];
    }
  },
};
