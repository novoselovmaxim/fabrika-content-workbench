import { Router } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db.js";
import { projects, projectKnowledge, onboardingSteps, products, projectKeywords, platforms, competitorSearches, audiences, savedCompetitors, rubrics, topics, settings } from "../schema.js";
import { sql, eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generate, getModelForTask, extractJSON } from "../services/aiGateway.js";
import { HANT_STAGES } from "../services/hantStages.js";

export const onboardingRouter = Router();

const STEP_KEYS = ["materials", "competitors", "audience", "hant", "value_prop", "products", "platforms"];

// POST /:projectId/start
onboardingRouter.post("/:projectId/start", (req, res) => {
  const { projectId } = req.params;
  const { scenario } = req.body;
  if (!scenario || !["existing", "new"].includes(scenario)) {
    return res.status(400).json({ error: "scenario must be 'existing' or 'new'" });
  }

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Reset project onboarding flag
  db.update(projects).set({
    onboardingScenario: scenario,
    onboardingComplete: 0,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId)).run();

  // Delete old steps to allow restart
  db.delete(onboardingSteps).where(eq(onboardingSteps.projectId, projectId)).run();

  // Check existing data for pre-filling
  const hasKnowledge = db.select({ count: sql<number>`count(*)` }).from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId)).get();
  const hasCompetitors = db.select({ count: sql<number>`count(*)` }).from(competitorSearches)
    .where(eq(competitorSearches.projectId, projectId)).get();
  const hasAudiences = db.select({ count: sql<number>`count(*)` }).from(audiences)
    .where(eq(audiences.projectId, projectId)).get();
  const hasProducts = db.select({ count: sql<number>`count(*)` }).from(products)
    .where(eq(products.projectId, projectId)).get();
  const hasPlatforms = db.select({ count: sql<number>`count(*)` }).from(platforms)
    .where(eq(platforms.projectId, projectId)).get();

  const hasAudiencesCount = hasAudiences?.count ?? 0;
  function dataForStep(key: string): { status: string; aiOutput: string | null } {
    if (key === "materials" && (hasKnowledge?.count ?? 0) > 0) {
      const kws = db.select().from(projectKeywords)
        .where(eq(projectKeywords.projectId, projectId)).all();
      return { status: "done", aiOutput: JSON.stringify(kws) };
    }
    if (key === "competitors" && (hasCompetitors?.count ?? 0) > 0) {
      const latest = db.select().from(competitorSearches)
        .where(eq(competitorSearches.projectId, projectId))
        .orderBy(sql`rowid`).all();
      return { status: "done", aiOutput: latest[latest.length - 1]?.keywords || null };
    }
    if (key === "audience") {
      const projectAudience = project?.audience;
      if (projectAudience) {
        return { status: "done", aiOutput: projectAudience };
      }
      if (hasAudiencesCount > 0) {
        return { status: "done", aiOutput: JSON.stringify({ groups: [] }) };
      }
    }
    if (key === "hant" && project?.customerJourney) {
      return { status: "done", aiOutput: project.customerJourney };
    }
    if (key === "value_prop" && project?.valueProp) {
      return { status: "done", aiOutput: project.valueProp };
    }
    if (key === "products" && (hasProducts?.count ?? 0) > 0) {
      const allProducts = db.select().from(products)
        .where(eq(products.projectId, projectId)).all();
      return { status: "done", aiOutput: JSON.stringify(allProducts) };
    }
    if (key === "platforms" && (hasPlatforms?.count ?? 0) > 0) {
      const allPlats = db.select().from(platforms)
        .where(eq(platforms.projectId, projectId)).all();
      return { status: "done", aiOutput: JSON.stringify(allPlats) };
    }
    return { status: "pending", aiOutput: null };
  }

  const steps = STEP_KEYS.map((stepKey) => {
    const prefill = dataForStep(stepKey);
    return {
      id: uuid(),
      projectId,
      stepKey,
      status: prefill.status,
      aiOutput: prefill.aiOutput,
      manualOverride: null,
      completedAt: prefill.status === "done" ? new Date().toISOString() : null,
    };
  });

  for (const step of steps) {
    db.insert(onboardingSteps).values(step).run();
  }

  const created = db.select().from(onboardingSteps)
    .where(eq(onboardingSteps.projectId, projectId)).all();

  res.status(201).json(created);
});

// POST /:projectId/analyze-competitors
onboardingRouter.post("/:projectId/analyze-competitors", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { urls, keywords, searchMode } = req.body;

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "analyze_competitors",
        urls: urls || [],
        keywords: keywords || [],
        searchMode: searchMode || "combined",
        niche: project.niche,
        mission: project.mission,
      }),
      systemPrompt: "Ты — маркетолог-аналитик. Проанализируй конкурентов и верни ТОЛЬКО JSON.",
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const competitorsJson = JSON.stringify({
      direct: parsed.direct || [],
      indirect: parsed.indirect || [],
      marketInsights: parsed.marketInsights || "",
    });

    db.update(projects).set({
      competitors: competitorsJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: competitorsJson,
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "competitors")
    )).run();

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Competitor analysis failed" });
  }
});

