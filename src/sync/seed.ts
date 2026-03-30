import type { Db } from "../db/client";
import { syncLog } from "../db/schema";
import { syncAll } from "../todoist/client";
import {
  upsertProjects,
  upsertSections,
  upsertTasks,
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
    // Fetch all data in a single Sync API call
    const { projects: apiProjects, sections: apiSections, activeTasks: apiActiveTasks } =
      await syncAll(token);

    // Upsert in order: projects → sections → tasks (FK dependencies)
    await upsertProjects(db, apiProjects);
    await upsertSections(db, apiSections);
    await upsertTasks(db, apiActiveTasks);

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
      completedTasks: 0,
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
