/**
 * VPS Instagram Scraper Module
 *
 * Добавьте этот файл на ваш VPS-сервер (80.87.111.142:4000).
 *
 * Установка на VPS:
 *   cd /path/to/vps-server
 *   npm install playwright
 *   npx playwright install chromium
 *   node vps-instagram-module.js
 *
 * После запуска, эндпоинт будет доступен:
 *   POST /api/metrics/instagram-scrape
 *   Body: { "username": "bereg.mikroshagi", "limit": 20 }
 *   Response: { "posts": [...], "channel": { "name": "...", "subscribers": N } }
 */

import { Router } from "express";
import { chromium } from "playwright";

const router = Router();

function extractUsername(input) {
  let u = input.replace(/^@/, "");
  const m = u.match(/instagram\.com\/([^/?]+)/);
  if (m) u = m[1];
  return u.replace(/\/+$/, "").trim();
}

router.post("/instagram-scrape", async (req, res) => {
  const { username, limit = 20 } = req.body;
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  const handle = extractUsername(username);
  const url = `https://www.instagram.com/${handle}/`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Ждём появления постов
    await page.waitForSelector("article a", { timeout: 15000 }).catch(() => {});

    // Собираем ссылки на посты
    const postLinks = await page.$$eval("article a[href*='/p/']", (els) =>
      [...new Set(els.map((el) => el.getAttribute("href")))].slice(0, limit)
    );

    const posts = [];
    for (const link of postLinks.slice(0, limit)) {
      const postUrl = `https://www.instagram.com${link}`;
      try {
        await page.goto(postUrl, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(1500);

        const data = await page.evaluate(() => {
          const captionEl = document.querySelector("article h1") || document.querySelector("article ._a9zr");
          const caption = captionEl?.innerText || "";
          const likeEl = document.querySelector("article section span") || document.querySelector("article ._aom1");
          const likes = parseInt(likeEl?.innerText?.replace(/\D/g, "")) || 0;
          const timeEl = document.querySelector("time");
          const date = timeEl?.getAttribute("datetime") || "";
          return { caption, likes, date };
        });

        posts.push({
          id: link.replace(/\/p\//, "").replace(/\//g, ""),
          code: link.replace(/\/p\//, "").replace(/\//g, ""),
          url: postUrl,
          caption: data.caption,
          likeCount: data.likes,
          commentCount: 0,
          createdAt: data.date,
        });
      } catch {
        // skip individual post errors
      }
    }

    // Пробуем получить имя профиля
    let profileName = handle;
    try {
      profileName = await page.$eval("header h2", (el) => el.innerText);
    } catch {}

    await browser.close();

    res.json({
      posts,
      channel: {
        title: profileName || handle,
        name: handle,
        subscriberCount: 0,
      },
    });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    res.status(502).json({ error: `Instagram scrape failed: ${e.message}` });
  }
});

export default router;
