import { db } from "../db.js";
import { campaignGoals, analyticsSnapshots, postItems } from "../schema.js";
import { sql, eq, and, gte } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const GOAL_THRESHOLDS = {
  ahead: 1.1,
  behind: 0.8,
} as const;

export function createGoal(params: {
  projectId: string;
  metricName: string;
  targetValue: number;
  period: string;
  deadlineDate?: string;
}): string {
  const id = uuid();
  db.insert(campaignGoals).values({
    id,
    projectId: params.projectId,
    metricName: params.metricName,
    targetValue: params.targetValue,
    period: params.period,
    deadlineDate: params.deadlineDate,
    status: "on_track",
  }).run();
  return id;
}

export function deleteGoal(id: string): void {
  db.delete(campaignGoals).where(eq(campaignGoals.id, id)).run();
}

export function getProjectGoals(projectId: string) {
  return db
    .select()
    .from(campaignGoals)
    .where(eq(campaignGoals.projectId, projectId))
    .orderBy(campaignGoals.createdAt)
    .all();
}

export function evaluateGoals(projectId: string): number {
  const goals = db
    .select()
    .from(campaignGoals)
    .where(eq(campaignGoals.projectId, projectId))
    .all();

  let evaluated = 0;
  const now = new Date().toISOString();

  for (const goal of goals) {
    const conditions = [
      eq(analyticsSnapshots.metricName, goal.metricName),
      eq(analyticsSnapshots.metricPeriod, goal.period),
    ];

    if (goal.deadlineDate) {
      const start = new Date(goal.deadlineDate);
      start.setDate(start.getDate() - 30);
      conditions.push(
        gte(analyticsSnapshots.snapshotDate, start.toISOString())
      );
    }

    const result = db
      .select({
        currentValue: sql<number>`avg(${analyticsSnapshots.metricValue})`,
      })
      .from(analyticsSnapshots)
      .where(and(...conditions))
      .get();

    let status: string = "on_track";
    if (result && result.currentValue != null) {
      const ratio = result.currentValue / goal.targetValue;
      if (ratio >= GOAL_THRESHOLDS.ahead) status = "ahead";
      else if (ratio < GOAL_THRESHOLDS.behind) status = "behind";
    }

    db.update(campaignGoals)
      .set({
        status,
        lastEvaluatedAt: now,
      })
      .where(eq(campaignGoals.id, goal.id))
      .run();
    evaluated++;
  }

  return evaluated;
}
