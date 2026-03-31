import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyHmac, isDuplicateDelivery, recordDelivery, processWebhookEvent } from "../../sync/webhook";
import crypto from "crypto";

// Mock the upsert module
vi.mock("../../sync/upsert", () => ({
  upsertTasks: vi.fn(),
  upsertProjects: vi.fn(),
  insertTaskCompletion: vi.fn(),
  mapTodoistTask: vi.fn(),
}));

vi.mock("../../todoist/client", () => ({
  fetchActiveTasks: vi.fn(),
}));

import { upsertTasks, upsertProjects, insertTaskCompletion } from "../../sync/upsert";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyHmac", () => {
  const secret = "test-secret";

  it("returns true for valid HMAC signature", () => {
    const body = '{"event_name":"item:added"}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("base64");

    expect(verifyHmac(body, secret, signature)).toBe(true);
  });

  it("returns false for invalid HMAC signature", () => {
    const body = '{"event_name":"item:added"}';
    // Use a different body to compute the wrong signature
    const wrongSig = crypto
      .createHmac("sha256", secret)
      .update("wrong body")
      .digest("base64");

    expect(verifyHmac(body, secret, wrongSig)).toBe(false);
  });
});

describe("isDuplicateDelivery", () => {
  it("returns false when delivery ID not found", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    };

    const result = await isDuplicateDelivery(db as never, "d1");
    expect(result).toBe(false);
  });

  it("returns true when delivery ID already exists", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ deliveryId: "d1" }])),
          })),
        })),
      })),
    };

    const result = await isDuplicateDelivery(db as never, "d1");
    expect(result).toBe(true);
  });
});

describe("recordDelivery", () => {
  it("inserts the delivery ID", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(),
      })),
    };

    await recordDelivery(db as never, "d1", "item:added");
    expect(db.insert).toHaveBeenCalled();
  });
});

function createMockDb() {
  const selectChain: Record<string, unknown> = {};
  const chainMethods = ["from", "where", "orderBy", "limit"];
  for (const m of chainMethods) {
    selectChain[m] = vi.fn(() => selectChain);
  }
  selectChain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([]).then(resolve);

  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: 1 }]),
        onConflictDoNothing: vi.fn(),
        onConflictDoUpdate: vi.fn(),
      })),
    })),
    select: vi.fn(() => selectChain),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  };
}

describe("processWebhookEvent — item:added", () => {
  it("upserts the task", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:added",
        event_data: {
          id: "t1",
          content: "New task",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: null,
          checked: false,
          completed_at: null,
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", content: "New task" })]
    );
  });
});

describe("processWebhookEvent — item:completed (one-off)", () => {
  it("inserts task_completions with completedAt and marks task complete", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:completed",
        event_data: {
          id: "t1",
          content: "Done task",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: null,
          checked: true,
          completed_at: "2024-06-15T14:30:00Z",
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedAt: new Date("2024-06-15T14:30:00Z"),
        completedDate: "2024-06-15",
      })
    );

    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", is_completed: true })]
    );
  });
});

describe("processWebhookEvent — item:completed (recurring)", () => {
  it("reads old due date and inserts completion with null completedAt", async () => {
    const db = createMockDb();
    // Mock: task exists in DB with old due date
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ dueDate: "2024-06-14" }]),
      })),
    }));

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:completed",
        event_data: {
          id: "t1",
          content: "Daily standup",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: { date: "2024-06-15", is_recurring: true, string: "every day" },
          checked: false, // recurring task stays active
          completed_at: null, // EMPTY for recurring tasks
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    // Should use old due date as completedDate
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedAt: null,
        completedDate: "2024-06-14",
      })
    );

    // Should NOT mark as completed
    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", is_completed: false })]
    );
  });
});

describe("processWebhookEvent — item:completed (recurring, stale DB)", () => {
  it("falls back to today when old dueDate equals incoming due.date", async () => {
    vi.useFakeTimers();
    // Today is June 16, but DB and incoming due.date are both June 15 (stale)
    vi.setSystemTime(new Date("2024-06-16T18:00:00Z"));

    const db = createMockDb();
    // Mock: task exists but dueDate matches incoming due.date (stale)
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ dueDate: "2024-06-15" }]),
      })),
    }));

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:completed",
        event_data: {
          id: "t1",
          content: "Daily standup",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: { date: "2024-06-15", is_recurring: true, string: "every day" },
          checked: false,
          completed_at: null,
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    // Should fall back to today (2024-06-16 in Chicago), NOT use stale "2024-06-15"
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedAt: null,
        completedDate: "2024-06-16",
      })
    );

    vi.useRealTimers();
  });
});

describe("processWebhookEvent — item:completed (recurring, task not in DB)", () => {
  it("falls back to today when task not found in DB", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T18:00:00Z"));

    const db = createMockDb();
    // Mock: task NOT in DB (empty result)
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    }));

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:completed",
        event_data: {
          id: "t1",
          content: "Daily standup",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: { date: "2024-06-16", is_recurring: true, string: "every day" },
          checked: false,
          completed_at: null,
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    // Should fall back to today
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedAt: null,
        completedDate: "2024-06-15",
      })
    );

    vi.useRealTimers();
  });
});

describe("processWebhookEvent — item:uncompleted", () => {
  it("deletes today's task_completions row and marks task not completed", async () => {
    const db = createMockDb();
    // Return a completion row so the delete branch fires
    const selectChain: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit"]) {
      selectChain[m] = vi.fn(() => selectChain);
    }
    selectChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve([{ completedDate: "2024-06-15" }]).then(resolve);
    db.select = vi.fn(() => selectChain) as typeof db.select;

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:uncompleted",
        event_data: {
          id: "t1",
          content: "Undone task",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: null,
          checked: false,
          completed_at: null,
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    // Should delete from task_completions
    expect(db.delete).toHaveBeenCalled();

    // Should upsert task as not completed
    expect(upsertTasks).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "t1", is_completed: false })]
    );
  });
});

describe("processWebhookEvent — item:deleted", () => {
  it("soft-deletes the task", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:deleted",
        event_data: { id: "t1" },
      },
      "America/Chicago",
      "test-token"
    );

    expect(db.update).toHaveBeenCalled();
  });
});

describe("processWebhookEvent — project:added", () => {
  it("upserts the project", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "project:added",
        event_data: {
          id: "p1",
          name: "New Project",
          color: "red",
          inbox_project: false,
          created_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(upsertProjects).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "p1", name: "New Project" })]
    );
  });
});

describe("processWebhookEvent — project:deleted", () => {
  it("soft-deletes the project", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "project:deleted",
        event_data: { id: "p1" },
      },
      "America/Chicago",
      "test-token"
    );

    expect(db.update).toHaveBeenCalled();
  });
});
