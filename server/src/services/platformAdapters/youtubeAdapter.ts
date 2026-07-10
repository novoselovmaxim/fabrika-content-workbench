import type { PlatformAdapter, PlatformMetrics, PlatformAuthConfig } from "./types.js";

async function fetchYouTubeVideoStats(videoIds: string[], apiKey: string): Promise<Map<string, PlatformMetrics>> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data: any = await res.json();
    const map = new Map<string, PlatformMetrics>();
    for (const item of data.items || []) {
      map.set(item.id, {
        metrics: {
          impressions: Number(item.statistics.viewCount),
          likes: Number(item.statistics.likeCount),
          comments: Number(item.statistics.commentCount),
        },
        externalId: item.id,
        postedAt: item.snippet.publishedAt,
        caption: item.snippet.title,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchYouTubeChannelVideos(channelIdOrHandle: string, limit: number, apiKey: string): Promise<PlatformMetrics[]> {
  try {
    let channelId = channelIdOrHandle;

    if (channelIdOrHandle.startsWith("@") || channelIdOrHandle.startsWith("UC")) {
      const handle = channelIdOrHandle.replace(/^@/, "");
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
      const searchData: any = await searchRes.json();
      if (searchData?.items?.[0]?.snippet?.channelId) {
        channelId = searchData.items[0].snippet.channelId;
      }
    }

    if (!channelId || channelId === channelIdOrHandle) {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(channelIdOrHandle)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
      const searchData: any = await searchRes.json();
      if (searchData?.items?.[0]?.snippet?.channelId) {
        channelId = searchData.items[0].snippet.channelId;
      }
    }

    if (!channelId) return [];

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=${limit}&type=video&key=${apiKey}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const searchData: any = await searchRes.json();

    const videoIds = (searchData.items || []).map((item: any) => item.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    const statsMap = await fetchYouTubeVideoStats(videoIds, apiKey);
    return videoIds.map((id: string) => statsMap.get(id)).filter(Boolean) as PlatformMetrics[];
  } catch {
    return [];
  }
}

export const youtubeAdapter: PlatformAdapter = {
  platformType: "youtube",
  supportedMetrics: { own: ["impressions", "likes", "comments"], competitor: ["impressions", "likes", "comments"] },
  async fetchOwnPostMetrics(externalMediaId: string, config: PlatformAuthConfig): Promise<PlatformMetrics | null> {
    if (!config.youtubeApiKey) return null;
    const map = await fetchYouTubeVideoStats([externalMediaId], config.youtubeApiKey);
    return map.get(externalMediaId) || null;
  },
  async fetchCompetitorMetrics(identifier: string, limit: number, config: PlatformAuthConfig): Promise<PlatformMetrics[]> {
    if (!config.youtubeApiKey) return [];
    return fetchYouTubeChannelVideos(identifier, limit, config.youtubeApiKey);
  },
};
