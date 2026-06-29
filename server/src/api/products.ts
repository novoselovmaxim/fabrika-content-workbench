import { Router } from "express";
import { db } from "../db.js";
import { products } from "../schema.js";
import { sql, eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const productsRouter = Router();

productsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const conditions: any[] = [];
  if (projectId) conditions.push(eq(products.projectId, projectId));
  let query: any = db.select().from(products);
  if (conditions.length > 0) query = query.where(and(...conditions));
  query = query.orderBy(products.sortOrder);
  res.json(query.all());
});

productsRouter.get("/:id", (req, res) => {
  const row = db.select().from(products).where(eq(products.id, req.params.id)).get();
  if (!row) return res.status(404).json({ error: "Product not found" });
  res.json(row);
});

productsRouter.post("/", (req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  const data = { id, ...req.body, createdAt: now, updatedAt: now };
  db.insert(products).values(data).run();
  res.status(201).json({ id, ...data });
});

productsRouter.patch("/:id", (req, res) => {
  const { id } = req.params;
  const update = { ...req.body, updatedAt: new Date().toISOString() };
  delete update.id;
  db.update(products).set(update).where(eq(products.id, id)).run();
  const row = db.select().from(products).where(eq(products.id, id)).get();
  res.json(row);
});

productsRouter.delete("/:id", (req, res) => {
  db.delete(products).where(eq(products.id, req.params.id)).run();
  res.status(204).end();
});
