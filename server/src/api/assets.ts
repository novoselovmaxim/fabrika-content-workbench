import { Router } from "express";
import { db } from "../db.js";
import { assets, postItems, platforms } from "../schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Jimp } from "jimp";
import { PATHS } from "../paths.js";
import { generateImage, getModelForTask, generate } from "../services/aiGateway.js";

const uploadDir = PATHS.uploads;
fs.mkdirSync(uploadDir, { recursive: true });

const logoDir = path.resolve(uploadDir, "logos");
fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logoDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const projectId = (_req.query.projectId as string) || "unknown";
    const styleId = (_req.query.styleId as string) || "unknown";
    cb(null, `${projectId}_${styleId}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Logo must be PNG, JPG, WebP, or SVG. Got: ${ext}`));
  },
});

export const assetsRouter = Router();

assetsRouter.get("/by-post/:postItemId", (req, res) => {
  const all = db
    .select()
    .from(assets)
    .where(eq(assets.postItemId, req.params.postItemId))
    .all();
  res.json(all);
});

assetsRouter.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const id = uuid();
  const { postItemId, type, sourceType } = req.body;
  const data = {
    id,
    postItemId: postItemId || null,
    type: type || "image",
    sourceType: sourceType || "manual_upload",
    sourcePath: req.file.path,
    sourceUrl: `/uploads/${req.file.filename}`,
    status: "attached",
  };
  db.insert(assets).values(data).run();
  res.status(201).json(data);
});

assetsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now };
  db.insert(assets).values(data).run();
  res.status(201).json({ id, ...data });
});

assetsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body };
  delete update.id;
  db.update(assets).set(update).where(eq(assets.id, id)).run();
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  res.json(row);
});

assetsRouter.delete("/:id", (req, res) => {
  const row = db.select().from(assets).where(eq(assets.id, req.params.id)).get();
  if (row?.sourcePath && fs.existsSync(row.sourcePath)) {
    fs.unlinkSync(row.sourcePath);
  }
  db.delete(assets).where(eq(assets.id, req.params.id)).run();
  res.status(204).end();
});

function resolveLogoPath(logoUrl: string): string | null {
  if (logoUrl.startsWith("/uploads/logos/")) {
    const filename = path.basename(logoUrl);
    const resolved = path.resolve(logoDir, filename);
    return fs.existsSync(resolved) ? resolved : null;
  }
  return null;
}

async function describeLogoForPrompt(logoUrl: string): Promise<string> {
  const localPath = resolveLogoPath(logoUrl);
  let b64: string;
  if (localPath) {
    b64 = fs.readFileSync(localPath).toString("base64");
  } else {
    const resp = await fetch(logoUrl);
    const buf = Buffer.from(await resp.arrayBuffer());
    b64 = buf.toString("base64");
  }
  const ext = path.extname(logoUrl).replace(".", "") || "png";
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;

  try {
    const result = await generate({
      provider: "vsellm",
      model: "google/gemini-3-flash-preview",
      prompt: `Опиши этот логотип для художника, который будет использовать описание для генерации изображений в стиле бренда. 
Опиши: цвета, форму, композицию, стиль (минимализм, классика, модерн и т.д.), настроение, ключевые визуальные элементы.
Не упоминай что это логотип — опиши как визуальный референс.
Ответ дай на русском, 1-2 предложения.`,
      images: [{ mime, b64 }],
      maxTokens: 300,
    });
    return result.content.trim();
  } catch {
    return "";
  }
}

