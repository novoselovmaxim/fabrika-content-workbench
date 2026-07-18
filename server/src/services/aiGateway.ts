import { db } from "../db.js";
import { settings } from "../schema.js";
import { eq } from "drizzle-orm";

function getDbSetting(key: string): string {
  try {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value || "";
  } catch {
    return "";
  }
}

export interface AiProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
}

export interface GenerateOptions {
  provider: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  images?: { mime: string; b64: string }[];
}

export interface GenerateResult {
  content: string;
  model: string;
  provider: string;
  tokens?: { prompt: number; completion: number };
  cost?: number;
}

function getProviderApiKey(envKey: string, dbKey: string): string {
  return process.env[envKey] || getDbSetting(dbKey) || "";
}

// Debug: log key presence (without exposing the key)
if (getDbSetting("openai_key")) console.log("[aiGateway] OpenAI key found in DB");
if (process.env.OPENAI_API_KEY) console.log("[aiGateway] OpenAI key found in env");

const providers: Record<string, AiProvider> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    apiKey: getProviderApiKey("OPENAI_API_KEY", "openai_key"),
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    apiKey: getProviderApiKey("ANTHROPIC_API_KEY", "anthropic_key"),
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
  },
  zveno: {
    id: "zveno",
    name: "ZvenoAI",
    apiKey: getProviderApiKey("ZVENO_API_KEY", "zveno_key"),
    baseUrl: "https://api.zveno.ai/v1",
    models: [
      "google/gemini-3-flash-preview",
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4.6",
      "openai/gpt-5.2",
      "openai/gpt-5-image-mini",
      "minimax/minimax-m2",
    ],
  },
   vsellm: {
    id: "vsellm",
    name: "Vsellm",
    apiKey: getProviderApiKey("VSELLM_API_KEY", "vsellm_key"),
    baseUrl: "https://api.vsellm.ru/v1",
    models: [
      "google/gemini-3-flash-preview",
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4-20250514",
      "vertex_ai/imagen-4.0-fast-generate-001",
      "deepseek-chat",
    ],
  },
};

// ── Task → model mapping ────────────────────────────────
export interface TaskModelConfig {
  [task: string]: string;
}

const DEFAULT_TASK_MODELS: TaskModelConfig = {
  chat: "vsellm/google/gemini-3-flash-preview",
  content: "vsellm/google/gemini-3-flash-preview",
  strategy: "vsellm/google/gemini-3-flash-preview",
  visual_prompt: "vsellm/google/gemini-3-flash-preview",
  image: "vsellm/vertex_ai/imagen-4.0-fast-generate-001",
};

const TASK_MODEL_KEYS: Record<string, string> = {
  chat: "model_chat",
  content: "model_content",
  strategy: "model_strategy",
  visual_prompt: "model_visual_prompt",
  image: "model_image",
};

export function getModelForTask(task: string): string {
  const dbKey = TASK_MODEL_KEYS[task];
  if (dbKey) {
    const saved = getDbSetting(dbKey);
    if (saved) return saved;
  }
  return DEFAULT_TASK_MODELS[task] || DEFAULT_TASK_MODELS.content;
}

export function getTaskModelKeys(): { task: string; label: string; dbKey: string; default: string }[] {
  return [
    { task: "chat", label: "AI Чат", dbKey: "model_chat", default: DEFAULT_TASK_MODELS.chat },
    { task: "content", label: "Контент (каптивы, хуки, CTA)", dbKey: "model_content", default: DEFAULT_TASK_MODELS.content },
    { task: "strategy", label: "Стратегия и брифы", dbKey: "model_strategy", default: DEFAULT_TASK_MODELS.strategy },
    { task: "visual_prompt", label: "Визуальные промпты", dbKey: "model_visual_prompt", default: DEFAULT_TASK_MODELS.visual_prompt },
    { task: "image", label: "Генерация изображений", dbKey: "model_image", default: DEFAULT_TASK_MODELS.image },
  ];
}

