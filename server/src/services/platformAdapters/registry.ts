import type { PlatformAdapter } from "./types.js";
import { instagramAdapter } from "./instagramAdapter.js";
import { vkAdapter } from "./vkAdapter.js";
import { zenAdapter } from "./zenAdapter.js";
import { telegramAdapter } from "./telegramAdapter.js";
import { youtubeAdapter } from "./youtubeAdapter.js";

const registry: Record<string, PlatformAdapter> = {
  instagram: instagramAdapter,
  vk: vkAdapter,
  zen: zenAdapter,
  telegram: telegramAdapter,
  youtube: youtubeAdapter,
};

export function getAdapter(platformType: string): PlatformAdapter | null {
  return registry[platformType] || null;
}

export function getSupportedOwnMetrics(platformType: string): string[] {
  const adapter = getAdapter(platformType);
  if (!adapter) return [];
  return adapter.supportedMetrics.own;
}

export function getSupportedCompetitorMetrics(platformType: string): string[] {
  const adapter = getAdapter(platformType);
  if (!adapter) return [];
  return adapter.supportedMetrics.competitor;
}
