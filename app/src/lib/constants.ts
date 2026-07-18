export const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "telegram", label: "Telegram" },
  { value: "youtube", label: "YouTube" },
  { value: "dzen", label: "Дзен" },
  { value: "vk", label: "ВКонтакте" },
] as const;

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  telegram: "#0088CC",
  youtube: "#FF0000",
  dzen: "#333333",
  vk: "#0077FF",
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  youtube: "YouTube",
  dzen: "Дзен",
  vk: "ВКонтакте",
};

export type PlatformType = (typeof PLATFORM_OPTIONS)[number]["value"];

export const PLATFORM_FORMATS: Record<string, { label: string; size: string; width: number; height: number }[]> = {
  instagram: [
    { label: "Квадрат 1:1", size: "1080x1080", width: 1080, height: 1080 },
    { label: "Портрет 4:5", size: "1080x1350", width: 1080, height: 1350 },
    { label: "Ландшафт 16:9", size: "1080x608", width: 1080, height: 608 },
    { label: "Stories 9:16", size: "1080x1920", width: 1080, height: 1920 },
  ],
  telegram: [
    { label: "Ландшафт 16:9", size: "1280x720", width: 1280, height: 720 },
    { label: "Квадрат 1:1", size: "512x512", width: 512, height: 512 },
  ],
  youtube: [
    { label: "Видео 16:9", size: "1280x720", width: 1280, height: 720 },
    { label: "Shorts 9:16", size: "1080x1920", width: 1080, height: 1920 },
  ],
  vk: [
    { label: "Квадрат 1:1", size: "1080x1080", width: 1080, height: 1080 },
    { label: "Ландшафт 16:9", size: "1080x608", width: 1080, height: 608 },
  ],
  dzen: [
    { label: "Ландшафт 16:9", size: "1280x720", width: 1280, height: 720 },
  ],
};

export const PLATFORM_DEFAULT_SIZE: Record<string, string> = {
  instagram: "1080x1080",
  telegram: "1280x720",
  youtube: "1280x720",
  vk: "1080x1080",
  dzen: "1280x720",
};

export const PLATFORM_CHAR_LIMITS: Record<string, { caption: number }> = {
  instagram: { caption: 2200 },
  telegram:  { caption: 4096 },
  youtube:   { caption: 5000 },
  vk:        { caption: 16384 },
  dzen:      { caption: 30000 },
};
