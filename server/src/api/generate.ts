import { Router } from "express";
import { generate, getModelForTask, getTemplates, getTemplate, fillTemplate, extractJSON, type GenerateOptions } from "../services/aiGateway.js";
import { db } from "../db.js";
import { projects, draftVersions, postItems, rubrics, topics, contentTypes, strategyBlocks, funnels } from "../schema.js";
import { sql, eq, and, gte } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { buildProjectContext } from "../services/projectContext.js";
import { selectRelevantFacts } from "../services/factSelector.js";
import { checkCompliance } from "../services/compliance.js";

export const generateRouter = Router();

// Map template stage → task model key
const TEMPLATE_STAGE_TASK: Record<string, string> = {
  brief: "strategy",
  carousel: "content",
  slide: "content",
  prompt: "visual_prompt",
  image: "image",
  slides: "content",
};

const EXPLAINABLE_TEMPLATES = new Set(["caption-post", "caption-carousel", "caption-reel", "brief"]);

// List available templates
generateRouter.get("/templates", (_req, res) => {
  const templates = getTemplates();
  res.json(templates.map((t) => ({ id: t.id, name: t.name, stage: t.stage, contentType: t.contentType })));
});

// Get template detail
generateRouter.get("/templates/:id", (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

// Generate content
generateRouter.post("/", async (req, res) => {
  try {
    const { templateId, postItemId, variables, provider, model, temperature, maxTokens, responseFormat } = req.body;

    let prompt = "";
    let systemPrompt = "";

    if (templateId) {
      const template = getTemplate(templateId);
      if (!template) return res.status(404).json({ error: "Template not found" });
      systemPrompt = template.systemPrompt;
      prompt = fillTemplate(template.userPrompt, variables || {});
    } else if (req.body.prompt) {
      prompt = req.body.prompt;
      systemPrompt = req.body.systemPrompt || "";
    } else {
      return res.status(400).json({ error: "Either templateId or prompt is required" });
    }

    // Inject project context if postItemId or projectId provided
    const ctxProjectId = postItemId
      ? (db.select({ projectId: postItems.projectId }).from(postItems).where(eq(postItems.id, postItemId)).get()?.projectId)
      : req.body.projectId || null;

    if (ctxProjectId) {
      const context = await buildProjectContext(ctxProjectId);
      if (context) {
        systemPrompt = systemPrompt + context;
      }

      // Inject relevant brand facts
      const useFacts = templateId ? EXPLAINABLE_TEMPLATES.has(templateId) : false;
      if (useFacts) {
        const { hantStage } = req.body;
        const selected = await selectRelevantFacts(ctxProjectId, {
          hantStage,
          limit: 10,
          topicTitle: variables?.title,
        });
        if (selected.facts.length > 0) {
          const factsBlock = selected.facts.map((f) => `[${f.id}] ${f.factText}`).join("\n");
          systemPrompt = systemPrompt + `\n\nФАКТЫ О БРЕНДЕ (используй только то, что применимо к этой теме):\n${factsBlock}`;
        }
      }
    }

    // Determine model: if request includes one, use it; otherwise resolve from template stage
    let genModel = model;
    if (!genModel && templateId) {
      const t = getTemplate(templateId);
      if (t) genModel = getModelForTask(TEMPLATE_STAGE_TASK[t.stage] || "content");
    }
    if (!genModel) genModel = getModelForTask("content");

    const isExplainable = templateId ? EXPLAINABLE_TEMPLATES.has(templateId) : false;
    const effectiveFormat = isExplainable ? "json" : (responseFormat || "text");

    const result = await generate({
      provider: provider || (genModel.startsWith("vsellm/") ? "vsellm" : genModel.includes("/") ? "zveno" : "openai"),
      model: genModel,
      prompt,
      systemPrompt,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2000,
      responseFormat: effectiveFormat,
    });

    // Parse JSON for explainable templates
    let contentText = result.content;
    let usedFacts: string[] | null = null;
    let riskScore: number | null = null;
    let riskTags: string[] | null = null;
    let explanation: string | null = null;

    if (isExplainable) {
      try {
        const parsed = JSON.parse(extractJSON(result.content));
        contentText = parsed.content || result.content;
        usedFacts = parsed.usedFacts || null;
        riskScore = parsed.risk ?? null;
        riskTags = parsed.riskTags || null;
        explanation = parsed.explanation || null;
      } catch {
        contentText = result.content;
      }
    }

    // Compliance check (regex layer on top of LLM risk)
    const compliance = checkCompliance(contentText, ctxProjectId || undefined);
    const finalRiskScore = riskScore != null ? Math.max(riskScore, compliance.riskScore) : compliance.riskScore || null;
    const finalRiskTags = [...new Set([...(riskTags || []), ...compliance.riskTags])];
    if (compliance.violatedRules.length > 0 && !explanation) {
      explanation = `Нарушены правила: ${compliance.violatedRules.join(", ")}`;
    }

    // Save as draft version if postItemId provided
    let draftId: string | null = null;
    if (postItemId) {
      draftId = uuid();
      db.insert(draftVersions).values({
        id: draftId,
        postItemId,
        stage: templateId?.split("-")[0] || "generation",
        modelProvider: result.provider,
        modelName: result.model,
        promptSnapshot: JSON.stringify({ templateId, variables }),
        contentMarkdown: contentText,
        isManualEdit: 0,
        usedBrandFacts: usedFacts ? JSON.stringify(usedFacts) : null,
        riskScore: finalRiskScore,
        riskTags: finalRiskTags.length > 0 ? JSON.stringify(finalRiskTags) : null,
        explanation,
      }).run();
    }

    res.json({
      content: contentText,
      model: result.model,
      provider: result.provider,
      tokens: result.tokens,
      draftId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Generation failed" });
  }
});

function getNextMonday(afterDate: string | null): string {
  const d = afterDate ? new Date(afterDate + "T12:00:00Z") : new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  const day = d.getUTCDay();
  if (day !== 1) {
    const offset = day === 0 ? 1 : 8 - day;
    d.setUTCDate(d.getUTCDate() + offset);
  }
  return d.toISOString().split("T")[0];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function buildWeekPlanPrompt(opts: {
  weekStart: string; weekEnd: string;
  rubrics: any[]; contentTypes: any[];
  blocks: any[]; plannedPosts: any[];
  platformName: string;
  topics: any[]; ideas: string[];
  funnel?: any;
  projectTone?: string;
}) {
  const funnelText = opts.funnel 
    ? `ВОРОНКА ПРОДАЖ (следуй этой структуре): ${opts.funnel.name}\nОписание: ${opts.funnel.description}\nСтадии/Шаги:\n${opts.funnel.stages}\nПравила: ${opts.funnel.rules || "нет"}`
    : "РЕЖИМ: Свободный контент на основе стратегии и рубрик.";

  const blocksText = opts.blocks.map(b =>
    `- ${b.title}${b.aiContent ? `: ${b.aiContent.slice(0, 300)}` : ""}${b.manualContent ? `: ${b.manualContent.slice(0, 300)}` : ""}`
  ).join("\n");

  const rubricsText = opts.rubrics.map(r =>
    `  • ${r.name} (${r.color || ""}) — ${r.description || ""}`
  ).join("\n");

  const contentTypesText = opts.contentTypes.map(ct =>
    `  • ${ct.name} (${ct.code})`
  ).join("\n");

  const topicsText = opts.topics.length > 0
    ? opts.topics.map((t: any) => `  • ${t.title}${t.description ? ` — ${t.description}` : ""}${t.rubricId ? ` (рубрика: ${opts.rubrics.find((r: any) => r.id === t.rubricId)?.name || "—"})` : ""}`).join("\n")
    : "  (нет)";

  const ideasText = opts.ideas.length > 0
    ? opts.ideas.map((idea: string, i: number) => `  ${i + 1}. ${idea}`).join("\n")
    : "  (нет)";

  const plannedText = opts.plannedPosts.length > 0
    ? opts.plannedPosts.map(p => `  • ${p.scheduledDate} — ${p.title}`).join("\n")
    : "  (нет)";

  const toneText = opts.projectTone ? `- Тон: ${opts.projectTone}` : "";

  return `Составь контент-план для Instagram-канала "${opts.platformName}" строго на неделю ${opts.weekStart} (понедельник) — ${opts.weekEnd} (воскресенье).

${funnelText}

СТРАТЕГИЯ (ключевые блоки):
${blocksText || "  (не указана)"}

РУБРИКИ:
${rubricsText}

ТЕМЫ ДЛЯ ПОСТОВ:
${topicsText}

ИДЕИ ДЛЯ КОНТЕНТА:
${ideasText}

ТИПЫ КОНТЕНТА:
${contentTypesText}

УЖЕ ЗАПЛАНИРОВАНО (не повторяй темы):
${plannedText}

ТРЕБОВАНИЯ:
- Распредели посты равномерно по дням недели (пн-вс)
- Если выбрана воронка — КАЖДЫЙ пост должен соответствовать логическому шагу воронки.
- Для каждого поста выбери рубрику и тип контента из списка выше.
- Заголовки должны быть уникальными, не повторять уже запланированные.
- Учитывай стратегию бренда.
${toneText}
- Если выбрана воронка — для каждого поста укажи stage (название стадии/шага воронки, к которому относится пост). Используй одну из стадий воронки из списка выше.
- Для каждого поста придумай цель (goal), хук (hook), ключевое сообщение (keyMessage) и CTA.

Формат ответа — строгий JSON:
{
  "plan": [
    { "date": "${opts.weekStart}", "posts": [
      { "title": "Заголовок поста", "format": "carousel", "rubric": "Название рубрики", "goal": "цель поста", "hook": "цепляющая первая фраза", "keyMessage": "главная мысль", "cta": "призыв к действию", "stage": "название стадии из воронки" }
    ]},
    { "date": "${addDays(opts.weekStart, 1)}", "posts": [...] },
    { "date": "${addDays(opts.weekStart, 2)}", "posts": [...] },
    { "date": "${addDays(opts.weekStart, 3)}", "posts": [...] },
    { "date": "${addDays(opts.weekStart, 4)}", "posts": [...] },
    { "date": "${addDays(opts.weekStart, 5)}", "posts": [...] },
    { "date": "${addDays(opts.weekStart, 6)}", "posts": [...] }
  ]
}

Каждая дата должна быть в указанном диапазоне недели. Ответ — ТОЛЬКО JSON, без пояснений.`;
}

// Generate next week plan
generateRouter.post("/week-plan", async (req, res) => {
  try {
    const { projectId, platformId, ideas: reqIdeas, funnelId } = req.body;
    if (!projectId || !platformId) {
      return res.status(400).json({ error: "projectId and platformId are required" });
    }

    const funnel = funnelId ? db.select().from(funnels).where(eq(funnels.id, funnelId)).get() : null;

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();

    // 1. Find last planned post date for this platform
    const lastPost = db
      .select({ scheduledDate: postItems.scheduledDate })
      .from(postItems)
      .where(and(
        eq(postItems.projectId, projectId),
        eq(postItems.platformId, platformId)
      ))
      .orderBy(sql`${postItems.scheduledDate} DESC`)
      .limit(1)
      .get();

    // 2. Calculate next free Monday
    const weekStart = getNextMonday(lastPost?.scheduledDate || null);
    const weekEnd = addDays(weekStart, 6);

    // 3. Gather context from DB
    const existingRubrics = db
      .select()
      .from(rubrics)
      .where(and(
        eq(rubrics.projectId, projectId),
        eq(rubrics.platformId, platformId),
        eq(rubrics.active, 1)
      ))
      .orderBy(rubrics.ordering)
      .all();

    const contentTypesList = db.select().from(contentTypes).all();

    const strategyBlockList = db
      .select()
      .from(strategyBlocks)
      .where(and(
        eq(strategyBlocks.projectId, projectId),
        eq(strategyBlocks.platformId, platformId)
      ))
      .orderBy(strategyBlocks.ordering)
      .all();

    // 4. Get topics from DB
    const existingTopics = db
      .select()
      .from(topics)
      .where(and(
        eq(topics.projectId, projectId),
        eq(topics.platformId, platformId),
      ))
      .orderBy(topics.priority)
      .all();

    const ideas = Array.isArray(reqIdeas) ? reqIdeas : [];

    // 5. Get planned posts (next 8 weeks for context)
    const plannedPosts = db
      .select({
        title: postItems.title,
        scheduledDate: postItems.scheduledDate,
        status: postItems.status,
      })
      .from(postItems)
      .where(and(
        eq(postItems.projectId, projectId),
        eq(postItems.platformId, platformId),
        gte(postItems.scheduledDate, formatDate(new Date())),
      ))
      .orderBy(postItems.scheduledDate)
      .all();

    // 6. Get platform name
    const platform = db
      .select({ name: sql<string>`name` })
      .from(sql`platforms`)
      .where(sql`id = ${platformId}`)
      .get();

    // 7. Build AI prompt
    const prompt = buildWeekPlanPrompt({
      weekStart,
      weekEnd,
      rubrics: existingRubrics,
      contentTypes: contentTypesList,
      blocks: strategyBlockList,
      plannedPosts,
      platformName: platform?.name || "проект",
      topics: existingTopics,
      ideas,
      funnel,
      projectTone: project?.tone || undefined,
    });

    // 8. Call AI
    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt,
      systemPrompt: "Ты — контент-планер. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
      temperature: 0.5,
      maxTokens: 3000,
      responseFormat: "json",
    });

    // 9. Parse AI response
    let planData: any;
    try {
      const cleaned = result.content
        .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
        .trim();
      planData = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        error: "Ошибка парсинга ответа AI",
        raw: result.content,
      });
    }

    if (!planData.plan || !Array.isArray(planData.plan)) {
      return res.status(500).json({
        error: "AI вернул неверный формат данных",
        raw: result.content,
      });
    }

    // 10. Create posts for each day (DO NOT delete existing)
    const createdPosts: any[] = [];
    for (const day of planData.plan) {
      for (const post of (day.posts || [])) {
        if (!post.title || post.title === "Новый пост") continue;
        
        const id = uuid();
        const rubric = existingRubrics.find(r => r.name === post.rubric);
        const ct = contentTypesList.find(
          c => c.name === post.format || c.code === post.format
        );
        const now = new Date().toISOString();
        db.insert(postItems).values({
          id,
          projectId,
          platformId,
          funnelId: funnelId || null,
          funnelStage: post.stage || null,
          title: post.title || "Новый пост",
          scheduledDate: day.date,
          status: "planned",
          rubricId: rubric?.id || null,
          contentTypeId: ct?.id || null,
          goal: post.goal || null,
          hook: post.hook || null,
          keyMessage: post.keyMessage || null,
          cta: post.cta || null,
          createdAt: now,
          updatedAt: now,
        }).run();
        createdPosts.push({
          id,
          title: post.title,
          date: day.date,
          format: post.format,
          rubric: post.rubric,
          stage: post.stage,
        });
      }
    }

    res.status(201).json({
      posts: createdPosts,
      weekStart,
      weekEnd,
      count: createdPosts.length,
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message || "Ошибка генерации плана" });
  }
});

// Quick generate without saving
generateRouter.post("/quick", async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const model = getModelForTask("chat");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt,
      systemPrompt: systemPrompt || "",
    });

    res.json({ content: result.content, model: result.model, provider: result.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Generation failed" });
  }
});

