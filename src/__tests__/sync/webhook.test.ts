import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyHmac, isDuplicateDelivery, recordDelivery, processWebhookEvent } from "../../sync/webhook";
import { sections } from "../../db/schema";
import crypto from "crypto";

// Mock the upsert module
vi.mock("../../sync/upsert", () => ({
  upsertTasks: vi.fn(),
  upsertProjects: vi.fn(),
  upsertSections: vi.fn(),
  insertTaskCompletion: vi.fn(),
  insertTaskSkippedDate: vi.fn(),
  deleteTaskSkippedDatesFrom: vi.fn(),
  mapTodoistTask: vi.fn(),
}));

vi.mock("../../todoist/client", () => ({
  fetchActiveTasks: vi.fn(),
}));

import { upsertTasks, upsertProjects, upsertSections, insertTaskCompletion, insertTaskSkippedDate, deleteTaskSkippedDatesFrom } from "../../sync/upsert";

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

  it("skip detection is a no-op for item:added (task not yet in DB)", async () => {
    // item:added fires before the task exists in our DB, so skip detection
    // must safely do nothing even if the event includes a recurring due date.
    const db = mockDbTaskNotFound();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:added",
        event_data: {
          id: "t1",
          content: "New recurring habit",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: { date: "2024-06-18", is_recurring: true, string: "every day" },
          checked: false,
          completed_at: null,
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
    expect(deleteTaskSkippedDatesFrom).not.toHaveBeenCalled();
    expect(upsertTasks).toHaveBeenCalled();
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

describe("processWebhookEvent — item:completed (non-recurring, oldDueDate === incomingDueDate)", () => {
  it("uses oldDueDate rather than falling back to today", async () => {
    // Edge case: task has no completed_at in payload but is NOT recurring.
    // Bug: oldDueDate === incomingDueDate causes incorrect fallback to today.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-16T18:00:00Z"));

    const db = createMockDb();
    // DB has same due date as incoming (non-recurring, due date doesn't advance)
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
          content: "One-off task",
          description: "",
          project_id: "p1",
          section_id: null,
          parent_id: null,
          priority: 1,
          labels: [],
          due: { date: "2024-06-15", is_recurring: false, string: "Jun 15" },
          checked: true,
          completed_at: null, // absent (triggers the recurring branch)
          added_at: "2024-01-01T00:00:00Z",
        },
      },
      "America/Chicago",
      "test-token"
    );

    // Should use oldDueDate "2024-06-15", NOT fall back to today "2024-06-16"
    expect(insertTaskCompletion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "t1",
        completedDate: "2024-06-15",
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

describe("processWebhookEvent — section:added", () => {
  it("upserts the section", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "section:added",
        event_data: {
          id: "s1",
          project_id: "p1",
          name: "Job Search",
          section_order: 1,
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(upsertSections).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "s1", project_id: "p1", name: "Job Search", order: 1 })]
    );
  });
});

describe("processWebhookEvent — section:updated", () => {
  it("upserts the section with updated name", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "section:updated",
        event_data: {
          id: "s1",
          project_id: "p1",
          name: "Job Hunt",
          section_order: 1,
        },
      },
      "America/Chicago",
      "test-token"
    );

    expect(upsertSections).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: "s1", name: "Job Hunt" })]
    );
  });
});

describe("processWebhookEvent — section:deleted", () => {
  it("hard-deletes the section", async () => {
    const db = createMockDb();

    await processWebhookEvent(
      db as never,
      {
        event_name: "section:deleted",
        event_data: { id: "s1" },
      },
      "America/Chicago",
      "test-token"
    );

    expect(db.delete).toHaveBeenCalledWith(sections);
  });
});

// Helper for item:updated skip-detection tests
function makeRecurringEventData(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    content: "Daily habit",
    description: "",
    project_id: "p1",
    section_id: null,
    parent_id: null,
    priority: 1,
    labels: [],
    due: { date: "2024-06-18", is_recurring: true, string: "every day" },
    checked: false,
    completed_at: null,
    added_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockDbWithExistingTask(dueDate: string | null, dueIsRecurring: boolean) {
  const db = createMockDb();
  db.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => [{ dueDate, dueIsRecurring }]),
    })),
  }));
  return db;
}

