import { Router } from "express";
import { db } from "../db.js";
import { topics, platforms } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const topicsRouter = Router();

topicsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const platformId = req.query.platformId as string | undefined;
  const rubricId = req.query.rubricId as string | undefined;
  const conditions: any[] = [];
  if (projectId) conditions.push(eq(topics.projectId, projectId));
  if (platformId) conditions.push(eq(topics.platformId, platformId));
  if (rubricId) conditions.push(eq(topics.rubricId, rubricId));
  let query: any = db.select().from(topics);
  if (conditions.length > 0) query = query.where(and(...conditions));
  res.json(query.all());
});

topicsRouter.get("/:id", (req, res) => {
  const row = db.select().from(topics).where(eq(topics.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Topic not found" });
  res.json(row);
});

topicsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  db.insert(topics).values(data).run();
  res.status(201).json({ id, ...data });
});

// PATCH /bulk — массовое обновление тем (смена рубрики, архивация, priority)
topicsRouter.patch("/bulk", (req, res) => {
  try {
    const { ids, data } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !data) {
      return res.status(400).json({ error: "ids[] and data are required" });
    }
    const update = { ...data, updatedAt: new Date().toISOString() };
    delete update.id;
    for (const id of ids) {
      db.update(topics).set(update).where(eq(topics.id, id)).run();
    }
    res.json({ success: true, count: ids.length });
  } catch (err: any) {
    console.error("Topics bulk update error:", err);
    res.status(500).json({ error: err?.message || "Failed to update topics" });
  }
});

topicsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  db.update(topics).set(update).where(eq(topics.id, id)).run();
  const row = db.select().from(topics).where(eq(topics.id, id)).get();
  res.json(row);
});

// POST /bulk — create or replace topics for a platform
topicsRouter.post("/bulk", (req, res) => {
  try {
    const { projectId, platformId, topics: items } = req.body;
    if (!projectId || !Array.isArray(items)) {
      return res.status(400).json({ error: "projectId and topics[] are required" });
    }

    // Validate platform exists before referencing it
    let resolvedPlatformId: string | null = platformId || null;
    if (resolvedPlatformId) {
      const exists = db
        .select()
        .from(platforms)
        .where(sql`id = ${resolvedPlatformId}`)
        .get();
      if (!exists) resolvedPlatformId = null;
    }

    // Delete existing topics for this project+platform
    const existing = resolvedPlatformId
      ? db.select().from(topics).where(sql`project_id = ${projectId} AND platform_id = ${resolvedPlatformId}`).all()
      : db.select().from(topics).where(sql`project_id = ${projectId}`).all();
    for (const t of existing) {
      db.delete(topics).where(sql`id = ${t.id}`).run();
    }

    const now = new Date().toISOString();
    const created = items.map((item: any, i: number) => {
      const id = uuid();
      const data = {
        id,
        projectId,
        platformId: resolvedPlatformId,
        rubricId: item.rubricId || null,
        title: item.title || "",
        description: item.description || "",
        status: "active",
        priority: item.priority || 0,
        source: item.source || "wizard",
        createdAt: now,
        updatedAt: now,
      };
      db.insert(topics).values(data).run();
      return data;
    });

    res.status(201).json({ topics: created, count: created.length });
  } catch (err: any) {
    console.error("Topics bulk create error:", err);
    res.status(500).json({ error: err?.message || "Failed to create topics" });
  }
});

topicsRouter.delete("/:id", (req, res) => {
  db.delete(topics).where(eq(topics.id, req.params.id)).run();
  res.status(204).end();
});
