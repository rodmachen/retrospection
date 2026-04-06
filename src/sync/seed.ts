import type { Db } from "../db/client";
import { syncLog } from "../db/schema";
import { syncAll, fetchCompletedTasks } from "../todoist/client";
import {
  upsertProjects,
  upsertSections,
  upsertTasks,
  insertTaskCompletion,
  inferRecurringCompletions,
} from "./upsert";

export interface SeedResult {
  projects: number;
  sections: number;
  activeTasks: number;
  completedTasks: number;
  inferredCompletions: number;
}

export async function runSeed(
  db: Db,
  token: string,
  timezone: string
): Promise<SeedResult> {
  const startedAt = new Date();

  // Log start
  const [logEntry] = await db
    .insert(syncLog)
    .values({ type: "seed", startedAt, status: "running" })
    .returning({ id: syncLog.id });

  try {
    // Fetch active data and completed tasks in parallel
    const [syncData, apiCompletedTasks] = await Promise.all([
      syncAll(token),
      fetchCompletedTasks(token, 7),
    ]);

    const { projects: apiProjects, sections: apiSections, activeTasks: apiActiveTasks } = syncData;

    // Upsert in order: projects → sections → tasks (FK dependencies)
    await upsertProjects(db, apiProjects);
    await upsertSections(db, apiSections);
    await upsertTasks(db, apiActiveTasks);

    // Track active task IDs so we don't overwrite their data with
    // minimal completed-task stubs (which hardcode section_id to null).
    const activeTaskIds = new Set(apiActiveTasks.map((t) => t.id));

    // Insert completions from the completed tasks API
    for (const ct of apiCompletedTasks) {
      const completedAt = new Date(ct.completed_at);
      const completedDate = completedAt.toLocaleDateString("en-CA", {
        timeZone: timezone,
      });

      // Only upsert a minimal task row if the task isn't already in the
      // active set. Recurring tasks appear in both lists — upserting here
      // would overwrite their section_id with null.
      if (!activeTaskIds.has(ct.task_id)) {
        await upsertTasks(db, [
          {
            id: ct.task_id,
            content: ct.content,
            description: "",
            project_id: ct.project_id,
            section_id: null,
            parent_id: null,
            priority: 1,
            labels: [],
            due: null,
            is_completed: true,
            completed_at: ct.completed_at,
            created_at: ct.completed_at, // best approximation
          },
        ]);
      }

      await insertTaskCompletion(db, {
        taskId: ct.task_id,
        completedAt,
        completedDate,
      });
    }

    // Infer recurring completions for active tasks
    const inferredCompletions = await inferRecurringCompletions(
      db,
      apiActiveTasks,
      timezone
    );

    const result: SeedResult = {
      projects: apiProjects.length,
      sections: apiSections.length,
      activeTasks: apiActiveTasks.length,
      completedTasks: apiCompletedTasks.length,
      inferredCompletions,
    };

    // Log success
    await db
      .insert(syncLog)
      .values({
        type: "seed",
        startedAt,
        completedAt: new Date(),
        status: "success",
        tasksSynced:
          result.activeTasks +
          result.completedTasks +
          result.inferredCompletions,
        metadata: result,
      });

    return result;
  } catch (error) {
    // Log failure
    await db
      .insert(syncLog)
      .values({
        type: "seed",
        startedAt,
        completedAt: new Date(),
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : String(error),
      });

    throw error;
  }
}
