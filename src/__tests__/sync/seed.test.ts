import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Todoist client
vi.mock("../../todoist/client", () => ({
  syncAll: vi.fn(),
}));

// Mock the upsert module
vi.mock("../../sync/upsert", () => ({
  upsertProjects: vi.fn(),
  upsertSections: vi.fn(),
  upsertTasks: vi.fn(),
  inferRecurringCompletions: vi.fn(),
}));

import { runSeed } from "../../sync/seed";
import { syncAll } from "../../todoist/client";
import {
  upsertProjects,
  upsertSections,
  upsertTasks,
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
    vi.mocked(inferRecurringCompletions).mockResolvedValue(0);

    const result = await runSeed(db as never, "test-token", "America/Chicago");

    expect(result.projects).toBe(1);
    expect(result.sections).toBe(1);
    expect(result.activeTasks).toBe(1);
    expect(result.completedTasks).toBe(0);
    expect(result.inferredCompletions).toBe(0);

    // Verify order: projects → sections → tasks
    expect(upsertProjects).toHaveBeenCalledBefore(vi.mocked(upsertSections));
    expect(upsertSections).toHaveBeenCalledBefore(vi.mocked(upsertTasks));
  });

  it("returns result with inferred recurring completions count", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({ projects: [], sections: [], activeTasks: [] });
    vi.mocked(inferRecurringCompletions).mockResolvedValue(3);

    const result = await runSeed(db as never, "test-token", "America/Chicago");

    expect(result.inferredCompletions).toBe(3);
    expect(inferRecurringCompletions).toHaveBeenCalledWith(
      expect.anything(),
      [],
      "America/Chicago"
    );
  });

  it("logs sync_log entries for start and success", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({ projects: [], sections: [], activeTasks: [] });
    vi.mocked(inferRecurringCompletions).mockResolvedValue(0);

    await runSeed(db as never, "test-token", "America/Chicago");

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db._insertedSyncLogs[0]).toMatchObject({ type: "seed", status: "running" });
    expect(db._insertedSyncLogs[1]).toMatchObject({ type: "seed", status: "success" });
  });
});
