const META_API_VERSION = "v22.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface InstagramConfig {
  accessToken: string;
  instagramAccountId: string;
  appId?: string;
  appSecret?: string;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl?: string;
  permalink?: string;
  thumbnailUrl?: string;
  timestamp: string;
  likeCount?: number;
  commentsCount?: number;
  reach?: number;
  impressions?: number;
  saves?: number;
  plays?: number;
}

export interface InstagramAccountInsights {
  reach?: number;
  impressions?: number;
  profileViews?: number;
  followerCount?: number;
  period: "day" | "week" | "days_28";
}

export interface InstagramMediaInsights {
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
  saves: number;
  plays?: number;
  shares?: number;
  engagement: number;
}

export class MetaInstagramService {
  private config: InstagramConfig | null = null;

  configure(config: InstagramConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!(this.config?.accessToken && this.config?.instagramAccountId);
  }

  private async graphApi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.config) throw new Error("Instagram not configured");
    const searchParams = new URLSearchParams({
      access_token: this.config.accessToken,
      ...params,
    });
    const url = `${BASE_URL}/${path}?${searchParams}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Instagram API: ${data.error.message}`);
    return data;
  }

  async getAccountInsights(period: "day" | "week" | "days_28" = "week"): Promise<InstagramAccountInsights> {
    const metrics = ["reach", "impressions", "profile_views", "follower_count"];
    const data = await this.graphApi<any>(`${this.config!.instagramAccountId}/insights`, {
      metric: metrics.join(","),
      period,
    });

    const result: InstagramAccountInsights = { period };
    for (const item of data.data || []) {
      const value = item.values?.[0]?.value;
      if (item.name === "reach") result.reach = value;
      else if (item.name === "impressions") result.impressions = value;
      else if (item.name === "profile_views") result.profileViews = value;
      else if (item.name === "follower_count") result.followerCount = value;
    }
    return result;
  }

  async getMediaInsights(mediaId: string): Promise<InstagramMediaInsights> {
    const metrics = ["like_count", "comments_count", "reach", "impressions", "saves", "plays"];
    const data = await this.graphApi<any>(`${mediaId}/insights`, {
      metric: metrics.join(","),
    });

    const raw: Record<string, number> = {};
    for (const item of data.data || []) {
      raw[item.name] = item.values?.[0]?.value || 0;
    }

    const likes = raw.like_count || 0;
    const comments = raw.comments_count || 0;
    const reach = raw.reach || 0;
    const impressions = raw.impressions || 0;
    const saves = raw.saves || 0;
    const plays = raw.plays || 0;

    return {
      likes,
      comments,
      reach,
      impressions,
      saves,
      plays,
      shares: raw.shares,
      engagement: likes + comments + saves > 0 ? ((likes + comments + saves) / impressions) * 100 : 0,
    };
  }

  async getRecentMedia(limit = 20): Promise<InstagramMedia[]> {
    const data = await this.graphApi<any>(`${this.config!.instagramAccountId}/media`, {
      fields: "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count",
      limit: String(limit),
    });

    return (data.data || []).map((item: any) => ({
      id: item.id,
      caption: item.caption,
      mediaType: item.media_type as InstagramMedia["mediaType"],
      mediaUrl: item.media_url,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail_url,
      timestamp: item.timestamp,
      likeCount: item.like_count,
      commentsCount: item.comments_count,
    }));
  }

  async checkAuth(): Promise<{ valid: boolean; userId?: string; error?: string }> {
    try {
      const data = await this.graphApi<any>(this.config!.instagramAccountId, {
        fields: "id,username,name,profile_picture_url",
      });
      return { valid: true, userId: data.id };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }
}

export const instagramService = new MetaInstagramService();
