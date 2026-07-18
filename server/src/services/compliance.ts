import { db } from "../db.js";
import { policyRules, complianceChecks, settings, postItems } from "../schema.js";
import { eq, and } from "drizzle-orm";
import { generate, extractJSON } from "./aiGateway.js";
import { COMPLIANCE_RULES, ComplianceRule, PostType } from "../rules/complianceRules.js";
import { v4 as uuid } from "uuid";

export interface Violation {
  ruleId: string;
  title: string;
  article: string;
  description: string;
  severity: "high" | "medium" | "low";
  matchedText?: string;
  explanation: string;
  source: "regex" | "ai" | "structural";
}

export interface ComplianceResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  violations: Violation[];
  totalRulesChecked: number;
  checkedAt: string;
}

export interface PostComplianceMetadata {
  postType?: string;
  ageRating?: string;
  isAdvertisingMarked?: number;
  advertiserInfo?: string;
  ordToken?: string;
}

function getRulesForPostType(postType?: string): ComplianceRule[] {
  if (!postType) return COMPLIANCE_RULES;
  return COMPLIANCE_RULES.filter(rule => {
    if (rule.appliesTo?.length) {
      return rule.appliesTo.includes(postType as PostType);
    }
    if (!rule.ruleType || rule.ruleType === "text") {
      return postType === "advertising" || postType === "sponsored";
    }
    return true;
  });
}

function getPlatformFilteredRules(platform: string, rules: ComplianceRule[]): ComplianceRule[] {
  return rules.filter(r => {
    const pf = r.platforms?.[platform];
    if (pf === "blocked") return false;
    return true;
  });
}

function structuralScreen(
  metadata: PostComplianceMetadata,
  enabledRules: ComplianceRule[]
): Violation[] {
  const violations: Violation[] = [];
  const structuralRules = enabledRules.filter(r => r.ruleType === "structural");

  for (const rule of structuralRules) {
    const violation = checkStructuralRule(rule, metadata);
    if (violation) violations.push(violation);
  }
  return violations;
}

function checkStructuralRule(rule: ComplianceRule, meta: PostComplianceMetadata): Violation | null {
  switch (rule.id) {
    case "structural-advertising-mark":
      if (meta.isAdvertisingMarked) return null;
      return {
        ruleId: rule.id,
        title: rule.title,
        article: rule.article,
        description: rule.description,
        severity: "high",
        explanation: "Рекламный пост не содержит пометку «Реклама». Отметьте поле в метаданных или добавьте в текст.",
        source: "structural",
      };

    case "structural-advertiser-info":
      if (meta.advertiserInfo?.trim()) return null;
      return {
        ruleId: rule.id,
        title: rule.title,
        article: rule.article,
        description: rule.description,
        severity: "high",
        explanation: "Не указаны сведения о рекламодателе. Заполните поле в метаданных поста.",
        source: "structural",
      };

    case "structural-ord-token":
      if (meta.ordToken?.trim()) return null;
      return {
        ruleId: rule.id,
        title: rule.title,
        article: rule.article,
        description: rule.description,
        severity: "high",
        explanation: "Не указан токен ЕРИР/ОРД. Для таргетированной рекламы он обязателен.",
        source: "structural",
      };

    case "structural-age-rating":
      if (meta.ageRating?.trim()) return null;
      return {
        ruleId: rule.id,
        title: rule.title,
        article: rule.article,
        description: rule.description,
        severity: "medium",
        explanation: "Не указана возрастная категория контента. Заполните метку 0+/6+/12+/16+/18+.",
        source: "structural",
      };

    case "structural-alcohol-age-18":
      if (!meta.ageRating) return null;
      if (meta.ageRating === "18+") return null;
      return {
        ruleId: rule.id,
        title: rule.title,
        article: rule.article,
        description: rule.description,
        severity: "high",
        explanation: "Для рекламы алкоголя возрастная категория должна быть 18+.",
        source: "structural",
      };

    case "structural-personal-data-consent":
      return null; // Text-level check handles this

    case "structural-finance-psc":
      return null; // Text-level check handles this

    case "structural-medical-receipt":
      return null; // Text-level check handles this

    case "structural-online-casino-ban":
      return null; // Text-level check handles this

    case "structural-promotion-terms":
      return null; // Text-level check handles this

    default:
      return null;
  }
}

