import { Router } from "express";
import { db } from "../db.js";
import { funnels, postItems } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const funnelsRouter = Router();

funnelsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (projectId) {
    const all = db.select().from(funnels).where(and(
      eq(funnels.active, 1),
      sql`${funnels.id} IN (SELECT DISTINCT ${postItems.funnelId} FROM ${postItems} WHERE ${postItems.projectId} = ${projectId})`,
    )).orderBy(funnels.ordering).all();
    res.json(all);
  } else {
    const all = db.select().from(funnels).orderBy(funnels.ordering).all();
    res.json(all);
  }
});

funnelsRouter.get("/:id", (req, res) => {
  const row = db.select().from(funnels).where(eq(funnels.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Funnel not found" });
  res.json(row);
});

funnelsRouter.post("/", (req, res) => {
  const id = uuid();
  const data = { id, ...req.body, createdAt: new Date().toISOString() };
  db.insert(funnels).values(data).run();
  res.status(201).json({ id, ...data });
});

funnelsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(funnels).where(eq(funnels.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Funnel not found" });
  const update = { ...req.body };
  delete update.id;
  db.update(funnels).set(update).where(eq(funnels.id, id)).run();
  const row = db.select().from(funnels).where(eq(funnels.id, id)).get();
  res.json(row);
});

funnelsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.select().from(funnels).where(eq(funnels.id, id)).get();
  if (!existing) return res.status(404).json({ error: "Funnel not found" });
  db.delete(funnels).where(eq(funnels.id, id)).run();
  res.status(204).end();
});
