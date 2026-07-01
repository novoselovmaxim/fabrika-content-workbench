import { Router } from "express";
import { db } from "../db.js";
import { sql, eq } from "drizzle-orm";
import { connectedPlatforms } from "../schema.js";
import crypto from "crypto";

const VPS = "http://80.87.111.142:4000";

export const metricsRouter = Router();

metricsRouter.post("/check", async (req, res) => {
  const { platform, identifier } = req.body;
  if (!platform || !identifier)
    return res.status(400).json({ error: "platform and identifier required" });
  try {
    const r = await fetch(`${VPS}/api/metrics/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, identifier }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.json({ valid: false, error: e.message });
  }
});

metricsRouter.post("/fetch", async (req, res) => {
  const { platform, identifier } = req.body;
  if (!platform || !identifier)
    return res.status(400).json({ error: "platform and identifier required" });
  try {
    const r = await fetch(`${VPS}/api/metrics/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, identifier }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

metricsRouter.get("/platforms", (_req, res) => {
  try {
    const rows = db.select().from(connectedPlatforms).orderBy(connectedPlatforms.createdAt).all();
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

metricsRouter.post("/platforms", (req, res) => {
  try {
    const { platform, identifier, label } = req.body;
    if (!platform || !identifier)
      return res.status(400).json({ error: "platform and identifier required" });
    db.insert(connectedPlatforms).values({
      id: crypto.randomUUID(),
      platform,
      identifier,
      label: label || null,
    }).run();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

metricsRouter.delete("/platforms/:id", (req, res) => {
  try {
    db.delete(connectedPlatforms).where(eq(connectedPlatforms.id, req.params.id)).run();
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
