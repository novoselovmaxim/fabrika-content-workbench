import { Router } from "express";
import { db } from "../db.js";
import { draftVersions } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const draftsRouter = Router();

draftsRouter.get("/by-post/:postItemId", (req, res) => {
  const all = db
    .select()
    .from(draftVersions)
    .where(eq(draftVersions.postItemId, req.params.postItemId))
    .all();
  res.json(all);
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
  res.json(row);
});

draftsRouter.delete("/:id", (req, res) => {
  db.delete(draftVersions).where(sql`id = ${req.params.id}`).run();
  res.status(204).end();
});