// Suggest rubrics for free content wizard (AI generates rubric ideas from project context)
generateRouter.post("/suggest-rubrics", async (req, res) => {
  try {
    const { projectId, platformId } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const context = await buildProjectContext(projectId);
    const prompt = [
      `Ты — контент-стратег. Предложи от 3 до 6 рубрик (постоянных тем/колонок) для контент-плана.`,
      platformId ? `Площадка: по ID ${platformId}` : null,
      ``,
      `Для каждой рубрики верни: name, description, color (hex).`,
      `Формат — JSON массив: [{ "name": "...", "description": "...", "color": "#...." }]`,
      `Только JSON, без пояснений.`,
    ].filter(Boolean).join("\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: prompt + context,
      systemPrompt: "Ты — контент-стратег. Отвечай ТОЛЬКО JSON массивом.",
      temperature: 0.4,
      maxTokens: 2000,
    });

    let parsed: any[] = [];
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Rubric suggestion failed" });
  }
});

// Suggest topics for free content wizard (given a rubric)
generateRouter.post("/suggest-topics", async (req, res) => {
  try {
    const { projectId, platformId, rubricId, rubricName, rubricDescription } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });

    const context = await buildProjectContext(projectId);
    const rubricText = rubricName ? `Рубрика: ${rubricName}${rubricDescription ? ` — ${rubricDescription}` : ""}` : "";

    const prompt = [
      `Ты — контент-стратег. Предложи от 5 до 10 идей для постов в рамках указанной рубрики.`,
      rubricText,
      platformId ? `Площадка: по ID ${platformId}` : null,
      ``,
      `Для каждой идеи верни: title (короткий заголовок поста), description (краткое описание).`,
      `Формат — JSON массив: [{ "title": "...", "description": "..." }]`,
      `Только JSON, без пояснений.`,
    ].filter(Boolean).join("\n");

    const model = getModelForTask("strategy");
    const result = await generate({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
      model,
      prompt: prompt + context,
      systemPrompt: "Ты — контент-стратег. Отвечай ТОЛЬКО JSON массивом, без пояснений, без markdown-разметки.",
      temperature: 0.5,
      maxTokens: 3000,
    });

    let parsed: any[] = [];
    try {
      const content = extractJSON(result.content);
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: result.content });
    }
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Topic suggestion failed" });
  }
});

// Shift funnel posts to new start date
generateRouter.post("/shift-funnel", async (req, res) => {
  try {
    const { projectId, platformId, funnelId, startDate } = req.body;
    if (!projectId || !platformId || !funnelId || !startDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const posts = db.select().from(postItems)
      .where(and(
        eq(postItems.projectId, projectId),
        eq(postItems.platformId, platformId),
        eq(postItems.funnelId, funnelId)
      ))
      .orderBy(postItems.scheduledDate)
      .all();

    if (posts.length === 0) return res.json({ success: true, count: 0 });

    const firstDate = posts[0].scheduledDate;
    const diffTime = new Date(startDate + "T00:00:00").getTime() - new Date(firstDate + "T00:00:00").getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    for (const post of posts) {
      const d = new Date(post.scheduledDate + "T00:00:00");
      d.setDate(d.getDate() + diffDays);
      const newDate = d.toISOString().split("T")[0];
      db.update(postItems).set({ scheduledDate: newDate }).where(eq(postItems.id, post.id)).run();
    }

    res.json({ success: true, count: posts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
