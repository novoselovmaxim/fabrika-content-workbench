import { Router } from "express";
import { instagramService } from "../integrations/metaInstagram.js";

export const instagramRouter = Router();

// Configure / status
instagramRouter.post("/configure", (req, res) => {
  const { accessToken, instagramAccountId } = req.body;
  if (!accessToken || !instagramAccountId) {
    return res.status(400).json({ error: "accessToken and instagramAccountId required" });
  }
  instagramService.configure({ accessToken, instagramAccountId });
  res.json({ status: "configured" });
});

instagramRouter.get("/status", (_req, res) => {
  res.json({
    configured: instagramService.isConfigured(),
  });
});

// Auth check
instagramRouter.get("/check", async (_req, res) => {
  if (!instagramService.isConfigured()) {
    return res.status(400).json({ error: "Instagram not configured" });
  }
  const result = await instagramService.checkAuth();
  res.json(result);
});

// Account insights
instagramRouter.get("/account-insights", async (req, res) => {
  if (!instagramService.isConfigured()) {
    return res.status(400).json({ error: "Instagram not configured" });
  }
  try {
    const period = (req.query.period as "day" | "week" | "days_28") || "week";
    const insights = await instagramService.getAccountInsights(period);
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recent media
instagramRouter.get("/media", async (req, res) => {
  if (!instagramService.isConfigured()) {
    return res.status(400).json({ error: "Instagram not configured" });
  }
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const media = await instagramService.getRecentMedia(limit);
    res.json(media);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Media insights
instagramRouter.get("/media/:id/insights", async (req, res) => {
  if (!instagramService.isConfigured()) {
    return res.status(400).json({ error: "Instagram not configured" });
  }
  try {
    const insights = await instagramService.getMediaInsights(req.params.id);
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
