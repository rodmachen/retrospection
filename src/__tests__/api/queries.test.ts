import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  queryTasks,
  queryTaskById,
  queryProjects,
  queryCompletionStats,
  queryLatestSync,
  nestSubtasks,
  queryHabitCompletions,
} from "../../api/queries";
import type { tasks } from "../../db/schema";

type TaskRow = typeof tasks.$inferSelect;

const TABLE_NAME_SYM = Symbol.for("drizzle:Name");

function makeCol(name: string) {
  const col = { _: { name } };
  return col;
}

function createMockDb(returnValue: unknown = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(returnValue)),
  };

  const chainFn = () => chain;
  // Make the chain thenable (a Promise-like)
  Object.assign(chain, {
    [Symbol.toStringTag]: "MockChain",
  });

  return {
    select: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

const sampleTask: TaskRow = {
  id: "t1",
  content: "Buy milk",
  description: null,
  projectId: "p1",
  sectionId: null,
  parentId: null,
  priority: 1,
  labels: [],
  dueDate: null,
  dueIsRecurring: false,
  dueString: null,
  dueTimezone: null,
  isCompleted: false,
  completedAt: null,
  deletedAt: null,
  todoistCreatedAt: null,
  firstSeenAt: new Date(),
  lastSyncedAt: new Date(),
  rawJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("queryTasks", () => {
  it("calls select with correct chain", async () => {
    const db = createMockDb([sampleTask]);

    const result = await queryTasks(db as never, {});

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual([sampleTask]);
  });

  it("accepts completed filter", async () => {
    const db = createMockDb([sampleTask]);
    const result = await queryTasks(db as never, { completed: true });
    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual([sampleTask]);
  });

  it("accepts projectId filter", async () => {
    const db = createMockDb([sampleTask]);
    const result = await queryTasks(db as never, { projectId: "p1" });
    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual([sampleTask]);
  });

  it("accepts limit and offset", async () => {
    const db = createMockDb([sampleTask]);
    const result = await queryTasks(db as never, { limit: 10, offset: 20 });
    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual([sampleTask]);
  });
});

describe("queryTaskById", () => {
  it("returns task when found", async () => {
    const db = createMockDb([sampleTask]);
    const result = await queryTaskById(db as never, "t1");
    expect(result).toEqual(sampleTask);
  });

  it("returns null when not found", async () => {
    const db = createMockDb([]);
    const result = await queryTaskById(db as never, "missing");
    expect(result).toBeNull();
  });
});

describe("queryProjects", () => {
  it("returns projects list", async () => {
    const project = {
      id: "p1",
      name: "Inbox",
      isInbox: true,
      color: "blue",
      deletedAt: null,
      taskCount: 5,
    };
    const db = createMockDb([project]);
    const result = await queryProjects(db as never);
    expect(result).toEqual([project]);
  });
});

describe("queryCompletionStats", () => {
  it("returns daily completion counts", async () => {
    const stats = [
      { completedDate: "2024-06-15", count: 3 },
      { completedDate: "2024-06-14", count: 5 },
    ];
    const db = createMockDb(stats);
    const result = await queryCompletionStats(db as never, 7);
    expect(result).toEqual(stats);
  });
});

describe("nestSubtasks", () => {
  const makeTask = (overrides: Partial<typeof sampleTask>) => ({
    ...sampleTask,
    ...overrides,
  });

  it("returns empty array for empty input", () => {
    expect(nestSubtasks([])).toEqual([]);
  });

  it("returns parent tasks with empty subtasks array when no subtasks", () => {
    const parent = makeTask({ id: "p1", parentId: null });
    const result = nestSubtasks([parent]);
    expect(result).toEqual([{ ...parent, subtasks: [] }]);
  });

  it("nests subtasks under their parent", () => {
    const parent = makeTask({ id: "p1", parentId: null });
    const child = makeTask({ id: "c1", parentId: "p1" });
    const result = nestSubtasks([parent, child]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
    expect(result[0].subtasks).toEqual([{ ...child, subtasks: [] }]);
  });

  it("nests multiple subtasks under the same parent", () => {
    const parent = makeTask({ id: "p1", parentId: null });
    const child1 = makeTask({ id: "c1", parentId: "p1" });
    const child2 = makeTask({ id: "c2", parentId: "p1" });
    const result = nestSubtasks([parent, child1, child2]);
    expect(result).toHaveLength(1);
    expect(result[0].subtasks).toHaveLength(2);
  });

  it("places orphan subtasks (parent not in array) at top level with empty subtasks", () => {
    const orphan = makeTask({ id: "c1", parentId: "missing-parent" });
    const result = nestSubtasks([orphan]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].subtasks).toEqual([]);
  });

  it("handles multiple parents each with their own subtasks", () => {
    const parent1 = makeTask({ id: "p1", parentId: null });
    const parent2 = makeTask({ id: "p2", parentId: null });
    const child1 = makeTask({ id: "c1", parentId: "p1" });
    const child2 = makeTask({ id: "c2", parentId: "p2" });
    const result = nestSubtasks([parent1, parent2, child1, child2]);
    expect(result).toHaveLength(2);
    const r1 = result.find((t) => t.id === "p1")!;
    const r2 = result.find((t) => t.id === "p2")!;
    expect(r1.subtasks.map((s) => s.id)).toEqual(["c1"]);
    expect(r2.subtasks.map((s) => s.id)).toEqual(["c2"]);
  });

  it("nests grandchildren under their parent child (multi-level)", () => {
    const parent = makeTask({ id: "p1", parentId: null });
    const child = makeTask({ id: "c1", parentId: "p1" });
    const grandchild = makeTask({ id: "gc1", parentId: "c1" });
    const result = nestSubtasks([parent, child, grandchild]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
    expect(result[0].subtasks).toHaveLength(1);
    expect(result[0].subtasks[0].id).toBe("c1");
    expect(result[0].subtasks[0].subtasks).toHaveLength(1);
    expect(result[0].subtasks[0].subtasks[0].id).toBe("gc1");
  });
});

describe("queryHabitCompletions", () => {
  it("returns empty array when no tasks", async () => {
    const db = createMockDb([]);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toEqual([]);
  });

  it("returns task with completion dates grouped", async () => {
    const rows = [
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: ["Workout"], description: null, completedDate: "2026-03-29", skippedDate: null },
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: ["Workout"], description: null, completedDate: "2026-04-01", skippedDate: null },
    ];
    const db = createMockDb(rows);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe("t1");
    expect(result[0].completionDates).toEqual(["2026-03-29", "2026-04-01"]);
    expect(result[0].skippedDates).toEqual([]);
  });

  it("returns task with empty completionDates when no completions in range", async () => {
    const rows = [
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: [], description: null, completedDate: null, skippedDate: null },
    ];
    const db = createMockDb(rows);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toHaveLength(1);
    expect(result[0].completionDates).toEqual([]);
    expect(result[0].skippedDates).toEqual([]);
  });

  it("groups multiple tasks with their own completion dates", async () => {
    const rows = [
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: [], description: null, completedDate: "2026-04-01", skippedDate: null },
      { taskId: "t2", content: "Strength", sectionName: "Workout", labels: [], description: null, completedDate: "2026-04-02", skippedDate: null },
      { taskId: "t2", content: "Strength", sectionName: "Workout", labels: [], description: null, completedDate: "2026-04-03", skippedDate: null },
    ];
    const db = createMockDb(rows);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toHaveLength(2);
    const t1 = result.find((r) => r.taskId === "t1")!;
    const t2 = result.find((r) => r.taskId === "t2")!;
    expect(t1.completionDates).toEqual(["2026-04-01"]);
    expect(t2.completionDates).toEqual(["2026-04-02", "2026-04-03"]);
    expect(t1.skippedDates).toEqual([]);
    expect(t2.skippedDates).toEqual([]);
  });

  it("returns task with skipped dates populated", async () => {
    const rows = [
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: [], description: null, completedDate: "2026-04-01", skippedDate: "2026-03-30" },
      { taskId: "t1", content: "Cardio", sectionName: "Workout", labels: [], description: null, completedDate: null, skippedDate: "2026-03-31" },
    ];
    const db = createMockDb(rows);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toHaveLength(1);
    expect(result[0].completionDates).toEqual(["2026-04-01"]);
    expect(result[0].skippedDates).toEqual(["2026-03-30", "2026-03-31"]);
  });

  it("deduplicates via Set when cross-product produces repeated dates", async () => {
    // Two completions × two skips = 4 rows, but unique dates should be preserved
    const rows = [
      { taskId: "t1", content: "Cardio", sectionName: null, labels: [], description: null, completedDate: "2026-04-01", skippedDate: "2026-03-30" },
      { taskId: "t1", content: "Cardio", sectionName: null, labels: [], description: null, completedDate: "2026-04-02", skippedDate: "2026-03-30" },
      { taskId: "t1", content: "Cardio", sectionName: null, labels: [], description: null, completedDate: "2026-04-01", skippedDate: "2026-03-31" },
      { taskId: "t1", content: "Cardio", sectionName: null, labels: [], description: null, completedDate: "2026-04-02", skippedDate: "2026-03-31" },
    ];
    const db = createMockDb(rows);
    const result = await queryHabitCompletions(db as never, "Habits", "2026-03-29", "2026-04-04");
    expect(result).toHaveLength(1);
    // Despite 4 rows, each date should appear only once
    expect(result[0].completionDates).toEqual(["2026-04-01", "2026-04-02"]);
    expect(result[0].skippedDates).toEqual(["2026-03-30", "2026-03-31"]);
  });
});

describe("queryLatestSync", () => {
  it("returns latest sync log entry", async () => {
    const syncEntry = {
      id: 1,
      type: "seed",
      startedAt: new Date(),
      completedAt: new Date(),
      status: "success",
      tasksSynced: 42,
      errorMessage: null,
      metadata: null,
    };
    const db = createMockDb([syncEntry]);
    const result = await queryLatestSync(db as never);
    expect(result).toEqual(syncEntry);
  });

  it("returns null when no sync log entries", async () => {
    const db = createMockDb([]);
    const result = await queryLatestSync(db as never);
    expect(result).toBeNull();
  });
});
