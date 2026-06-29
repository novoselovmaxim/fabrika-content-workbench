import { Router } from "express";
import { db } from "../db.js";
import { rubrics } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const rubricsRouter = Router();

rubricsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const platformId = req.query.platformId as string | undefined;
  const conditions: any[] = [];
  if (projectId) conditions.push(eq(rubrics.projectId, projectId));
  if (platformId) conditions.push(eq(rubrics.platformId, platformId));
  let query: any = db.select().from(rubrics);
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.orderBy(rubrics.ordering);
  res.json(query.all());
});

rubricsRouter.get("/:id", (req, res) => {
  const row = db.select().from(rubrics).where(eq(rubrics.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Rubric not found" });
  res.json(row);
});

rubricsRouter.post("/", (req, res) => {
  const id = uuid();
  const data = { id, ...req.body };
  db.insert(rubrics).values(data).run();
  res.status(201).json({ id, ...data });
});

rubricsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  delete update.id;
  db.update(rubrics).set(update).where(eq(rubrics.id, id)).run();
  const row = db.select().from(rubrics).where(eq(rubrics.id, id)).get();
  res.json(row);
});

// POST /bulk — create or replace rubrics for a platform
rubricsRouter.post("/bulk", (req, res) => {
  const { projectId, platformId, rubrics: items } = req.body;
  if (!projectId || !Array.isArray(items)) {
    return res.status(400).json({ error: "projectId and rubrics[] are required" });
  }

  // Delete existing rubrics for this project (+ platform if specified)
  const existing = platformId
    ? db.select().from(rubrics).where(sql`project_id = ${projectId} AND platform_id = ${platformId}`).all()
    : db.select().from(rubrics).where(sql`project_id = ${projectId}`).all();
  for (const r of existing) {
    db.delete(rubrics).where(sql`id = ${r.id}`).run();
  }

  const created = items.map((item: any, i: number) => {
    const id = uuid();
    const data = {
      id,
      projectId,
      platformId: platformId || null,
      name: item.name || "",
      description: item.description || "",
      color: item.color || "#6366f1",
      ordering: i,
      active: 1,
    };
    db.insert(rubrics).values(data).run();
    return data;
  });

  res.status(201).json({ rubrics: created, count: created.length });
});

rubricsRouter.delete("/:id", (req, res) => {
  db.delete(rubrics).where(eq(rubrics.id, req.params.id)).run();
  res.status(204).end();
});
