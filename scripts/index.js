import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import * as metrics from "./metrics.mjs";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "licenses.json");
const REQUESTS_FILE = path.join(__dirname, "requests.json");

try {
  const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
  envFile.split("\n").filter(Boolean).forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, admin-secret");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function load() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function loadRequests() {
  if (!fs.existsSync(REQUESTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf-8"));
}

function saveRequests(data) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
}

const loginAttempts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= 5;
}

app.post("/api/request-license", (req, res) => {
  const { email, termMonths } = req.body;
  if (!email || !termMonths)
    return res.status(400).json({ error: "email and termMonths required" });

  const requests = loadRequests();
  const entry = {
    id: crypto.randomBytes(4).toString("hex"),
    email,
    termMonths,
    expiresAt: new Date(Date.now() + termMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "pending",
    createdAt: new Date().toISOString(),
    generatedKey: null,
  };
  requests.push(entry);
  saveRequests(requests);

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (token && chatId) {
    const text = encodeURIComponent(
      "Запрос лицензии\n\nПочта: " + email + "\nСрок: " + termMonths + " мес.\n\nhttp://80.87.111.142:4000/admin"
    );
    fetch("https://api.telegram.org/bot" + token + "/sendMessage?chat_id=" + chatId + "&text=" + text).catch(() => {});
  }

  res.json({ success: true });
});

app.post("/api/activate", (req, res) => {
  const { key, email } = req.body;
  const db = load();
  const lic = db[key];
  if (!lic) return res.status(400).json({ error: "Лицензионный ключ не найден" });
  if (!lic.active) return res.status(400).json({ error: "Лицензия деактивирована" });
  if (lic.expiresAt && new Date(lic.expiresAt) < new Date())
    return res.status(400).json({ error: "Срок лицензии истек" });
  lic.activatedAt = lic.activatedAt || new Date().toISOString();
  lic.email = email || lic.email;
  save(db);
  res.json({ valid: true, planName: lic.planName, expiresAt: lic.expiresAt, email: lic.email });
});

app.post("/api/check", (req, res) => {
  const { key } = req.body;
  const db = load();
  const lic = db[key];
  if (!lic || !lic.active) return res.json({ valid: false });
  if (lic.expiresAt && new Date(lic.expiresAt) < new Date()) return res.json({ valid: false });
  res.json({ valid: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const CHECKERS = {
  telegram: metrics.checkTelegram,
  youtube: metrics.checkYouTube,
  vk: metrics.checkVK,
  instagram: metrics.checkInstagram,
};

const FETCHERS = {
  telegram: metrics.fetchTelegram,
  youtube: metrics.fetchYouTube,
  vk: metrics.fetchVK,
  instagram: metrics.fetchInstagram,
};

app.post("/api/metrics/check", async (req, res) => {
  const { platform, identifier } = req.body;
  const checker = CHECKERS[platform];
  if (!checker) return res.status(400).json({ error: "Unknown platform" });
  if (!identifier) return res.status(400).json({ error: "identifier required" });
  const result = await checker(identifier);
  res.json(result);
});

app.post("/api/metrics/fetch", async (req, res) => {
  const { platform, identifier } = req.body;
  const fetcher = FETCHERS[platform];
  if (!fetcher) return res.status(400).json({ error: "Unknown platform" });
  if (!identifier) return res.status(400).json({ error: "identifier required" });
  const result = await fetcher(identifier);
  res.json(result);
});

app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip))
    return res.status(429).json({ error: "Слишком много попыток. Повторите позже." });
  if (req.body.secret !== process.env.ADMIN_SECRET)
    return res.status(403).json({ error: "Неверный секрет" });
  res.json({ success: true });
});

app.post("/api/admin/generate", (req, res) => {
  const { adminSecret, email, planName, expiresAt } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  const key = "FBR-" + crypto.randomBytes(4).toString("hex").toUpperCase()
    + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const db = load();
  db[key] = { email: email || "", planName: planName || "Standard", expiresAt: expiresAt || null, activatedAt: null, active: true };
  save(db);
  res.json({ key });
});

app.get("/api/admin/list", (req, res) => {
  if (req.headers["admin-secret"] !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  res.json(load());
});

app.post("/api/admin/deactivate", (req, res) => {
  const { adminSecret, key } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  const db = load();
  if (!db[key]) return res.status(404).json({ error: "Key not found" });
  db[key].active = false;
  save(db);
  res.json({ success: true });
});

app.get("/api/admin/requests", (req, res) => {
  if (req.headers["admin-secret"] !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  res.json(loadRequests());
});

app.post("/api/admin/generate-from-request", (req, res) => {
  const { adminSecret, requestId } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });

  const requests = loadRequests();
  const idx = requests.findIndex(r => r.id === requestId && r.status === "pending");
  if (idx === -1) return res.status(404).json({ error: "Заявка не найдена или уже обработана" });
  const reqData = requests[idx];

  const key = "FBR-" + crypto.randomBytes(4).toString("hex").toUpperCase()
    + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const db = load();
  db[key] = { email: reqData.email, planName: "Standard", expiresAt: reqData.expiresAt, activatedAt: null, active: true };
  save(db);

  requests[idx].status = "completed";
  requests[idx].generatedKey = key;
  saveRequests(requests);

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (token && chatId) {
    const text = encodeURIComponent(
      "Ключ готов для " + reqData.email + "\n\n" + key
    );
    fetch("https://api.telegram.org/bot" + token + "/sendMessage?chat_id=" + chatId + "&text=" + text + "&parse_mode=Markdown").catch(() => {});
  }

  res.json({ success: true, key, email: reqData.email });
});

app.get("/admin", (_req, res) => {
  const filePath = path.join(__dirname, "admin.html");
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).send("Admin page not found");
});

app.listen(process.env.PORT || 4000, () => {
  console.log("License server running on port", process.env.PORT || 4000);
});