function regexScreen(text: string, enabledRules: ComplianceRule[]): Violation[] {
  const violations: Violation[] = [];
  for (const rule of enabledRules) {
    if (!rule.regexPatterns?.length) continue;
    for (const pattern of rule.regexPatterns) {
      try {
        const regex = new RegExp(pattern, "giu");
        const match = regex.exec(text);
        if (match) {
          violations.push({
            ruleId: rule.id,
            title: rule.title,
            article: rule.article,
            description: rule.description,
            severity: rule.severity,
            matchedText: match[0].slice(0, 100),
            explanation: `Найдено совпадение с паттерном: "${match[0]}"`,
            source: "regex",
          });
        }
      } catch {
        // skip invalid regex
      }
    }
  }
  return violations;
}

function getModelForCompliance(): string {
  try {
    const row = db.select().from(settings).where(eq(settings.key, "model_compliance")).get() as any;
    return row?.value || "vsellm/google/gemini-3-flash-preview";
  } catch {
    return "vsellm/google/gemini-3-flash-preview";
  }
}

export async function checkCompliance(
  text: string,
  options?: {
    platform?: string;
    projectId?: string;
    useAi?: boolean;
    postType?: string;
    metadata?: PostComplianceMetadata;
  }
): Promise<ComplianceResult> {
  const platform = options?.platform || "generic";
  const useAi = options?.useAi ?? true;
  const postType = options?.postType;
  const metadata = options?.metadata;

  const typeFiltered = getRulesForPostType(postType);
  const enabledRules = getPlatformFilteredRules(platform, typeFiltered);

  let violations: Violation[] = [];

  // Level 0: structural checks (post metadata)
  if (metadata) {
    const structuralViolations = structuralScreen(metadata, enabledRules);
    violations.push(...structuralViolations);
  }

  // Level 1: regex screening (text rules only)
  const textRules = enabledRules.filter(r => r.ruleType !== "structural" && r.regexPatterns?.length);
  const regexViolations = regexScreen(text, textRules);
  violations.push(...regexViolations);

  // Level 2: AI check (text rules only)
  const aiTextRules = enabledRules.filter(r => r.ruleType !== "structural");
  if (useAi && text.trim().length > 50 && aiTextRules.length > 0) {
    try {
      const aiViolations = await aiCheck(text, platform, aiTextRules, regexViolations.length > 0);
      violations.push(...aiViolations);
    } catch (err) {
      console.warn("[compliance] AI check failed, falling back to regex only:", String(err));
    }
  }

  // Deduplicate by ruleId
  const seen = new Set<string>();
  violations = violations.filter(v => {
    if (seen.has(v.ruleId)) return false;
    seen.add(v.ruleId);
    return true;
  });

  // Calculate risk score
  let riskScore = 0;
  for (const v of violations) {
    const score = v.severity === "high" ? 0.6 : v.severity === "medium" ? 0.3 : 0.1;
    riskScore = Math.max(riskScore, score);
  }

  // Keep legacy DB-based rules check too for backward compatibility
  const legacyConditions: any[] = [eq(policyRules.enabled, 1)];
  const legacyRules = db.select().from(policyRules).where(and(...legacyConditions)).all();
  for (const lr of legacyRules) {
    if (!lr.pattern) continue;
    try {
      const regex = new RegExp(lr.pattern, "giu");
      if (regex.test(text)) {
        const severity = lr.severity === "block" ? "high" as const : lr.severity === "warning" ? "medium" as const : "low" as const;
        const score = severity === "high" ? 0.6 : severity === "medium" ? 0.3 : 0.1;
        riskScore = Math.max(riskScore, score);
      }
    } catch {}
  }

  const riskLevel: "low" | "medium" | "high" =
    riskScore >= 0.5 ? "high" : riskScore >= 0.2 ? "medium" : "low";

  return {
    riskScore,
    riskLevel,
    violations,
    totalRulesChecked: enabledRules.length,
    checkedAt: new Date().toISOString(),
  };
}

