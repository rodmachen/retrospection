import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  upsertProjects,
  upsertSections,
  upsertTasks,
  insertTaskCompletion,
  inferRecurringCompletions,
  insertTaskSkippedDate,
  deleteTaskSkippedDatesFrom,
} from "../../sync/upsert";
import type { TodoistProject, TodoistSection, TodoistTask } from "../../todoist/types";

// We mock the DB at the module level — each upsert function takes a `db` parameter,
// so we build a mock that tracks calls.

const TABLE_NAME_SYM = Symbol.for("drizzle:Name");

function createMockDb() {
  const insertedValues: Record<string, unknown[]> = {};
  const conflictAction: Record<string, string> = {};

  const chainable = (tableName: string) => {
    const chain = {
      values: (vals: unknown) => {
        insertedValues[tableName] = Array.isArray(vals) ? vals : [vals];
        return chain;
      },
      onConflictDoUpdate: (opts: unknown) => {
        conflictAction[tableName] = "doUpdate";
        return chain;
      },
      onConflictDoNothing: () => {
        conflictAction[tableName] = "doNothing";
        return chain;
      },
    };
    return chain;
  };

  const deletedWhere: Record<string, unknown[]> = {};

  const deleteChainable = (tableName: string) => {
    const chain = {
      where: (condition: unknown) => {
        if (!deletedWhere[tableName]) deletedWhere[tableName] = [];
        deletedWhere[tableName].push(condition);
        return chain;
      },
    };
    return chain;
  };

  const db = {
    insert: vi.fn((table: Record<symbol, string>) => chainable(table[TABLE_NAME_SYM])),
    delete: vi.fn((table: Record<symbol, string>) => deleteChainable(table[TABLE_NAME_SYM])),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    })),
    _insertedValues: insertedValues,
    _conflictAction: conflictAction,
    _deletedWhere: deletedWhere,
  };

  return db;
}

const sampleProject: TodoistProject = {
  id: "p1",
  name: "Inbox",
  color: "blue",
  is_inbox_project: true,
  created_at: "2024-01-01T00:00:00Z",
};

const sampleSection: TodoistSection = {
  id: "s1",
  project_id: "p1",
  name: "Section A",
  order: 1,
};

const sampleTask: TodoistTask = {
  id: "t1",
  content: "Buy milk",
  description: "Whole milk",
  project_id: "p1",
  section_id: "s1",
  parent_id: null,
  priority: 1,
  labels: ["grocery"],
  due: null,
  is_completed: false,
  completed_at: null,
  created_at: "2024-01-01T00:00:00Z",
};

