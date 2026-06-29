import { Router } from "express";
import { db } from "../db.js";
import { projectKeywords } from "../schema.js";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const keywordsRouter = Router();

keywordsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const rows = db
    .select()
    .from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId))
    .orderBy(projectKeywords.sortOrder)
    .all();

  res.json(rows);
});

keywordsRouter.post("/bulk", (req, res) => {
  const { projectId, keywords, replaceAll } = req.body;
  if (!projectId || !Array.isArray(keywords)) {
    return res.status(400).json({ error: "projectId and keywords[] are required" });
  }

  if (replaceAll) {
    db.delete(projectKeywords)
      .where(eq(projectKeywords.projectId, projectId))
      .run();
  } else {
    db.delete(projectKeywords)
      .where(
        sql`${projectKeywords.projectId} = ${projectId} AND ${projectKeywords.source} = 'ai_extracted'`
      )
      .run();
  }

  const created = keywords.map((item: { keyword: string; source?: string }, i: number) => {
    const id = uuid();
    const data = {
      id,
      projectId,
      keyword: item.keyword,
      source: item.source || "ai_extracted",
      sortOrder: i,
    };
    db.insert(projectKeywords).values(data).run();
    return data;
  });

  res.status(201).json({ keywords: created, count: created.length });
});

keywordsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .select()
    .from(projectKeywords)
    .where(eq(projectKeywords.id, id))
    .get();
  if (!existing) return res.status(404).json({ error: "Keyword not found" });

  db.delete(projectKeywords).where(eq(projectKeywords.id, id)).run();
  res.status(204).end();
});
