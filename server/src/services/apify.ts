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
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((item: any) => ({
      id: item.id ?? "",
      code: item.code ?? "",
      url: item.url ?? "",
      createdAt: item.createdAt ?? "",
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      caption: item.caption ?? "",
    }));
  } catch {
    return null;
  }
}
