import { Router } from "express";
import { checkCompliance } from "../services/compliance.js";
import { db } from "../db.js";
import { policyRules, draftVersions } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const complianceRouter = Router();

complianceRouter.post("/check", (req, res) => {
  const { text, projectId } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });
  const result = checkCompliance(text, projectId || undefined);
  res.json(result);
});

complianceRouter.post("/draft/:draftId/check", (req, res) => {
  const { draftId } = req.params;
  const draft = db.select({ contentMarkdown: draftVersions.contentMarkdown, postItemId: draftVersions.postItemId })
    .from(draftVersions).where(eq(draftVersions.id, draftId)).get();
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  const result = checkCompliance(draft.contentMarkdown || "");
  res.json(result);
});

// Policy rules CRUD
complianceRouter.get("/policy-rules", (_req, res) => {
  const rules = db.select().from(policyRules).orderBy(policyRules.code).all();
  res.json(rules);
});

complianceRouter.post("/policy-rules", (req, res) => {
  const { code, description, pattern, severity } = req.body;
  if (!code || !description) return res.status(400).json({ error: "code and description are required" });
  const id = uuid();
  db.insert(policyRules).values({ id, code, description, pattern, severity: severity || "warning", enabled: 1 }).run();
  res.status(201).json({ id });
});

complianceRouter.patch("/policy-rules/:id", (req, res) => {
  const { id } = req.params;
  const update = req.body;
  delete update.id;
  db.update(policyRules).set(update).where(eq(policyRules.id, id)).run();
  res.json({ success: true });
});

complianceRouter.delete("/policy-rules/:id", (req, res) => {
  db.delete(policyRules).where(eq(policyRules.id, req.params.id)).run();
  res.status(204).end();
});
