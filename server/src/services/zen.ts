export interface ZenPost {
  title: string;
  text: string;
  date: string;
  url: string;
  views: number;
  likes: number;
}

export async function fetchZenArticle(url: string): Promise<{ posts: ZenPost[]; name: string }> {
  const cleanUrl = url.replace(/[\s\n]/g, "").replace(/\?.*$/, "");

  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Дзен: HTTP ${res.status} при загрузке статьи`);
  }

  const html = await res.text();

  // Title: og:title, then h1, then document title
  let title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || "";
  if (!title) {
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) title = stripTags(h1Match[1]);
  }
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) title = stripTags(titleMatch[1]);
  }

  // Description: og:description or meta description
  let description = extractMeta(html, "og:description") || extractMeta(html, "description") || "";

  // Article text: look for common Zen article containers
  let articleText = "";

  // Try JSON-LD first (structured data)
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis);
  if (jsonLdMatches) {
    for (const block of jsonLdMatches) {
      try {
        const json = JSON.parse(block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, ""));
        const articleBody = json?.articleBody || json?.description || "";
        if (articleBody && articleBody.length > articleText.length) {
          articleText = articleBody;
        }
      } catch {}
    }
  }

  // Try common Zen content selectors via regex
  if (!articleText) {
    const contentPatterns = [
      /<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i,
      /<div[^>]*class="[^"]*content[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*zen[_-]?article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*data-testid="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        const cleaned = match[1]
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<figure[\s\S]*?<\/figure>/gi, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<p[^>]*>/gi, "\n")
          .replace(/<\/p>/gi, "")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (cleaned.length > articleText.length) {
          articleText = cleaned;
        }
      }
    }
  }

  // Final fallback: just get all paragraph text
  if (!articleText || articleText.length < 100) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) {
      articleText = pMatches
        .map((p) => stripTags(p))
        .filter((t) => t.length > 20)
        .join("\n\n");
    }
  }

  // Date from JSON-LD or og:article:published_time
  let date = extractMeta(html, "article:published_time") || "";
  if (!date) {
    const dateMatch = html.match(/datetime="([^"]+)"|"datePublished"\s*:\s*"([^"]+)"/i);
    if (dateMatch) date = dateMatch[1] || dateMatch[2];
  }

  // Extract channel/author name
  let author = extractMeta(html, "author") || extractMeta(html, "og:site_name") || "";
  if (!author) {
    const authorMatch = html.match(/"authorName"\s*:\s*"([^"]+)"/);
    if (authorMatch) author = authorMatch[1];
  }

  const combined = [title, description, articleText].filter(Boolean).join("\n\n").trim();

  const post: ZenPost = {
    title: title || "Статья без заголовка",
    text: combined || "Не удалось извлечь текст статьи",
    date: date || new Date().toISOString(),
    url: cleanUrl,
    views: 0,
    likes: 0,
  };

  return {
    posts: [post],
    name: author || "Дзен",
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
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
