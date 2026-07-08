import { Router } from "express";
import { db } from "../db.js";
import { postItems, topics as topicsTable, rubrics, contentTypes, funnels, draftVersions, pipelineRuns, assets, analyticsSnapshots, platforms, reviewEvents } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const postsRouter = Router();

postsRouter.get("/", (req, res) => {
  const status = req.query.status as string | undefined;
  const rubricId = req.query.rubricId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const projectId = req.query.projectId as string | undefined;
  const platformId = req.query.platformId as string | undefined;
  const funnelId = req.query.funnelId as string | undefined;
  const excludeFunnel = req.query.excludeFunnel as string | undefined;

  const statuses = req.query.statuses as string | undefined;
  const topicId = req.query.topicId as string | undefined;
  const conditions: any[] = [];
  if (status) conditions.push(eq(postItems.status, status));
  if (statuses) {
    const vals = statuses.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (vals.length > 0) conditions.push(sql`${postItems.status} IN ${vals}`);
  }
  if (rubricId) conditions.push(eq(postItems.rubricId, rubricId));
  if (topicId) conditions.push(eq(postItems.topicId, topicId));
  if (startDate) conditions.push(sql`${postItems.scheduledDate} >= ${startDate}`);
  if (endDate) conditions.push(sql`${postItems.scheduledDate} <= ${endDate}`);
  if (projectId) conditions.push(eq(postItems.projectId, projectId));
  if (platformId) conditions.push(eq(postItems.platformId, platformId));
  if (funnelId) conditions.push(eq(postItems.funnelId, funnelId));
  if (excludeFunnel === "true") conditions.push(sql`${postItems.funnelId} IS NULL`);

  let query: any = db
    .select({
      id: postItems.id,
      projectId: postItems.projectId,
      platformId: postItems.platformId,
      title: postItems.title,
      status: postItems.status,
      scheduledDate: postItems.scheduledDate,
      scheduledTime: postItems.scheduledTime,
      topicId: postItems.topicId,
      rubricId: postItems.rubricId,
      contentTypeId: postItems.contentTypeId,
      funnelId: postItems.funnelId,
      goal: postItems.goal,
      hook: postItems.hook,
      keyMessage: postItems.keyMessage,
      cta: postItems.cta,
      reviewStatus: postItems.reviewStatus,
      createdAt: postItems.createdAt,
      updatedAt: postItems.updatedAt,
      topicTitle: topicsTable.title,
      rubricName: rubrics.name,
      rubricColor: rubrics.color,
      contentTypeName: contentTypes.name,
      contentTypeCode: contentTypes.code,
      funnelName: funnels.name,
      funnelColor: funnels.color,
    })
    .from(postItems)
    .leftJoin(topicsTable, eq(postItems.topicId, topicsTable.id))
    .leftJoin(rubrics, eq(postItems.rubricId, rubrics.id))
    .leftJoin(contentTypes, eq(postItems.contentTypeId, contentTypes.id))
    .leftJoin(funnels, eq(postItems.funnelId, funnels.id));

  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.orderBy(postItems.scheduledDate);

  const all = query.all();
  res.json(all);
});

postsRouter.get("/:id", (req, res) => {
  const row = db
    .select({
      id: postItems.id,
      projectId: postItems.projectId,
      platformId: postItems.platformId,
      title: postItems.title,
      status: postItems.status,
      scheduledDate: postItems.scheduledDate,
      scheduledTime: postItems.scheduledTime,
      topicId: postItems.topicId,
      rubricId: postItems.rubricId,
      contentTypeId: postItems.contentTypeId,
      campaignId: postItems.campaignId,
      funnelId: postItems.funnelId,
      goal: postItems.goal,
      hook: postItems.hook,
      keyMessage: postItems.keyMessage,
      cta: postItems.cta,
      versionCurrentId: postItems.versionCurrentId,
      owner: postItems.owner,
      publishedMediaId: postItems.publishedMediaId,
      reviewStatus: postItems.reviewStatus,
      lastReviewedBy: postItems.lastReviewedBy,
      lastReviewedAt: postItems.lastReviewedAt,
      createdAt: postItems.createdAt,
      updatedAt: postItems.updatedAt,
      topicTitle: topicsTable.title,
      rubricName: rubrics.name,
      rubricColor: rubrics.color,
      contentTypeName: contentTypes.name,
      contentTypeCode: contentTypes.code,
      funnelName: funnels.name,
      funnelColor: funnels.color,
    })
    .from(postItems)
    .leftJoin(topicsTable, eq(postItems.topicId, topicsTable.id))
    .leftJoin(rubrics, eq(postItems.rubricId, rubrics.id))
    .leftJoin(contentTypes, eq(postItems.contentTypeId, contentTypes.id))
    .leftJoin(funnels, eq(postItems.funnelId, funnels.id))
    .where(eq(postItems.id, req.params.id))
    .get();
  if (!row) return res.status(404).json({ error: "Post not found" });
  res.json(row);
});

