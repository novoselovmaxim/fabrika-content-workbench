export interface InstagramPost {
  title: string;
  text: string;
  date: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  mediaType: string;
}

export async function fetchInstagramPost(url: string, userDescription?: string): Promise<{ posts: InstagramPost[]; name: string }> {
  const cleanUrl = url.replace(/[\s\n]/g, "").replace(/\?.*$/, "").replace(/\/$/, "");

  let caption = "";
  let author = "";
  let mediaType = "image";

  // Try oEmbed API (public, no auth)
  try {
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(cleanUrl)}`;
    const res = await fetch(oembedUrl, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data: any = await res.json();
      caption = data.title || data.caption || "";
      author = data.author_name || "";
    }
  } catch {}

  // If oEmbed fails, try scraping the page
  if (!caption) {
    try {
      const res = await fetch(cleanUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();

        // Try JSON-LD
        const jsonMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/is);
        if (jsonMatch) {
          try {
            const json = JSON.parse(jsonMatch[1]);
            caption = json?.caption || json?.description || "";
            author = json?.author?.name || json?.publisher?.name || "";
          } catch {}
        }

        // Try meta tags
        if (!caption) {
          caption = extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || "";
        }
        if (!author) {
          author = extractMeta(html, "og:site_name") || extractMeta(html, "twitter:site") || "";
        }
      }
    } catch {}
  }

  // Build text: caption + user description
  const textParts: string[] = [];
  if (caption) textParts.push(caption);
  if (userDescription?.trim()) {
    textParts.push("");
    textParts.push("[Описание визуала]");
    textParts.push(userDescription.trim());
  }

  // Detect media type from URL
  if (cleanUrl.includes("/reel/") || cleanUrl.includes("/reels/")) {
    mediaType = "video";
  } else if (cleanUrl.includes("/p/")) {
    mediaType = "image";
  }

  const post: InstagramPost = {
    title: (caption || "Пост Instagram").slice(0, 200),
    text: textParts.join("\n"),
    date: new Date().toISOString(),
    url: cleanUrl,
    views: 0,
    likes: 0,
    comments: 0,
    mediaType,
  };

  return {
    posts: [post],
    name: author || "Instagram",
  };
}

function extractMeta(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  return "";
}
