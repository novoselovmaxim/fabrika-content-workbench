import type { PlatformAdapter, PlatformMetrics, PlatformAuthConfig } from "./types.js";

function parseViewsCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase();
  if (s.endsWith("K")) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith("M")) return Math.round(parseFloat(s) * 1_000_000);
  return parseInt(s.replace(/\D/g, ""), 10) || undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

async function fetchTelegramPosts(channelUsername: string, limit: number): Promise<PlatformMetrics[]> {
  const clean = channelUsername.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  try {
    const res = await fetch(`https://t.me/s/${clean}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const blocks = html.match(/<div class="tgme_widget_message[\s\S]*?(?=<div class="tgme_widget_message|\s*<\/div>\s*<\/div>\s*<\/section>)/g) || [];

    return blocks.slice(0, limit).map((block) => {
      const idMatch = block.match(/data-post="[^/]+\/(\d+)"/);
      const viewsMatch = block.match(/tgme_widget_message_views">([^<]+)</);
      const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/);
      const textMatch = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);

      return {
        metrics: { impressions: parseViewsCount(viewsMatch?.[1]) },
        externalId: idMatch?.[1],
        postedAt: dateMatch?.[1],
        caption: textMatch ? stripTags(textMatch[1]) : undefined,
      };
    });
  } catch {
    return [];
  }
}

export const telegramAdapter: PlatformAdapter = {
  platformType: "telegram",
  supportedMetrics: { own: ["impressions"], competitor: ["impressions"] },
  async fetchOwnPostMetrics(externalMediaId: string, config: PlatformAuthConfig) {
    const channel = config.channelUsername;
    if (!channel) return null;
    const posts = await fetchTelegramPosts(channel, 30);
    const post = posts.find((p) => p.externalId === externalMediaId);
    return post || null;
  },
  async fetchCompetitorMetrics(identifier: string, limit: number) {
    return fetchTelegramPosts(identifier, limit);
  },
};