// POST /:projectId/generate-audience
onboardingRouter.post("/:projectId/generate-audience", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { mode, note, promptOverride } = req.body;

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (promptOverride) {
      // User provided their own prompt — use it directly
      const model = getModelForTask("strategy");
      const result = await generate({
        provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
        model,
        prompt: promptOverride,
        systemPrompt: "Ты — маркетолог-аналитик. Отвечай ТОЛЬКО валидным JSON без пояснений.",
        temperature: 0.3,
        maxTokens: 4000,
        responseFormat: "json",
      });

    let parsed: any = {};
    try {
      const extracted = extractJSON(result.content);
      parsed = JSON.parse(extracted);
    } catch (pe: any) {
      const preview = (result.content || "").slice(0, 400);
      return res.status(500).json({ error: `JSON parse: ${pe.message}. Raw: ${preview}`, raw: result.content, promptUsed: promptOverride });
    }

    const audienceJson = JSON.stringify(parsed);
      db.update(projects).set({ audience: audienceJson, updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId)).run();
      db.update(onboardingSteps).set({ status: "done", aiOutput: audienceJson, completedAt: new Date().toISOString() })
        .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "audience"))).run();

      return res.json({ result: parsed, promptUsed: promptOverride });
    }

    // ── Build context ──
    let contextForAi = "";
    if (mode === "from_knowledge") {
      const items = db.select().from(projectKnowledge)
        .where(eq(projectKnowledge.projectId, projectId)).all();
      contextForAi = items.map((i) => `${i.title}: ${(i.content || "").slice(0, 2000)}`).join("\n\n");
    } else if (mode === "from_note") {
      contextForAi = note || "";
    } else {
      contextForAi = `Ниша: ${project.niche || ""}\nМиссия: ${project.mission || ""}\nОписание: ${project.description || ""}`;
    }

    // ── Competitor data ──
    const latestCompetitorSearch = db.select().from(competitorSearches)
      .where(eq(competitorSearches.projectId, projectId))
      .orderBy(desc(competitorSearches.createdAt))
      .get();

    let competitorsText = "";
    if (latestCompetitorSearch) {
      try {
        const parsed = JSON.parse(latestCompetitorSearch.resultJson || "");
        const direct = parsed.direct || parsed.directCompetitors || [];
        const indirect = parsed.indirect || parsed.indirectCompetitors || [];
        const insights = parsed.marketInsights || parsed.insights || "";
        competitorsText = `Конкуренты:\n${JSON.stringify({ direct, indirect }, null, 2)}\nРынок: ${insights}`;
      } catch {
        competitorsText = `Конкуренты: ${latestCompetitorSearch.resultJson}`;
      }
    }

    // ── Project keywords ──
    const kws = db.select().from(projectKeywords)
      .where(eq(projectKeywords.projectId, projectId))
      .all();
    const keywordsText = kws.length > 0
      ? `Ключевые слова проекта: ${kws.map((k: any) => k.keyword).join(", ")}`
      : "";

    // ── Build prompt ──
    const hantStagesText = HANT_STAGES.map((s) =>
      `Стадия ${s.stage}: ${s.label} — ${s.clientGoal}`
    ).join("\n");

    const userPrompt = [
      `Ты — маркетолог-аналитик. Определи целевые аудитории для проекта и проанализируй их по лестнице Ханта.`,
      ``,
      `Данные проекта:`,
      project.niche ? `Ниша: ${project.niche}` : null,
      project.mission ? `Миссия: ${project.mission}` : null,
      project.description ? `Описание: ${project.description}` : null,
      ``,
      competitorsText ? `${competitorsText}\n` : null,
      keywordsText,
      ``,
      contextForAi ? `Контекст:\n${contextForAi}\n` : null,
      ``,
      `ВАЖНО: определи от 1 до 5 целевых аудиторий (сегментов). Каждая ЦА — отдельный сегмент со своими болями, потребностями и стадиями воронки. Если аудитория однородна — верни одну. Если есть разные сегменты — верни несколько.`,
      ``,
      `Для КАЖДОЙ ЦА верни:`,
      `- name (название сегмента)`,
      `- portrait (текстовый портрет: кто это, что делает, о чём переживает)`,
      `- demographics (объект: age, gender, location, income)`,
      `- pains (массив болей и проблем)`,
      `- hantStages (массив из 9 стадий лестницы Ханта):`,
      `   stage (номер 1-9), label (название), description (описание для этой ЦА), audienceShare (доля в %), triggerPhrases (массив фраз), contentGoal (цель контента)`,
      ``,
      hantStagesText,
      ``,
      `Формат ответа — JSON массив. Пример: [{ "name": "Название", "portrait": "...", "demographics": {...}, "pains": [...], "hantStages": [...] }]`,
      `Верни ТОЛЬКО JSON массив, без пояснений.`,
    ].filter(Boolean).join("\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: userPrompt,
      systemPrompt: "Ты — маркетолог-аналитик. Отвечай ТОЛЬКО валидным JSON массивом без пояснений.",
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const extracted = extractJSON(result.content);
      parsed = JSON.parse(extracted);
    } catch (pe: any) {
      const preview = (result.content || "").slice(0, 400);
      return res.status(500).json({ error: `JSON parse: ${pe.message}. Raw: ${preview}`, raw: result.content, promptUsed: userPrompt });
    }

    // Normalize: if AI returns a single object (not array), wrap it
    if (!Array.isArray(parsed)) parsed = [parsed];

    const audienceJson = JSON.stringify(parsed);

    db.update(projects).set({
      audience: audienceJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: audienceJson,
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "audience")
    )).run();

    res.json({ result: parsed, promptUsed: userPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Audience generation failed" });
  }
});

