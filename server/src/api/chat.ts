import { Router } from "express";
import { db } from "../db.js";
import { chatMessages, strategyBlocks } from "../schema.js";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generate, getModelForTask, type GenerateOptions } from "../services/aiGateway.js";
import { buildProjectContext } from "../services/projectContext.js";

export const chatRouter = Router();

// GET /project/:projectId?sessionId=xxx — list messages for a session
chatRouter.get("/project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "sessionId query parameter is required" });
  }

  const messages = db
    .select()
    .from(chatMessages)
    .where(sql`project_id = ${projectId} AND session_id = ${sessionId}`)
    .orderBy(chatMessages.createdAt)
    .all();

  res.json(messages);
});

// POST / — send a message, get AI response
chatRouter.post("/", async (req, res) => {
  try {
    const { projectId, platformId, sessionId, content, contextStep, pageContext } = req.body;

    if (!projectId || !sessionId || !content) {
      return res.status(400).json({ error: "projectId, sessionId, and content are required" });
    }

    const now = new Date().toISOString();

    // 1. Save the user message
    const userMsgId = uuid();
    const userMessage = {
      id: userMsgId,
      projectId,
      platformId: platformId || null,
      sessionId,
      role: "user",
      content,
      contextStep: contextStep || null,
      applied: 0,
      createdAt: now,
    };
    db.insert(chatMessages).values(userMessage).run();

    // 2. Fetch previous messages in this session for context
    const history = db
      .select()
      .from(chatMessages)
      .where(sql`project_id = ${projectId} AND session_id = ${sessionId}`)
      .orderBy(chatMessages.createdAt)
      .all();

    // 3. Build the conversation prompt for the AI
    const conversationText = history
      .map((m) => `${m.role === "user" ? "Пользователь" : "Ассистент"}: ${m.content}`)
      .join("\n\n");

    // Detect wizard action from structured JSON content
    let wizardAction: string | null = null;
    let wizardData: any = {};
    try {
      const parsed = JSON.parse(content);
      if (parsed.action) {
        wizardAction = parsed.action;
        wizardData = parsed;
      }
    } catch {}

    const pageContextHint = pageContext ? `\n\nПользователь сейчас на экране: ${pageContext}. Учитывай этот контекст в ответе.` : "";
    const SYSTEM_PROMPT_CHAT =
      "Ты — ассистент контент-стратега. Помогаешь разрабатывать стратегию контента для социальных сетей. " +
      "Отвечай на русском языке. Будь конкретным, практичным и полезным. " +
      "Если нужно предложить контент, формулируй готовые варианты." +
      pageContextHint;

    const PROMPT_TEMPLATES: Record<string, { system: string; user: (data: any) => string }> = {
      generate_strategy: {
        system: "Ты — контент-стратег. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `На основе данных проекта разработай стратегию продвижения для площадки: ${data.platformName || "все площадки"} (${data.platformType || "social"}).

${data.projectContext || ""}

Данные из формы (дополнительно):
- Ниша: ${data.form?.niche || "не указана"}
- ЦА: ${data.form?.audience || "не указана"}
- Боли: ${data.form?.pains || "не указаны"}
- Стиль: ${data.form?.style || "не указан"}

Формат ответа (строгий JSON):
{
  "blocks": [
    { "title": "Позиционирование", "content": "..." },
    { "title": "Целевая аудитория", "content": "..." },
    { "title": "Голос и тон", "content": "..." },
    { "title": "Форматная сетка", "content": "..." },
    { "title": "Ритм и частота", "content": "..." },
    { "title": "Метрики успеха", "content": "..." }
  ]
}`
      },
      generate_rubrics: {
        system: "Ты — контент-стратег. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений. Все поля обязательны.",
        user: (data: any) => {
          const blocks = (data.strategyBlocks || []).map((b: any) => `- ${b.title}: ${b.content?.slice(0, 200)}`).join("\n");
          return `На основе стратегии предложи 4-6 рубрик для контента. Для каждой рубрики укажи процент контента (percent, сумма всех процентов = 100) и подходящие форматы (types: post, carousel, reel, stories, case).

Стратегия проекта:
${blocks || "не указана"}

Формат ответа (строгий JSON):
{
  "rubrics": [
    { "name": "Название рубрики", "description": "Описание рубрики", "percent": 25, "types": ["post", "carousel"] }
  ]
}`;
        }
      },
      generate_ideas: {
        system: "Ты — контент-стратег. Отвечай ТОЛЬКО одним JSON-объектом, без лишнего текста, без пояснений, без markdown.",
        user: (data: any) => {
          const blocks = (data.strategyBlocks || []).map((b: any) => `- ${b.title}: ${b.content?.slice(0, 200)}`).join("\n");
          const rubricsList = (data.rubrics || []).map((r: any) => `- ${r.name} (${r.percent}%): ${r.description}`).join("\n");
          return `На основе стратегии и рубрик придумай 5-7 идей для контента.

${data.projectContext || ""}

Стратегия:
${blocks || "не указана"}

Рубрики:
${rubricsList || "не указаны"}

Данные проекта из формы:
- Ниша: ${data.form?.niche || "не указана"}
- ЦА: ${data.form?.audience || "не указана"}
- Боли: ${data.form?.pains || "не указаны"}

Ответь ТОЛЬКО JSON, без лишнего текста:
{"ideas": ["идея 1", "идея 2", "идея 3", "идея 4", "идея 5"]}`;
        }
      },
      generate_topics: {
        system: "Ты — контент-стратег. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => {
          const blocks = (data.strategyBlocks || []).map((b: any) => `- ${b.title}: ${b.content?.slice(0, 200)}`).join("\n");
          const rubricsList = (data.rubrics || []).map((r: any) => `- ${r.name} (${r.percent}%): ${r.description}`).join("\n");
          const ideasList = (data.ideas || []).map((i: string) => `- ${i}`).join("\n");
          return `Сгенерируй 10 тем для контента на основе стратегии, рубрик и идей.

Стратегия:
${blocks || "не указана"}

Рубрики:
${rubricsList || "не указаны"}

Идеи:
${ideasList || "не указаны"}

Формат ответа (строгий JSON):
{
  "topics": [
    { "title": "Тема", "rubric": "Название рубрики", "description": "Описание" }
  ]
}`;
        }
      },
      unpack_brand: {
        system: "Ты — бренд-аналитик. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `Проанализируй следующие материалы о проекте и извлеки структурированную информацию для заполнения профиля бренда.

СЫРЫЕ МАТЕРИАЛЫ:
${data.materials || "не предоставлены"}

СТРУКТУРА ОТВЕТА (строгий JSON):
{
  "niche": "ниша",
  "audience": "целевая аудитория",
  "pains": "боли и проблемы",
  "style": "стиль общения",
  "tone": "tone of voice",
  "brandStyles": [
    {
      "name": "Название стиля",
      "contentType": "all",
      "systemPrompt": "подробный промпт для генерации изображений",
      "isActive": true
    }
  ],
  "knowledgeSummary": "краткое саммари проекта (300-500 символов)"
}`
      },
      update_onboarding: {
        system: "Ты — бренд-аналитик. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `На основе материалов проекта обнови поля профиля бренда.

МАТЕРИАЛЫ ПРОЕКТА:
${data.materials || "не предоставлены"}

Извлеки из материалов ключевую информацию и верни строгий JSON:
{
  "name": "название проекта",
  "niche": "ниша / тематика",
  "audience": "целевая аудитория",
  "pains": "боли и проблемы аудитории",
  "style": "стиль общения",
  "tone": "tone of voice"
}`
      },
      unpack_from_interview: {
        system: "Ты — бренд-аналитик. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `На основе ответов пользователя на вопросы заполни структурированные поля проекта.

Ответы пользователя:
${(data.answers || []).map((a: any) => `${a.question}\nОтвет: ${a.answer}`).join("\n\n")}

Формат ответа (строгий JSON):
{
  "name": "название проекта/блога",
  "niche": "ниша",
  "audience": "целевая аудитория",
  "pains": "боли и проблемы",
  "style": "стиль общения",
  "tone": "tone of voice",
  "goal": "цель проекта",
  "keyMessage": "главная мысль",
  "brandStyles": [
    {
      "name": "Визуальный стиль",
      "contentType": "all",
      "systemPrompt": "подробный промпт для генерации изображений на основе описания визуала",
      "isActive": true
    }
  ],
  "knowledgeSummary": "краткое саммари проекта (300-500 символов)"
}`
      },
      generate_design_system: {
        system: "Ты — визуальный стратег бренда и дизайнер. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `На основе информации о проекте разработай дизайн-систему для генерации изображений через AI.

ИНФОРМАЦИЯ О ПРОЕКТЕ:
Ниша: ${data.niche || "не указана"}
ЦА: ${data.audience || "не указана"}
Стиль общения: ${data.style || "не указан"}
Tone of voice: ${data.tone || "не указан"}

МАТЕРИАЛЫ ПРОЕКТА:
${data.materials || "не предоставлены"}

Сгенерируй дизайн-систему, которая будет использоваться для всех визуалов бренда.

Формат ответа (строгий JSON):
{
  "name": "название дизайн-системы",
  "palette": {
    "primary": "#HEX",
    "secondary": "#HEX",
    "accent": "#HEX",
    "background": "#HEX",
    "text": "#HEX",
    "description": "описание цветовой палитры"
  },
  "typography": {
    "headingFont": "шрифт для заголовков",
    "bodyFont": "шрифт для текста",
    "description": "описание типографики"
  },
  "composition": {
    "layout": "центр | правило третей | асимметрия",
    "mood": "спокойный | энергичный | минималистичный | тёплый",
    "lighting": "естественное | студийное | мягкое | контрастное",
    "textures": "описание текстур",
    "description": "описание визуального языка"
  },
  "systemPrompt": "готовый подробный системный промпт для AI-генерации изображений (60-120 слов, на русском)"
}`,
      },
      generate_week_plan: {
        system: "Ты — контент-планер. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `Составь контент-план на неделю.

${data.projectContext || ""}
Площадка: ${data.platformName || "все площадки"}

Воронка: ${data.funnel ? `${data.funnel.name} - ${data.funnel.description}` : "свободный контент"}

Для каждого поста укажи цель (goal), хук (hook), ключевое сообщение (keyMessage) и CTA.

Формат ответа (строгий JSON):
{
  "plan": [
    { "date": "2026-06-19", "posts": [{ "title": "Тема", "format": "post", "rubric": "Рубрика", "goal": "цель", "hook": "хук", "keyMessage": "главная мысль", "cta": "призыв" }] },
    { "date": "2026-06-20", "posts": [...] }
  ]
}`
      },
      recommend_funnels: {
        system: "Ты — эксперт по воронкам продаж. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
        user: (data: any) => `На основе данных проекта порекомендуй подходящие воронки из списка.

${data.projectContext || ""}
Площадка: ${data.platformName || "не указана"}

Список доступных воронок с этапами:
${(data.funnels || []).map((f: any) => {
  const stages = f.stages ? (() => { try { const s = JSON.parse(f.stages); return Array.isArray(s) ? s.map((x: any) => typeof x === "string" ? x : x.name || String(x)).join(" → ") : ""; } catch { return ""; } })() : "";
  return `- ID: ${f.id}, Название: ${f.name}${stages ? `\n  Этапы: ${stages}` : ""}\n  Описание: ${f.description}`;
}).join("\n")}

Учитывай этап проекта по Лестнице Ханта (поле "Путь клиента" в контексте) — подбирай воронку, которая соответствует текущему этапу взаимодействия с аудиторией. Выбери 1-2 воронки.

Формат ответа:
{
  "recommendations": [
    { "id": "ID воронки", "reason": "Почему она подходит (1-2 предложения)" }
  ]
}`
      },
    };

    // Load full project context for all messages (not just wizard actions)
    const projectCtx = projectId ? await buildProjectContext(projectId, { snippetChars: 4000 }) : "";

    if (wizardAction && projectId) {
      wizardData.projectContext = projectCtx;
    }

    const useTemplate = wizardAction ? PROMPT_TEMPLATES[wizardAction] : null;
    const systemPrompt = useTemplate?.system || SYSTEM_PROMPT_CHAT;
    const promptText = useTemplate
      ? useTemplate.user(wizardData)
      : `Вот история диалога с пользователем:\n\n${conversationText}${projectCtx}\n\nАссистент:`;

    // 4. Pick model based on context step
    const taskMap: Record<string, string> = {
      onboarding: "strategy",
      ideas: "strategy",
      strategy: "strategy",
      rubrics: "strategy",
      topics: "strategy",
      plan: "strategy",
      caption: "content",
      hook: "content",
      cta: "content",
      brief: "content",
      image_prompt: "visual_prompt",
    };
    const task = taskMap[contextStep || ""] || "chat";
    const model = getModelForTask(task);

    // 5. Try to get AI response, fall back to mock if no API key configured
    let aiContent: string;
    try {
      const result = await generate({
        provider: model.startsWith("vsellm/") ? "vsellm" : model.includes("/") ? "zveno" : "openai",
        model,
        prompt: promptText,
        systemPrompt,
        temperature: useTemplate ? 0.5 : 0.7,
        maxTokens: useTemplate ? 2000 : 1500,
        responseFormat: useTemplate ? "json" : undefined,
      } as GenerateOptions);
      aiContent = result.content;
    } catch (err: any) {
      console.error("[chat] AI generate error:", err.message);
      // Fallback mock response if AI is not configured
      const mockResponses = [
        "Отличный вопрос! Для вашей ниши я рекомендую фокусироваться на полезном контенте, который решает конкретные боли аудитории. Давайте проработаем это подробнее.",
        "Понимаю ваш запрос. Предлагаю включить в стратегию цикл из 3-5 постов, раскрывающих эту тему с разных сторон. Это создаст системность и вовлечёт аудиторию.",
        "Хорошая идея! Вот пример структуры: 1) Проблема — 2) Причина — 3) Микрошаг — 4) Результат. Такой формат отлично работает в Instagram и Telegram.",
      ];
      aiContent = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    }

    // 5. Strip markdown code blocks from AI response for wizard actions
    if (wizardAction && aiContent.includes("```")) {
      const match = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) aiContent = match[1].trim();
    }

    // 6. Save the assistant response
    const assistantMsgId = uuid();
    const assistantMessage = {
      id: assistantMsgId,
      projectId,
      platformId: platformId || null,
      sessionId,
      role: "assistant",
      content: aiContent,
      contextStep: contextStep || null,
      applied: 0,
      createdAt: new Date().toISOString(),
    };
    db.insert(chatMessages).values(assistantMessage).run();

    res.status(201).json({
      userMessage: { ...userMessage, id: userMsgId },
      assistantMessage: { ...assistantMessage, id: assistantMsgId },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Chat processing failed" });
  }
});

// POST /apply — apply a chat message content to a strategy block
chatRouter.post("/apply", (req, res) => {
  try {
    const { messageId, strategyBlockId } = req.body;

    if (!messageId || !strategyBlockId) {
      return res.status(400).json({ error: "messageId and strategyBlockId are required" });
    }

    // Find the chat message
    const message = db.select().from(chatMessages).where(sql`id = ${messageId}`).get();
    if (!message) {
      return res.status(404).json({ error: "Chat message not found" });
    }

    // Find the strategy block
    const block = db.select().from(strategyBlocks).where(sql`id = ${strategyBlockId}`).get();
    if (!block) {
      return res.status(404).json({ error: "Strategy block not found" });
    }

    // Update the strategy block's manualContent with the message content
    const now = new Date().toISOString();
    db.update(strategyBlocks)
      .set({ manualContent: message.content, updatedAt: now })
      .where(sql`id = ${strategyBlockId}`)
      .run();

    // Mark the message as applied
    db.update(chatMessages)
      .set({ applied: 1 })
      .where(sql`id = ${messageId}`)
      .run();

    const updatedBlock = db.select().from(strategyBlocks).where(sql`id = ${strategyBlockId}`).get();

    res.json({
      success: true,
      strategyBlock: updatedBlock,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to apply message to strategy block" });
  }
});
