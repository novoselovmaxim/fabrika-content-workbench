import { Router } from "express";
import { db } from "../db.js";
import { strategyBlocks, projects } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import { generate, getModelForTask } from "../services/aiGateway.js";

const upload = multer({ dest: "/tmp/strategy-uploads" });

export const strategyRouter = Router();

// GET /project/:projectId — list strategy blocks for a project
// Optionally filter by ?platformId=
strategyRouter.get("/project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const { platformId } = req.query;

  let query = db
    .select()
    .from(strategyBlocks)
    .where(sql`project_id = ${projectId}`)
    .orderBy(strategyBlocks.ordering)
    .all();

  // If platformId filter is provided, filter further
  if (platformId && typeof platformId === "string") {
    query = query.filter((b) => b.platformId === platformId);
  }

  res.json(query);
});

// GET /:id — get one strategy block
strategyRouter.get("/:id", (req, res) => {
  const row = db.select().from(strategyBlocks).where(sql`id = ${req.params.id}`).get();
  if (!row) return res.status(404).json({ error: "Strategy block not found" });
  res.json(row);
});

// POST / — create a strategy block
strategyRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  db.insert(strategyBlocks).values(data).run();
  res.status(201).json({ id, ...data });
});

// PATCH /:id — update a strategy block
strategyRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  const existing = db.select().from(strategyBlocks).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Strategy block not found" });
  db.update(strategyBlocks).set(update).where(sql`id = ${id}`).run();
  const row = db.select().from(strategyBlocks).where(sql`id = ${id}`).get();
  res.json(row);
});

