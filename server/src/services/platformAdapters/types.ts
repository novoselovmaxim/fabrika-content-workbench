import type { MetricName } from "../../constants/metrics.js";

export interface PlatformMetrics {
  metrics: Partial<Record<MetricName, number>>;
  externalId?: string;
  postedAt?: string;
  caption?: string;
}

export interface PlatformAdapter {
  platformType: string;
  supportedMetrics: {
    own: MetricName[];
    competitor: MetricName[];
  };
  fetchOwnPostMetrics(externalMediaId: string, config: PlatformAuthConfig): Promise<PlatformMetrics | null>;
  fetchCompetitorMetrics(identifier: string, limit: number, config: PlatformAuthConfig): Promise<PlatformMetrics[]>;
}

export interface PlatformAuthConfig {
  [key: string]: string | undefined;
}
