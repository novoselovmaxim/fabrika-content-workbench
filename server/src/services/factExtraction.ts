import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { brandFacts, projectKnowledge, projects, products } from "../schema.js";
import { eq, and } from "drizzle-orm";
import { generate, getModelForTask, extractJSON } from "./aiGateway.js";

const FACT_CATEGORIES = ["product", "audience", "promise", "constraint", "proof", "faq", "other"];

async function extractFromContent(
  content: string,
  title: string
): Promise<{ category: string; factText: string; confidence: number }[]> {
  const model = getModelForTask("strategy");
  const prompt = `Извлеки из текста атомарные факты о бренде или продукте. Каждый факт — одно короткое проверяемое утверждение (не абзац, не список).

Категории (выбери одну для каждого факта): ${FACT_CATEGORIES.join(", ")}.

Название: ${title}

Текст:
${content}

Верни JSON-массив:
[{ "category": "...", "factText": "...", "confidence": 0.0-1.0 }]

confidence — насколько явно факт следует из текста (1.0 — прямая цитата или утверждение, 0.6-0.8 — логичный вывод, ниже 0.5 — не включай такой факт вообще).

Только JSON, без пояснений.`;

  const result = await generate({
    provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
    model,
    prompt,
    systemPrompt: "Ты — аналитик, извлекаешь атомарные факты из текста. Отвечай ТОЛЬКО JSON массивом.",
    temperature: 0.2,
    maxTokens: 4000,
    responseFormat: "json",
  });

  try {
    const cleaned = extractJSON(result.content);
    return JSON.parse(cleaned);
  } catch {
    console.warn("[factExtraction] Failed to parse LLM response:", result.content.slice(0, 200));
    return [];
  }
}

export async function extractFactsFromKnowledge(
  projectId: string,
  knowledgeEntryId?: string
): Promise<number> {
  const conditions: any[] = [eq(projectKnowledge.projectId, projectId)];
  if (knowledgeEntryId) {
    conditions.push(eq(projectKnowledge.id, knowledgeEntryId));
  }

  const entries = db.select().from(projectKnowledge).where(and(...conditions)).all();
  let total = 0;

  for (const entry of entries) {
    const existing = db.select().from(brandFacts)
      .where(and(eq(brandFacts.projectId, projectId), eq(brandFacts.sourceRef, entry.id)))
      .get();
    if (existing) continue;

    const content = entry.content || "";
    if (content.length < 20) continue;

    const facts = await extractFromContent(content, entry.title);
    if (facts.length === 0) continue;

    const sourceType = entry.type === "file" ? "knowledge_file" : "note";

    for (const fact of facts) {
      if (!FACT_CATEGORIES.includes(fact.category)) fact.category = "other";
      db.insert(brandFacts).values({
        id: uuid(),
        projectId,
        category: fact.category,
        sourceType,
        sourceRef: entry.id,
        factText: fact.factText,
        confidence: Math.min(Math.max(fact.confidence, 0), 1),
        validated: 0,
      }).run();
    }

    total += facts.length;
  }

  return total;
}

export async function deriveFactsFromOnboarding(projectId: string): Promise<number> {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return 0;

  let total = 0;

  // ── Products ──
  const productRows = db.select().from(products)
    .where(eq(products.projectId, projectId)).all();
  for (const p of productRows) {
    db.insert(brandFacts).values({
      id: uuid(),
      projectId,
      category: "product",
      sourceType: "ai_inferred",
      sourceRef: p.id,
      factText: `${p.name}${p.description ? `: ${p.description}` : ""}`,
      confidence: 0.9,
      validated: 1,
    }).run();
    total++;
  }

  // ── Value Prop ──
  if (project.valueProp) {
    try {
      const vp = JSON.parse(project.valueProp);
      const arrays = ["tasks", "problems", "gains", "products", "helpFactors", "gainFactors"] as const;
      for (const key of arrays) {
        const items = vp[key];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (item.score < 2) continue;
          db.insert(brandFacts).values({
            id: uuid(),
            projectId,
            category: "promise",
            sourceType: "ai_inferred",
            sourceRef: "value_prop",
            factText: item.text,
            confidence: Math.min(item.score / 3, 1),
            validated: 1,
          }).run();
          total++;
        }
      }
    } catch {}
  }

  // ── Audience (deep 17-parameter format with groups) ──
  if (project.audience) {
    try {
      const parsed = JSON.parse(project.audience);
      const groups = parsed.groups || (Array.isArray(parsed) ? parsed : [parsed]);

      for (const group of groups) {
        const textFields: string[] = [];

        // Collect from all relevant fields
        const fieldsToExtract = [
          "portrait", "summary", "pains", "fears", "irritations",
          "goals", "beliefs", "stepsToSolve", "alternatives",
          "whyAlternativesFail", "desiredResult", "globalFears", "objections"
        ];
        for (const field of fieldsToExtract) {
          const val = group[field];
          if (!val) continue;
          if (Array.isArray(val)) {
            textFields.push(...val.filter((v: any) => typeof v === "string" && v.length > 10));
          } else if (typeof val === "string" && val.length > 10) {
            textFields.push(val);
          }
        }

        for (const text of textFields) {
          const existing = db.select().from(brandFacts)
            .where(and(eq(brandFacts.projectId, projectId), eq(brandFacts.factText, text)))
            .get();
          if (existing) continue;

          db.insert(brandFacts).values({
            id: uuid(),
            projectId,
            category: "audience",
            sourceType: "ai_inferred",
            sourceRef: "audience_deep",
            factText: text,
            confidence: 0.8,
            validated: 1,
          }).run();
          total++;
        }
      }
    } catch {}
  }

  return total;
}
