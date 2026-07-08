import { db } from "../db.js";
import { brandFacts } from "../schema.js";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { generate, getModelForTask, extractJSON } from "./aiGateway.js";

export interface BrandFactRow {
  id: string;
  projectId: string;
  category: string;
  sourceType: string;
  sourceRef: string | null;
  factText: string;
  confidence: number | null;
  validated: number | null;
  language: string | null;
}

export interface SelectorOpts {
  categories?: string[];
  hantStage?: number;
  language?: string;
  limit?: number;
  topicTitle?: string;
}

export interface SelectorResult {
  facts: BrandFactRow[];
}

export async function selectRelevantFacts(
  projectId: string,
  opts: SelectorOpts = {}
): Promise<SelectorResult> {
  const limit = opts.limit ?? 15;
  const conditions: any[] = [eq(brandFacts.projectId, projectId)];

  if (opts.categories && opts.categories.length > 0) {
    conditions.push(inArray(brandFacts.category, opts.categories));
  }

  if (opts.language) {
    conditions.push(eq(brandFacts.language, opts.language));
  }

  const candidates = db
    .select()
    .from(brandFacts)
    .where(and(...conditions))
    .orderBy(desc(brandFacts.validated), desc(brandFacts.confidence))
    .all() as BrandFactRow[];

  if (candidates.length === 0) return { facts: [] };

  if (candidates.length <= limit) {
    return { facts: candidates };
  }

  const topicContext = opts.topicTitle ? `Контекст: тема поста «${opts.topicTitle}»${opts.hantStage ? `, стадия воронки: ${opts.hantStage}` : ""}.` : "";

  const factList = candidates.map((f, i) =>
    `${i + 1}. [${f.category}] (conf: ${f.confidence ?? 0.5}) ${f.factText}`
  ).join("\n");

  const model = getModelForTask("strategy");
  const prompt = `Из списка фактов о бренде выбери не более ${limit} наиболее релевантных для генерации поста.

${topicContext}
Факты к отбору:
${factList}

Верни JSON-массив индексов выбранных фактов (от 1 до ${candidates.length}):
{ "selected": [1, 3, 7] }

Выбирай только те факты, которые напрямую применимы к теме. Только JSON, без пояснений.`;

  const result = await generate({
    provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
    model,
    prompt,
    systemPrompt: "Ты — контент-стратег. Выбирай факты для поста. Только JSON.",
    temperature: 0.2,
    maxTokens: 1000,
    responseFormat: "json",
  });

  try {
    const cleaned = extractJSON(result.content);
    const parsed = JSON.parse(cleaned);
    const indices: number[] = Array.isArray(parsed.selected) ? parsed.selected : Array.isArray(parsed) ? parsed : [];

    const selected = indices
      .map((i: number) => candidates[i - 1])
      .filter(Boolean)
      .slice(0, limit);

    return { facts: selected.length > 0 ? selected : candidates.slice(0, limit) };
  } catch {
    return { facts: candidates.slice(0, limit) };
  }
}
