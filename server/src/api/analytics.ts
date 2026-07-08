import { Router } from "express";
import { db } from "../db.js";
import { analyticsInsights } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { recomputeInsights } from "../services/insights.js";

export const analyticsRouter = Router();

analyticsRouter.post("/:projectId/recompute-insights", (req, res) => {
  try {
    const { projectId } = req.params;
    const count = recomputeInsights(projectId);
    res.json({ recomputed: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to recompute insights" });
  }
});

analyticsRouter.get("/:projectId/insights", (req, res) => {
  const { projectId } = req.params;
  const rows = db.select().from(analyticsInsights)
    .where(eq(analyticsInsights.projectId, projectId))
    .orderBy(sql`${analyticsInsights.generatedAt} desc`)
    .all();
  res.json(rows.map((r: any) => ({
    ...r,
    payload: r.payload ? (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })() : null,
  })));
});

analyticsRouter.delete("/:projectId/insights", (req, res) => {
  const { projectId } = req.params;
  db.delete(analyticsInsights).where(eq(analyticsInsights.projectId, projectId)).run();
  res.status(204).end();
});
