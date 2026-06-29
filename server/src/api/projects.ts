import { Router } from "express";
import { db } from "../db.js";
import {
  projects,
  projectKnowledge,
  platforms,
  onboardingSteps,
  chatMessages,
  strategyBlocks,
  postItems,
  topics,
  rubrics,
  rubricDistributions,
  draftVersions,
  assets,
  pipelineRuns,
  analyticsSnapshots,
} from "../schema.js";
import { sql, eq, desc, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generate, getModelForTask } from "../services/aiGateway.js";
import { buildProjectContext } from "../services/projectContext.js";

export const projectsRouter = Router();

// GET / — list all projects
projectsRouter.get("/", (_req, res) => {
  const all = db.select().from(projects).orderBy(projects.createdAt).all();
  res.json(all);
});

// GET /:id — get one project
projectsRouter.get("/:id", (req, res) => {
  const row = db.select().from(projects).where(sql`id = ${req.params.id}`).get();
  if (!row) return res.status(404).json({ error: "Project not found" });
  res.json(row);
});

// POST / — create a project
projectsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  db.insert(projects).values(data).run();
  res.status(201).json({ id, ...data });
});

// PATCH /:id — update a project
projectsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  const existing = db.select().from(projects).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Project not found" });
  db.update(projects).set(update).where(sql`id = ${id}`).run();
  const row = db.select().from(projects).where(sql`id = ${id}`).get();
  res.json(row);
});

// DELETE /:id — delete a project and all related data
projectsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(projects).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Project not found" });

  // Collect all post_item IDs for this project (needed for child tables)
  const postIds = db
    .select({ id: postItems.id })
    .from(postItems)
    .where(sql`project_id = ${id}`)
    .all()
    .map((r: any) => r.id);

  if (postIds.length > 0) {
    db.delete(analyticsSnapshots).where(inArray(analyticsSnapshots.postItemId, postIds)).run();
    db.delete(pipelineRuns).where(inArray(pipelineRuns.postItemId, postIds)).run();
    db.delete(assets).where(inArray(assets.postItemId, postIds)).run();
    db.delete(draftVersions).where(inArray(draftVersions.postItemId, postIds)).run();
  }

  // Tables referencing the project directly
  db.delete(rubricDistributions)
    .where(
      sql`rubric_id IN (SELECT id FROM rubrics WHERE project_id = ${id})`
    )
    .run();
  db.delete(platforms).where(sql`project_id = ${id}`).run();
  db.delete(onboardingSteps).where(sql`project_id = ${id}`).run();
  db.delete(projectKnowledge).where(sql`project_id = ${id}`).run();
  db.delete(chatMessages).where(sql`project_id = ${id}`).run();
  db.delete(strategyBlocks).where(sql`project_id = ${id}`).run();
  db.delete(postItems).where(sql`project_id = ${id}`).run();
  db.delete(topics).where(sql`project_id = ${id}`).run();
  db.delete(rubrics).where(sql`project_id = ${id}`).run();

  // Delete the project itself
  db.delete(projects).where(sql`id = ${id}`).run();

  res.status(204).end();
});

// Helper: extract JSON from AI response
function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonBlock = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonBlock) return jsonBlock[1].trim();
  return text.trim();
}

// POST /:id/unpack — AI brand unpacking from knowledge base
projectsRouter.post("/:id/unpack", async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Collect knowledge entries
    const items = db
      .select()
      .from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, id))
      .orderBy(desc(projectKnowledge.createdAt))
      .all();

    let materials = "";
    if (items.length === 0) {
      materials = "Материалы отсутствуют. Заполните базовые поля проекта.";
    } else {
      for (const item of items.slice(0, 10)) {
        const preview = (item.content || "").slice(0, 3000);
        materials += `\n--- ${item.title} (${item.type}) ---\n${preview}\n`;
      }
    }

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({ action: "unpack_brand", materials }),
      systemPrompt: "Ты — бренд-аналитик. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
      temperature: 0.3,
      maxTokens: 2000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const now = new Date().toISOString();
    const update: any = { updatedAt: now };

    if (parsed.niche) update.niche = parsed.niche;
    if (parsed.audience) update.audience = parsed.audience;
    if (parsed.pains) update.pains = parsed.pains;
    if (parsed.style) update.style = parsed.style;
    if (parsed.tone) update.tone = parsed.tone;
    if (parsed.knowledgeSummary) update.knowledgeSummary = parsed.knowledgeSummary;
    if (parsed.name) update.name = parsed.name;
    if (parsed.mission) update.mission = parsed.mission;
    if (parsed.keywords && Array.isArray(parsed.keywords)) {
      update.keywords = JSON.stringify(parsed.keywords);
    }
    if (parsed.brandStyles && Array.isArray(parsed.brandStyles)) {
      update.brandStyles = JSON.stringify(parsed.brandStyles);
    }

    db.update(projects).set(update).where(eq(projects.id, id)).run();

    const updated = db.select().from(projects).where(eq(projects.id, id)).get();
    res.json({ unpacked: true, ...parsed, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unpack failed" });
  }
});

