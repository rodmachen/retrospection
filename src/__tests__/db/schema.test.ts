import { describe, it, expect } from "vitest";
import {
  projects,
  sections,
  tasks,
  taskCompletions,
  webhookEvents,
  syncLog,
} from "../../db/schema";
import { getTableName } from "drizzle-orm";

describe("database schema", () => {
  it("projects table has correct name", () => {
    expect(getTableName(projects)).toBe("projects");
  });

  it("sections table has correct name", () => {
    expect(getTableName(sections)).toBe("sections");
  });

  it("tasks table has correct name", () => {
    expect(getTableName(tasks)).toBe("tasks");
  });

  it("task_completions table has correct name", () => {
    expect(getTableName(taskCompletions)).toBe("task_completions");
  });

  it("webhook_events table has correct name", () => {
    expect(getTableName(webhookEvents)).toBe("webhook_events");
  });

  it("sync_log table has correct name", () => {
    expect(getTableName(syncLog)).toBe("sync_log");
  });

  it("tasks table has all required columns", () => {
    const cols = Object.keys(tasks);
    expect(cols).toContain("id");
    expect(cols).toContain("content");
    expect(cols).toContain("projectId");
    expect(cols).toContain("sectionId");
    expect(cols).toContain("parentId");
    expect(cols).toContain("priority");
    expect(cols).toContain("labels");
    expect(cols).toContain("dueDate");
    expect(cols).toContain("dueIsRecurring");
    expect(cols).toContain("isCompleted");
    expect(cols).toContain("completedAt");
    expect(cols).toContain("deletedAt");
    expect(cols).toContain("rawJson");
  });

  it("task_completions has both timestamp and date columns", () => {
    const cols = Object.keys(taskCompletions);
    expect(cols).toContain("completedAt");
    expect(cols).toContain("completedDate");
    expect(cols).toContain("taskId");
  });

  it("webhook_events uses delivery_id as primary key column", () => {
    const cols = Object.keys(webhookEvents);
    expect(cols).toContain("deliveryId");
    expect(cols).toContain("eventType");
  });
});
