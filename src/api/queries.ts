import { eq, and, desc, count, sql, isNull, inArray } from "drizzle-orm";
import { tasks, projects, taskCompletions, syncLog } from "../db/schema";
import type { Db } from "../db/client";

export interface TaskFilters {
  completed?: boolean;
  projectId?: string;
  nested?: boolean;
  limit?: number;
  offset?: number;
}

type TaskRow = typeof tasks.$inferSelect;
export type NestedTask = TaskRow & { subtasks: NestedTask[] };

export function nestSubtasks(flatTasks: TaskRow[]): NestedTask[] {
  const byId = new Map<string, NestedTask>();

  // First pass: build map of all tasks with empty subtasks arrays
  for (const task of flatTasks) {
    byId.set(task.id, { ...task, subtasks: [] });
  }

  const result: NestedTask[] = [];

  for (const task of flatTasks) {
    const node = byId.get(task.id)!;
    if (task.parentId !== null && byId.has(task.parentId)) {
      // Attach to parent — works at any nesting depth
      byId.get(task.parentId)!.subtasks.push(node);
    } else {
      // Top-level: root task (parentId === null) or orphan (parent not in set)
      result.push(node);
    }
  }

  return result;
}

export async function queryTasks(db: Db, filters: TaskFilters) {
  const { completed, projectId, nested = false, limit = 50, offset = 0 } = filters;

  const conditions = [];
  if (completed !== undefined) {
    conditions.push(eq(tasks.isCompleted, completed));
  }
  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  }
  // Exclude soft-deleted tasks
  conditions.push(isNull(tasks.deletedAt));

  if (!nested) {
    return db
      .select()
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // Nested mode: fetch root tasks first, then all descendants iteratively.
  // This handles any nesting depth (Todoist supports up to 4 levels).
  const parentConditions = [...conditions, isNull(tasks.parentId)];
  const parentRows = await db
    .select()
    .from(tasks)
    .where(and(...parentConditions))
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);

  if (parentRows.length === 0) return [];

  const allTasks = [...parentRows];
  let currentIds = parentRows.map((t) => t.id);

  // Iteratively fetch the next level of descendants until none remain
  while (currentIds.length > 0) {
    const childRows = await db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.parentId, currentIds), isNull(tasks.deletedAt)))
      .orderBy(tasks.createdAt);

    if (childRows.length === 0) break;
    allTasks.push(...childRows);
    currentIds = childRows.map((t) => t.id);
  }

  return nestSubtasks(allTasks);
}

export async function queryTaskById(db: Db, id: string) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
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
