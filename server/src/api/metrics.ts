import { Router } from "express";
import { fetchInstagramProfile, isApifyConfigured } from "../services/apify.js";

const VPS = "http://80.87.111.142:4000";

export const metricsRouter = Router();

metricsRouter.post("/check", async (req, res) => {
  const { platform, identifier } = req.body;
  if (!platform || !identifier)
    return res.status(400).json({ error: "platform and identifier required" });

  if (platform === "instagram") {
    try {
      if (isApifyConfigured()) {
        const profile = await fetchInstagramProfile(identifier);
        if (profile) {
          return res.json({
            valid: true,
            username: profile.username,
            full_name: profile.fullName,
            follower_count: profile.followerCount,
            following_count: profile.followingCount,
            media_count: profile.postCount,
            is_private: profile.isPrivate,
            is_verified: profile.isVerified,
          });
        }
      }
      try {
        const feedRes = await fetch(`https://www.instagram.com/${encodeURIComponent(identifier)}/feed/`, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        return res.json({
          valid: feedRes.ok,
          username: identifier,
          follower_count: null,
          is_private: null,
          is_verified: null,
        });
      } catch {
        return res.json({ valid: true, username: identifier, follower_count: null });
      }
    } catch (e: any) {
      return res.json({ valid: false, error: e.message });
    }
  }

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

  if (platform === "instagram") {
    try {
      const r = await fetch(`${VPS}/api/metrics/instagram-scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifier, limit: 10 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) return res.json({ error: `VPS Instagram: ${r.status}` });
      return res.json(await r.json());
    } catch (e: any) {
      return res.json({ error: `VPS Instagram недоступен: ${e.message}` });
    }
  }

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
