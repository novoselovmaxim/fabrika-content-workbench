import { Router } from "express";
import { getLicense, activateLicense, checkLicenseOnline } from "../services/licenseService.js";

export const licenseRouter = Router();

licenseRouter.get("/", (_req, res) => {
  res.json(getLicense());
});

licenseRouter.post("/activate", async (req, res) => {
  const { key, email } = req.body;
  if (!key || !email) return res.status(400).json({ error: "key and email are required" });
  try {
    const info = await activateLicense(key, email);
    res.json(info);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

licenseRouter.post("/check", async (_req, res) => {
  await checkLicenseOnline();
  res.json(getLicense());
});