async function callOpenAI(opts: GenerateOptions, provider: AiProvider): Promise<GenerateResult> {
  const content: any = opts.images?.length
    ? [
        { type: "text", text: opts.prompt },
        ...opts.images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mime};base64,${img.b64}` },
        })),
      ]
    : opts.prompt;

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content },
      ],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    model: opts.model,
    provider: opts.provider,
    tokens: data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens } : undefined,
  };
}

async function callAnthropic(opts: GenerateOptions, provider: AiProvider): Promise<GenerateResult> {
  const res = await fetch(`${provider.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.7,
      system: opts.systemPrompt || "",
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return {
    content: data.content[0].text,
    model: opts.model,
    provider: "anthropic",
    tokens: data.usage ? { prompt: data.usage.input_tokens, completion: data.usage.output_tokens } : undefined,
  };
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  // Route by model prefix: vsellm/vendor/model → vsellm provider, strip prefix
  if (opts.model.startsWith("vsellm/")) {
    const p = providers.vsellm;
    if (!p.apiKey) throw new Error("Vsellm API key not configured. Add it in Settings.");
    return callOpenAI({ ...opts, model: opts.model.replace("vsellm/", ""), provider: "vsellm" }, p);
  }

  // Route by model prefix: zveno/vendor/model → zveno provider, strip prefix
  if (opts.model.startsWith("zveno/")) {
    const p = providers.zveno;
    if (!p.apiKey) throw new Error("ZvenoAI API key not configured. Add it in Settings.");
    return callOpenAI({ ...opts, model: opts.model.replace("zveno/", ""), provider: "zveno" }, p);
  }

  // Legacy: vendor/model name (no prefix) → zveno
  if (opts.model.includes("/")) {
    const p = providers.zveno;
    if (!p.apiKey) throw new Error("ZvenoAI API key not configured. Add it in Settings.");
    return callOpenAI({ ...opts, provider: "zveno" }, p);
  }

  const provider = providers[opts.provider];
  if (!provider) throw new Error(`Unknown provider: ${opts.provider}`);
  if (!provider.apiKey) throw new Error(`API key not configured for ${opts.provider}`);

  if (opts.provider === "openai") return callOpenAI(opts, provider);
  if (opts.provider === "anthropic") return callAnthropic(opts, provider);
  throw new Error(`Provider ${opts.provider} not implemented`);
}

// ── JSON extraction helper ──────────────────────────────
export function extractJSON(text: string): string {
  let s = text.trim();
  // Strip markdown code block fences
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  // Try raw parse on cleaned text
  try { JSON.parse(s); return s; } catch {}
  // Try JSON object/array anywhere in text
  const jsonBlock = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonBlock) {
    const inner = jsonBlock[1].trim();
    try { JSON.parse(inner); return inner; } catch {}
  }
  return s;
}

// ── Image generation ────────────────────────────────────
export interface GenerateImageOptions {
  provider: string;
  model: string;
  prompt: string;
  size?: string;
  quality?: "standard" | "low";
  n?: number;
}

export interface GenerateImageResult {
  b64_json: string;
  model: string;
  provider: string;
}

function isGeminiImageModel(model: string): boolean {
  return /^google\/gemini-(.+-)?image-preview$/.test(model);
}