async function aiCheck(
  text: string,
  platform: string,
  enabledRules: ComplianceRule[],
  hasRegexHits: boolean
): Promise<Violation[]> {
  // Build prompt: only include relevant rules, grouped by category
  const ruleGroups: Record<string, ComplianceRule[]> = {};
  for (const rule of enabledRules) {
    if (!ruleGroups[rule.category]) ruleGroups[rule.category] = [];
    ruleGroups[rule.category].push(rule);
  }

  let rulesBlock = "";
  for (const [category, rules] of Object.entries(ruleGroups)) {
    rulesBlock += `\n## ${getCategoryLabel(category)}\n`;
    for (const r of rules) {
      rulesBlock += `- [${r.id}] ${r.title}: ${r.description}\n`;
    }
  }

  const systemPrompt = `Ты — эксперт по рекламному праву РФ (38-ФЗ "О рекламе"). Проверяй текст на соответствие правилам ниже.

Отвечай ТОЛЬКО в формате JSON, без пояснений:
{
  "violations": [
    {
      "ruleId": "id правила",
      "explanation": "краткое объяснение на русском, почему этот текст нарушает правило",
      "matchedText": "цитата из текста, которая вызывает нарушение (до 150 символов)"
    }
  ]
}

Если нарушений нет — верни {"violations": []}
Не выдумывай нарушения. Проверяй только правила, которые явно применимы к тексту.`;

  const userPrompt = `Платформа: ${platform}
${hasRegexHits ? "⚠ Внимание: предварительная regex-проверка уже обнаружила потенциальные нарушения — проверь особенно тщательно." : ""}

## Правила
${rulesBlock}

## Текст для проверки

${text}

Проверь текст на соответствие каждому правилу из списка. Если есть нарушение — укажи ruleId, объяснение и цитату из текста.`;

  const result = await generate({
    provider: "vsellm",
    model: "vsellm/google/gemini-3-flash-preview",
    systemPrompt,
    prompt: userPrompt,
    responseFormat: "json",
    temperature: 0.1,
    maxTokens: 2000,
  });

  let parsed: any;
  try {
    const cleaned = extractJSON(result.content);
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[compliance] Failed to parse AI response:", result.content.slice(0, 200));
    return [];
  }

  const aiViolations: Violation[] = [];
  const allRules = COMPLIANCE_RULES;
  for (const v of (parsed.violations || [])) {
    const rule = allRules.find(r => r.id === v.ruleId);
    if (!rule) continue;
    aiViolations.push({
      ruleId: v.ruleId,
      title: rule.title,
      article: rule.article,
      description: rule.description,
      severity: rule.severity,
      matchedText: (v.matchedText || "").slice(0, 150),
      explanation: v.explanation || "Обнаружено AI-проверкой",
      source: "ai",
    });
  }

  return aiViolations;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    "general": "Общие требования (ст.5)",
    "minor-protection": "Защита несовершеннолетних (ст.6)",
    "banned-goods": "Запрещённые товары и услуги (ст.7)",
    "internet-labeling": "Маркировка интернет-рекламы (ст.18.1)",
    "medical": "Медицина и фармацевтика (ст.24)",
    "bad": "БАДы и пищевые добавки (ст.25)",
    "financial": "Финансовые услуги (ст.28)",
    "alcohol": "Алкогольная продукция (ст.21)",
    "gambling": "Азартные игры (ст.27)",
    "tobacco": "Табак и никотин",
    "military-weapons": "Оружие (ст.26)",
    "tonic-drinks": "Энергетические напитки (ст.25.1)",
    "environment": "Экологические заявления",
    "video-game": "Видеоигры",
    "fair-comparison": "Корректные сравнения",
    "personal-data": "Персональные данные (152-ФЗ)",
    "hidden-ad": "Скрытая реклама",
    "promotions": "Стимулирующие мероприятия (ст.9)",
    "housing": "Жилищные услуги",
    "securities": "Ценные бумаги",
  };
  return labels[category] || category;
}

export function saveCheckResult(
  draftId: string | undefined,
  postItemId: string | undefined,
  platform: string | undefined,
  result: ComplianceResult
): string {
  const id = uuid();
  db.insert(complianceChecks).values({
    id,
    draftId: draftId || null,
    postItemId: postItemId || null,
    platform: platform || null,
    status: "complete",
    riskScore: result.riskScore,
    resultsJson: JSON.stringify(result),
    checkedAt: new Date().toISOString(),
  }).run();
  return id;
}
