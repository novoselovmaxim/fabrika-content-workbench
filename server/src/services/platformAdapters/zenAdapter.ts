import type { PlatformAdapter } from "./types.js";

export const zenAdapter: PlatformAdapter = {
  platformType: "zen",
  supportedMetrics: { own: [], competitor: [] },
  async fetchOwnPostMetrics() { return null; },
  async fetchCompetitorMetrics() { return []; },
};
