import { sql, and, eq, gte } from "drizzle-orm";
import { projects, sections, tasks, taskCompletions, taskSkippedDates } from "../db/schema";
import type { Db } from "../db/client";
import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
} from "../todoist/types";
import { getTodayInTimezone } from "../utils/dates";

export async function upsertProjects(db: Db, items: TodoistProject[]) {
  if (items.length === 0) return;

  await db
    .insert(projects)
    .values(
      items.map((p) => ({
        id: p.id,
        name: p.name,
        isInbox: p.is_inbox_project,
        color: p.color,
        todoistCreatedAt: new Date(p.created_at),
        updatedAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        name: sql`excluded.name`,
        isInbox: sql`excluded.is_inbox`,
        color: sql`excluded.color`,
        updatedAt: new Date(),
      },
    });
}

export async function upsertSections(db: Db, items: TodoistSection[]) {
  if (items.length === 0) return;

  await db
    .insert(sections)
    .values(
      items.map((s) => ({
        id: s.id,
        projectId: s.project_id,
        name: s.name,
        order: s.order,
        updatedAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: sections.id,
      set: {
        name: sql`excluded.name`,
        projectId: sql`excluded.project_id`,
        order: sql`excluded."order"`,
        updatedAt: new Date(),
      },
    });
}

export function mapTodoistTask(t: TodoistTask) {
  return {
    id: t.id,
    content: t.content,
    description: t.description || null,
    projectId: t.project_id,
    sectionId: t.section_id || null,
    parentId: t.parent_id || null,
    priority: t.priority,
    labels: t.labels,
    dueDate: t.due?.date ?? null,
    dueIsRecurring: t.due?.is_recurring ?? false,
    dueString: t.due?.string ?? null,
    dueTimezone: t.due?.timezone ?? null,
    isCompleted: t.is_completed,
    completedAt: t.completed_at ? new Date(t.completed_at) : null,
    todoistCreatedAt: new Date(t.created_at),
    lastSyncedAt: new Date(),
    rawJson: t as unknown,
    updatedAt: new Date(),
  };
}

export async function upsertTasks(db: Db, items: TodoistTask[]) {
  if (items.length === 0) return;

  await db
    .insert(tasks)
    .values(items.map(mapTodoistTask))
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        content: sql`excluded.content`,
        description: sql`excluded.description`,
        projectId: sql`excluded.project_id`,
        sectionId: sql`excluded.section_id`,
        parentId: sql`excluded.parent_id`,
        priority: sql`excluded.priority`,
        labels: sql`excluded.labels`,
        dueDate: sql`excluded.due_date`,
        dueIsRecurring: sql`excluded.due_is_recurring`,
        dueString: sql`excluded.due_string`,
        dueTimezone: sql`excluded.due_timezone`,
        isCompleted: sql`excluded.is_completed`,
        completedAt: sql`excluded.completed_at`,
        lastSyncedAt: new Date(),
        rawJson: sql`excluded.raw_json`,
        updatedAt: new Date(),
      },
    });
}

export async function insertTaskCompletion(
  db: Db,
  completion: {
    taskId: string;
    completedAt: Date | null;
    completedDate: string;
  }
) {
  await db
    .insert(taskCompletions)
    .values({
      taskId: completion.taskId,
      completedAt: completion.completedAt,
      completedDate: completion.completedDate,
    })
    .onConflictDoNothing();
}

export async function insertTaskSkippedDate(
  db: Db,
  skip: { taskId: string; skippedDate: string }
) {
  await db
    .insert(taskSkippedDates)
    .values({ taskId: skip.taskId, skippedDate: skip.skippedDate })
    .onConflictDoNothing();
}

export async function deleteTaskSkippedDatesFrom(
  db: Db,
  taskId: string,
  fromDate: string
) {
  await db
    .delete(taskSkippedDates)
    .where(
      and(
        eq(taskSkippedDates.taskId, taskId),
        gte(taskSkippedDates.skippedDate, fromDate)
      )
    );
}

/**
 * Infer today's completions for active recurring tasks.
 *
 * Heuristic: if a recurring task's due_date is in the future (past today),
 * it means the task was completed today and the due date advanced.
 * This is the same logic as command-center's habits tracker.
 */
export async function inferRecurringCompletions(
  db: Db,
  activeTasks: TodoistTask[],
  timezone: string
): Promise<number> {
  const today = getTodayInTimezone(timezone);
  let count = 0;

  for (const task of activeTasks) {
    if (!task.due?.is_recurring) continue;
    if (!task.due.date) continue;

    // If due date is in the future (past today), it was completed today and advanced
    if (task.due.date <= today) continue;

    await insertTaskCompletion(db, {
      taskId: task.id,
      completedAt: null, // We don't know the actual time
      completedDate: today,
    });
    count++;
  }

  return count;
}

