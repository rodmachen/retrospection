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

function mockSyncResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      sync_token: "abc123",
      projects: [],
      sections: [],
      items: [],
      ...overrides,
    }),
  };
}

describe("fetchProjects", () => {
  it("returns mapped projects from Sync API", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        projects: [
          {
            id: "1",
            name: "Inbox",
            color: "blue",
            is_inbox_project: true,
            is_deleted: false,
            is_archived: false,
            added_at: "2024-01-01T00:00:00Z",
          },
        ],
      })
    );

    const result = await fetchProjects(TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/sync/v9/sync",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Inbox");
    expect(result[0].is_inbox_project).toBe(true);
    expect(result[0].created_at).toBe("2024-01-01T00:00:00Z");
  });

  it("filters out deleted and archived projects", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        projects: [
          { id: "1", name: "Active", color: "blue", is_inbox_project: false, is_deleted: false, is_archived: false, added_at: "2024-01-01T00:00:00Z" },
          { id: "2", name: "Deleted", color: "red", is_inbox_project: false, is_deleted: true, is_archived: false, added_at: "2024-01-01T00:00:00Z" },
          { id: "3", name: "Archived", color: "green", is_inbox_project: false, is_deleted: false, is_archived: true, added_at: "2024-01-01T00:00:00Z" },
        ],
      })
    );

    const result = await fetchProjects(TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(fetchProjects(TOKEN)).rejects.toThrow("Todoist Sync API error: 401 Unauthorized");
  });
});

describe("fetchSections", () => {
  it("returns mapped sections from Sync API", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        sections: [
          { id: "s1", project_id: "p1", name: "Section A", section_order: 1, is_deleted: false, is_archived: false },
        ],
      })
    );

    const result = await fetchSections(TOKEN);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Section A");
    expect(result[0].order).toBe(1);
  });

  it("filters out deleted and archived sections", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        sections: [
          { id: "s1", project_id: "p1", name: "Active", section_order: 1, is_deleted: false, is_archived: false },
          { id: "s2", project_id: "p1", name: "Deleted", section_order: 2, is_deleted: true, is_archived: false },
        ],
      })
    );

    const result = await fetchSections(TOKEN);
    expect(result).toHaveLength(1);
  });
});

describe("fetchActiveTasks", () => {
  it("returns mapped active tasks from Sync API", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        items: [
          {
            id: "t1",
            content: "Buy milk",
            description: "",
            project_id: "p1",
            section_id: null,
            parent_id: null,
            priority: 1,
            labels: [],
            due: null,
            checked: false,
            date_completed: null,
            added_at: "2024-01-01T00:00:00Z",
            is_deleted: false,
          },
        ],
      })
    );

    const result = await fetchActiveTasks(TOKEN);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Buy milk");
    expect(result[0].is_completed).toBe(false);
    expect(result[0].created_at).toBe("2024-01-01T00:00:00Z");
  });

  it("filters out deleted and completed items", async () => {
    mockFetch.mockResolvedValueOnce(
      mockSyncResponse({
        items: [
          { id: "t1", content: "Active", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: false, date_completed: null, added_at: "2024-01-01T00:00:00Z", is_deleted: false },
          { id: "t2", content: "Completed", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: true, date_completed: "2024-06-15T12:00:00Z", added_at: "2024-01-01T00:00:00Z", is_deleted: false },
          { id: "t3", content: "Deleted", description: "", project_id: "p1", section_id: null, parent_id: null, priority: 1, labels: [], due: null, checked: false, date_completed: null, added_at: "2024-01-01T00:00:00Z", is_deleted: true },
        ],
      })
    );

    const result = await fetchActiveTasks(TOKEN);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });
});

describe("fetchCompletedTasks", () => {
  it("returns empty array (endpoint unavailable)", async () => {
    const result = await fetchCompletedTasks(TOKEN, 7);
    expect(result).toEqual([]);
    // Should not make any API calls
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