describe("upsertProjects", () => {
  it("inserts projects with onConflictDoUpdate", async () => {
    const db = createMockDb();
    await upsertProjects(db as never, [sampleProject]);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertedValues["projects"]).toHaveLength(1);
    expect(db._insertedValues["projects"][0]).toMatchObject({
      id: "p1",
      name: "Inbox",
      isInbox: true,
    });
    expect(db._conflictAction["projects"]).toBe("doUpdate");
  });

  it("does nothing for empty array", async () => {
    const db = createMockDb();
    await upsertProjects(db as never, []);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("upsertSections", () => {
  it("inserts sections with onConflictDoUpdate", async () => {
    const db = createMockDb();
    await upsertSections(db as never, [sampleSection]);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertedValues["sections"]).toHaveLength(1);
    expect(db._insertedValues["sections"][0]).toMatchObject({
      id: "s1",
      projectId: "p1",
      name: "Section A",
    });
    expect(db._conflictAction["sections"]).toBe("doUpdate");
  });
});

describe("upsertTasks", () => {
  it("inserts tasks with onConflictDoUpdate", async () => {
    const db = createMockDb();
    await upsertTasks(db as never, [sampleTask]);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertedValues["tasks"]).toHaveLength(1);
    expect(db._insertedValues["tasks"][0]).toMatchObject({
      id: "t1",
      content: "Buy milk",
      projectId: "p1",
      labels: ["grocery"],
    });
    expect(db._conflictAction["tasks"]).toBe("doUpdate");
  });

  it("maps due date fields from Todoist format", async () => {
    const db = createMockDb();
    const taskWithDue: TodoistTask = {
      ...sampleTask,
      due: {
        date: "2024-06-15",
        is_recurring: true,
        string: "every day",
        timezone: "America/Chicago",
      },
    };
    await upsertTasks(db as never, [taskWithDue]);

    const inserted = db._insertedValues["tasks"][0] as Record<string, unknown>;
    expect(inserted.dueDate).toBe("2024-06-15");
    expect(inserted.dueIsRecurring).toBe(true);
    expect(inserted.dueString).toBe("every day");
    expect(inserted.dueTimezone).toBe("America/Chicago");
  });

  it("handles null due date", async () => {
    const db = createMockDb();
    await upsertTasks(db as never, [sampleTask]);

    const inserted = db._insertedValues["tasks"][0] as Record<string, unknown>;
    expect(inserted.dueDate).toBeNull();
    expect(inserted.dueIsRecurring).toBe(false);
    expect(inserted.dueString).toBeNull();
    expect(inserted.dueTimezone).toBeNull();
  });
});

describe("insertTaskCompletion", () => {
  it("inserts with onConflictDoNothing for idempotency", async () => {
    const db = createMockDb();
    await insertTaskCompletion(db as never, {
      taskId: "t1",
      completedAt: new Date("2024-06-15T12:00:00Z"),
      completedDate: "2024-06-15",
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertedValues["task_completions"]).toHaveLength(1);
    expect(db._conflictAction["task_completions"]).toBe("doNothing");
  });

  it("allows null completedAt for recurring tasks", async () => {
    const db = createMockDb();
    await insertTaskCompletion(db as never, {
      taskId: "t1",
      completedAt: null,
      completedDate: "2024-06-15",
    });

    const inserted = db._insertedValues["task_completions"][0] as Record<string, unknown>;
    expect(inserted.completedAt).toBeNull();
    expect(inserted.completedDate).toBe("2024-06-15");
  });
});

describe("inferRecurringCompletions", () => {
  it("infers completion for recurring task with future due date", async () => {
    const db = createMockDb();
    // Task is recurring, due date is in the future (meaning it was completed today and advanced)
    const recurringTask: TodoistTask = {
      ...sampleTask,
      due: {
        date: "2099-01-02", // tomorrow / future = was completed today
        is_recurring: true,
        string: "every day",
      },
    };

    // Mock select to return empty (no existing completion for today)
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    }));

    const count = await inferRecurringCompletions(db as never, [recurringTask], "America/Chicago");

    // Should have tried to insert a task_completions row
    expect(db.insert).toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("skips non-recurring tasks", async () => {
    const db = createMockDb();
    const count = await inferRecurringCompletions(db as never, [sampleTask], "America/Chicago");
    expect(db.insert).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it("skips recurring tasks with past due dates", async () => {
    const db = createMockDb();
    const recurringTask: TodoistTask = {
      ...sampleTask,
      due: {
        date: "2020-01-01", // past — hasn't been completed recently
        is_recurring: true,
        string: "every day",
      },
    };

    const count = await inferRecurringCompletions(db as never, [recurringTask], "America/Chicago");
    expect(db.insert).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });
});

describe("insertTaskSkippedDate", () => {
  it("inserts with onConflictDoNothing for idempotency", async () => {
    const db = createMockDb();
    await insertTaskSkippedDate(db as never, { taskId: "t1", skippedDate: "2024-06-15" });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db._insertedValues["task_skipped_dates"]).toHaveLength(1);
    expect(db._insertedValues["task_skipped_dates"][0]).toMatchObject({
      taskId: "t1",
      skippedDate: "2024-06-15",
    });
    expect(db._conflictAction["task_skipped_dates"]).toBe("doNothing");
  });
});

describe("deleteTaskSkippedDatesFrom", () => {
  it("calls delete on task_skipped_dates with a where condition", async () => {
    const db = createMockDb();
    await deleteTaskSkippedDatesFrom(db as never, "t1", "2024-06-15");

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db._deletedWhere["task_skipped_dates"]).toHaveLength(1);
  });

  it("deletes using the correct table", async () => {
    const db = createMockDb();
    await deleteTaskSkippedDatesFrom(db as never, "t2", "2024-07-01");

    // delete was called once (on task_skipped_dates table)
    expect(db.delete).toHaveBeenCalledTimes(1);
    const [tableArg] = (db.delete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(tableArg[Symbol.for("drizzle:Name")]).toBe("task_skipped_dates");
  });
});
