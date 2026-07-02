import { Router } from "express";
import { db } from "../db.js";
import { sql, eq } from "drizzle-orm";
import { connectedPlatforms } from "../schema.js";
import crypto from "crypto";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";

const VPS = "http://80.87.111.142:4000";

export const metricsRouter = Router();

metricsRouter.post("/check", async (req, res) => {
  const { platform, identifier } = req.body;
  if (!platform || !identifier)
    return res.status(400).json({ error: "platform and identifier required" });
  
  // Instagram handled locally via instagrapi
  if (platform === "instagram") {
    try {
      const result = await runInstagramScript(["check", identifier]);
      return res.json(result);
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
  
  // Instagram handled locally via instagrapi
  if (platform === "instagram") {
    try {
      const result = await runInstagramScript(["fetch", identifier, "20"]);
      return res.json(result);
    } catch (e: any) {
      return res.json({ valid: false, error: e.message });
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

function findInstagramBinary() {
  const scriptDir = path.resolve(__dirname, "../../../scripts");
  const binaryName = "ig-fetcher" + (process.platform === "win32" ? ".exe" : "");
  const binary = path.join(scriptDir, "dist", binaryName);
  if (fs.existsSync(binary)) return { cmd: binary, args: [] };
  const script = path.join(scriptDir, "instagram.py");
  const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) return { cmd: venvPython, args: [script] };
  return { cmd: "python3", args: [script] };
}

const IG_BIN = findInstagramBinary();

function runInstagramScript(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(IG_BIN.cmd, [...IG_BIN.args, ...args], {
      timeout: 60_000,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Instagram script: ${err.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Instagram script: invalid JSON output`));
      }
    });
  });
}
