export const METRIC_NAMES = [
  "reach", "impressions", "likes", "comments", "saves", "shares",
  "profile_visits", "clicks", "ctr", "engagement_rate",
] as const;

export const METRIC_PERIODS = ["day", "7d", "30d", "lifetime"] as const;

export type MetricName = typeof METRIC_NAMES[number];
export type MetricPeriod = typeof METRIC_PERIODS[number];
