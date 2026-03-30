import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchProjects,
  fetchSections,
  fetchActiveTasks,
  fetchCompletedTasks,
} from "../../todoist/client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TOKEN = "test-token";

beforeEach(() => {
  mockFetch.mockReset();
});

function paginatedResponse(results: unknown[], nextCursor: string | null = null) {
  return { ok: true, json: async () => ({ results, next_cursor: nextCursor }) };
}

function completedResponse(items: unknown[], nextCursor: string | null = null) {
  return { ok: true, json: async () => ({ items, next_cursor: nextCursor }) };
}

describe("fetchProjects", () => {
  it("returns mapped projects from API v1", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        {
          id: "1", name: "Inbox", color: "blue",
          inbox_project: true, is_deleted: false, is_archived: false,
          created_at: "2024-01-01T00:00:00Z",
        },
      ])
    );

    const result = await fetchProjects(TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.todoist.com/api/v1/projects"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Inbox");
    expect(result[0].is_inbox_project).toBe(true);
  });

  it("filters out deleted and archived projects", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        { id: "1", name: "Active", color: "blue", inbox_project: false, is_deleted: false, is_archived: false, created_at: "2024-01-01T00:00:00Z" },
        { id: "2", name: "Deleted", color: "red", inbox_project: false, is_deleted: true, is_archived: false, created_at: "2024-01-01T00:00:00Z" },
        { id: "3", name: "Archived", color: "green", inbox_project: false, is_deleted: false, is_archived: true, created_at: "2024-01-01T00:00:00Z" },
      ])
    );

    const result = await fetchProjects(TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("paginates through multiple pages", async () => {
    mockFetch
      .mockResolvedValueOnce(
        paginatedResponse(
          [{ id: "1", name: "P1", color: "blue", inbox_project: false, is_deleted: false, is_archived: false, created_at: "2024-01-01T00:00:00Z" }],
          "cursor-page2"
        )
      )
      .mockResolvedValueOnce(
        paginatedResponse([
          { id: "2", name: "P2", color: "red", inbox_project: false, is_deleted: false, is_archived: false, created_at: "2024-01-01T00:00:00Z" },
        ])
      );

    const result = await fetchProjects(TOKEN);
    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should include cursor
    expect(mockFetch.mock.calls[1][0]).toContain("cursor=cursor-page2");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(fetchProjects(TOKEN)).rejects.toThrow("Todoist API error: 401 Unauthorized");
  });
});

describe("fetchSections", () => {
  it("returns mapped sections from API v1", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        { id: "s1", project_id: "p1", name: "Section A", section_order: 1, is_deleted: false, is_archived: false, added_at: "2024-01-01T00:00:00Z" },
      ])
    );

    const result = await fetchSections(TOKEN);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Section A");
    expect(result[0].order).toBe(1);
  });

  it("filters out deleted and archived sections", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        { id: "s1", project_id: "p1", name: "Active", section_order: 1, is_deleted: false, is_archived: false, added_at: "2024-01-01T00:00:00Z" },
        { id: "s2", project_id: "p1", name: "Deleted", section_order: 2, is_deleted: true, is_archived: false, added_at: "2024-01-01T00:00:00Z" },
      ])
    );

    const result = await fetchSections(TOKEN);
    expect(result).toHaveLength(1);
  });
});

describe("fetchActiveTasks", () => {
  it("returns mapped active tasks from API v1", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        {
          id: "t1", content: "Buy milk", description: "",
          project_id: "p1", section_id: null, parent_id: null,
          priority: 1, labels: [], due: null,
          checked: false, is_deleted: false,
          completed_at: null, added_at: "2024-01-01T00:00:00Z",
        },
      ])
    );

    const result = await fetchActiveTasks(TOKEN);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Buy milk");
    expect(result[0].is_completed).toBe(false);
    expect(result[0].created_at).toBe("2024-01-01T00:00:00Z");
  });

  it("filters out deleted and completed items", async () => {
    mockFetch.mockResolvedValueOnce(
      paginatedResponse([
        { id: "t1", content: "Active", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: false, is_deleted: false, completed_at: null, added_at: "2024-01-01T00:00:00Z" },
        { id: "t2", content: "Completed", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: true, is_deleted: false, completed_at: "2024-06-15T12:00:00Z", added_at: "2024-01-01T00:00:00Z" },
        { id: "t3", content: "Deleted", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: false, is_deleted: true, completed_at: null, added_at: "2024-01-01T00:00:00Z" },
      ])
    );

    const result = await fetchActiveTasks(TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });
});

describe("fetchCompletedTasks", () => {
  it("fetches completed tasks from by_completion_date endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      completedResponse([
        {
          id: "t1", content: "Done task",
          project_id: "p1", section_id: null,
          completed_at: "2024-06-15T12:00:00Z",
          description: "", parent_id: null, priority: 1, labels: [],
          due: null, checked: true, is_deleted: false, added_at: "2024-01-01T00:00:00Z",
        },
      ])
    );

    const result = await fetchCompletedTasks(TOKEN, 7);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api/v1/tasks/completed/by_completion_date"),
      expect.anything()
    );
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("since=");
    expect(calledUrl).toContain("until=");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Done task");
    expect(result[0].task_id).toBe("t1");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(fetchCompletedTasks(TOKEN, 7)).rejects.toThrow("Todoist API error: 403 Forbidden");
  });
});
