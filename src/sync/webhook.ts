import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { tasks, taskCompletions, projects, sections, webhookEvents, syncLog } from "../db/schema";
import type { Db } from "../db/client";
import { upsertTasks, upsertProjects, upsertSections, insertTaskCompletion, insertTaskSkippedDate, deleteTaskSkippedDatesFrom } from "./upsert";
import type { TodoistTask, TodoistProject, TodoistSection } from "../todoist/types";
import { getTodayInTimezone, getDatesBetween } from "../utils/dates";

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

    case "section:added":
    case "section:updated":
      await handleSectionUpsert(db, event_data);
      break;

    case "section:deleted":
      await handleSectionDeleted(db, event_data);
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
  const taskId = task.id;

  // --- Skip detection for recurring tasks ---
  const incomingDue = eventData.due as { date?: string; is_recurring?: boolean } | null;
  const incomingDueDate = incomingDue?.date ?? null;
  const incomingIsRecurring = incomingDue?.is_recurring ?? false;

  if (incomingDueDate && incomingIsRecurring) {
    const existingRows = await db
      .select({ dueDate: tasks.dueDate, dueIsRecurring: tasks.dueIsRecurring })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    const existing = existingRows[0];
    if (existing?.dueDate && existing.dueIsRecurring) {
      const oldDueDate = existing.dueDate;

      if (incomingDueDate > oldDueDate) {
        // Forward move → insert skip records for each skipped date
        const skippedDates = getDatesBetween(oldDueDate, incomingDueDate);
        for (const skippedDate of skippedDates) {
          await insertTaskSkippedDate(db, { taskId, skippedDate });
        }
      } else if (incomingDueDate < oldDueDate) {
        // Backward move → delete invalidated skip records
        await deleteTaskSkippedDatesFrom(db, taskId, incomingDueDate);
      }
    }
  }

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
    const incomingIsRecurring = (eventData.due as { is_recurring?: boolean } | null)?.is_recurring ?? false;

    // For recurring tasks, the due date advances on completion — if oldDueDate
    // matches incoming (stale DB) or is absent, fall back to today.
    // For non-recurring tasks, oldDueDate doesn't advance, so use it directly.
    const completedDate =
      oldDueDate && (!incomingIsRecurring || oldDueDate !== incomingDueDate)
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

async function handleSectionUpsert(
  db: Db,
  eventData: Record<string, unknown>
): Promise<void> {
  const section: TodoistSection = {
    id: String(eventData.id),
    project_id: String(eventData.project_id ?? ""),
    name: String(eventData.name ?? ""),
    order: Number(eventData.section_order ?? 0),
  };
  await upsertSections(db, [section]);
}

async function handleSectionDeleted(
  db: Db,
  eventData: Record<string, unknown>
): Promise<void> {
  const sectionId = String(eventData.id);
  await db.delete(sections).where(eq(sections.id, sectionId));
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
