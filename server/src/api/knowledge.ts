import { Router } from "express";
import { db } from "../db.js";
import { projectKnowledge, projects } from "../schema.js";
import { sql, eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import multer from "multer";
import path from "path";
import fs from "fs";
import mammoth from "mammoth";
// @ts-ignore
import TurndownService from "turndown";
import { PATHS } from "../paths.js";
import { generate } from "../services/aiGateway.js";

const uploadDir = PATHS.knowledge;
fs.mkdirSync(uploadDir, { recursive: true });

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const knowledgeRouter = Router();

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function convertFile(filePath: string, mimeType: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === ".pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const XLSX = await import("xlsx");
    const wb = XLSX.readFile(filePath);
    let text = "";
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
      for (const row of rows) {
        text += row.filter((c: any) => c).join(" ") + "\n";
      }
    }
    return text;
  }

  if (ext === ".xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const XLSX = await import("xlsx");
    const wb = XLSX.readFile(filePath);
    let text = "";
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
      for (const row of rows) {
        text += row.filter((c: any) => c).join(" ") + "\n";
      }
    }
    return text;
  }

  if (ext === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const buf = fs.readFileSync(filePath);
    const parser = new PDFParse({ verbosity: 0 } as any);
    await (parser as any).load(buf);
    const result: any = await parser.getText();
    return typeof result === "string" ? result : result?.text || String(result);
  }

  if (ext === ".html" || ext === ".htm") {
    const html = fs.readFileSync(filePath, "utf-8");
    return turndown.turndown(html);
  }

  if (ext === ".txt" || ext === ".md" || ext === ".csv") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".json") {
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  return fs.readFileSync(filePath, "utf-8");
}

// GET /by-project/:projectId — list knowledge entries for a project
knowledgeRouter.get("/by-project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const { type, tag, search } = req.query;

  let query = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId))
    .orderBy(desc(projectKnowledge.createdAt));

  let items = query.all();

  if (type && typeof type === "string") {
    items = items.filter((i) => i.type === type);
  }

  if (tag && typeof tag === "string") {
    items = items.filter((i) => {
      const tags = i.tags ? JSON.parse(i.tags) : [];
      return tags.includes(tag);
    });
  }

  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.content || "").toLowerCase().includes(q)
    );
  }

  res.json(items);
});

// GET /by-project/:projectId/flat — get all knowledge as flat markdown text
knowledgeRouter.get("/by-project/:projectId/flat", (req, res) => {
  const { projectId } = req.params;
  const items = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId))
    .orderBy(desc(projectKnowledge.createdAt))
    .all();

  let text = "";
  for (const item of items) {
    const tags = item.tags ? (() => { try { return JSON.parse(item.tags); } catch { return []; } })() : [];
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    text += `## ${item.title} (${item.type})${tagStr}\n${item.content || ""}\n\n`;
  }

  res.json({ text: text.trim(), count: items.length, totalChars: text.length });
});

// GET /stats/:projectId — get knowledge stats
knowledgeRouter.get("/stats/:projectId", (req, res) => {
  const { projectId } = req.params;
  const items = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId))
    .all();

  const totalWords = items.reduce((sum, i) => sum + (i.wordCount || 0), 0);
  const totalChars = items.reduce((sum, i) => sum + (i.content?.length || 0), 0);

  res.json({
    total: items.length,
    totalWords,
    totalChars,
    byType: {
      file: items.filter((i) => i.type === "file").length,
      note: items.filter((i) => i.type === "note").length,
      link: items.filter((i) => i.type === "link").length,
    },
  });
});

// POST / — create a note or link
knowledgeRouter.post("/", (req, res) => {
  const { projectId, type, title, content, sourceUrl, tags } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: "projectId and title are required" });
  }

  const id = uuid();
  const now = new Date().toISOString();
  const data = {
    id,
    projectId,
    type: type || "note",
    title,
    content: content || "",
    sourceUrl: sourceUrl || null,
    tags: tags ? JSON.stringify(tags) : null,
    wordCount: wordCount(content || ""),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(projectKnowledge).values(data).run();
  res.status(201).json({ ...data, tags });
});

// POST /upload — upload and convert a file
knowledgeRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { projectId, tags } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const content = await convertFile(req.file.path, req.file.mimetype, req.file.originalname);
    const id = uuid();
    const now = new Date().toISOString();

    const data = {
      id,
      projectId,
      type: "file",
      title: req.file.originalname,
      content,
      filePath: req.file.path,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      tags: tags ? JSON.stringify(tags) : null,
      wordCount: wordCount(content),
      createdAt: now,
      updatedAt: now,
    };

    db.insert(projectKnowledge).values(data).run();
    res.status(201).json({ ...data, tags: tags ? JSON.parse(JSON.stringify(tags)) : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "File conversion failed" });
  }
});

// PATCH /:id — update a knowledge entry
knowledgeRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update: any = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  delete update.projectId;

  if (update.tags) {
    update.tags = JSON.stringify(update.tags);
  }
  if (update.content !== undefined) {
    update.wordCount = wordCount(update.content || "");
  }

  const existing = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.id, id))
    .get();
  if (!existing) return res.status(404).json({ error: "Knowledge entry not found" });

  db.update(projectKnowledge).set(update).where(eq(projectKnowledge.id, id)).run();
  const row = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.id, id))
    .get();
  res.json(row);
});

// DELETE /:id — delete a knowledge entry
knowledgeRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.id, id))
    .get();
  if (!existing) return res.status(404).json({ error: "Knowledge entry not found" });

  if (existing.filePath && fs.existsSync(existing.filePath)) {
    fs.unlink(existing.filePath, () => {});
  }

  db.delete(projectKnowledge).where(eq(projectKnowledge.id, id)).run();
  res.status(204).end();
});

// POST /:projectId/compress — AI compression of all project knowledge
knowledgeRouter.post("/:projectId/compress", async (req, res) => {
  try {
    const { projectId } = req.params;
    const items = db
      .select()
      .from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, projectId))
      .orderBy(desc(projectKnowledge.createdAt))
      .all();

    if (items.length === 0) {
      return res.status(400).json({ error: "No knowledge entries to compress" });
    }

    const totalChars = items.reduce((sum, i) => sum + (i.content?.length || 0), 0);

    let contextText = "";
    for (const item of items) {
      const preview = (item.content || "").slice(0, 5000);
      contextText += `\n--- ${item.title} (${item.type}) ---\n${preview}\n`;
    }

    if (contextText.length > 25000) {
      contextText = contextText.slice(0, 25000) + "\n... (обрезано)";
    }

    const prompt = `Сожми следующую информацию о проекте в краткий структурированный саммари (300-500 символов). 
Сохрани ключевые факты: аудитория, стиль, tone of voice, боли, УТП, важные правила генерации контента.

ИНФОРМАЦИЯ:
${contextText}

ФОРМАТ ОТВЕТА — ТОЛЬКО текст саммари, без пояснений.`;

    const result = await generate({
      provider: "vsellm",
      model: "google/gemini-3-flash-preview",
      prompt,
      systemPrompt: "Ты — ассистент, который сжимает информацию о проекте в краткое саммари для AI-контекста. Отвечай только саммари.",
      temperature: 0.3,
      maxTokens: 1000,
    });

    const summary = result.content.trim();

    db.update(projects)
      .set({ knowledgeSummary: summary, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId))
      .run();

    res.json({ summary, chars: summary.length, sourceChars: totalChars });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Compression failed" });
  }
});
