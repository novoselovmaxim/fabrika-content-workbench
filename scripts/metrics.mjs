import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
  envFile.split("\n").filter(Boolean).forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

// ── In-memory cache (5 min TTL) ──

const cache = new Map();

function cached(key, ttlMs = 300_000) {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.ts < ttlMs) return existing.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Helpers ──

function parseIdentifier(input) {
  input = (input || "").trim();
  if (!input) return null;
  input = input.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (input.includes("youtube.com/") || input.includes("youtu.be/")) {
    const m = input.match(/@([\w._-]+)/);
    if (m) return { type: "handle", value: m[1] };
    const m2 = input.match(/\/c\/([\w._-]+)/);
    if (m2) return { type: "handle", value: m2[1] };
    const m3 = input.match(/channel\/([\w._-]+)/);
    if (m3) return { type: "channel_id", value: m3[1] };
    return null;
  }
  if (input.startsWith("@")) return { type: "handle", value: input.slice(1) };
  if (input.includes("t.me/")) {
    const m = input.match(/t\.me\/(?:s\/)?([\w_]+)/);
    if (m) return { type: "handle", value: m[1] };
    return null;
  }
  return { type: "handle", value: input };
}

function telegramApi(method, params = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token) return Promise.reject(new Error("BOT_TOKEN not configured"));
  const url = new URL("https://api.telegram.org/bot" + token + "/" + method);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return fetch(url).then(r => r.json());
}

// ── Telegram ──

export async function checkTelegram(input) {
  const p = parseIdentifier(input);
  if (!p) return { valid: false, error: "Неверный формат" };
  try {
    const res = await telegramApi("getChat", { chat_id: "@" + p.value });
    if (!res.ok) return { valid: false, error: res.description || "Канал не найден" };
    return { valid: true, name: res.result.title, subscribers: res.result.member_count || null };
  } catch (e) {
    return { valid: false, error: "Ошибка подключения" };
  }
}

export async function fetchTelegram(input) {
  const p = parseIdentifier(input);
  if (!p) return { valid: false, error: "Неверный формат" };
  const cacheKey = "tg:" + p.value;
  const cachedData = cached(cacheKey);
  if (cachedData) return cachedData;

  try {
    const res = await telegramApi("getChat", { chat_id: "@" + p.value });
    if (!res.ok) return { valid: false, error: res.description || "Канал не найден" };
    const chat = res.result;
    const data = {
      platform: "telegram",
      name: chat.title,
      identifier: "@" + p.value,
      subscribers: chat.member_count || null,
      posts: [],
      fetchedAt: new Date().toISOString(),
    };
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    return { valid: false, error: "Ошибка подключения" };
  }
}

// ── YouTube ──

async function youtubeApi(endpoint, params = {}) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Promise.reject(new Error("YOUTUBE_API_KEY not configured"));
  const url = new URL("https://www.googleapis.com/youtube/v3/" + endpoint);
  url.searchParams.set("key", key);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "YouTube API error");
  }
  return res.json();
}

async function resolveYouTubeChannel(input) {
  const p = parseIdentifier(input);
  if (!p) return null;
  if (p.type === "channel_id") return p.value;
  if (p.type === "handle") {
    const data = await youtubeApi("search", {
      part: "snippet",
      q: "@" + p.value,
      type: "channel",
      maxResults: 1,
    });
    if (data.items?.length) return data.items[0].snippet.channelId;
    const data2 = await youtubeApi("search", {
      part: "snippet",
      q: p.value,
      type: "channel",
      maxResults: 5,
    });
    if (data2.items?.length) return data2.items[0].snippet.channelId;
    return null;
  }
  return null;
}

export async function checkYouTube(input) {
  const cacheKey = "yt:check:" + input;
  const cachedData = cached(cacheKey, 600_000);
  if (cachedData) return cachedData;

  try {
    const channelId = await resolveYouTubeChannel(input);
    if (!channelId) return { valid: false, error: "Канал не найден" };
    const data = await youtubeApi("channels", { part: "snippet,statistics", id: channelId });
    if (!data.items?.length) return { valid: false, error: "Канал не найден" };
    const ch = data.items[0];
    const result = { valid: true, name: ch.snippet.title, subscribers: parseInt(ch.statistics.subscriberCount) || null };
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

export async function fetchYouTube(input) {
  const cacheKey = "yt:fetch:" + input;
  const cachedData = cached(cacheKey);
  if (cachedData) return cachedData;

  try {
    const channelId = await resolveYouTubeChannel(input);
    if (!channelId) return { valid: false, error: "Канал не найден" };
    const [chData, vidsData] = await Promise.all([
      youtubeApi("channels", { part: "snippet,statistics", id: channelId }),
      youtubeApi("search", { part: "snippet", channelId, order: "date", maxResults: 10, type: "video" }),
    ]);
    if (!chData.items?.length) return { valid: false, error: "Канал не найден" };
    const ch = chData.items[0];

    let posts = [];
    if (vidsData.items?.length) {
      const videoIds = vidsData.items.map(v => v.id.videoId).filter(Boolean);
      if (videoIds.length) {
        const statsData = await youtubeApi("videos", { part: "statistics", id: videoIds.join(",") });
        const statsMap = {};
        (statsData.items || []).forEach(v => { statsMap[v.id] = v.statistics; });
        posts = vidsData.items.map(v => ({
          id: v.id.videoId,
          date: v.snippet.publishedAt,
          title: v.snippet.title,
          thumbnail: v.snippet.thumbnails?.default?.url || null,
          views: parseInt(statsMap[v.id.videoId]?.viewCount) || 0,
          likes: parseInt(statsMap[v.id.videoId]?.likeCount) || 0,
          comments: parseInt(statsMap[v.id.videoId]?.commentCount) || 0,
        }));
      }
    }

    const data = {
      platform: "youtube",
      name: ch.snippet.title,
      identifier: channelId,
      subscribers: parseInt(ch.statistics.subscriberCount) || 0,
      totalViews: parseInt(ch.statistics.viewCount) || 0,
      totalVideos: parseInt(ch.statistics.videoCount) || 0,
      posts,
      fetchedAt: new Date().toISOString(),
    };
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ── VK (placeholder) ──

export async function checkVK(input) {
  return { valid: false, error: "VK API ещё не настроен (ожидается ключ)" };
}

export async function fetchVK(input) {
  return { valid: false, error: "VK API ещё не настроен (ожидается ключ)" };
}

// ── Instagram (via compiled ig-fetcher) ──

import { execFile } from "child_process";

function findInstagramBinary() {
  const binaryName = "ig-fetcher" + (process.platform === "win32" ? ".exe" : "");
  const binary = path.join(__dirname, "dist", binaryName);
  if (fs.existsSync(binary)) return { cmd: binary, args: [] };
  const script = path.join(__dirname, "instagram.py");
  const venvPython = path.join(__dirname, "..", ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) return { cmd: venvPython, args: [script] };
  return { cmd: "python3", args: [script] };
}

const IG_BIN = findInstagramBinary();

function runInstagram(args) {
  return new Promise((resolve) => {
    execFile(IG_BIN.cmd, [...IG_BIN.args, ...args], {
      timeout: 60_000,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ valid: false, error: `Instagram script: ${err.message}` });
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch {
        resolve({ valid: false, error: `Instagram script: invalid JSON output` });
      }
    });
  });
}

export async function checkInstagram(input) {
  const result = await runInstagram(["check", input]);
  return result;
}

export async function fetchInstagram(input) {
  const result = await runInstagram(["fetch", input, "20"]);
  return result;
}
