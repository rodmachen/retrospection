import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyHmac, checkAndRecordDelivery, processWebhookEvent } from "../../sync/webhook";
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

describe("checkAndRecordDelivery", () => {
  it("returns false for new delivery ID", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(),
      })),
    };

    const result = await checkAndRecordDelivery(db as never, "d1", "item:added");
    expect(result).toBe(false);
    expect(db.insert).toHaveBeenCalled();
  });

  it("returns true for duplicate delivery ID (unique constraint violation)", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error("unique constraint violation 23505");
        }),
      })),
    };

    const result = await checkAndRecordDelivery(db as never, "d1", "item:added");
    expect(result).toBe(true);
  });

  it("re-throws non-duplicate errors", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => {
          throw new Error("connection refused");
        }),
      })),
    };

    await expect(
      checkAndRecordDelivery(db as never, "d1", "item:added")
    ).rejects.toThrow("connection refused");
  });
});

function createMockDb() {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: 1 }]),
        onConflictDoNothing: vi.fn(),
        onConflictDoUpdate: vi.fn(),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    })),
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
          is_completed: false,
          completed_at: null,
          created_at: "2024-01-01T00:00:00Z",
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
          is_completed: true,
          completed_at: "2024-06-15T14:30:00Z",
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
          is_completed: false, // recurring task stays active
          completed_at: null, // EMPTY for recurring tasks
          created_at: "2024-01-01T00:00:00Z",
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

describe("processWebhookEvent — item:uncompleted", () => {
  it("deletes today's task_completions row and marks task not completed", async () => {
    const db = createMockDb();

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
          is_completed: false,
          completed_at: null,
          created_at: "2024-01-01T00:00:00Z",
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
          is_inbox_project: false,
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
