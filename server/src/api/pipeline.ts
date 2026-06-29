import { Router } from "express";
import { db } from "../db.js";
import { pipelineRuns } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const pipelineRouter = Router();

pipelineRouter.get("/by-post/:postItemId", (req, res) => {
  const all = db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.postItemId, req.params.postItemId))
    .all();
  res.json(all);
});

pipelineRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, startedAt: now };
  db.insert(pipelineRuns).values(data).run();
  res.status(201).json({ id, ...data });
});

pipelineRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  delete update.id;
  db.update(pipelineRuns).set(update).where(sql`id = ${id}`).run();
  const row = db.select().from(pipelineRuns).where(sql`id = ${id}`).get();
  res.json(row);
});
