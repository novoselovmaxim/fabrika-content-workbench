import { Router } from "express";
import { checkCompliance, saveCheckResult } from "../services/compliance.js";
import { db } from "../db.js";
import { policyRules, draftVersions, complianceRules, complianceChecks, postItems } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { COMPLIANCE_RULES } from "../rules/complianceRules.js";
import { generate } from "../services/aiGateway.js";

export const complianceRouter = Router();

// ── Text check ───────────────────────────────────────────
complianceRouter.post("/check", (req, res) => {
  const { text, projectId, platform, useAi, postType, metadata } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  checkCompliance(text, {
    platform: platform || "generic",
    projectId: projectId || undefined,
    useAi: useAi !== false,
    postType,
    metadata,
  })
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── Full post check (text + structural) ──────────────────
complianceRouter.post("/post/:postId/check", (req, res) => {
  const { postId } = req.params;
  const { draftId } = req.body;

  const post = db.select({
    postType: postItems.postType,
    ageRating: postItems.ageRating,
    isAdvertisingMarked: postItems.isAdvertisingMarked,
    advertiserInfo: postItems.advertiserInfo,
    ordToken: postItems.ordToken,
  }).from(postItems).where(eq(postItems.id, postId)).get();

  if (!post) return res.status(404).json({ error: "Post not found" });

  let text = "";
  if (draftId) {
    const draft = db.select({ contentMarkdown: draftVersions.contentMarkdown })
      .from(draftVersions).where(eq(draftVersions.id, draftId)).get();
    if (draft) text = draft.contentMarkdown || "";
  }

  checkCompliance(text, {
    platform: "generic",
    useAi: true,
    postType: post.postType || undefined,
    metadata: {
      postType: post.postType || undefined,
      ageRating: post.ageRating || undefined,
      isAdvertisingMarked: post.isAdvertisingMarked || 0,
      advertiserInfo: post.advertiserInfo || undefined,
      ordToken: post.ordToken || undefined,
    },
  })
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── Draft check ──────────────────────────────────────────
complianceRouter.post("/draft/:draftId/check", (req, res) => {
  const { draftId } = req.params;
  const { platform } = req.body;
  const draft = db.select({
    contentMarkdown: draftVersions.contentMarkdown,
    postItemId: draftVersions.postItemId,
    stage: draftVersions.stage,
  }).from(draftVersions).where(eq(draftVersions.id, draftId)).get();

  if (!draft) return res.status(404).json({ error: "Draft not found" });

  checkCompliance(draft.contentMarkdown || "", { platform: platform || "generic", useAi: true })
    .then(result => {
      saveCheckResult(draftId, draft.postItemId, platform, result);
      res.json(result);
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── Suggest post type based on text ──────────────────────
complianceRouter.post("/suggest-post-type", async (req, res) => {
  const { text, title } = req.body;
  if (!text && !title) return res.status(400).json({ error: "text or title is required" });

  const input = `Заголовок: ${title || ""}\nТекст: ${(text || "").slice(0, 2000)}`;
  try {
    const result = await generate({
      provider: "vsellm",
      model: "vsellm/google/gemini-3-flash-preview",
      systemPrompt: "Ты — классификатор контента для соцсетей. Ответь ТОЛЬКО JSON:\n{ \"postType\": \"advertising\" | \"sponsored\" | \"personal\" | \"educational\" | \"informational\" | \"other\", \"reason\": \"краткое обоснование на русском\" }",
      prompt: `Определи тип поста по тексту:\n${input}`,
      responseFormat: "json",
      temperature: 0.1,
      maxTokens: 500,
    });
    const parsed = JSON.parse(result.content);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message, postType: "other", reason: "Ошибка AI" });
  }
});

// ── Suggest age rating based on text ─────────────────────
complianceRouter.post("/suggest-age-rating", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const result = await generate({
      provider: "vsellm",
      model: "vsellm/google/gemini-3-flash-preview",
      systemPrompt: "Ты — классификатор возрастной маркировки по 436-ФЗ. Ответь ТОЛЬКО JSON:\n{ \"ageRating\": \"0+\" | \"6+\" | \"12+\" | \"16+\" | \"18+\", \"reason\": \"краткое обоснование на русском\" }",
      prompt: `Определи возрастную категорию для текста:\n${(text || "").slice(0, 2000)}`,
      responseFormat: "json",
      temperature: 0.1,
      maxTokens: 500,
    });
    const parsed = JSON.parse(result.content);
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message, ageRating: "0+", reason: "Ошибка AI" });
  }
});

// ── Check history for a draft ────────────────────────────
complianceRouter.get("/history/:draftId", (req, res) => {
  const checks = db.select()
    .from(complianceChecks)
    .where(eq(complianceChecks.draftId, req.params.draftId))
    .orderBy(complianceChecks.checkedAt)
    .all()
    .map(c => ({
      ...c,
      results: c.resultsJson ? JSON.parse(c.resultsJson) : null,
    }));
  res.json(checks);
});

// ── Get structured rules ─────────────────────────────────
complianceRouter.get("/rules", (_req, res) => {
  const dbRules = db.select().from(complianceRules).all();
  const dbRulesMap = new Map(dbRules.map(r => [r.ruleId, r]));

  const merged = COMPLIANCE_RULES.map(rule => {
    const dbRule = dbRulesMap.get(rule.id);
    return {
      ...rule,
      regexPatterns: undefined,
      aiCheckPrompt: undefined,
      ruleType: rule.ruleType || "text",
      appliesTo: rule.appliesTo || null,
      enabled: dbRule ? dbRule.enabled : 1,
      dbId: dbRule?.id || null,
    };
  });

  res.json(merged);
});

// ── Sync rules from source to DB ─────────────────────────
complianceRouter.post("/rules/sync", (_req, res) => {
  let created = 0;
  for (const rule of COMPLIANCE_RULES) {
    const existing = db.select().from(complianceRules).where(eq(complianceRules.ruleId, rule.id)).get();
    if (existing) {
      db.update(complianceRules).set({
        ruleType: rule.ruleType || "text",
        appliesTo: rule.appliesTo ? JSON.stringify(rule.appliesTo) : null,
        updatedAt: sql`(current_timestamp)`,
      }).where(eq(complianceRules.ruleId, rule.id)).run();
      continue;
    }
    db.insert(complianceRules).values({
      id: uuid(),
      ruleId: rule.id,
      category: rule.category,
      article: rule.article,
      title: rule.title,
      description: rule.description,
      severity: rule.severity,
      ruleType: rule.ruleType || "text",
      appliesTo: rule.appliesTo ? JSON.stringify(rule.appliesTo) : null,
      enabled: 1,
      platformOverrides: rule.platforms ? JSON.stringify(rule.platforms) : null,
    }).run();
    created++;
  }
  res.json({ synced: created });
});

// ── Toggle a rule on/off ─────────────────────────────────
complianceRouter.patch("/rules/:ruleId", (req, res) => {
  const { ruleId } = req.params;
  const update = req.body;
  delete update.ruleId;

  const existing = db.select().from(complianceRules).where(eq(complianceRules.ruleId, ruleId)).get();
  if (existing) {
    db.update(complianceRules).set({ ...update, updatedAt: sql`(current_timestamp)` })
      .where(eq(complianceRules.ruleId, ruleId)).run();
  } else {
    db.insert(complianceRules).values({
      id: uuid(),
      ruleId,
      category: update.category || "general",
      article: update.article || "",
      title: update.title || ruleId,
      description: update.description || "",
      severity: update.severity || "medium",
      enabled: update.enabled ?? 1,
    }).run();
  }
  res.json({ success: true });
});

// ── Legacy policy rules CRUD ─────────────────────────────
complianceRouter.get("/policy-rules", (_req, res) => {
  const rules = db.select().from(policyRules).orderBy(policyRules.code).all();
  res.json(rules);
});

complianceRouter.post("/policy-rules", (req, res) => {
  const { code, description, pattern, severity } = req.body;
  if (!code || !description) return res.status(400).json({ error: "code and description are required" });
  const id = uuid();
  db.insert(policyRules).values({ id, code, description, pattern, severity: severity || "warning", enabled: 1 }).run();
  res.status(201).json({ id });
});

complianceRouter.patch("/policy-rules/:id", (req, res) => {
  const { id } = req.params;
  const update = req.body;
  delete update.id;
  db.update(policyRules).set(update).where(eq(policyRules.id, id)).run();
  res.json({ success: true });
});

complianceRouter.delete("/policy-rules/:id", (req, res) => {
  db.delete(policyRules).where(eq(policyRules.id, req.params.id)).run();
  res.status(204).end();
});
