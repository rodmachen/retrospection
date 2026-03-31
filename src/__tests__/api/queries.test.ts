import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  queryTasks,
  queryTaskById,
  queryProjects,
  queryCompletionStats,
  queryLatestSync,
} from "../../api/queries";

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

const sampleTask = {
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