function mockDbTaskNotFound() {
  const db = createMockDb();
  db.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => []),
    })),
  }));
  return db;
}

describe("processWebhookEvent — item:updated skip detection", () => {
  it("creates skip records when recurring task due date moves forward", async () => {
    // Old due: June 15, incoming due: June 18 → skip 15, 16, 17
    const db = mockDbWithExistingTask("2024-06-15", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-18", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).toHaveBeenCalledTimes(3);
    expect(insertTaskSkippedDate).toHaveBeenCalledWith(expect.anything(), { taskId: "t1", skippedDate: "2024-06-15" });
    expect(insertTaskSkippedDate).toHaveBeenCalledWith(expect.anything(), { taskId: "t1", skippedDate: "2024-06-16" });
    expect(insertTaskSkippedDate).toHaveBeenCalledWith(expect.anything(), { taskId: "t1", skippedDate: "2024-06-17" });
  });

  it("does not create skips for non-recurring tasks", async () => {
    // Old is recurring but incoming is not
    const db = mockDbWithExistingTask("2024-06-15", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-18", is_recurring: false, string: "" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
  });

  it("does not create skips when task not in DB", async () => {
    const db = mockDbTaskNotFound();

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData(),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
  });

  it("does not create skips when old dueDate is null", async () => {
    // Task exists in DB but has no due date set
    const db = mockDbWithExistingTask(null, true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData(),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
  });

  it("does not create skips when dates are equal", async () => {
    const db = mockDbWithExistingTask("2024-06-18", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-18", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
    expect(deleteTaskSkippedDatesFrom).not.toHaveBeenCalled();
  });

  it("creates single skip when dates are one day apart", async () => {
    // Old: June 17, incoming: June 18 → skip only June 17
    const db = mockDbWithExistingTask("2024-06-17", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-18", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    expect(insertTaskSkippedDate).toHaveBeenCalledTimes(1);
    expect(insertTaskSkippedDate).toHaveBeenCalledWith(expect.anything(), { taskId: "t1", skippedDate: "2024-06-17" });
  });

  it("backward move deletes skips on/after new date", async () => {
    // Old: June 18, incoming: June 15 → delete skips >= June 15
    const db = mockDbWithExistingTask("2024-06-18", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-15", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    expect(deleteTaskSkippedDatesFrom).toHaveBeenCalledWith(expect.anything(), "t1", "2024-06-15");
    expect(insertTaskSkippedDate).not.toHaveBeenCalled();
  });

  it("backward move does not delete skips before new date", async () => {
    // The deleteTaskSkippedDatesFrom function uses >= fromDate, so records
    // before fromDate are preserved. We verify it's called with the right date.
    const db = mockDbWithExistingTask("2024-06-20", true);

    await processWebhookEvent(
      db as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-17", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );

    // Called with "2024-06-17" — only deletes >= that date, preserving earlier records
    expect(deleteTaskSkippedDatesFrom).toHaveBeenCalledWith(expect.anything(), "t1", "2024-06-17");
  });

  it("upsert still called after both forward and backward moves", async () => {
    // Forward move
    const dbFwd = mockDbWithExistingTask("2024-06-15", true);
    await processWebhookEvent(
      dbFwd as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-18", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );
    expect(upsertTasks).toHaveBeenCalled();

    vi.clearAllMocks();

    // Backward move
    const dbBwd = mockDbWithExistingTask("2024-06-18", true);
    await processWebhookEvent(
      dbBwd as never,
      {
        event_name: "item:updated",
        event_data: makeRecurringEventData({
          due: { date: "2024-06-15", is_recurring: true, string: "every day" },
        }),
      },
      "America/Chicago",
      "test-token"
    );
    expect(upsertTasks).toHaveBeenCalled();
  });
});
