import { db } from "../db.js";
import { settings } from "../schema.js";
import { eq } from "drizzle-orm";
import { generate, getModelForTask, extractJSON } from "./aiGateway.js";

export interface Competitor {
  name: string;
  url: string;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  audience: string;
  contentStrategy: string;
  mainProducts?: string[];
  contentFormats?: string[];
  brandVoice?: string;
  visualStyle?: string;
  uniqueSellingPoints?: string[];
}

export interface SearchResult {
  direct: Competitor[];
  indirect: Competitor[];
  marketInsights: string;
  keywordsFound: string[];
}

function getSetting(key: string): string {
  try {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value || "";
  } catch {
    return "";
  }
}

async function searchTavily(
  keywords: string[],
  maxResults: number
): Promise<any[]> {
  const apiKey = getSetting("tavily_api_key");
  if (!apiKey) throw new Error("Tavily API key not configured");

  const MAX_QUERY_LENGTH = 350;
  const seen = new Set<string>();
  const allResults: any[] = [];

  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const kw of keywords) {
    if (currentLen + kw.length + 1 > MAX_QUERY_LENGTH && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(kw);
    currentLen += kw.length + 1;
  }
  if (current.length > 0) chunks.push(current);

  for (const chunk of chunks) {
    const query = chunk.join(" ");
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: maxResults,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`Tavily chunk failed (${query.slice(0, 60)}…): ${res.status} ${err}`);
      continue;
    }

    const data = await res.json();
    for (const r of data.results || []) {
      const key = r.url || r.title;
      if (key && !seen.has(key)) {
        seen.add(key);
        allResults.push(r);
      }
    }
  }

  return allResults.slice(0, maxResults * 2);
}

async function searchBrave(
  keywords: string[],
  maxResults: number,
  options: { region?: string; language?: string }
): Promise<any[]> {
  const apiKey = getSetting("brave_api_key");
  if (!apiKey) throw new Error("Brave API key not configured");

  const params = new URLSearchParams({
    q: keywords.join(" "),
    count: String(maxResults),
  });
  if (options.region) params.set("region", options.region);
  if (options.language) params.set("lang", options.language);

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brave API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.web?.results || [];
}

async function analyzeResults(
  rawResults: any[],
  keywords: string[],
  promptOverride?: string
): Promise<SearchResult> {
  const model = getModelForTask("strategy");

  const defaultPrompt = `Проанализируй результаты поиска конкурентов и создай структурированный отчёт.

Поисковые запросы: ${keywords.join(", ")}

Исходные результаты:
${JSON.stringify(rawResults, null, 2)}

Верни JSON-объект с полями:
- "direct": массив прямых конкурентов
- "indirect": массив косвенных конкурентов

Каждый конкурент содержит:
  - name (строка): название бренда
  - url (строка): URL
  - positioning (строка): позиционирование 1-2 предложения
  - strengths (string[]): 3-5 сильных сторон
  - weaknesses (string[]): 3-5 слабых сторон
  - audience (строка): описание целевой аудитории
  - contentStrategy (строка): описание контент-стратегии
  - mainProducts (string[]): основные продукты/услуги
  - contentFormats (string[]): форматы контента (видео, статьи, подкасты, etc.)
  - brandVoice (строка): голос бренда и тональность
  - visualStyle (строка): визуальный стиль (цвета, типографика, стиль фото)
  - uniqueSellingPoints (string[]): уникальные торговые предложения

Также:
- "marketInsights": строка с выводами о рыночных трендах и пробелах
- "keywordsFound": массив найденных ключевых слов

Ответь ТОЛЬКО валидным JSON без пояснений.`;

  const result = await generate({
    provider: "vsellm",
    model,
    prompt: promptOverride || defaultPrompt,
    systemPrompt: "Ты эксперт по анализу конкурентов. Анализируй результаты и возвращай структурированный JSON на русском.",
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: "json",
  });

  const raw = result.content;

  try {
    const parsed = JSON.parse(extractJSON(raw));
    return {
      direct: parsed.direct || [],
      indirect: parsed.indirect || [],
      marketInsights: parsed.marketInsights || "",
      keywordsFound: parsed.keywordsFound || [],
    };
  } catch (e: any) {
    console.error("[searchService] JSON parse failed:", e.message, "raw:", raw.slice(0, 300));
    return {
      direct: [],
      indirect: [],
      marketInsights: "AI анализ не удалось обработать",
      keywordsFound: [],
    };
  }
}

