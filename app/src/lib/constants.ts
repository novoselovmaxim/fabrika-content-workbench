export const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "dzen", label: "Дзен" },
  { value: "vk", label: "ВКонтакте" },
] as const;

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  telegram: "#0088CC",
  dzen: "#333333",
  vk: "#0077FF",
};

export type PlatformType = (typeof PLATFORM_OPTIONS)[number]["value"];
