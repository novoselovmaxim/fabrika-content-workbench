import { Router } from "express";
import { db } from "../db.js";
import { contentTextures } from "../schema.js";
import { eq } from "drizzle-orm";

export const texturesRouter = Router();

texturesRouter.get("/", (_req, res) => {
  const all = db.select().from(contentTextures).orderBy(contentTextures.ordering).all();
  res.json(all);
});

texturesRouter.get("/:code", (req, res) => {
  const row = db.select().from(contentTextures).where(eq(contentTextures.code, req.params.code)).get();
  if (!row) return res.status(404).json({ error: "Texture not found" });
  res.json(row);
});