export async function analyzeCompetitorUrl(
  url: string
): Promise<Competitor> {
  const model = getModelForTask("strategy");

  // Fetch page content
  let pageContent = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FabrikaAnalyzer/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      pageContent = text.slice(0, 8000);
    }
  } catch {
    // If fetch fails, pass URL only
  }

  const prompt = `Проанализируй конкурента по URL и доступной информации.

URL: ${url}
${pageContent ? `\nСодержимое страницы:\n${pageContent}\n` : "\n(доступ к странице не получен, анализируй по URL)\n"}

Верни JSON с полями:
- "name": название бренда
- "url": ${url}
- "positioning": позиционирование (1-2 предложения)
- "strengths": массив 3-5 сильных сторон
- "weaknesses": массив 3-5 слабых сторон
- "audience": описание целевой аудитории
- "contentStrategy": описание контент-стратегии
- "mainProducts": массив основных продуктов/услуг
- "contentFormats": массив форматов контента (видео, статьи, подкасты, etc.)
- "brandVoice": голос бренда и тональность
- "visualStyle": визуальный стиль
- "uniqueSellingPoints": массив УТП

Ответь ТОЛЬКО валидным JSON без пояснений.`;

  const result = await generate({
    provider: "vsellm",
    model,
    prompt,
    systemPrompt: "Ты эксперт по анализу конкурентов. Анализируй информацию и возвращай структурированный JSON на русском.",
    temperature: 0.3,
    maxTokens: 3000,
    responseFormat: "json",
  });

  const raw = result.content;
  try {
    const parsed = JSON.parse(extractJSON(raw));
    return {
      name: parsed.name || "Unknown",
      url,
      positioning: parsed.positioning || "",
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      audience: parsed.audience || "",
      contentStrategy: parsed.contentStrategy || "",
      mainProducts: parsed.mainProducts || [],
      contentFormats: parsed.contentFormats || [],
      brandVoice: parsed.brandVoice || "",
      visualStyle: parsed.visualStyle || "",
      uniqueSellingPoints: parsed.uniqueSellingPoints || [],
    };
  } catch (e: any) {
    console.error("[searchService] URL analysis JSON parse failed:", e.message, "raw:", raw.slice(0, 300));
    return {
      name: new URL(url).hostname,
      url,
      positioning: "",
      strengths: [],
      weaknesses: [],
      audience: "",
      contentStrategy: "",
    };
  }
}

export async function searchCompetitors(
  keywords: string[],
  engine: string,
  options: { region?: string; language?: string; maxResults?: number; promptOverride?: string } = {}
): Promise<SearchResult> {
  const maxResults = options.maxResults || 10;

  try {
    let rawResults: any[] = [];

    if (engine === "tavily") {
      rawResults = await searchTavily(keywords, maxResults);
    } else if (engine === "brave") {
      rawResults = await searchBrave(keywords, maxResults, options);
    } else if (engine === "both") {
      const [tavilyResults, braveResults] = await Promise.all([
        searchTavily(keywords, maxResults).catch(() => []),
        searchBrave(keywords, maxResults, options).catch(() => []),
      ]);
      rawResults = [...tavilyResults, ...braveResults];
    } else {
      throw new Error(`Unknown search engine: ${engine}`);
    }

    return await analyzeResults(rawResults, keywords, options.promptOverride);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown search error";
    return {
      direct: [],
      indirect: [],
      marketInsights: `Ошибка поиска: ${message}`,
      keywordsFound: [],
    };
  }
}