// ── Shared: build audience analysis prompt from project data ──
function buildAudiencePrompt(project: any, knowledgeText: string, competitorsText: string, savedCompetitorsText: string, keywordsText: string): string {
  return [
    `Ты — маркетолог-аналитик и стратег. Проведи глубокий анализ целевой аудитории по методологии.`,
    ``,
    `## ПРОЕКТ`,
    project.niche ? `Ниша: ${project.niche}` : null,
    project.mission ? `Миссия: ${project.mission}` : null,
    project.description ? `Описание: ${project.description}` : null,
    keywordsText ? `Ключевые слова: ${keywordsText}` : null,
    ``,
    `## БАЗА ЗНАНИЙ`,
    knowledgeText || "Материалы отсутствуют.",
    ``,
    `## КОНКУРЕНТЫ И РЫНОК`,
    competitorsText,
    savedCompetitorsText,
    ``,
    `## ЗАДАЧА`,
    `Проведи анализ целевой аудитории по следующей структуре. Для КАЖДОЙ группы ЦА заполни ВСЕ 17 пунктов.`,
    ``,
    `1. Перечислить группы-сегменты людей, которые нуждаются в продукте`,
    `2. Социальный фактор: пол, возраст, семейное положение, наличие/отсутствие детей, профессия – род занятий, доход, уровень образования, прочее`,
    `3. Боли, проблемы, болевые точки каждой группы`,
    `4. Выделить глобальные страхи (для каждой группы)`,
    `5. Что клиента раздражает (для каждой группы)`,
    `6. Цели, желания, ценности каждой группы`,
    `7. Убеждения каждой группы`,
    `8. Шаги, которые делает для устранения проблемы`,
    `9. Альтернативные методы каждой группы`,
    `10. Почему альтернативные методы не работают (для каждой группы)`,
    `11. Насколько часто возникает потребность в продукте. В какой ситуации возникает потребность и какова потребность (для каждой группы)`,
    `12. Где потребляют информацию (для каждой группы)`,
    `13. Точки контакта, где люди узнают и откуда придут за продуктом (для каждой группы)`,
    `14. Какой реальный результат клиент хочет получить от продукта (для каждой группы)`,
    `15. Почему продукт лучше (для каждой группы)`,
    `16. Выделить глобальные страхи (для каждой группы)`,
    `17. Что может помешать купить продукт – возражения (для каждой группы)`,
    ``,
    `ВАЖНО:`,
    `- Учти данные о конкурентах: возможно, у конкурентов есть сегменты ЦА, которые мы упустили — включи их в анализ.`,
    `- Если аудитория однородна — верни одну группу. Если есть разные сегменты — верни несколько.`,
    `- Для каждой группы верни ВСЕ 17 пунктов.`,
    ``,
    `Формат ответа — JSON объект:`,
    `{`,
    `  "groups": [`,
    `    {`,
    `      "name": "Название сегмента",`,
    `      "summary": "Краткое описание сегмента (1-2 предложения)",`,
    `      "segments": ["какие группы людей входят"], // пункт 1`,
    `      "socialFactors": { "gender": "...", "age": "...", "familyStatus": "...", "children": "...", "profession": "...", "income": "...", "education": "...", "other": "..." }, // пункт 2`,
    `      "pains": ["боль 1", "боль 2", ...], // пункт 3`,
    `      "fears": ["страх 1", "страх 2", ...], // пункт 4`,
    `      "irritations": ["что раздражает 1", ...], // пункт 5`,
    `      "goals": ["цель 1", "цель 2", ...], // пункт 6`,
    `      "beliefs": ["убеждение 1", ...], // пункт 7`,
    `      "stepsToSolve": ["шаг 1", "шаг 2", ...], // пункт 8`,
    `      "alternatives": ["альтернатива 1", ...], // пункт 9`,
    `      "whyAlternativesFail": ["почему не работает 1", ...], // пункт 10`,
    `      "needFrequency": "Как часто возникает потребность", // пункт 11`,
    `      "needSituation": "В какой ситуации и какова потребность",`,
    `      "informationSources": ["источник 1", ...], // пункт 12`,
    `      "touchpoints": ["точка контакта 1", ...], // пункт 13`,
    `      "desiredResult": "Какой реальный результат хочет клиент", // пункт 14`,
    `      "whyProductBetter": "Почему продукт лучше для этой группы", // пункт 15`,
    `      "globalFears": ["глобальный страх 1", ...], // пункт 16`,
    `      "objections": ["возражение 1", ...] // пункт 17`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Верни ТОЛЬКО JSON объект, без пояснений.`,
  ].filter(Boolean).join("\n");
}

function loadAudienceContext(projectId: string) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return null;

  const knowledgeEntries = db.select().from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId))
    .orderBy(desc(projectKnowledge.createdAt))
    .all();

  let knowledgeText = "";
  for (const entry of knowledgeEntries.slice(0, 8)) {
    const preview = (entry.content || "").slice(0, 2000);
    knowledgeText += `\n--- ${entry.title} (${entry.type}) ---\n${preview}\n`;
  }

  const keywords = db.select().from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId)).all();
  const keywordsText = keywords.map((k: any) => k.keyword).join(", ");

  const latestCompetitorSearch = db.select().from(competitorSearches)
    .where(eq(competitorSearches.projectId, projectId))
    .orderBy(desc(competitorSearches.createdAt))
    .get();

  let competitorsText = "Данные о конкурентах отсутствуют.";
  if (latestCompetitorSearch) {
    try {
      const parsed = JSON.parse(latestCompetitorSearch.resultJson || "");
      const direct = parsed.direct || parsed.directCompetitors || [];
      const indirect = parsed.indirect || parsed.indirectCompetitors || [];
      const insights = parsed.marketInsights || parsed.insights || "";
      competitorsText = `Конкуренты:\n${JSON.stringify({ direct, indirect }, null, 2)}\nРынок: ${insights}`;
    } catch {
      competitorsText = `Конкуренты: ${latestCompetitorSearch.resultJson}`;
    }
  }

  const savedCompetitorRows = db.select().from(savedCompetitors)
    .where(eq(savedCompetitors.projectId, projectId)).all();
  let savedCompetitorsText = "";
  if (savedCompetitorRows.length > 0) {
    savedCompetitorsText = "Накопленные конкуренты:\n" + savedCompetitorRows.map((c: any) =>
      `- ${c.name} (${c.url})\n  Позиционирование: ${c.positioning || "—"}\n  Сильные: ${c.strengths || "—"}\n  Слабые: ${c.weaknesses || "—"}\n  Аудитория: ${c.audience || "—"}`
    ).join("\n");
  }

  return { project, knowledgeText, competitorsText, savedCompetitorsText, keywordsText };
}

// GET /:projectId/generate-audience-deep-prompt — возвращает сформированный промпт (без генерации)
onboardingRouter.get("/:projectId/generate-audience-deep-prompt", (req, res) => {
  try {
    const { projectId } = req.params;
    const ctx = loadAudienceContext(projectId);
    if (!ctx) return res.status(404).json({ error: "Project not found" });

    const prompt = buildAudiencePrompt(ctx.project, ctx.knowledgeText, ctx.competitorsText, ctx.savedCompetitorsText, ctx.keywordsText);
    res.json({ prompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to build prompt" });
  }
});

// POST /:projectId/generate-audience-deep — глубокий анализ ЦА по 17 пунктам + конкуренты
onboardingRouter.post("/:projectId/generate-audience-deep", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { promptOverride } = req.body;

    const ctx = loadAudienceContext(projectId);
    if (!ctx) return res.status(404).json({ error: "Project not found" });

    const userPrompt = promptOverride || buildAudiencePrompt(ctx.project, ctx.knowledgeText, ctx.competitorsText, ctx.savedCompetitorsText, ctx.keywordsText);

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: userPrompt,
      systemPrompt: "Ты — маркетолог-аналитик и стратег. Отвечай ТОЛЬКО валидным JSON объектом без пояснений.",
      temperature: 0.3,
      maxTokens: 8000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const extracted = extractJSON(result.content);
      parsed = JSON.parse(extracted);
    } catch (pe: any) {
      const preview = (result.content || "").slice(0, 400);
      return res.status(500).json({ error: `JSON parse: ${pe.message}. Raw: ${preview}`, raw: result.content, promptUsed: userPrompt });
    }

    const audienceJson = JSON.stringify(parsed);
    db.update(projects).set({
      audience: audienceJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    const existingStep = db.select().from(onboardingSteps)
      .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "audience"))).get();
    if (existingStep) {
      db.update(onboardingSteps).set({
        status: "done",
        aiOutput: audienceJson,
        completedAt: new Date().toISOString(),
      }).where(eq(onboardingSteps.id, existingStep.id)).run();
    }

    res.json({ result: parsed, promptUsed: userPrompt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Deep audience analysis failed" });
  }
});

// POST /:projectId/save-audience — сохранить отредактированный результат ЦА
onboardingRouter.post("/:projectId/save-audience", (req, res) => {
  try {
    const { projectId } = req.params;
    const { result } = req.body;
    if (!result) return res.status(400).json({ error: "result is required" });

    const audienceJson = JSON.stringify(result);
    db.update(projects).set({
      audience: audienceJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    const existingStep = db.select().from(onboardingSteps)
      .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "audience"))).get();
    if (existingStep) {
      db.update(onboardingSteps).set({
        status: "done",
        aiOutput: audienceJson,
        completedAt: new Date().toISOString(),
      }).where(eq(onboardingSteps.id, existingStep.id)).run();
    } else {
      db.insert(onboardingSteps).values({
        id: uuid(),
        projectId,
        stepKey: "audience",
        status: "done",
        aiOutput: audienceJson,
        completedAt: new Date().toISOString(),
      }).run();
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Save failed" });
  }
});

// POST /:projectId/generate-value-prop
onboardingRouter.post("/:projectId/generate-value-prop", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const audience = project.audience ? JSON.parse(project.audience) : {};

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "generate_value_prop",
        niche: project.niche,
        mission: project.mission,
        audience: audience.portrait || project.audience,
        pains: project.pains,
      }),
      systemPrompt: `Ты — маркетолог-стратег. Сформируй ценностное предложение по методологии.
      
Формула: "Наш [продукт] помогает [ЦА], которые хотят [задача], тем что [действие/проблема] и [результат]."

Верни JSON со структурой:
{
  "formula": "готовая формула",
  "tasks": [{"text": "Задача/цель ЦА", "score": 1-3}],
  "problems": [{"text": "Проблема/боль", "score": 1-3}],
  "gains": [{"text": "Выгода/результат", "score": 1-3}],
  "products": [{"text": "Товар/услуга", "score": 1-3}],
  "helpFactors": [{"text": "Как продукт снимает боль", "score": 1-3}],
  "gainFactors": [{"text": "Как продукт создаёт выгоду", "score": 1-3}]
}
Score: 1=низкий, 2=средний, 3=высокий приоритет.

Верни ТОЛЬКО JSON без пояснений.`,
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const valuePropJson = JSON.stringify(parsed);

    db.update(projects).set({
      valueProp: valuePropJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: valuePropJson,
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "value_prop")
    )).run();

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Value prop generation failed" });
  }
});

// POST /:projectId/generate-hant-multi — построить лестницу Ханта для КАЖДОЙ группы ЦА отдельно
onboardingRouter.post("/:projectId/generate-hant-multi", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Получаем группы ЦА из сохранённого результата глубокого анализа
    let audienceGroups: any[] = [];
    try {
      const parsed = project.audience ? JSON.parse(project.audience) : {};
      audienceGroups = parsed.groups || [];
    } catch {
      return res.status(400).json({ error: "Audience data not found or invalid. Run audience analysis first." });
    }

    if (audienceGroups.length === 0) {
      return res.status(400).json({ error: "No audience groups found. Run audience analysis first." });
    }

    const HANT_STAGES_DETAIL = [
      { stage: 1, label: "Не знает о проблеме", temperature: "cold", clientGoal: "Привлечь внимание к проблеме", clientActions: "Не ищет информацию, живёт обычной жизнью", expectations: "Не знает, что проблема существует", emotions: "Спокойствие, неосведомлённость", touchpoints: "Реклама, соцсети, рекомендации друзей", tonality: "Обучающая, провокационная" },
      { stage: 2, label: "Осознаёт, ничего не делает", temperature: "cold", clientGoal: "Показать последствия бездействия", clientActions: "Замечает проблему, но откладывает", expectations: "Думает, что проблема не срочная", emotions: "Лёгкое беспокойство", touchpoints: "Блоги, статьи, видео", tonality: "Эмпатичная, аккуратная" },
      { stage: 3, label: "Ищет решение", temperature: "warm", clientGoal: "Показать варианты решений", clientActions: "Гуглит, спрашивает знакомых", expectations: "Хочет найти лучшее решение", emotions: "Заинтересованность, сомнение", touchpoints: "Поисковики, форумы, обзоры", tonality: "Полезная, экспертная" },
      { stage: 4, label: "Выбирает среди решений", temperature: "warm", clientGoal: "Показать преимущества", clientActions: "Сравнивает варианты, читает отзывы", expectations: "Хочет понять, что лучше", emotions: "Активный поиск, сравнение", touchpoints: "Сайты, обзоры, кейсы", tonality: "Убедительная, сравнительная" },
      { stage: 5, label: "Выбирает поставщика", temperature: "warm", clientGoal: "Закрыть возражения, усилить доверие", clientActions: "Изучает конкретные предложения", expectations: "Ищет лучшего поставщика", emotions: "Готовность к выбору, настороженность", touchpoints: "Сайт, соцсети, личный кабинет", tonality: "Доверительная, персональная" },
      { stage: 6, label: "Сомневается в себе", temperature: "hot", clientGoal: "Усилить уверенность в правильности выбора", clientActions: "Сомневается, перепроверяет", expectations: "Боится ошибиться", emotions: "Тревога, неуверенность", touchpoints: "Отзывы, гарантии, поддержка", tonality: "Поддерживающая, ободряющая" },
      { stage: 7, label: "Пробный период", temperature: "hot", clientGoal: "Упростить первый шаг", clientActions: "Пробует, тестирует", expectations: "Хочет убедиться, что работает", emotions: "Надежда, опасение", touchpoints: "Бесплатный доступ, демо", tonality: "Простая, дружелюбная" },
      { stage: 8, label: "Оплата и пользование", temperature: "retained", clientGoal: "Обеспечить успешный опыт", clientActions: "Покупает, начинает использовать", expectations: "Ждёт результат", emotions: "Удовлетворение или разочарование", touchpoints: "Продукт, поддержка", tonality: "Помогающая, вовлекающая" },
      { stage: 9, label: "Повторные взаимодействия", temperature: "retained", clientGoal: "Удержать, сделать лояльным", clientActions: "Использует повторно, рекомендует", expectations: "Хочет больше ценности", emotions: "Лояльность или разочарование", touchpoints: "Email, соцсети, программа лояльности", tonality: "Благодарная, вдохновляющая" },
    ];

    const HANT_STAGES_TEXT = HANT_STAGES_DETAIL.map((s) =>
      `Стадия ${s.stage}: ${s.label} (${s.temperature})\n  Цель: ${s.clientGoal}\n  Действия: ${s.clientActions}\n  Ожидания: ${s.expectations}\n  Эмоции: ${s.emotions}\n  Точки контакта: ${s.touchpoints}\n  Тональность: ${s.tonality}`
    ).join("\n\n");

    // Строим промпт со ВСЕМИ группами ЦА сразу
    const groupsDescription = audienceGroups.map((g: any, i: number) =>
      `Группа ${i + 1}: "${g.name}"\nОписание: ${g.summary || ""}\nБоли: ${(g.pains || []).join(", ")}\nСтрахи: ${(g.fears || []).join(", ")}\nЦели: ${(g.goals || []).join(", ")}\nУбеждения: ${(g.beliefs || []).join(", ")}\nЧто раздражает: ${(g.irritations || []).join(", ")}\nЖелаемый результат: ${g.desiredResult || ""}`
    ).join("\n\n");

    const userPrompt = [
      `Ты — маркетолог-стратег. Для КАЖДОЙ группы целевой аудитории построй отдельную матрицу пути клиента по 9 стадиям Ханта.`,
      ``,
      `## Данные проекта`,
      project.niche ? `Ниша: ${project.niche}` : null,
      project.mission ? `Миссия: ${project.mission}` : null,
      project.description ? `Описание: ${project.description}` : null,
      ``,
      `## Группы ЦА (всего ${audienceGroups.length})`,
      groupsDescription,
      ``,
      `## Стадии Ханта (для каждой группы нужно заполнить все 9)`,
      HANT_STAGES_TEXT,
      ``,
      `Для КАЖДОЙ стадии каждой группы верни объект со всеми полями:`,
      `- stage (номер 1-9)`,
      `- label (название стадии)`,
      `- temperature (cold/warm/hot/retained)`,
      `- clientGoal (цель клиента на этой стадии для этой группы)`,
      `- clientActions (что делает клиент)`,
      `- contentFromActions (контент под действия клиента)`,
      `- expectations (что ожидает)`,
      `- contentFromExpectations (контент под ожидания)`,
      `- emotions (эмоции)`,
      `- tonality (тональность контента)`,
      `- touchpoints (массив точек контакта)`,
      `- experience (опыт клиента)`,
      `- contentFromExperience (контент на основе опыта)`,
      `- recommendations (рекомендации по контенту)`,
      `- funnelPrototype (прототип воронки)`,
      ``,
      `Формат ответа — JSON объект:`,
      `{`,
      `  "journeys": [`,
      `    {`,
      `      "groupIndex": 0, // индекс группы из списка выше`,
      `      "groupName": "Название сегмента ЦА",`,
      `      "groupSummary": "Кратко об этой ЦА",`,
      `      "stages": [ /* 9 объектов стадий */ ]`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Верни ТОЛЬКО JSON объект, без пояснений.`,
    ].filter(Boolean).join("\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: userPrompt,
      systemPrompt: "Ты — маркетолог-стратег. Отвечай ТОЛЬКО валидным JSON объектом без пояснений.",
      temperature: 0.3,
      maxTokens: 10000,
      responseFormat: "json",
    });

    let parsed: any = {};
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch (pe: any) {
      const preview = (result.content || "").slice(0, 400);
      return res.status(500).json({ error: `JSON parse: ${pe.message}. Raw: ${preview}`, raw: result.content });
    }

    const journeys = parsed.journeys || [];
    const journeyJson = JSON.stringify(journeys);

    db.update(projects).set({
      customerJourney: journeyJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    const existingStep = db.select().from(onboardingSteps)
      .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "hant"))).get();
    if (existingStep) {
      db.update(onboardingSteps).set({
        status: "done",
        aiOutput: journeyJson,
        completedAt: new Date().toISOString(),
      }).where(eq(onboardingSteps.id, existingStep.id)).run();
    }

    res.json(journeys);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Hant multi-journey generation failed" });
  }
});

// POST /:projectId/save-hant — сохранить отредактированный результат лестниц Ханта
onboardingRouter.post("/:projectId/save-hant", (req, res) => {
  try {
    const { projectId } = req.params;
    const { journeys } = req.body;
    if (!journeys) return res.status(400).json({ error: "journeys is required" });

    const journeyJson = JSON.stringify(journeys);
    db.update(projects).set({
      customerJourney: journeyJson,
      updatedAt: new Date().toISOString(),
    }).where(eq(projects.id, projectId)).run();

    const existingStep = db.select().from(onboardingSteps)
      .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "hant"))).get();
    if (existingStep) {
      db.update(onboardingSteps).set({
        status: "done",
        aiOutput: journeyJson,
        completedAt: new Date().toISOString(),
      }).where(eq(onboardingSteps.id, existingStep.id)).run();
    } else {
      db.insert(onboardingSteps).values({
        id: uuid(),
        projectId,
        stepKey: "hant",
        status: "done",
        aiOutput: journeyJson,
        completedAt: new Date().toISOString(),
      }).run();
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Save failed" });
  }
});

// GET /:projectId/status
onboardingRouter.get("/:projectId/status", (req, res) => {
  const { projectId } = req.params;
  const steps = db.select().from(onboardingSteps)
    .where(eq(onboardingSteps.projectId, projectId))
    .all();
  const project = db.select({
    onboardingScenario: projects.onboardingScenario,
    onboardingComplete: projects.onboardingComplete,
  }).from(projects).where(eq(projects.id, projectId)).get();

  res.json({
    steps,
    scenario: project?.onboardingScenario || null,
    complete: project?.onboardingComplete || 0,
  });
});

// PATCH /:projectId/step/:stepKey
onboardingRouter.patch("/:projectId/step/:stepKey", (req, res) => {
  const { projectId, stepKey } = req.params;
  const { status, manualOverride } = req.body;

  const existing = db.select().from(onboardingSteps)
    .where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, stepKey)
    )).get();

  if (!existing) return res.status(404).json({ error: "Step not found" });

  const update: any = { updatedAt: new Date().toISOString() };
  if (status) update.status = status;
  if (manualOverride !== undefined) update.manualOverride = JSON.stringify(manualOverride);
  if (status === "done") update.completedAt = new Date().toISOString();

  db.update(onboardingSteps).set(update)
    .where(eq(onboardingSteps.id, existing.id)).run();

  const updated = db.select().from(onboardingSteps)
    .where(eq(onboardingSteps.id, existing.id)).get();

  res.json(updated);
});

// POST /:projectId/generate-keywords — AI extracts keywords from materials
onboardingRouter.post("/:projectId/generate-keywords", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const knowledge = db.select().from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, projectId)).all();

    const context = knowledge.map((k) => `${k.title}: ${(k.content || "").slice(0, 2000)}`).join("\n\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "extract_keywords",
        context,
        niche: project.niche,
        mission: project.mission,
      }),
      systemPrompt: `Ты — SEO-маркетолог. Извлеки ключевые слова и фразы из контекста проекта.
Верни JSON-массив объектов: [{"keyword": "...", "volume": "high|medium|low", "group": "..."}]
volume — примерная оценка частотности, group — тематическая группа.
Только JSON.`,
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    });

    let parsed: any[] = [];
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    for (const kw of parsed) {
      db.insert(projectKeywords).values({
        id: uuid(),
        projectId,
        keyword: kw.keyword,
        source: `ai_extracted:${kw.group || "general"}:${kw.volume || "medium"}`,
      }).run();
    }

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: JSON.stringify(parsed),
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "materials")
    )).run();

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Keyword generation failed" });
  }
});

// POST /:projectId/generate-products — AI generates products from materials
onboardingRouter.post("/:projectId/generate-products", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const knowledge = db.select().from(projectKnowledge)
      .where(eq(projectKnowledge.projectId, projectId)).all();
    const context = knowledge.map((k) => `${k.title}: ${(k.content || "").slice(0, 2000)}`).join("\n\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "generate_products",
        context,
        niche: project.niche,
        mission: project.mission,
      }),
      systemPrompt: `Ты — продуктовый маркетолог. На основе материалов проекта определи продукты/услуги, которые проект предлагает.

Верни JSON-массив объектов:
[{
  "name": "Название продукта",
  "description": "Краткое описание",
  "audienceDescription": "Для кого этот продукт",
  "pains": ["боль 1", "боль 2"],
  "gains": ["выгода 1", "выгода 2"]
}]
Только JSON.`,
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    });

    let parsed: any[] = [];
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const created: any[] = [];
    for (const p of parsed) {
      const id = uuid();
      db.insert(products).values({
        id,
        projectId,
        name: p.name,
        description: p.description,
        values: JSON.stringify({ pains: p.pains || [], gains: p.gains || [], audienceDescription: p.audienceDescription || "" }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).run();
      created.push({ id, ...p });
    }

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: JSON.stringify(created),
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "products")
    )).run();

    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Product generation failed" });
  }
});

// POST /:projectId/suggest-platforms — AI suggests platforms per product
onboardingRouter.post("/:projectId/suggest-platforms", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    const allProducts = db.select().from(products)
      .where(eq(products.projectId, projectId)).all();

    if (allProducts.length === 0) {
      return res.status(400).json({ error: "No products found. Generate products first." });
    }

    // Clear old suggested platforms for this project before adding new ones
    db.delete(platforms).where(and(
      eq(platforms.projectId, projectId),
      eq(platforms.suggested, 1)
    )).run();

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "suggest_platforms",
        products: allProducts.map((p) => {
          let values: any = {};
          try { values = JSON.parse(p.values || "{}"); } catch {}
          return { id: p.id, name: p.name, description: p.description, values };
        }),
        niche: project.niche,
      }),
      systemPrompt: `Ты — SMM-стратег. Для каждого продукта предложи подходящие площадки.

Каждый продукт имеет поле "id" — используй его как "productId" в ответе.

Верни JSON-массив объектов:
[{
  "productId": "id продукта (скопируй из id в данных продукта)",
  "platforms": [{
    "name": "Instagram",
    "type": "social",
    "description": "Почему эта площадка",
    "priority": 1
  }]
}]
Приоритет — от 1 (самый релевантный). Возможные типы: social, video, text, marketplace, messenger, other.
Только JSON.`,
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: "json",
    });

    let parsed: any[] = [];
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }

    const created: any[] = [];
    for (const item of parsed) {
      // Resolve productId — AI might return invalid UUID, fallback to matching by name or first product
      let productId = item.productId;
      if (!productId || !allProducts.some((p) => p.id === productId)) {
        const matched = allProducts.find((p) => p.name === item.productId || p.name === item.name);
        productId = matched?.id || allProducts[0]?.id || null;
      }
      if (!productId) continue;
      for (const pl of item.platforms || []) {
        const id = uuid();
        db.insert(platforms).values({
          id,
          projectId,
          productId,
          name: pl.name,
          type: pl.type || "social",
          config: JSON.stringify({ description: pl.description || "", priority: pl.priority || 10 }),
          suggested: 1,
          ordering: pl.priority || 10,
        }).run();
        created.push({ id, productId, ...pl, suggested: 1 });
      }
    }

    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: JSON.stringify(created),
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "platforms")
    )).run();

    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Platform suggestion failed" });
  }
});

// POST /:projectId/import-channel
onboardingRouter.post("/:projectId/import-channel", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { platform, identifier, description } = req.body;

    if (!platform || !identifier) {
      return res.status(400).json({ error: "platform and identifier required" });
    }

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) return res.status(404).json({ error: "Project not found" });

    // 1. Fetch posts
    let fetchData: any;

    if (platform === "vk") {
      const dbKey = db.select().from(settings).where(eq(settings.key, "vk_service_key")).get()?.value;
      const vkKey = process.env.VK_SERVICE_KEY || dbKey || "";
      if (!vkKey) {
        return res.status(503).json({ error: "VK Service Key не настроен. Настройте в Settings → VK Service Key." });
      }
      try {
        const { fetchVKPosts } = await import("../services/vk.js");
        const result = await fetchVKPosts(identifier, vkKey);
        fetchData = {
          posts: result.posts,
          channel: { title: result.name, name: result.name, subscriberCount: result.subscribers },
        };
      } catch (e: any) {
        return res.status(502).json({ error: `VK API: ${e.message}` });
      }
    } else if (platform === "zen") {
      try {
        const { fetchZenArticle } = await import("../services/zen.js");
        const result = await fetchZenArticle(identifier);
        fetchData = {
          posts: result.posts,
          channel: { title: result.name, name: result.name, subscriberCount: 0 },
        };
      } catch (e: any) {
        return res.status(502).json({ error: `Дзен: ${e.message}` });
      }
    } else if (platform === "instagram") {
      const isPostUrl = /instagram\.com\/(p|reel|reels)\//.test(identifier);
      if (isPostUrl) {
        try {
          const { fetchInstagramPost } = await import("../services/instagram.js");
          const result = await fetchInstagramPost(identifier, description);
          fetchData = {
            posts: result.posts,
            channel: { title: result.name, name: result.name, subscriberCount: 0 },
          };
        } catch (e: any) {
          return res.status(502).json({ error: `Instagram: ${e.message}` });
        }
      } else {
        try {
          const { fetchInstagramProfile, isApifyConfigured } = await import("../services/apify.js");
          if (isApifyConfigured()) {
            const profile = await fetchInstagramProfile(identifier.replace(/^@/, ""));
            if (profile) {
              fetchData = {
                posts: [],
                channel: {
                  title: profile.fullName || profile.username || identifier,
                  name: profile.username || identifier,
                  subscriberCount: profile.followerCount,
                },
              };
            } else {
              fetchData = { posts: [], channel: { title: identifier, name: identifier, subscriberCount: 0 } };
            }
          } else {
            fetchData = { posts: [], channel: { title: identifier, name: identifier, subscriberCount: 0 } };
          }
        } catch (e: any) {
          return res.status(502).json({ error: `Instagram: ${e.message}` });
        }
      }
    } else {
      try {
        const VPS = "http://80.87.111.142:4000";
        const r = await fetch(`${VPS}/api/metrics/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, identifier }),
          signal: AbortSignal.timeout(15000),
        });
        fetchData = await r.json();
      } catch (e: any) {
        return res.status(503).json({
          error: `VPS недоступен (${e.message}). Импорт канала требует подключения к серверу метрик.`,
          detail: e.message,
        });
      }
      if (fetchData.error) {
        return res.status(502).json({ error: fetchData.error });
      }
    }

    // 2. Save each post as knowledge entry
    const posts: any[] = fetchData.posts || [];
    if (posts.length === 0) {
      return res.status(200).json({
        imported: 0,
        message: "Канал найден, но посты не получены",
        channel: fetchData.channel || null,
        analysis: null,
      });
    }

    const knowledgeIds: string[] = [];
    for (const post of posts) {
      const id = uuid();
      const text = post.text || "";
      const title = post.title || text.slice(0, 100);
      const tags = JSON.stringify({
        source: platform,
        identifier,
        url: post.url || post.link || "",
        date: post.date || post.publishedAt || "",
        views: post.views || post.viewCount || 0,
        likes: post.likes || post.likeCount || 0,
        comments: post.comments || post.commentCount || 0,
        reposts: post.reposts || post.shareCount || 0,
      });
      db.insert(projectKnowledge).values({
        id,
        projectId,
        type: "channel_post",
        title,
        content: text,
        sourceUrl: post.url || post.link || null,
        tags,
        createdAt: new Date().toISOString(),
      }).run();
      knowledgeIds.push(id);
    }

    // 3. Run AI analysis on imported posts
    const combinedTexts = posts.map((p, i) => `[Пост ${i + 1}] ${p.text || ""}`).join("\n\n---\n\n");
    const channelInfo = fetchData.channel || {};
    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: JSON.stringify({
        action: "analyze_channel",
        platform,
        identifier,
        channelName: channelInfo.title || channelInfo.name || identifier,
        subscriberCount: channelInfo.subscriberCount || channelInfo.subscribers || 0,
        postCount: posts.length,
        posts: posts.map((p) => ({
          text: (p.text || "").slice(0, 1500),
          date: p.date || p.publishedAt || "",
          views: p.views || p.viewCount || 0,
        })),
      }),
      systemPrompt: `Ты — контент-стратег. Проанализируй посты канала и верни ТОЛЬКО JSON.
Поля:
- niche (string): ниша канала
- toneOfVoice (string): тон общения
- contentStyle (string): стиль контента
- targetAudience (string): целевая аудитория
- postingFrequency (string): частота публикаций
- mainTopics (string[]): 3-7 ключевых тем
- rubrics (array of {name, description, percentage}): 2-5 рубрик с процентом встречаемости в этих постах
- recommendations (string): рекомендации по контент-стратегии`,
      temperature: 0.3,
      maxTokens: 4000,
      responseFormat: "json",
    });

    let analysis: any = {};
    try {
      const extracted = extractJSON(result.content);
      analysis = JSON.parse(extracted);
    } catch {
      analysis = { error: "Failed to parse AI response", raw: result.content.slice(0, 500) };
    }

    // 4. Save rubrics from analysis
    const savedRubricIds: string[] = [];
    if (analysis.rubrics && Array.isArray(analysis.rubrics)) {
      for (const r of analysis.rubrics) {
        const rid = uuid();
        db.insert(rubrics).values({
          id: rid,
          projectId,
          name: r.name || "Без названия",
          description: r.description || null,
          ordering: savedRubricIds.length,
          active: 1,
          color: ["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899"][savedRubricIds.length % 6],
        }).run();
        savedRubricIds.push(rid);
      }
    }

    // 5. Save topics from analysis
    if (analysis.mainTopics && Array.isArray(analysis.mainTopics)) {
      for (const t of analysis.mainTopics) {
        db.insert(topics).values({
          id: uuid(),
          projectId,
          title: typeof t === "string" ? t : t.title || t,
          description: typeof t === "string" ? null : t.description || null,
          source: "channel_import",
          status: "active",
          rubricId: savedRubricIds[0] || null,
          priority: 0,
        }).run();
      }
    }

    // 6. Update project fields if empty
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (!project.niche && analysis.niche) updates.niche = analysis.niche;
    if (!project.tone && analysis.toneOfVoice) updates.tone = analysis.toneOfVoice;
    if (!project.audience && analysis.targetAudience) updates.audience = analysis.targetAudience;
    if (!project.style && analysis.contentStyle) updates.style = analysis.contentStyle;
    if (Object.keys(updates).length > 1) {
      db.update(projects).set(updates).where(eq(projects.id, projectId)).run();
    }

    // 7. Update onboarding step if exists
    db.update(onboardingSteps).set({
      status: "done",
      aiOutput: JSON.stringify(analysis),
      completedAt: new Date().toISOString(),
    }).where(and(
      eq(onboardingSteps.projectId, projectId),
      eq(onboardingSteps.stepKey, "materials")
    )).run();

    res.json({
      imported: posts.length,
      channel: {
        name: channelInfo.title || channelInfo.name || identifier,
        subscribers: channelInfo.subscriberCount || channelInfo.subscribers || 0,
        platform,
      },
      analysis,
      knowledgeIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Channel import failed" });
  }
});


