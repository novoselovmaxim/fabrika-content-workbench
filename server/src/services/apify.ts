import { db } from "../db.js";
import { settings } from "../schema.js";
import { eq } from "drizzle-orm";

function getApifyApiKey(): string {
  const fromDb = db.select().from(settings).where(eq(settings.key, "apify_api_key")).get()?.value;
  return fromDb || process.env.APIFY_API_KEY || "";
}

interface InstagramPostMetrics {
  id: string;
  code: string;
  url: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  caption: string;
}

interface InstagramProfileResult {
  followerCount: number;
  followingCount: number;
  postCount: number;
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
}

export function isApifyConfigured(): boolean {
  return !!getApifyApiKey();
}

export async function fetchInstagramProfile(username: string): Promise<InstagramProfileResult | null> {
  const apiKey = getApifyApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apidojo~instagram-scraper/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [`https://www.instagram.com/${username}/`],
          maxItems: 1,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0];
    return {
      followerCount: item.owner?.followerCount ?? 0,
      followingCount: item.owner?.followingCount ?? 0,
      postCount: item.owner?.postCount ?? 0,
      username: item.owner?.username ?? username,
      fullName: item.owner?.fullName ?? "",
      isPrivate: item.owner?.isPrivate ?? false,
      isVerified: item.owner?.isVerified ?? false,
    };
  } catch {
    return null;
  }
}

function extractInstagramCaption(item: any): string {
  if (item.caption) return item.caption;
  if (item.text) return item.text;
  if (item.description) return item.description;
  if (item.title) return item.title;
  if (item.edge_media_to_caption?.edges?.[0]?.node?.text) {
    return item.edge_media_to_caption.edges[0].node.text;
  }
  if (item.node?.caption) return item.node.caption;
  if (item.node?.text) return item.node.text;
  if (item.node?.edge_media_to_caption?.edges?.[0]?.node?.text) {
    return item.node.edge_media_to_caption.edges[0].node.text;
  }
  if (item.hashtags?.length > 0) return item.hashtags.join(" ");
  return "";
}

function extractInstagramType(item: any): string {
  const raw = item.type || item.__typename || "";
  if (raw.includes("Video") || raw.includes("Reel") || raw.includes("clip")) return "Reel";
  if (raw.includes("Carousel") || raw.includes("Sidecar") || raw.includes("graphsidecar")) return "Карусель";
  if (raw.includes("Image") || raw.includes("Photo") || raw.includes("graphimage")) return "Фото";
  return "Пост";
}

export async function fetchInstagramPosts(username: string, limit: number = 20): Promise<InstagramPostMetrics[] | null> {
  const apiKey = getApifyApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apidojo~instagram-scraper/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [`https://www.instagram.com/${username}/`],
          maxItems: limit,
        }),
        signal: AbortSignal.timeout(180000),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[apify] fetchInstagramPosts HTTP ${res.status} for "${username}": ${text.slice(0, 200)}`);
      return null;
    }
    let data = await res.json();
    if (!Array.isArray(data)) {
      if (Array.isArray(data.data)) data = data.data;
      else if (Array.isArray(data.items)) data = data.items;
      else if (data.output && Array.isArray(data.output)) data = data.output;
      else {
        console.error(`[apify] fetchInstagramPosts: non-array response for "${username}"`, JSON.stringify(data).slice(0, 300));
        return null;
      }
    }

    // Debug: log first item keys
    if (data.length > 0) {
      const keys = Object.keys(data[0]).sort();
      console.error(`[apify] First item keys for "${username}":`, keys.join(", "));
      console.error(`[apify] Type="${data[0].type}", caption="${(data[0].caption || "").slice(0, 80)}", hashtags=${data[0].hashtags?.length || 0}`);
    }

    const ownerName = (item: any) => {
      if (!item.owner) return item.username || null;
      if (typeof item.owner === "string") return item.owner;
      if (typeof item.owner === "object" && item.owner) {
        return item.owner.username || item.owner.fullName || null;
      }
      return null;
    };
    const filtered = data.filter((item: any) => {
      const name = ownerName(item);
      return name && name.toLowerCase() === username.toLowerCase();
    });
    if (filtered.length === 0 && data.length > 0) {
      console.error("[apify] All posts filtered out. First item owner:", ownerName(data[0]));
    }
    const items = filtered.length > 0 ? filtered : data;
    return items.map((item: any) => ({
      id: item.id ?? item.code ?? "",
      code: item.code ?? item.shortCode ?? "",
      url: item.url ?? "",
      createdAt: item.createdAt ?? item.takenAt ?? item.timestamp ?? "",
      likeCount: item.likeCount ?? item.likesCount ?? 0,
      commentCount: item.commentCount ?? item.commentsCount ?? 0,
      caption: extractInstagramCaption(item),
    }));
  } catch (e: any) {
    console.error(`[apify] fetchInstagramPosts exception for "${username}":`, e?.message || e);
    return null;
  }
}
