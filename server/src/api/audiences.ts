import { Router } from "express";
import { db } from "../db.js";
import { audiences, projects, competitorSearches, projectKnowledge } from "../schema.js";
import { sql, eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generate, getModelForTask } from "../services/aiGateway.js";

export const audiencesRouter = Router();

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonBlock = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonBlock) return jsonBlock[1].trim();
  return text.trim();
}

audiencesRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }
  const rows = db
    .select()
    .from(audiences)
    .where(eq(audiences.projectId, projectId))
    .orderBy(audiences.sortOrder)
    .all();
  res.json(rows);
});

audiencesRouter.get("/:id", (req, res) => {
  const row = db.select().from(audiences).where(eq(audiences.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Audience not found" });
  res.json(row);
});

audiencesRouter.post("/", async (req, res) => {
  const generateMode = req.query.generate === "true";

  if (generateMode) {
    try {
      const projectId = req.query.projectId as string || req.body.projectId;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!project) return res.status(404).json({ error: "Project not found" });

      const latestCompetitorSearch = db
        .select()
        .from(competitorSearches)
        .where(eq(competitorSearches.projectId, projectId))
        .orderBy(desc(competitorSearches.createdAt))
        .get();

      const knowledgeEntries = db
        .select()
        .from(projectKnowledge)
        .where(eq(projectKnowledge.projectId, projectId))
        .orderBy(desc(projectKnowledge.createdAt))
        .all();

      let knowledgeText = "";
      for (const entry of knowledgeEntries.slice(0, 10)) {
        const preview = (entry.content || "").slice(0, 3000);
        knowledgeText += `\n--- ${entry.title} (${entry.type}) ---\n${preview}\n`;
      }

      const competitorsText = latestCompetitorSearch?.resultJson
        ? (() => {
            try {
              const parsed = JSON.parse(latestCompetitorSearch.resultJson);
              return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
            } catch {
              return latestCompetitorSearch.resultJson;
            }
          })()
        : "Данные о конкурентах отсутствуют.";

      const prompt = `На основе ниши, миссии, описания проекта, данных о конкурентах и материалов в базе знаний — предложи список целевых аудиторий. Для каждой: name, portrait (текстовый портрет), demographics (JSON объект), pains (описание болей). Верни JSON массив.

Ниша: ${project.niche || "не указана"}
Миссия: ${project.mission || "не указана"}
Описание: ${project.description || "не указано"}
Аудитория: ${project.audience || "не указана"}
Боли: ${project.pains || "не указаны"}

Данные о конкурентах:
${competitorsText}

База знаний:
${knowledgeText || "Материалы отсутствуют."}`;

      const model = getModelForTask("strategy");
      const result = await generate({
        provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
        model,
        prompt,
        systemPrompt: "Ты — маркетолог-аналитик. Отвечай ТОЛЬКО валидным JSON массивом без пояснений.",
        temperature: 0.4,
        maxTokens: 4000,
        responseFormat: "json",
      });

      let parsed: any;
      try {
        const content = extractJSON(result.content);
        parsed = JSON.parse(content);
      } catch {
        return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
      }

      res.json({ generated: true, audiences: Array.isArray(parsed) ? parsed : [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Audience generation failed" });
    }
    return;
  }

  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  delete data.id;
  data.id = id;
  db.insert(audiences).values(data).run();
  res.status(201).json(data);
});

audiencesRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(audiences).where(eq(audiences.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Audience not found" });
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  db.update(audiences).set(update).where(eq(audiences.id, id)).run();
  const row = db.select().from(audiences).where(eq(audiences.id, id)).get();
  res.json(row);
});

audiencesRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(audiences).where(eq(audiences.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Audience not found" });
  db.delete(audiences).where(eq(audiences.id, id)).run();
  res.status(204).end();
});
