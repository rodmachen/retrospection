import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

/**
 * End-to-end pipeline test.
 * Exercises: seed → webhook item:completed → REST query.
 * All external I/O (DB, Todoist API) is mocked.
 */

// Mock Todoist client
vi.mock("../../todoist/client", () => ({
  syncAll: vi.fn(),
  fetchCompletedTasks: vi.fn().mockResolvedValue([]),
}));

// Mock DB upserts/inserts at the sync layer
vi.mock("../../sync/upsert", () => ({
  upsertProjects: vi.fn(),
  upsertSections: vi.fn(),
  upsertTasks: vi.fn(),
  insertTaskCompletion: vi.fn(),
  inferRecurringCompletions: vi.fn().mockResolvedValue(0),
  mapTodoistTask: vi.fn(),
}));

import { runSeed } from "../../sync/seed";
import { processWebhookEvent } from "../../sync/webhook";
import { queryTaskById } from "../../api/queries";
import { syncAll } from "../../todoist/client";
import { upsertTasks, insertTaskCompletion } from "../../sync/upsert";

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockDb(taskStore: Record<string, unknown> = {}) {
  const stored = Object.values(taskStore);

  // A fully chainable select mock that resolves to stored values
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit", "offset", "orderBy", "leftJoin", "groupBy"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Make it thenable so await works
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(stored).then(resolve);

  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: 1 }]),
        onConflictDoNothing: vi.fn(),
        onConflictDoUpdate: vi.fn(),
      })),
    })),
    select: vi.fn(() => chain),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn() })),
    })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  };
}

describe("Pipeline: seed → webhook → REST", () => {
  it("Step 1: seed populates tasks", async () => {
    const db = createMockDb();

    vi.mocked(syncAll).mockResolvedValue({
      projects: [{ id: "p1", name: "Work", color: "blue", is_inbox_project: false, created_at: "2024-01-01T00:00:00Z" }],
      sections: [],
      activeTasks: [
        {
          id: "t1", content: "Write tests", description: "", project_id: "p1",
          section_id: null, parent_id: null, priority: 2, labels: [],
          due: null, is_completed: false, completed_at: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    const result = await runSeed(db as never, "test-token", "America/Chicago");

    expect(result.activeTasks).toBe(1);
    expect(result.completedTasks).toBe(0);
    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", content: "Write tests" })]
    );
  });

  it("Step 2: webhook item:completed marks task complete", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:completed",
        event_data: {
          id: "t1",
          content: "Write tests",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 2,
          labels: [],
          due: null,
          is_completed: true,
          completed_at: "2024-06-15T18:00:00Z",
          created_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedAt: new Date("2024-06-15T18:00:00Z"),
        completedDate: "2024-06-15",
      })
    );

    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", is_completed: true })]
    );
  });

  it("Step 3: REST API returns completed task", async () => {
    const completedTask = {
      id: "t1",
      content: "Write tests",
      description: null,
      projectId: "p1",
      sectionId: null,
      parentId: null,
      priority: 2,
      labels: [],
      dueDate: null,
      dueIsRecurring: false,
      dueString: null,
      dueTimezone: null,
      isCompleted: true,
      completedAt: new Date("2024-06-15T18:00:00Z"),
      deletedAt: null,
      firstSeenAt: new Date(),
      lastSyncedAt: new Date(),
      rawJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = createMockDb({ t1: completedTask });

    const result = await queryTaskById(db as never, "t1");

    expect(result).not.toBeNull();
    expect(result?.isCompleted).toBe(true);
    expect(result?.id).toBe("t1");
  });
});