export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const model = opts.model.replace("vsellm/", "").replace("zveno/", "");
  let p: AiProvider | undefined;
  if (opts.model.startsWith("vsellm/")) p = providers.vsellm;
  else if (opts.model.startsWith("zveno/")) p = providers.zveno;
  else p = model.includes("/") ? providers.vsellm : providers[opts.provider] || providers.vsellm;
  if (!p) throw new Error(`Provider not found for model: ${opts.model}`);
  if (!p.apiKey) throw new Error(`${p.name} API key not configured. Add it in Settings.`);

  if (isGeminiImageModel(model)) {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: opts.prompt }],
        responseModalities: ["Image", "Text"],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Image generation error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const imageUrl: string = data.choices?.[0]?.message?.images?.[0]?.url;
    if (!imageUrl) throw new Error("Gemini did not return an image");

    const b64_json = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    return { b64_json, model: opts.model, provider: p.id };
  }

  const res = await fetch(`${p.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      size: opts.size || "1024x1024",
      n: opts.n || 1,
      quality: opts.quality || "standard",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Image generation error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return {
    b64_json: data.data[0].b64_json,
    model: opts.model,
    provider: p.id,
  };
}

// ── Prompt templates ────────────────────────────────────
export interface PromptTemplate {
  id: string;
  name: string;
  stage: string;
  contentType: string;
  systemPrompt: string;
  userPrompt: string;
}

const defaultTemplates: PromptTemplate[] = [
  {
    id: "caption-carousel",
    name: "Caption для карусели",
    stage: "caption",
    contentType: "carousel",
    systemPrompt: "Ты — контент-мейкер, который пишет посты под конкретный проект. Ниша, тон и аудитория указаны в блоке КОНТЕКСТ ПРОЕКТА ниже. Пиши на русском.",
    userPrompt: "Напиши caption для Instagram-карусели.\n\nТема: {title}\nЦель: {goal}\nХук: {hook}\nКлючевое сообщение: {keyMessage}\nCTA: {cta}\n\nФормат:\n- Первые 1-2 строки — цепляющий хук\n- Основной блок — полезный контент (3-7 пунктов)\n- Финал — мягкий CTA\n\nФормат ответа — строгий JSON:\n{ \"content\": \"текст caption\", \"usedFacts\": [\"id1\"], \"risk\": 0.0-1.0, \"riskTags\": [\"тег\"], \"explanation\": \"1-2 предложения\" }",
  },
  {
    id: "caption-post",
    name: "Caption для поста",
    stage: "caption",
    contentType: "post",
    systemPrompt: "Ты — контент-мейкер, который пишет посты под конкретный проект. Ниша, тон и аудитория указаны в блоке КОНТЕКСТ ПРОЕКТА ниже. Пиши на русском.",
    userPrompt: "Напиши caption для статичного Instagram-поста.\n\nТема: {title}\nЦель: {goal}\nХук: {hook}\nКлючевое сообщение: {keyMessage}\nCTA: {cta}\n\nФормат:\n- Сильная открывющая фраза\n- Развитие мысли\n- Мягкий CTA\n\nФормат ответа — строгий JSON:\n{ \"content\": \"текст caption\", \"usedFacts\": [\"id1\"], \"risk\": 0.0-1.0, \"riskTags\": [\"тег\"], \"explanation\": \"1-2 предложения\" }",
  },
  {
    id: "caption-reel",
    name: "Сценарий для Reels",
    stage: "caption",
    contentType: "reel",
    systemPrompt: "Ты — контент-мейкер, который пишет посты под конкретный проект. Ниша, тон и аудитория указаны в блоке КОНТЕКСТ ПРОЕКТА ниже. Пиши на русском.",
    userPrompt: "Напиши сценарий для Reels (15-30 секунд).\n\nТема: {title}\nЦель: {goal}\nХук: {hook}\nКлючевое сообщение: {keyMessage}\n\nФормат:\n- Хук (первые 3 секунды)\n- Ситуация / узнаваемость\n- Один простой шаг\n- Финал с эмоцией\n\nФормат ответа — строгий JSON:\n{ \"content\": \"текст сценария\", \"usedFacts\": [\"id1\"], \"risk\": 0.0-1.0, \"riskTags\": [\"тег\"], \"explanation\": \"1-2 предложения\" }",
  },
  {
    id: "caption-stories",
    name: "Сценарий для Stories",
    stage: "caption",
    contentType: "stories",
    systemPrompt: "Ты — контент-мейкер, который пишет посты под конкретный проект. Ниша, тон и аудитория указаны в блоке КОНТЕКСТ ПРОЕКТА ниже. Пиши на русском.",
    userPrompt: "Напиши сценарий для Stories (3-5 карточек).\n\nТема: {title}\nЦель: {goal}\n\nФормат для каждой карточки:\n- Текст на экране\n- Визуальная заметка\n- CTA / стикер\n\nТон: тёплый, диалоговый.",
  },
  {
    id: "hook-variants",
    name: "Варианты хуков",
    stage: "hook",
    contentType: "any",
    systemPrompt: "Ты — маркетолог, специалист по хукам для Instagram. Пиши на русском.",
    userPrompt: "Придумай 5 вариантов хуков для поста.\n\nТема: {title}\nЦель: {goal}\n\nФормат: каждый хук — 1 строка, цепляющий, без кликбейта.",
  },
  {
    id: "cta-variants",
    name: "Варианты CTA",
    stage: "cta",
    contentType: "any",
    systemPrompt: "Ты — маркетолог, специалист по call-to-action. Пиши на русском.",
    userPrompt: "Придумай 5 вариантов CTA для поста.\n\nТема: {title}\nЦель: {goal}\n\nФормат: каждый CTA — 1 строка.",
  },
  {
    id: "visual-prompt",
    name: "Промпт для изображения",
    stage: "image_prompt",
    contentType: "any",
    systemPrompt: "Ты — профессиональный промпт-инженер для Google Imagen. Создавай детальные промпты на русском языке. В ответе — ТОЛЬКО текст промпта, без пояснений.",
    userPrompt: `Создай детальный промпт для генерации изображения для Instagram-поста.

Тема: {title}
Ключевое сообщение: {keyMessage}

Требования:
- Стиль: мягкая фотография, естественное освещение, малая глубина резкости
- Палитра и стиль — в соответствии с брендом проекта
- Визуальная метафора на тему {title}
- Чистая композиция, нижняя треть пустая для текста
- 60-100 слов

Чего избегать: текст, буквы, водяные знаки, лица людей

Ответ — ТОЛЬКО промпт, на русском.`,
  },
  {
    id: "carousel-image-prompt",
    name: "Промпт для слайда карусели",
    stage: "image_prompt",
    contentType: "carousel",
    systemPrompt: "Ты — профессиональный промпт-инженер для Google Imagen. Создавай детальные промпты на русском языке. В ответе — ТОЛЬКО текст промпта, без пояснений.",
    userPrompt: `Создай детальный промпт для генерации изображения для слайда Instagram-карусели.

Пост: {title}
Ключевое сообщение: {keyMessage}
Слайд {slideNumber}: {slideTitle}
Текст на слайде: {slideText}
Рубрика: {rubric}

Требования:
- Стиль: мягкая фотография, естественное освещение, малая глубина резкости
- Палитра и стиль — в соответствии с брендом проекта
- Визуальная метафора: «{slideTitle}» — связь с темой: {slideText}
- Чистая композиция, спокойное созерцательное настроение
- Нижняя треть пустая для текста
- 60-100 слов
- АБСОЛЮТНО НИКАКОГО ТЕКСТА на изображении. Ни букв, ни слов, ни надписей. Только визуальный образ.

Чего избегать: текст, буквы, слова, надписи, водяные знаки, лица людей

Ответ — ТОЛЬКО промпт, на русском.`,
  },
  {
    id: "brief",
    name: "Бриф на пост",
    stage: "brief",
    contentType: "any",
    systemPrompt: "Ты — контент-стратег. Пиши на русском. Отвечай только в формате JSON.",
    userPrompt: "Составь бриф на Instagram-пост. Ответ — строгий JSON без пояснений.\n\nТема: {title}\nРубрика: {rubric}\nТип контента: {contentType}\n\nБриф должен включать:\n1. Цель поста\n2. Целевая аудитория (конкретный сегмент)\n3. Ключевое сообщение\n4. Хук (вход)\n5. CTA\n6. Тон и стиль\n7. Формат подачи\n8. Ожидаемая реакция\n\nФормат: {\"goal\": \"...\", \"hook\": \"...\", \"keyMessage\": \"...\", \"cta\": \"...\", \"usedFacts\": [\"id1\"], \"risk\": 0.0-1.0, \"riskTags\": [\"тег\"], \"explanation\": \"1-2 предложения\" }",
  },
  {
    id: "carousel-slides",
    name: "Структура карусели (слайды)",
    stage: "carousel",
    contentType: "carousel",
    systemPrompt: "Ты — контент-мейкер для Instagram. Разрабатывай структуру карусели пошагово. Пиши на русском.",
    userPrompt: `Разработай структуру карусели для Instagram-поста.

Название: {title}
Рубрика: {rubric}
Цель: {goal}
Хук: {hook}
Ключевое сообщение: {keyMessage}
CTA: {cta}
{captionContext}

Определи оптимальное количество слайдов (от 3 до 10), исходя из содержания.

Для каждого слайда укажи:
- заголовок — это ВИДИМЫЙ заголовок на слайде (привлекательная фраза, а не служебное описание). ВАЖНО: не пиши "Заключение", "Вывод", "CTA", "Результат", "Итог" — это служебные названия разделов. Придумай конкретную фразу, которая будет на слайде.
- текст на слайде (коротко, 1-3 предложения)
- format: "image" или "html"
  — "image" если слайду нужен фотореалистичный фон (продукт, атмосфера, человек, сцена, пейзаж)
  — "html" если слайд текстоцентричный (цитата, статистика, вопрос, CTA, список, определение, заголовок раздела)
- visualPrompt (только для format="image"): что изобразить на русском
- styleHint (только для format="html"): краткое описание визуального стиля (фон, расположение текста, акценты)

Формат ответа — строгий JSON:
  {
    "slides": [
      { "slide": 1, "title": "Обложка", "text": "текст на слайде", "format": "image", "visualPrompt": "описание визуала" },
      { "slide": 2, "title": "70% людей даже не замечают", "text": "70% людей...", "format": "html", "styleHint": "крупная цифра, тёмный фон, контраст" },
      { "slide": 3, "title": "Что с этим делать", "text": "текст", "format": "html", "styleHint": "мягкий градиент, цитатный блок" },
      { "slide": 4, "title": "Начни с малого", "text": "текст", "format": "image", "visualPrompt": "описание визуала" }
    ]
  }

  Ответ — ТОЛЬКО JSON, без пояснений.`,
  },
  {
    id: "slide-html-style",
    name: "Стиль для HTML-слайда",
    stage: "slide_style",
    contentType: "carousel",
    systemPrompt: "Ты — дизайнер, специалист по визуальному оформлению Instagram-слайдов. Твой стек: CSS-градиенты, современная типографика, акцентные цвета. Пиши на русском. Ответ — ТОЛЬКО JSON, без пояснений.",
    userPrompt: `Разработай визуальный стиль для слайда Instagram-карусели.

  Заголовок: {title}
  Текст: {text}
  Стиль: {styleHint}
  Брендовый стиль: {brandStyle}

  Определи:
  - тип фона: градиент, плашка, минимализм
  - цвета фона (2 для градиента)
  - цвет текста
  - размер заголовка (крупный/средний)
  - расположение текста (центр/слева/снизу)
  - акцентный элемент (цифра, иконка, линия, буллит)

  Формат ответа — строгий JSON:
  {
    "backgroundType": "gradient" | "solid" | "minimal",
    "colors": ["#hex1", "#hex2"],
    "textColor": "#hex",
    "titleSize": "large" | "medium",
    "layout": "center" | "left" | "bottom",
    "accentType": "digit" | "icon" | "line" | "bullet" | "none",
    "accentColor": "#hex"
  }

  Ответ — ТОЛЬКО JSON, без пояснений.`,
  },
  {
    id: "stories-board",
    name: "Сценарий Stories",
    stage: "stories",
    contentType: "stories",
    systemPrompt: "Ты — контент-мейкер для Instagram Stories. Пиши на русском.",
    userPrompt: `Разработай сценарий для Instagram Stories (3-5 карточек).

Название: {title}
Рубрика: {rubric}
Цель: {goal}
Хук: {hook}
CTA: {cta}

Для каждой карточки укажи:
- номер
- текст на экране
- визуальная заметка / идея для фона

Формат ответа — строгий JSON:
{
  "stories": [
    { "slide": 1, "text": "текст на экране", "visualNote": "описание визуала" },
    { "slide": 2, "text": "...", "visualNote": "..." }
  ]
}

Ответ — ТОЛЬКО JSON, без пояснений.`,
  },
  {
    id: "generate-brand-style",
    name: "Генерация промпта фирменного стиля",
    stage: "brand_style",
    contentType: "any",
    systemPrompt: "Ты — визуальный стратег бренда. Создавай подробные системные промпты для Imagen. В ответе — ТОЛЬКО текст промпта, без пояснений.",
    userPrompt: `На основе описания бренда создай системный промпт для генерации изображений.

Ниша: {niche}
ЦА: {audience}
Стиль: {style}
Доп. описание: {userDescription}

Промпт должен описывать: цветовую палитру, освещение, композицию, настроение, текстуры.
60-120 слов. Только промпт, без пояснений.`,
  },
  {
    id: "hashtags",
    name: "Хештеги для Instagram",
    stage: "caption",
    contentType: "post",
    systemPrompt: "Ты — SMM-специалист по Instagram. Подбирай релевантные хештеги. Ответ — строго 5 хештегов через пробел, без пояснений, без номеров, без точки в конце.",
    userPrompt: `Сгенерируй 5 хештегов для Instagram-поста.

Название: {title}
Рубрика: {rubric}
Тип контента: {contentType}
Цель: {goal}
Хук: {hook}
Ключевое сообщение: {keyMessage}
CTA: {cta}

Правила:
- Ровно 5 хештегов
- Только на русском или английском (релевантно теме)
- Смесь широких и узких тегов
- Пример: #маркетинг #контент #продвижение`,
  },
  {
    id: "reel-script",
    name: "Сценарий Reels",
    stage: "reel",
    contentType: "reel",
    systemPrompt: "Ты — сценарист коротких Reels. Пиши на русском.",
    userPrompt: `Напиши сценарий для Reels (15-60 секунд).

Название: {title}
Рубрика: {rubric}
Цель: {goal}
Хук: {hook}
Ключевое сообщение: {keyMessage}
CTA: {cta}


Название: {title}
Рубрика: {rubric}
Цель: {goal}
Хук: {hook}
Ключевое сообщение: {keyMessage}
CTA: {cta}

Формат ответа — строгий JSON:
{
  "duration": "30",
  "script": [
    { "time": "0-3", "text": "текст озвучки", "visual": "что в кадре", "textOnScreen": "текст на экране" },
    { "time": "3-10", "text": "...", "visual": "...", "textOnScreen": "..." }
  ]
}

Ответ — ТОЛЬКО JSON, без пояснений.`,
  },
];

export function getTemplates(): PromptTemplate[] {
  return defaultTemplates;
}

export function getTemplate(id: string): PromptTemplate | undefined {
  return defaultTemplates.find((t) => t.id === id);
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}
