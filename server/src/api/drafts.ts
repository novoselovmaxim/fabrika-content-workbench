import { Router } from "express";
import { db } from "../db.js";
import { draftVersions } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

function parseJsonFields<T>(row: T, fields: readonly (keyof T)[]): T {
  const out = { ...row };
  for (const f of fields) {
    const val = out[f];
    if (typeof val === "string") {
      try { (out as any)[f] = JSON.parse(val); } catch { /* keep as-is */ }
    }
  }
  return out;
}

const jsonFields = ["usedBrandFacts", "riskTags", "contentJson"] as const;

export const draftsRouter = Router();

draftsRouter.get("/by-post/:postItemId", (req, res) => {
  const all = db
    .select()
    .from(draftVersions)
    .where(eq(draftVersions.postItemId, req.params.postItemId))
    .all();
  res.json(all.map((d) => parseJsonFields(d, jsonFields)));
});

draftsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now };
  db.insert(draftVersions).values(data).run();
  res.status(201).json({ id, ...data });
});

draftsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  delete update.id;
  db.update(draftVersions).set(update).where(sql`id = ${id}`).run();
  const row = db.select().from(draftVersions).where(sql`id = ${id}`).get();
  res.json(row ? parseJsonFields(row, jsonFields) : null);
});

draftsRouter.delete("/:id", (req, res) => {
  db.delete(draftVersions).where(sql`id = ${req.params.id}`).run();
  res.status(204).end();
});
