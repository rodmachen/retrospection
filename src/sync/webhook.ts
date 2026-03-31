import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { tasks, taskCompletions, projects, webhookEvents, syncLog } from "../db/schema";
import type { Db } from "../db/client";
import { upsertTasks, upsertProjects, insertTaskCompletion } from "./upsert";
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
  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  if (computedBuf.byteLength !== signatureBuf.byteLength) return false;
  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}

export interface WebhookPayload {
  event_name: string;
  event_data: Record<string, unknown>;
}

/**
 * Returns true if the delivery ID has already been recorded (duplicate).
 */
export async function isDuplicateDelivery(
  db: Db,
  deliveryId: string
): Promise<boolean> {
  const rows = await db
    .select({ deliveryId: webhookEvents.deliveryId })
    .from(webhookEvents)
    .where(eq(webhookEvents.deliveryId, deliveryId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Records a successfully processed delivery ID.
 */
export async function recordDelivery(
  db: Db,
  deliveryId: string,
  eventType: string
): Promise<void> {
  await db.insert(webhookEvents).values({ deliveryId, eventType });
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
      await handleItemUncompleted(db, event_data);
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
  const tasksSynced = event_name.startsWith("item:") ? 1 : 0;
  await db.insert(syncLog).values({
    type: "webhook",
    startedAt: new Date(),
    completedAt: new Date(),
    status: "success",
    tasksSynced,
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

    const oldDueDate = existingRows[0]?.dueDate ?? null;
    const incomingDueDate = (eventData.due as { date?: string } | null)?.date ?? null;

    // If DB due date is stale (matches incoming advanced date) or task not found,
    // fall back to today. Otherwise use the old due date (normal case).
    const completedDate =
      oldDueDate && oldDueDate !== incomingDueDate
        ? oldDueDate
        : getTodayInTimezone(timezone);

    // Insert completion with the determined date
    await insertTaskCompletion(db, {
      taskId,
      completedAt: null,
      completedDate,
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
  eventData: Record<string, unknown>
): Promise<void> {
  const taskId = String(eventData.id);

  // Delete the most recent completion for this task (may not be today if completed yesterday)
  const latest = await db
    .select({ completedDate: taskCompletions.completedDate })
    .from(taskCompletions)
    .where(eq(taskCompletions.taskId, taskId))
    .orderBy(desc(taskCompletions.completedDate))
    .limit(1);

  if (latest.length > 0) {
    await db
      .delete(taskCompletions)
      .where(
        and(
          eq(taskCompletions.taskId, taskId),
          eq(taskCompletions.completedDate, latest[0].completedDate)
        )
      );
  }

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
    is_inbox_project: Boolean(eventData.inbox_project ?? false),
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
    is_completed: Boolean(data.checked ?? false),
    completed_at: (data.completed_at as string) ?? null,
    created_at: String(data.added_at ?? new Date().toISOString()),
  };
}
