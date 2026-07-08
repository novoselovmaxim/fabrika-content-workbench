import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { brandFacts } from "../schema.js";
import { eq, and, like, desc } from "drizzle-orm";
import { extractFactsFromKnowledge, deriveFactsFromOnboarding } from "../services/factExtraction.js";

export const brandFactsRouter = Router();

brandFactsRouter.get("/by-project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const { category, validated, sourceType } = req.query;

  const conditions: any[] = [eq(brandFacts.projectId, projectId)];
  if (category) conditions.push(eq(brandFacts.category, category as string));
  if (validated !== undefined) conditions.push(eq(brandFacts.validated, parseInt(validated as string, 10)));
  if (sourceType) conditions.push(eq(brandFacts.sourceType, sourceType as string));

  const facts = db
    .select()
    .from(brandFacts)
    .where(and(...conditions))
    .orderBy(desc(brandFacts.validated), desc(brandFacts.confidence))
    .all();

  res.json(facts);
});

brandFactsRouter.post("/", (req, res) => {
  const { projectId, category, factText, sourceType, confidence } = req.body;
  if (!projectId || !category || !factText) {
    return res.status(400).json({ error: "projectId, category, and factText are required" });
  }

  const id = uuid();
  db.insert(brandFacts).values({
    id,
    projectId,
    category,
    sourceType: sourceType || "manual",
    factText,
    confidence: confidence ?? 1,
    validated: 1,
  }).run();

  res.status(201).json({ id });
});

brandFactsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const { category, factText, validated, confidence } = req.body;

  const existing = db.select().from(brandFacts).where(eq(brandFacts.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Fact not found" });

  const update: Record<string, any> = {};
  if (category !== undefined) update.category = category;
  if (factText !== undefined) update.factText = factText;
  if (validated !== undefined) update.validated = validated ? 1 : 0;
  if (confidence !== undefined) update.confidence = confidence;

  if (Object.keys(update).length > 0) {
    db.update(brandFacts).set(update).where(eq(brandFacts.id, id)).run();
  }

  res.json({ success: true });
});

brandFactsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.delete(brandFacts).where(eq(brandFacts.id, id)).run();
  res.json({ success: true });
});

brandFactsRouter.post("/:projectId/extract", async (req, res) => {
  try {
    const { projectId } = req.params;
    const count = await extractFactsFromKnowledge(projectId);
    res.json({ extracted: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

brandFactsRouter.post("/:projectId/derive-from-onboarding", async (req, res) => {
  try {
    const { projectId } = req.params;
    const count = await deriveFactsFromOnboarding(projectId);
    res.json({ derived: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
