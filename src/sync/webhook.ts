import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { tasks, taskCompletions, projects, webhookEvents, syncLog } from "../db/schema";
import type { Db } from "../db/client";
import { upsertTasks, upsertProjects, insertTaskCompletion, mapTodoistTask } from "./upsert";
import { fetchActiveTasks } from "../todoist/client";
import type { TodoistTask, TodoistProject } from "../todoist/types";

export function verifyHmac(
  rawBody: string,
  secret: string,
  signature: string
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );
}

export interface WebhookPayload {
  event_name: string;
  event_data: Record<string, unknown>;
}

/**
 * Returns true if the delivery ID was already processed (duplicate).
 * Inserts the delivery ID if new.
 */
export async function checkAndRecordDelivery(
  db: Db,
  deliveryId: string,
  eventType: string
): Promise<boolean> {
  try {
    await db.insert(webhookEvents).values({
      deliveryId,
      eventType,
    });
    return false; // New delivery, not a duplicate
  } catch (error: unknown) {
    // Unique constraint violation = duplicate delivery
    if (
      error instanceof Error &&
      (error.message.includes("unique") ||
        error.message.includes("duplicate") ||
        error.message.includes("23505"))
    ) {
      return true;
    }
    throw error;
  }
}

function getTodayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

export async function processWebhookEvent(
  db: Db,
  payload: WebhookPayload,
  timezone: string,
  todoistToken: string
): Promise<void> {
  const { event_name, event_data } = payload;

  switch (event_name) {
    case "item:added":
    case "item:updated":
      await handleItemUpsert(db, event_data, todoistToken);
      break;

    case "item:completed":
      await handleItemCompleted(db, event_data, timezone, todoistToken);
      break;

    case "item:uncompleted":
      await handleItemUncompleted(db, event_data, timezone);
      break;

    case "item:deleted":
      await handleItemDeleted(db, event_data);
      break;

    case "project:added":
    case "project:updated":
      await handleProjectUpsert(db, event_data);
      break;

    case "project:deleted":
      await handleProjectDeleted(db, event_data);
      break;

    default:
      // Unknown event type — log but don't fail
      break;
  }

  // Log to sync_log
  await db.insert(syncLog).values({
    type: "webhook",
    startedAt: new Date(),
    completedAt: new Date(),
    status: "success",
    tasksSynced: 1,
    metadata: { event_name, task_id: event_data.id },
  });
}

async function handleItemUpsert(
  db: Db,
  eventData: Record<string, unknown>,
  todoistToken: string
): Promise<void> {
  const task = eventDataToTodoistTask(eventData);

  // Self-healing: if the task references a project not in our DB,
  // we still upsert the task. FK is nullable or the project may exist.
  await upsertTasks(db, [task]);
}

async function handleItemCompleted(
  db: Db,
  eventData: Record<string, unknown>,
  timezone: string,
  todoistToken: string
): Promise<void> {
  const taskId = String(eventData.id);
  const completedAtRaw = eventData.completed_at as string | null | undefined;
  const isRecurring = !completedAtRaw;

  if (isRecurring) {
    // Recurring task: completed_at is empty in the payload.
    // Read the OLD due date from our DB before upserting.
    const existingRows = await db
      .select({ dueDate: tasks.dueDate })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    const oldDueDate = existingRows[0]?.dueDate ?? getTodayInTimezone(timezone);

    // Insert completion with the old due date
    await insertTaskCompletion(db, {
      taskId,
      completedAt: null,
      completedDate: oldDueDate,
    });

    // Upsert task with new advanced due date (DO NOT mark as completed)
    const task = eventDataToTodoistTask(eventData);
    await upsertTasks(db, [task]);
  } else {
    // One-off task: completed_at is present
    const completedAt = new Date(completedAtRaw);
    const completedDate = completedAt.toLocaleDateString("en-CA", {
      timeZone: timezone,
    });

    // Insert completion row
    await insertTaskCompletion(db, {
      taskId,
      completedAt,
      completedDate,
    });

    // Upsert task as completed
    const task = eventDataToTodoistTask(eventData);
    task.is_completed = true;
    task.completed_at = completedAtRaw;
    await upsertTasks(db, [task]);
  }
}

async function handleItemUncompleted(
  db: Db,
  eventData: Record<string, unknown>,
  timezone: string
): Promise<void> {
  const taskId = String(eventData.id);
  const today = getTodayInTimezone(timezone);

  // Delete the task_completions row for today
  await db
    .delete(taskCompletions)
    .where(
      and(
        eq(taskCompletions.taskId, taskId),
        eq(taskCompletions.completedDate, today)
      )
    );

  // Upsert task as not completed
  const task = eventDataToTodoistTask(eventData);
  task.is_completed = false;
  task.completed_at = null;
  await upsertTasks(db, [task]);
}

async function handleItemDeleted(
  db: Db,
  eventData: Record<string, unknown>
): Promise<void> {
  const taskId = String(eventData.id);

  await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

async function handleProjectUpsert(
  db: Db,
  eventData: Record<string, unknown>
): Promise<void> {
  const project: TodoistProject = {
    id: String(eventData.id),
    name: String(eventData.name ?? ""),
    color: String(eventData.color ?? ""),
    is_inbox_project: Boolean(eventData.is_inbox_project ?? false),
    created_at: String(
      eventData.created_at ?? new Date().toISOString()
    ),
  };
  await upsertProjects(db, [project]);
}

async function handleProjectDeleted(
  db: Db,
  eventData: Record<string, unknown>
): Promise<void> {
  const projectId = String(eventData.id);

  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/**
 * Maps webhook event_data (which uses Todoist API field names)
 * to our TodoistTask type.
 */
function eventDataToTodoistTask(
  data: Record<string, unknown>
): TodoistTask {
  const due = data.due as { date?: string; is_recurring?: boolean; string?: string; timezone?: string } | null;

  return {
    id: String(data.id),
    content: String(data.content ?? ""),
    description: String(data.description ?? ""),
    project_id: String(data.project_id ?? ""),
    section_id: data.section_id ? String(data.section_id) : null,
    parent_id: data.parent_id ? String(data.parent_id) : null,
    priority: Number(data.priority ?? 1),
    labels: (data.labels as string[]) ?? [],
    due: due
      ? {
          date: due.date ?? "",
          is_recurring: due.is_recurring ?? false,
          string: due.string ?? "",
          timezone: due.timezone,
        }
      : null,
    is_completed: Boolean(data.is_completed ?? false),
    completed_at: (data.completed_at as string) ?? null,
    created_at: String(data.created_at ?? new Date().toISOString()),
  };
}
