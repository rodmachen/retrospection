import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Todoist client
vi.mock("../../todoist/client", () => ({
  syncAll: vi.fn(),
  fetchCompletedTasks: vi.fn(),
}));

// Mock the upsert module
vi.mock("../../sync/upsert", () => ({
  upsertProjects: vi.fn(),
  upsertSections: vi.fn(),
  upsertTasks: vi.fn(),
  insertTaskCompletion: vi.fn(),
  inferRecurringCompletions: vi.fn(),
}));

import { runSeed } from "../../sync/seed";
import { syncAll, fetchCompletedTasks } from "../../todoist/client";
import {
  upsertProjects,
  upsertSections,
  upsertTasks,
  insertTaskCompletion,
  inferRecurringCompletions,
} from "../../sync/upsert";

function createMockDb() {
  const insertedSyncLogs: unknown[] = [];

  return {
    insert: vi.fn(() => ({
      values: vi.fn((vals: unknown) => {
        insertedSyncLogs.push(vals);
        return {
          returning: vi.fn(() => [{ id: 1 }]),
        };
      }),
    })),
    _insertedSyncLogs: insertedSyncLogs,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runSeed", () => {
  it("fetches all data and upserts in correct order", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({
      projects: [{ id: "p1", name: "Inbox", color: "blue", is_inbox_project: true, created_at: "2024-01-01T00:00:00Z" }],
      sections: [{ id: "s1", project_id: "p1", name: "Section A", order: 1 }],
      activeTasks: [
        {
          id: "t1", content: "Task 1", description: "", project_id: "p1",
          section_id: null, parent_id: null, priority: 1, labels: [],
          due: null, is_completed: false, completed_at: null, created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(fetchCompletedTasks).mockResolvedValue([
      {
        task_id: "t2", content: "Done task", project_id: "p1",
        section_id: null, completed_at: "2024-06-15T12:00:00Z", id: "c1",
      },
    ]);
    vi.mocked(inferRecurringCompletions).mockResolvedValue(0);

    const result = await runSeed(db as never, "test-token", "America/Chicago");

    expect(result.projects).toBe(1);
    expect(result.sections).toBe(1);
    expect(result.activeTasks).toBe(1);
    expect(result.completedTasks).toBe(1);
    expect(result.inferredCompletions).toBe(0);

    // Verify order: projects → sections → tasks
    expect(upsertProjects).toHaveBeenCalledBefore(vi.mocked(upsertSections));
    expect(upsertSections).toHaveBeenCalledBefore(vi.mocked(upsertTasks));

    // Verify completions were inserted
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t2",
        completedDate: "2024-06-15",
      })
    );
  });

  it("returns result with inferred recurring completions count", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({ projects: [], sections: [], activeTasks: [] });
    vi.mocked(fetchCompletedTasks).mockResolvedValue([]);
    vi.mocked(inferRecurringCompletions).mockResolvedValue(3);

    const result = await runSeed(db as never, "test-token", "America/Chicago");

    expect(result.inferredCompletions).toBe(3);
    expect(inferRecurringCompletions).toHaveBeenCalledWith(
      expect.anything(),
      [],
      "America/Chicago"
    );
  });

  it("does not overwrite active task data when same task appears in completed list", async () => {
    const db = createMockDb();

    // Recurring task "t1" appears in BOTH active tasks and completed tasks
    vi.mocked(syncAll).mockResolvedValue({
      projects: [{ id: "p1", name: "Habits", color: "blue", is_inbox_project: false, created_at: "2024-01-01T00:00:00Z" }],
      sections: [{ id: "s1", project_id: "p1", name: "Coding Studies", order: 1 }],
      activeTasks: [
        {
          id: "t1", content: "React Course", description: "", project_id: "p1",
          section_id: "s1", parent_id: null, priority: 1, labels: [],
          due: { date: "2024-06-16", is_recurring: true, string: "every day" },
          is_completed: false, completed_at: null, created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(fetchCompletedTasks).mockResolvedValue([
      {
        task_id: "t1", content: "React Course", project_id: "p1",
        section_id: "s1", completed_at: "2024-06-15T12:00:00Z", id: "t1",
      },
    ]);
    vi.mocked(inferRecurringCompletions).mockResolvedValue(0);

    await runSeed(db as never, "test-token", "America/Chicago");

    // upsertTasks should be called once (for active tasks), NOT again with section_id: null
    expect(upsertTasks).toHaveBeenCalledTimes(1);
    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ id: "t1", section_id: "s1" }),
      ])
    );

    // Completion should still be inserted
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: "t1", completedDate: "2024-06-15" })
    );
  });

  it("logs sync_log entries for start and success", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({ projects: [], sections: [], activeTasks: [] });
    vi.mocked(fetchCompletedTasks).mockResolvedValue([]);
    vi.mocked(inferRecurringCompletions).mockResolvedValue(0);

    await runSeed(db as never, "test-token", "America/Chicago");

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db._insertedSyncLogs[0]).toMatchObject({ type: "seed", status: "running" });
    expect(db._insertedSyncLogs[1]).toMatchObject({ type: "seed", status: "success" });
  });
});
