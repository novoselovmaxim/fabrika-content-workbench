import { Router } from "express";
import { db } from "../db.js";
import { platforms } from "../schema.js";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const platformsRouter = Router();

// GET /project/:projectId — list platforms for a project
platformsRouter.get("/project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const rows = db
    .select()
    .from(platforms)
    .where(sql`project_id = ${projectId}`)
    .orderBy(platforms.ordering)
    .all();
  res.json(rows);
});

// GET /:id — get one platform
platformsRouter.get("/:id", (req, res) => {
  const row = db.select().from(platforms).where(sql`id = ${req.params.id}`).get();
  if (!row) return res.status(404).json({ error: "Platform not found" });
  res.json(row);
});

// POST / — create a platform
platformsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now };
  db.insert(platforms).values(data).run();
  res.status(201).json({ id, ...data });
});

// PATCH /:id — update a platform
platformsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  delete update.id;
  const existing = db.select().from(platforms).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Platform not found" });
  db.update(platforms).set(update).where(sql`id = ${id}`).run();
  const row = db.select().from(platforms).where(sql`id = ${id}`).get();
  res.json(row);
});

// DELETE /:id — delete a platform
platformsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(platforms).where(sql`id = ${id}`).get();
  if (!existing) return res.status(404).json({ error: "Platform not found" });
  db.delete(platforms).where(sql`id = ${id}`).run();
  res.status(204).end();
});
