import { v4 as uuid } from "uuid";
import { db } from "../db.js";
import { policyRules } from "../schema.js";
import { eq } from "drizzle-orm";

const GLOBAL_RULES = [
  {
    code: "med_guarantee",
    description: "Запрет медицинских и психологических гарантий результата — нельзя обещать излечение, диагностику или клинический эффект",
    severity: "block",
  },
  {
    code: "finance_guarantee",
    description: "Запрет гарантированного финансового результата — нельзя обещать конкретный доход или ROI",
    severity: "block",
  },
  {
    code: "absolute_claims",
    description: "Флаг избыточно категоричных обещаний — слова «навсегда», «100% результат», «гарантированно» без контекста",
    severity: "warning",
  },
];

export function seedPolicyRules(): void {
  for (const rule of GLOBAL_RULES) {
    const existing = db.select().from(policyRules).where(eq(policyRules.code, rule.code)).get();
    if (existing) continue;
    db.insert(policyRules).values({
      id: uuid(),
      projectId: null,
      code: rule.code,
      description: rule.description,
      severity: rule.severity,
      enabled: 1,
    }).run();
  }
  console.log(`✓ Seeded ${GLOBAL_RULES.length} global policy rules`);
}
