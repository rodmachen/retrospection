import { eq, and, desc, count, sql, isNull } from "drizzle-orm";
import { tasks, projects, taskCompletions, syncLog } from "../db/schema";
import type { Db } from "../db/client";

export interface TaskFilters {
  completed?: boolean;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export async function queryTasks(db: Db, filters: TaskFilters) {
  const { completed, projectId, limit = 50, offset = 0 } = filters;

  const conditions = [];
  if (completed !== undefined) {
    conditions.push(eq(tasks.isCompleted, completed));
  }
  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  }
  // Exclude soft-deleted tasks
  conditions.push(isNull(tasks.deletedAt));

  return db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function queryTaskById(db: Db, id: string) {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function queryProjects(db: Db) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      isInbox: projects.isInbox,
      color: projects.color,
      deletedAt: projects.deletedAt,
      taskCount: count(tasks.id),
    })
    .from(projects)
    .leftJoin(
      tasks,
      and(eq(tasks.projectId, projects.id), isNull(tasks.deletedAt))
    )
    .where(isNull(projects.deletedAt))
    .groupBy(projects.id)
    .orderBy(projects.name);
}

export async function queryCompletionStats(db: Db, days: number) {
  return db
    .select({
      completedDate: taskCompletions.completedDate,
      count: count(taskCompletions.id),
    })
    .from(taskCompletions)
    .where(
      sql`${taskCompletions.completedDate} >= CURRENT_DATE - ${days}::integer`
    )
    .groupBy(taskCompletions.completedDate)
    .orderBy(desc(taskCompletions.completedDate));
}

export async function queryLatestSync(db: Db) {
  const rows = await db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.startedAt))
    .limit(1);
  return rows[0] ?? null;
}