// POST /:id/unpack-from-interview — AI brand unpacking from interview answers
projectsRouter.post("/:id/unpack-from-interview", async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const project = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "answers array is required" });
    }

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({ action: "unpack_from_interview", answers }),
      systemPrompt: "Ты — бренд-аналитик. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
      temperature: 0.3,
      maxTokens: 2000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const now = new Date().toISOString();
    const update: any = { updatedAt: now };

    if (parsed.name) update.name = parsed.name;
    if (parsed.niche) update.niche = parsed.niche;
    if (parsed.audience) update.audience = parsed.audience;
    if (parsed.pains) update.pains = parsed.pains;
    if (parsed.style) update.style = parsed.style;
    if (parsed.tone) update.tone = parsed.tone;
    if (parsed.knowledgeSummary) update.knowledgeSummary = parsed.knowledgeSummary;
    if (parsed.keyMessage) update.description = parsed.keyMessage;
    if (parsed.mission) update.mission = parsed.mission;
    if (parsed.keywords && Array.isArray(parsed.keywords)) {
      update.keywords = JSON.stringify(parsed.keywords);
    }
    if (parsed.brandStyles && Array.isArray(parsed.brandStyles)) {
      update.brandStyles = JSON.stringify(parsed.brandStyles);
    }

    db.update(projects).set(update).where(eq(projects.id, id)).run();

    const updated = db.select().from(projects).where(eq(projects.id, id)).get();
    res.json({ unpacked: true, ...parsed, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unpack from interview failed" });
  }
});

// POST /:id/generate-design-system — generate design system from project context
projectsRouter.post("/:id/generate-design-system", async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const ctx = await buildProjectContext(id, { snippetChars: 5000 });

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: "vsellm",
      model,
      prompt: `Сгенерируй дизайн-систему для бренда на основе контекста проекта.

Контекст проекта:
${ctx}

В материалах проекта могут быть HTML-файлы с CSS-переменными (:root { ... }) — это реальная цветовая палитра бренда, используй её.
Также могут быть brand.md с описанием айдентики, логотипы, описания стиля.

Извлеки точные цвета: primary, secondary, accent, background, text — они должны максимально совпадать с реальными цветами бренда из материалов.

Верни ТОЛЬКО JSON без пояснений:
{
  "name": "название стиля",
  "palette": { "primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "text": "#hex", "additional": ["#hex", "#hex"] },
  "typography": { "headingFont": "название шрифта", "bodyFont": "название шрифта", "headingWeight": 700, "bodyWeight": 400 },
  "composition": { "style": "описание визуального стиля", "mood": "настроение", "lighting": "освещение", "textures": ["текстура 1", "текстура 2"] },
  "systemPrompt": "системный промпт для генерации изображений (60-120 слов)"
}`,
      systemPrompt: "Ты — визуальный стратег бренда и дизайнер. Отвечай ТОЛЬКО валидным JSON без пояснений.",
      temperature: 0.3,
      maxTokens: 2000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    res.json({ generated: true, designSystem: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Design system generation failed" });
  }
});

// GET /:id/brand-styles — get brand styles for a project
projectsRouter.get("/:id/brand-styles", (req, res) => {
  const row = db.select({ brandStyles: projects.brandStyles }).from(projects).where(eq(projects.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Project not found" });
  try {
    const styles = row.brandStyles ? JSON.parse(row.brandStyles) : [];
    res.json(styles);
  } catch {
    res.json([]);
  }
});

// PUT /:id/brand-styles — set brand styles for a project
projectsRouter.put("/:id/brand-styles", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Project not found" });
  const brandStyles = JSON.stringify(req.body.styles || []);
  db.update(projects)
    .set({ brandStyles, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .run();
  res.json({ saved: true, count: (req.body.styles || []).length });
});
