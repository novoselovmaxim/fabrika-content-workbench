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
- "direct": массив прямых конкурентов, каждый с полями: name, url, positioning, strengths (string[]), weaknesses (string[]), audience, contentStrategy
- "indirect": массив косвенных конкурентов, те же поля
- "marketInsights": строка с выводами о рыночных трендах и пробелах
- "keywordsFound": массив найденных ключевых слов

Ответь ТОЛЬКА валидным JSON без пояснений.`;

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
