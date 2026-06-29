import { Router } from "express";
import { db } from "../db.js";
import { competitorSearches, savedCompetitors, onboardingSteps, projects, excludedCompetitors } from "../schema.js";
import { sql, eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { searchCompetitors } from "../services/searchService.js";

export const competitorsRouter = Router();

competitorsRouter.get("/", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const rows = db
    .select()
    .from(competitorSearches)
    .where(eq(competitorSearches.projectId, projectId))
    .orderBy(desc(competitorSearches.createdAt))
    .all();

  res.json(rows);
});

competitorsRouter.get("/latest", (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const row = db
    .select()
    .from(competitorSearches)
    .where(eq(competitorSearches.projectId, projectId))
    .orderBy(desc(competitorSearches.createdAt))
    .limit(1)
    .get();

  if (!row) return res.status(404).json({ error: "No search results found" });
  res.json(row);
});

// Get all accumulated saved competitors for a project
competitorsRouter.get("/saved/:projectId", (req, res) => {
  const { projectId } = req.params;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });

  const rows = db
    .select()
    .from(savedCompetitors)
    .where(eq(savedCompetitors.projectId, projectId))
    .orderBy(desc(savedCompetitors.createdAt))
    .all();

  res.json(rows);
});

// Add endpoint to manually exclude competitors
competitorsRouter.post("/excluded", async (req, res) => {
  const { projectId, url, reason = "manual_exclude" } = req.body;
  if (!projectId || !url) {
    return res.status(400).json({ error: "projectId and url are required" });
  }
  
  // Check if already exists
  const exists = await db.select()
    .from(excludedCompetitors)
    .where(and(
      eq(excludedCompetitors.projectId, projectId),
      eq(excludedCompetitors.url, url)
    ))
    .get();
    
  if (exists) {
    return res.status(200).json({ message: "Already excluded", already: true });
  }
  
  await db.insert(excludedCompetitors).values({
    id: uuid(),
    projectId,
    url,
    reason,
    createdAt: new Date().toISOString()
  });
  
  res.status(200).json({ message: "Excluded successfully", already: false });
});

competitorsRouter.delete("/search", async (req, res) => {
  try {
    const { projectId, keywords, engine, region, language, promptOverride } = req.body;
    if (!projectId || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "projectId and non-empty keywords[] are required" });
    }
    if (engine && !["tavily", "brave", "both"].includes(engine)) {
      return res.status(400).json({ error: "engine must be tavily, brave, or both" });
    }

    const result = await searchCompetitors(keywords, engine || "tavily", { region, language, promptOverride });

    // Save the search record
    const searchId = uuid();
    const now = new Date().toISOString();
    const searchData = {
      id: searchId,
      projectId,
      keywords: JSON.stringify(keywords),
      searchEngine: engine || "tavily",
      region: region || null,
      language: language || null,
      resultJson: JSON.stringify(result),
      createdAt: now,
    };

    db.insert(competitorSearches).values(searchData).run();

    // Save new unique competitors to the accumulated table
    const allCompetitors = [...(result.direct || []), ...(result.indirect || [])];
    const keywordsStr = keywords.join(", ");
    let savedCount = 0;

    for (const comp of allCompetitors) {
      // Skip if this URL is excluded
      const excluded = db
        .select()
        .from(excludedCompetitors)
        .where(and(
          eq(excludedCompetitors.projectId, projectId),
          eq(excludedCompetitors.url, comp.url || "")
        ))
        .get();

      if (!excluded && comp.url) {
        db.insert(savedCompetitors).values({
          id: uuid(),
          projectId,
          name: comp.name || "Unknown",
          url: comp.url,
          positioning: comp.positioning || "",
          strengths: JSON.stringify(comp.strengths || []),
          weaknesses: JSON.stringify(comp.weaknesses || []),
          audience: comp.audience || "",
          contentStrategy: comp.contentStrategy || "",
          source: "search",
          searchKeywords: keywordsStr,
          createdAt: now,
        }).run();
        savedCount++;
      }
    }

    res.status(201).json({ 
      ...searchData, 
      id: searchId, 
      keywords, 
      resultJson: result,
      savedCount,
      message: `Saved ${savedCount} new competitors`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Competitor search failed" });
  }
});