// Upload logo for a brand style
assetsRouter.post("/upload-logo", logoUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/logos/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// Delete a logo file
assetsRouter.delete("/delete-logo", (req, res) => {
  const { projectId, styleId } = req.query;
  if (!projectId || !styleId) return res.status(400).json({ error: "projectId and styleId required" });
  const pattern = `${projectId}_${styleId}`;
  for (const f of fs.readdirSync(logoDir)) {
    if (f.startsWith(pattern)) {
      fs.unlinkSync(path.resolve(logoDir, f));
    }
  }
  res.status(204).end();
});

// Generate image via AI
assetsRouter.post("/generate-image", async (req, res) => {
  try {
    const {
      postItemId, prompt, size, stylePrompt,
      logoMode, logoUrl, logoPosition, logoSize, logoOpacity,
    } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    let finalPrompt = stylePrompt ? `${stylePrompt}\n\n${prompt}` : prompt;

    // Inject platform context
    if (postItemId) {
      try {
        const post = db.select({ platformType: platforms.type, platformName: platforms.name })
          .from(postItems)
          .leftJoin(platforms, eq(postItems.platformId, platforms.id))
          .where(eq(postItems.id, postItemId))
          .get();
        if (post?.platformType) {
          const sizeLabel = size ? ` (${size})` : "";
          finalPrompt += `\n\nФормат изображения: ${sizeLabel} для ${post.platformName || post.platformType}. Учитывай соотношение сторон при компоновке.`;
        }
      } catch {}
    }

    // Logo mode: reference – describe logo and inject into prompt
    if (logoMode === "reference" && logoUrl) {
      const description = await describeLogoForPrompt(logoUrl);
      if (description) {
        finalPrompt += `\n\nВизуальный референс бренда: ${description}`;
      }
    }

    const model = getModelForTask("image");
    const result = await generateImage({
      provider: model.startsWith("vsellm/") ? "vsellm" : model.startsWith("zveno/") ? "zveno" : "openai",
      model,
      prompt: finalPrompt,
      size: size || "1024x1024",
    });

    // Save generated image
    const id = uuid();
    const filename = `${id}.png`;
    const filePath = path.resolve(uploadDir, filename);
    fs.writeFileSync(filePath, Buffer.from(result.b64_json, "base64"));

    // Logo mode: overlay – composite logo onto the generated image
    if (logoMode === "overlay" && logoUrl) {
      try {
        const logoPath = resolveLogoPath(logoUrl);
        if (logoPath) {
          const image = await Jimp.read(filePath);
          const logo = await Jimp.read(logoPath);
          const w = image.width;
          const h = image.height;
          const sizePct = (logoSize ?? 10) / 100;
          const logoW = Math.floor(w * sizePct);
          const logoH = Math.floor(logo.height * (logoW / logo.width));
          logo.resize({ w: logoW, h: logoH });
          const opacity = logoOpacity ?? 0.7;
          logo.opacity(opacity);
          const pos = logoPosition || "bottom-right";
          const pad = 16;
          const x = pos.includes("right") ? w - logoW - pad : pad;
          const y = pos.includes("bottom") ? h - logoH - pad : pad;
          image.composite(logo, x, y);
          const overlayed = await image.getBuffer("image/png");
          fs.writeFileSync(filePath, overlayed);
        }
      } catch (err) {
        console.warn("[logo overlay] failed:", err);
      }
    }

    // Create asset record
    const now = new Date().toISOString();
    const asset = {
      id,
      postItemId: postItemId || null,
      type: "image",
      sourceType: "ai_generated",
      sourcePath: filePath,
      sourceUrl: `/uploads/${filename}`,
      status: "attached",
      promptUsed: JSON.stringify({
        prompt,
        stylePrompt: stylePrompt || "",
        logoMode: logoMode || "none",
        logoPosition,
        logoSize,
        logoOpacity,
      }),
      createdAt: now,
    };
    db.insert(assets).values(asset).run();

    res.status(201).json(asset);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Image generation failed" });
  }
});

// Compose text onto a generated image (frontend Canvas does rich text; server = gradient overlay fallback)
assetsRouter.post("/compose-slide", async (req, res) => {
  try {
    const {
      backgroundUrl, text, postItemId, title,
      backgroundOpacity,
    } = req.body;
    if (!backgroundUrl || !text) return res.status(400).json({ error: "backgroundUrl and text are required" });

    const filename = path.basename(backgroundUrl);
    const inputPath = path.resolve(uploadDir, filename);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: "Background image not found" });

    const image = await Jimp.read(inputPath);
    const w = image.width;
    const h = image.height;

    // Draw gradient overlay
    const overlayH = Math.floor(h * 0.45);
    const opacity = (backgroundOpacity ?? 65) / 100;
    const gradient = new Jimp({ width: w, height: overlayH, color: 0x00000000 });
    gradient.scan(0, 0, w, overlayH, (_x, _y, idx) => {
      const progress = Math.floor(idx / (gradient.bitmap.width * 4)) / overlayH;
      const alpha = Math.floor(progress * opacity * 255);
      gradient.bitmap.data[idx] = 0;
      gradient.bitmap.data[idx + 1] = 0;
      gradient.bitmap.data[idx + 2] = 0;
      gradient.bitmap.data[idx + 3] = alpha;
    });
    image.composite(gradient, 0, h - overlayH);

    const composed = await image.getBuffer("image/png");
    const id = uuid();
    const filenameOut = `composed_${id}.png`;
    const filePath = path.resolve(uploadDir, filenameOut);
    fs.writeFileSync(filePath, composed);

    const now = new Date().toISOString();
    const asset = {
      id,
      postItemId: postItemId || null,
      type: "image",
      sourceType: "ai_generated",
      sourcePath: filePath,
      sourceUrl: `/uploads/${filenameOut}`,
      status: "attached",
      createdAt: now,
    };
    db.insert(assets).values(asset).run();

    res.status(201).json(asset);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Composition failed" });
  }
});
