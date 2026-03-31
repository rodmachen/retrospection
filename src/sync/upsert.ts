import { projects, sections, tasks, taskCompletions } from "../db/schema";
import type { Db } from "../db/client";
import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
} from "../todoist/types";

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
      set: (excluded) => ({
        name: excluded.name,
        isInbox: excluded.isInbox,
        color: excluded.color,
        updatedAt: new Date(),
      }),
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
      set: (excluded) => ({
        name: excluded.name,
        projectId: excluded.projectId,
        order: excluded.order,
        updatedAt: new Date(),
      }),
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
      set: (excluded) => ({
        content: excluded.content,
        description: excluded.description,
        projectId: excluded.projectId,
        sectionId: excluded.sectionId,
        parentId: excluded.parentId,
        priority: excluded.priority,
        labels: excluded.labels,
        dueDate: excluded.dueDate,
        dueIsRecurring: excluded.dueIsRecurring,
        dueString: excluded.dueString,
        dueTimezone: excluded.dueTimezone,
        isCompleted: excluded.isCompleted,
        completedAt: excluded.completedAt,
        lastSyncedAt: new Date(),
        rawJson: excluded.rawJson,
        updatedAt: new Date(),
      }),
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

function getTodayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}