competitorsRouter.post("/search", async (req, res) => {
  try {
    const { projectId, keywords, engine, region, language, promptOverride } = req.body;
    if (!projectId || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "projectId and non-empty keywords[] are required" });
    }
    if (engine && !["tavily", "brave", "both"].includes(engine)) {
      return res.status(400).json({ error: "engine must be tavily, brave, or both" });
    }

    const result = await searchCompetitors(keywords, engine || "tavily", { region, language, promptOverride });

    // Save the search record
    const searchId = uuid();
    const now = new Date().toISOString();
    const searchData = {
      id: searchId,
      projectId,
      keywords: JSON.stringify(keywords),
      searchEngine: engine || "tavily",
      region: region || null,
      language: language || null,
      resultJson: JSON.stringify(result),
      createdAt: now,
    };

    db.insert(competitorSearches).values(searchData).run();

    // Save new unique competitors to the accumulated table
    const allCompetitors = [...(result.direct || []), ...(result.indirect || [])];
    const keywordsStr = keywords.join(", ");
    let savedCount = 0;

    for (const comp of allCompetitors) {
      // Check if this URL already exists for this project
      const existing = db
        .select()
        .from(savedCompetitors)
        .where(and(
          eq(savedCompetitors.projectId, projectId),
          eq(savedCompetitors.url, comp.url || "")
        ))
        .get();

      if (!existing && comp.url) {
        db.insert(savedCompetitors).values({
          id: uuid(),
          projectId,
          name: comp.name || "Unknown",
          url: comp.url,
          positioning: comp.positioning || "",
          strengths: JSON.stringify(comp.strengths || []),
          weaknesses: JSON.stringify(comp.weaknesses || []),
          audience: comp.audience || "",
          contentStrategy: comp.contentStrategy || "",
          source: "search",
          searchKeywords: keywordsStr,
          createdAt: now,
        }).run();
        savedCount++;
      }
    }

    // Also update onboarding step so complete tab sees it
    const compStep = db.select().from(onboardingSteps)
      .where(and(eq(onboardingSteps.projectId, projectId), eq(onboardingSteps.stepKey, "competitors"))).get();
    if (compStep) {
      db.update(onboardingSteps).set({
        aiOutput: JSON.stringify({ direct: result.direct || [], indirect: result.indirect || [] }),
        status: "done",
        completedAt: now,
      }).where(eq(onboardingSteps.id, compStep.id)).run();
    } else {
      db.insert(onboardingSteps).values({
        id: uuid(),
        projectId,
        stepKey: "competitors",
        aiOutput: JSON.stringify({ direct: result.direct || [], indirect: result.indirect || [] }),
        status: "done",
        completedAt: now,
      }).run();
    }

    // Also update project.competitors field
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (project) {
      const existing = project.competitors ? JSON.parse(project.competitors) : { direct: [], indirect: [] };
      const merged = {
        direct: [...(existing.direct || []), ...(result.direct || [])],
        indirect: [...(existing.indirect || []), ...(result.indirect || [])],
        marketInsights: result.marketInsights || existing.marketInsights || "",
      };
      db.update(projects).set({ competitors: JSON.stringify(merged) }).where(eq(projects.id, projectId)).run();
    }

    res.status(201).json({ 
      ...searchData, 
      id: searchId, 
      keywords, 
      resultJson: result,
      savedCount,
      message: `Saved ${savedCount} new competitors`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Competitor search failed" });
  }
});

competitorsRouter.delete("/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .select()
    .from(competitorSearches)
    .where(eq(competitorSearches.id, id))
    .get();
  if (!existing) return res.status(404).json({ error: "Search result not found" });

  db.delete(competitorSearches).where(eq(competitorSearches.id, id)).run();
  res.status(204).end();
});

// Delete a saved competitor
competitorsRouter.delete("/saved/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .select()
    .from(savedCompetitors)
    .where(eq(savedCompetitors.id, id))
    .get();
  if (!existing) return res.status(404).json({ error: "Saved competitor not found" });

  db.delete(savedCompetitors).where(eq(savedCompetitors.id, id)).run();
  res.status(204).end();
});

// Clear all saved competitors for a project
competitorsRouter.delete("/saved/:projectId/all", (req, res) => {
  const { projectId } = req.params;
  db.delete(savedCompetitors).where(eq(savedCompetitors.projectId, projectId)).run();
  res.status(204).end();
});
