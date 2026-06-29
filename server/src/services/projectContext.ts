import { db } from "../db.js";
import { projects, projectKnowledge, strategyBlocks } from "../schema.js";
import { eq, desc, and } from "drizzle-orm";

const DEFAULT_SNIPPET_CHARS = 5000;
const MAX_CONTEXT_CHARS = 12000;

export async function buildProjectContext(
  projectId: string,
  opts?: { snippetChars?: number }
): Promise<string> {
  const snippetChars = opts?.snippetChars ?? DEFAULT_SNIPPET_CHARS;
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return "";

  const parts: string[] = [];

  if (project.niche) parts.push(`Ниша: ${project.niche}`);
  if (project.mission) parts.push(`Миссия: ${project.mission}`);
  if (project.valueProp) parts.push(`Ценностное предложение: ${project.valueProp}`);
  if (project.customerJourney) parts.push(`Путь клиента (Лестница Ханта): ${project.customerJourney}`);
  if (project.audience) parts.push(`ЦА: ${project.audience}`);
  if (project.pains) parts.push(`Боли: ${project.pains}`);
  if (project.style) parts.push(`Стиль: ${project.style}`);
  if (project.tone) parts.push(`Тон: ${project.tone}`);

  if (project.brandStyles) {
    try {
      const styles = JSON.parse(project.brandStyles);
      const active = styles.filter((s: any) => s.isActive);
      if (active.length > 0) {
        parts.push("\nФирменные стили (активные):");
        for (const s of active) {
          parts.push(`- ${s.name || "Без названия"} (${s.contentType}): ${s.systemPrompt?.slice(0, 500) || ""}`);
        }
      }
    } catch {}
  }

  if (project.knowledgeSummary) {
    parts.push(`\nБаза знаний (саммари):\n${project.knowledgeSummary}`);
  }

  const strategy = db
    .select()
    .from(strategyBlocks)
    .where(and(eq(strategyBlocks.projectId, projectId), eq(strategyBlocks.approved, 1)))
    .orderBy(strategyBlocks.ordering)
    .all();

  if (strategy.length > 0) {
    parts.push("\nСтратегия (ключевые блоки):");
    for (const b of strategy) {
      const content = b.manualContent || b.aiContent || "";
      if (content) parts.push(`- ${b.title}: ${content.slice(0, 500)}`);
    }
  }

  const knowledge = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.projectId, projectId))
    .orderBy(desc(projectKnowledge.createdAt))
    .limit(10)
    .all();

  if (knowledge.length > 0) {
    let kChars = 0;
    const kParts: string[] = [];
    for (const k of knowledge) {
      const snippet = (k.content || "").slice(0, snippetChars);
      if (kChars + snippet.length > MAX_CONTEXT_CHARS) break;
      kParts.push(`- ${k.title} (${k.type}): ${snippet}`);
      kChars += snippet.length;
    }
    if (kParts.length > 0) {
      parts.push("\nБаза знаний (файлы и записи):");
      parts.push(...kParts);
    }
  }

  if (parts.length === 0) return "";

  return `\n\nКОНТЕКСТ ПРОЕКТА:\n${parts.join("\n")}`;
}
