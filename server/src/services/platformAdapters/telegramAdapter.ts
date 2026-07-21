import type { PlatformAdapter, PlatformMetrics, PlatformAuthConfig } from "./types.js";

function parseViewsCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase();
  if (s.endsWith("K")) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith("M")) return Math.round(parseFloat(s) * 1_000_000);
  return parseInt(s.replace(/\D/g, ""), 10) || undefined;
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function findEndOfDiv(html: string, startIdx: number): number {
  let depth = 0;
  let i = startIdx;
  const len = html.length;
  while (i < len) {
    const c = html[i];
    if (c === '<') {
      const tagEnd = html.indexOf('>', i);
      if (tagEnd < 0) { i++; continue; }
      const tag = html.slice(i + 1, tagEnd).trim();
      if (tag.startsWith('/')) {
        depth--;
      } else if (!tag.endsWith('/') && !tag.startsWith('!') && !tag.startsWith('?')) {
        const tagName = tag.split(/\s/)[0].toLowerCase();
        if (tagName !== 'br' && tagName !== 'hr' && tagName !== 'img' && tagName !== 'input' && tagName !== 'meta' && tagName !== 'link') {
          depth++;
        }
      }
      i = tagEnd + 1;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return len;
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

    const posts: PlatformMetrics[] = [];
    const idRegex = /data-post="[^/]+\/(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(html)) !== null) {
      const postId = m[1];
      const wrapStartIdx = html.lastIndexOf("<div", m.index);
      const wrapEndIdx = findEndOfDiv(html, wrapStartIdx);

      const block = html.slice(wrapStartIdx, wrapEndIdx);

      const viewsMatch = block.match(/tgme_widget_message_views[^>]*>([^<]+)</);
      const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/);

      let caption: string | undefined;
      const textMatch = block.match(/<div class="tgme_widget_message_text[^>]*">([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_reactions|$)/);
      if (textMatch) {
        caption = stripTags(textMatch[1]) || undefined;
      }
      if (!caption) {
        const altMatch = block.match(/<div class="tgme_widget_message_text[^>]*">([\s\S]*?)<\/div>/);
        if (altMatch) {
          caption = stripTags(altMatch[1]) || undefined;
        }
      }

      posts.push({
        metrics: { impressions: parseViewsCount(viewsMatch?.[1]) },
        externalId: postId,
        postedAt: dateMatch?.[1],
        caption,
      });

      if (posts.length >= limit) break;
    }

    return posts;
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
