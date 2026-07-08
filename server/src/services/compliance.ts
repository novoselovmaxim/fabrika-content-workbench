import { db } from "../db.js";
import { policyRules } from "../schema.js";
import { eq, and } from "drizzle-orm";

interface ComplianceResult {
  riskScore: number;
  riskTags: string[];
  violatedRules: string[];
}

export function checkCompliance(text: string, projectId?: string): ComplianceResult {
  let riskScore = 0;
  const riskTags: string[] = [];
  const violatedRules: string[] = [];

  const conditions: any[] = [eq(policyRules.enabled, 1)];
  const rules = db.select().from(policyRules).where(and(...conditions)).all();

  for (const rule of rules) {
    if (!rule.pattern) continue;
    try {
      const regex = new RegExp(rule.pattern, "giu");
      if (regex.test(text)) {
        const severity = rule.severity || "warning";
        const sevScore = severity === "block" ? 0.6 : severity === "warning" ? 0.3 : 0.1;
        riskScore = Math.max(riskScore, sevScore);
        riskTags.push(rule.code);
        violatedRules.push(rule.description);
      }
    } catch {
      // skip invalid regex
    }
  }

  return { riskScore, riskTags: [...new Set(riskTags)], violatedRules: [...new Set(violatedRules)] };
}