postsRouter.post("/", (req, res) => {
  const { topicId, projectId, platformId } = req.body;
  if (topicId && projectId) {
    const existing = db.select({ id: postItems.id })
      .from(postItems)
      .where(and(eq(postItems.topicId, topicId), eq(postItems.projectId, projectId)))
      .get();
    if (existing) {
      return res.status(409).json({ error: "Post already exists for this topic", existingPostId: existing.id });
    }
  }
  if (platformId && projectId) {
    const platform = db.select({ projectId: platforms.projectId })
      .from(platforms)
      .where(eq(platforms.id, platformId))
      .get();
    if (!platform) return res.status(400).json({ error: "Platform not found" });
    if (platform.projectId !== projectId) return res.status(400).json({ error: "Platform does not belong to this project" });
  }
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  db.insert(postItems).values(data).run();
  res.status(201).json({ id, ...data });
});

postsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;

  const SIGNIFICANT_FIELDS = new Set(["title", "goal", "hook", "keyMessage", "cta", "scheduledDate", "status"]);
  const significantChanges: { field: string; from: any; to: any }[] = [];

  for (const key of Object.keys(req.body)) {
    if (SIGNIFICANT_FIELDS.has(key)) {
      const current = db.select({ [key]: (postItems as any)[key] }).from(postItems).where(sql`id = ${id}`).get();
      if (current && String(current[key as keyof typeof current]) !== String(req.body[key])) {
        significantChanges.push({ field: key, from: current[key as keyof typeof current], to: req.body[key] });
      }
    }
  }

  db.update(postItems).set(update).where(sql`id = ${id}`).run();

  if (significantChanges.length > 0) {
    const now = new Date().toISOString();
    for (const change of significantChanges) {
      db.insert(reviewEvents).values({
        id: uuid(),
        postItemId: id,
        eventType: "field_change",
        payload: JSON.stringify(change),
        createdAt: now,
      }).run();
    }
  }

  const row = db.select().from(postItems).where(sql`id = ${id}`).get();
  res.json(row);
});

// POST /bulk-from-topics — создать посты для нескольких тем разом
postsRouter.post("/bulk-from-topics", (req, res) => {
  try {
    const { projectId, platformId, topicIds, status } = req.body;
    if (!projectId || !Array.isArray(topicIds) || topicIds.length === 0) {
      return res.status(400).json({ error: "projectId and topicIds[] are required" });
    }

    if (platformId && projectId) {
      const platform = db.select({ projectId: platforms.projectId })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .get();
      if (!platform) return res.status(400).json({ error: "Platform not found" });
      if (platform.projectId !== projectId) return res.status(400).json({ error: "Platform does not belong to this project" });
    }

    const topicRows = db.select().from(topicsTable).where(sql`id IN ${topicIds}`).all();
    const now = new Date().toISOString();
    const created: any[] = [];
    const skipped: any[] = [];

    const existingPosts = db.select({ topicId: postItems.topicId })
      .from(postItems)
      .where(and(eq(postItems.projectId, projectId), sql`${postItems.topicId} IN ${topicIds}`))
      .all();
    const existingTopicIds = new Set(existingPosts.map((p: any) => p.topicId));

    for (const topic of topicRows) {
      if (existingTopicIds.has(topic.id)) {
        skipped.push({ topicId: topic.id, title: topic.title });
        continue;
      }

      const id = uuid();
      const data = {
        id,
        projectId,
        platformId: platformId || null,
        title: topic.title,
        topicId: topic.id,
        rubricId: topic.rubricId || null,
        status: status || "idea",
        createdAt: now,
        updatedAt: now,
      };
      db.insert(postItems).values(data).run();
      created.push(data);
    }

    res.status(201).json({ posts: created, count: created.length, skipped });
  } catch (err: any) {
    console.error("Bulk create posts from topics error:", err);
    res.status(500).json({ error: err?.message || "Failed to create posts" });
  }
});

postsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.delete(draftVersions).where(sql`post_item_id = ${id}`).run();
  db.delete(pipelineRuns).where(sql`post_item_id = ${id}`).run();
  db.delete(assets).where(sql`post_item_id = ${id}`).run();
  db.delete(analyticsSnapshots).where(sql`post_item_id = ${id}`).run();
  db.delete(postItems).where(sql`id = ${id}`).run();
  res.status(204).end();
});
