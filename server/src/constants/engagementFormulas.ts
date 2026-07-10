import type { MetricName } from "./metrics.js";

export const ENGAGEMENT_FORMULA_BY_PLATFORM: Record<string, { numerator: MetricName[]; denominator: MetricName }> = {
  instagram: { numerator: ["likes", "comments", "saves"], denominator: "impressions" },
  vk: { numerator: ["likes", "comments", "shares"], denominator: "reach" },
  telegram: { numerator: [], denominator: "impressions" },
  youtube: { numerator: ["likes", "comments"], denominator: "impressions" },
  zen: { numerator: [], denominator: "impressions" },
};

export function computeEngagementRate(
  platformType: string,
  metrics: Partial<Record<MetricName, number>>
): number | null {
  const formula = ENGAGEMENT_FORMULA_BY_PLATFORM[platformType];
  if (!formula || formula.numerator.length === 0) return null;
  const denom = metrics[formula.denominator];
  if (!denom || denom <= 0) return null;
  const numeratorSum = formula.numerator.reduce((sum, m) => sum + (metrics[m] || 0), 0);
  return numeratorSum / denom;
}
