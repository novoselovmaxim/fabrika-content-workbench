import { Router } from "express";
import { db } from "../db.js";
import { settings } from "../schema.js";
import { eq } from "drizzle-orm";

export const settingsRouter = Router();

// Get all settings
settingsRouter.get("/", (_req, res) => {
  const all = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const s of all) map[s.key] = s.value ?? '';
  res.json(map);
});

// Get one setting
settingsRouter.get("/:key", (req, res) => {
  const row = db.select().from(settings).where(eq(settings.key, req.params.key)).get();
  if (!row) return res.status(404).json({ error: "Setting not found" });
  res.json({ key: row.key, value: row.value });
});

// Set/update a setting
settingsRouter.post("/", (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "key is required" });
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
  res.json({ key, value, saved: true });
});

// Set multiple settings at once
settingsRouter.post("/bulk", (req, res) => {
  const entries = req.body;
  for (const [key, value] of Object.entries(entries)) {
    db.insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } })
      .run();
  }
  res.json({ saved: true, count: Object.keys(entries).length });
});

// Delete a setting
settingsRouter.delete("/:key", (req, res) => {
  db.delete(settings).where(eq(settings.key, req.params.key)).run();
  res.status(204).end();
});

// Models worth showing (curated, one regex per provider/vendor prefix)
const CURATED_TEXT: RegExp[] = [
  /^google\/gemini-(3\.(5-flash|1-pro-preview)|3-flash-preview|2\.5-(flash|pro))$/,
  /^anthropic\/claude-(sonnet-4\.6|haiku-4\.5|opus-4\.8|opus-4\.7|opus-4)$/,
  /^openai\/gpt-(5\.2(-chat|-pro)?|5\.1(-codex|-codex-max)?|4\.1(-mini|-nano)?|4o(-mini)?|5(-image|-image-mini)?|5\.4-image-2|o4-mini(-high)?|o3-mini(-high)?|o1(-pro)?)$/,
  /^deepseek\/(deepseek-(chat-v3\.1|v4-pro|r1))$/,
  /^qwen\/qwen3(-235b-a22b|-max-thinking|-coder|-32b|\.7-max)?$/,
  /^mistralai\/mistral-(large|small-3\.2-24b-instruct)$/,
  /^cohere\/command-a$/,
  /^meta-llama\/llama-(4-maverick|4-scout|3\.3-70b-instruct)$/,
  /^moonshotai\/kimi-k2\.5$/,
  /^x-ai\/grok-4\.20$/,
  /^z-ai\/glm-5\.1$/,
  /^microsoft\/phi-4$/,
  /^google\/gemini-(3-pro-image-preview|3\.1-flash-image-preview)$/,
  /^vertex_ai\/imagen-/,
];

// Get available models from configured providers (vsellm + zveno)
settingsRouter.get("/models/list", async (req, res) => {
  const vsellmKey = db.select().from(settings).where(eq(settings.key, "vsellm_key")).get()?.value ||
    process.env.VSELLM_API_KEY || "";
  const zvenoKey = db.select().from(settings).where(eq(settings.key, "zveno_key")).get()?.value ||
    process.env.ZVENO_API_KEY || "";

  const allModels = new Set<string>();
  const errors: string[] = [];

  async function fetchProviderModels(apiKey: string, baseUrl: string, prefix: string) {
    try {
      const resp = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) {
        errors.push(`${prefix}: API error ${resp.status}`);
        return;
      }
      const data = await resp.json() as any;
      for (const m of (data.data || [])) {
        allModels.add(prefix + m.id);
      }
    } catch (err: any) {
      errors.push(`${prefix}: ${err.message}`);
    }
  }

  const promises: Promise<void>[] = [];
  if (vsellmKey) promises.push(fetchProviderModels(vsellmKey, "https://api.vsellm.ru/v1", "vsellm/"));
  if (zvenoKey) promises.push(fetchProviderModels(zvenoKey, "https://api.zveno.ai/v1", "zveno/"));
  await Promise.all(promises);

  // Filter to curated models + models already saved in settings
  const savedSettingKeys = ["model_chat", "model_content", "model_strategy", "model_visual_prompt", "model_image"];
  const savedModels = new Set<string>();
  for (const key of savedSettingKeys) {
    const val = db.select().from(settings).where(eq(settings.key, key)).get()?.value;
    if (val) savedModels.add(val);
  }

  const all = [...allModels].sort();
  const curated = all.filter((id: string) => {
    if (savedModels.has(id)) return true;
    const withoutPrefix = id.replace(/^(vsellm\/|zveno\/)/, "");
    return CURATED_TEXT.some((re) => re.test(withoutPrefix));
  });

  const imageModels = curated.filter((id: string) =>
    id.includes("imagen") || id.includes("gpt-image") ||
    /-image/.test(id)  // catches gpt-5-image, gpt-5-image-mini, gpt-5.4-image-2, gemini-*-image-preview
  );
  const textModels = curated.filter((id: string) => !imageModels.includes(id));

  res.json({ models: curated, textModels, imageModels, errors: errors.length > 0 ? errors : undefined });
});
