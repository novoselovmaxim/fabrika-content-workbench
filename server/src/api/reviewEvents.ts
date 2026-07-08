import { Router } from "express";
import { db } from "../db.js";
import { reviewEvents, postItems } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const reviewEventsRouter = Router();

reviewEventsRouter.patch("/posts/:id/review-status", (req, res) => {
  const { id } = req.params;
  const { reviewStatus, actorName } = req.body;
  if (!reviewStatus) return res.status(400).json({ error: "reviewStatus is required" });

  const post = db.select({ reviewStatus: postItems.reviewStatus }).from(postItems).where(eq(postItems.id, id)).get();
  if (!post) return res.status(404).json({ error: "Post not found" });

  const from = post.reviewStatus || "none";
  const now = new Date().toISOString();

  db.update(postItems).set({
    reviewStatus,
    lastReviewedBy: actorName || null,
    lastReviewedAt: now,
    updatedAt: now,
  }).where(sql`id = ${id}`).run();

  db.insert(reviewEvents).values({
    id: uuid(),
    postItemId: id,
    actorName: actorName || null,
    eventType: "status_change",
    payload: JSON.stringify({ from, to: reviewStatus }),
    createdAt: now,
  }).run();

  const updated = db.select().from(postItems).where(sql`id = ${id}`).get();
  res.json(updated);
});

reviewEventsRouter.get("/posts/:id/review-events", (req, res) => {
  const { id } = req.params;
  const events = db.select().from(reviewEvents)
    .where(eq(reviewEvents.postItemId, id))
    .orderBy(reviewEvents.createdAt)
    .all();
  res.json(events.map((e: any) => ({
    ...e,
    payload: e.payload ? (() => { try { return JSON.parse(e.payload); } catch { return e.payload; } })() : null,
  })));
});
