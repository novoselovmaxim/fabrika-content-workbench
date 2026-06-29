import { Router } from "express";
import { db } from "../db.js";
import { contentTypes } from "../schema.js";

export const contentTypesRouter = Router();

contentTypesRouter.get("/", (_req, res) => {
  const all = db.select().from(contentTypes).all();
  res.json(all);
});