// POST /import — import strategy from file (.txt, .md, .docx)
strategyRouter.post("/import", upload.single("file"), async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    if (!req.file) return res.status(400).json({ error: "File is required" });

    let rawText = "";

    if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.originalname.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ path: req.file.path });
      rawText = result.value;
    } else {
      rawText = fs.readFileSync(req.file.path, "utf-8");
    }

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    // Split into blocks by headings (## or ### or lines ending with :) or double newlines
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    const blocks: { title: string; content: string }[] = [];
    let currentTitle = "Введение";
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)/);
      if (headingMatch || (line.endsWith(":") && line.length < 80 && !line.endsWith("::"))) {
        // Save previous block
        if (currentContent.length > 0) {
          blocks.push({ title: currentTitle, content: currentContent.join("\n") });
        }
        currentTitle = headingMatch ? headingMatch[1] : line.replace(/:$/, "");
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    // Last block
    if (currentContent.length > 0) {
      blocks.push({ title: currentTitle, content: currentContent.join("\n") });
    }

    // If no blocks found by headings, split by paragraphs
    if (blocks.length <= 1 && rawText.length > 200) {
      const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
      if (paragraphs.length > 2) {
        blocks.length = 0;
        paragraphs.forEach((p, i) => {
          const lines = p.trim().split("\n");
          const firstLine = lines[0].replace(/^[#*\s]+/, "").slice(0, 60);
          blocks.push({
            title: firstLine || `Раздел ${i + 1}`,
            content: p.trim(),
          });
        });
      }
    }

    // Create strategy blocks in DB
    const now = new Date().toISOString();
    const { platformId } = req.body;
    const created = blocks.map((block, i) => {
      let sectionKey;
      try {
        sectionKey = block.title.toLowerCase().replace(/[^a-zа-яё\s]/gi, "").trim().slice(0, 40).replace(/\s+/g, "_") || `block_${i}`;
      } catch {
        sectionKey = `block_${i}`;
      }
      const id = uuid();
      const data = {
        id,
        projectId,
        platformId: platformId || null,
        sectionKey,
        title: block.title || "",
        aiContent: block.content || "",
        ordering: i,
        manualContent: block.content || "",
        approved: 0,
        createdAt: now,
        updatedAt: now,
      };
      try {
        db.insert(strategyBlocks).values(data).run();
      } catch (dbErr: any) {
        console.error(`[strategy/import] DB insert failed for block ${i}:`, dbErr);
        console.error(`[strategy/import] Block data:`, JSON.stringify(data, null, 2));
        throw dbErr;
      }
      return data;
    });

    res.json({ blocks: created, count: created.length });
  } catch (err: any) {
    console.error("[strategy/import] Error:", err);
    console.error("[strategy/import] Stack:", err?.stack);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// POST /ai-import — import strategy from file with AI analysis + merge
strategyRouter.post("/ai-import", upload.single("file"), async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    if (!req.file) return res.status(400).json({ error: "File is required" });

    let rawText = "";

    if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        req.file.originalname.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ path: req.file.path });
      rawText = result.value;
    } else {
      rawText = fs.readFileSync(req.file.path, "utf-8");
    }

    fs.unlink(req.file.path, () => {});

    // Fetch project info
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Fetch existing strategy blocks
    const existingBlocks = db
      .select()
      .from(strategyBlocks)
      .where(sql`project_id = ${projectId}`)
      .orderBy(strategyBlocks.ordering)
      .all();

    const existingText = existingBlocks.length > 0
      ? existingBlocks.map((b, i) => `[Блок ${i + 1}] ${b.title}\n${b.aiContent || ""}`).join("\n\n")
      : "— стратегия ещё не создана";

    const model = getModelForTask("strategy");

    const prompt = `Ты — контент-стратег. Проанализируй содержимое загруженного файла и текущую стратегию проекта, затем объедини их в единую структурированную стратегию.

ИНФОРМАЦИЯ О ПРОЕКТЕ:
Название: ${project.name || ""}
Ниша: ${project.niche || ""}
ЦА: ${project.audience || ""}
Боли: ${project.pains || ""}
Стиль: ${project.style || ""}

ТЕКУЩАЯ СТРАТЕГИЯ (блоки):
${existingText}

СОДЕРЖИМОЕ ЗАГРУЖЕННОГО ФАЙЛА:
${rawText.slice(0, 15000)}

ИНСТРУКЦИИ:
1. Проанализируй файл — выдели ключевые разделы, идеи, ценности, tone of voice
2. Сравни с текущей стратегией — что нового добавляет файл, что уточняет
3. Создай единую стратегию — объедини лучшее из обоих источников
4. Разбей на логические блоки (5-12 блоков)
5. Каждый блок: title (заголовок) и content (содержание, 2-5 предложений)

ФОРМАТ ОТВЕТА — строгий JSON:
{
  "blocks": [
    { "title": "Название блока", "content": "Содержание блока" },
    { "title": "...", "content": "..." }
  ]
}

Ответ — ТОЛЬКО JSON, без пояснений.`;

    const result = await generate({
      provider: "vsellm",
      model,
      prompt,
      systemPrompt: "Ты — стратег, анализирующий файлы и обновляющий стратегию проекта. Отвечай только JSON.",
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: "json",
    });

    let parsed: { blocks: { title: string; content: string }[] };
    try {
      parsed = JSON.parse(result.content.replace(/```json|```/g, "").trim());
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON", raw: result.content });
    }

    if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
      return res.status(500).json({ error: "AI returned unexpected format", raw: result.content });
    }

    // Delete existing blocks for this project
    for (const b of existingBlocks) {
      db.delete(strategyBlocks).where(sql`id = ${b.id}`).run();
    }

    // Insert new AI-generated blocks
    const now = new Date().toISOString();
    const { platformId } = req.body;
    const created = parsed.blocks.map((block, i) => {
      let sectionKey;
      try {
        sectionKey = block.title.toLowerCase().replace(/[^a-zа-яё\s]/gi, "").trim().slice(0, 40).replace(/\s+/g, "_") || `block_${i}`;
      } catch {
        sectionKey = `block_${i}`;
      }
      const id = uuid();
      const data = {
        id,
        projectId,
        platformId: platformId || null,
        sectionKey,
        title: block.title || "",
        aiContent: block.content || "",
        ordering: i,
        manualContent: "",
        approved: 0,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(strategyBlocks).values(data).run();
      return data;
    });

    // Update project knowledge_summary to reflect new strategy
    try {
      const summaryText = created.map((b, i) => `${i + 1}. ${b.title}: ${(b.aiContent || "").slice(0, 200)}`).join("\n");
      db.update(projects).set({ knowledgeSummary: summaryText }).where(eq(projects.id, projectId)).run();
    } catch {}

    res.json({ blocks: created, count: created.length, fromFile: req.file.originalname });
  } catch (err: any) {
    console.error("[strategy/ai-import] Error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// POST /bulk — create or replace strategy blocks for a platform
strategyRouter.post("/bulk", (req, res) => {
  const { projectId, platformId, blocks } = req.body;
  if (!projectId || !platformId || !Array.isArray(blocks)) {
    return res.status(400).json({ error: "projectId, platformId, and blocks[] are required" });
  }

  const now = new Date().toISOString();

  // Delete existing blocks for this project+platform
  const existing = db
    .select()
    .from(strategyBlocks)
    .where(sql`project_id = ${projectId} AND platform_id = ${platformId}`)
    .all();
  for (const b of existing) {
    db.delete(strategyBlocks).where(sql`id = ${b.id}`).run();
  }

  // Insert new blocks
  const created = blocks.map((block: any, i: number) => {
    const id = uuid();
    const data = {
      id,
      projectId,
      platformId,
      sectionKey: block.sectionKey || block.title?.toLowerCase().replace(/[^a-zа-яё\s]/gi, "").trim().slice(0, 40).replace(/\s+/g, "_") || `block_${i}`,
      title: block.title || "",
      aiContent: block.content || "",
      manualContent: block.manualContent || null,
      ordering: i,
      approved: block.approved || 0,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(strategyBlocks).values(data).run();
    return data;
  });

  res.status(201).json({ blocks: created, count: created.length });
});

// DELETE /:id — delete a strategy block
strategyRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(strategyBlocks).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Strategy block not found" });
  db.delete(strategyBlocks).where(sql`id = ${id}`).run();
  res.status(204).end();
});
