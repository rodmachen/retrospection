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

describe("fetchProjects", () => {
  it("returns array of projects", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "1", name: "Inbox", color: "blue", is_inbox_project: true, created_at: "2024-01-01T00:00:00Z" },
      ],
    });

    const result = await fetchProjects(TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/rest/v2/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Inbox");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(fetchProjects(TOKEN)).rejects.toThrow("Todoist API error: 401 Unauthorized");
  });
});

describe("fetchSections", () => {
  it("returns array of sections", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "s1", project_id: "p1", name: "Section A", order: 1 },
      ],
    });

    const result = await fetchSections(TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/rest/v2/sections",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Section A");
  });
});

describe("fetchActiveTasks", () => {
  it("returns array of active tasks", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
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
          is_completed: false,
          completed_at: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    const result = await fetchActiveTasks(TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.todoist.com/rest/v2/tasks",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Buy milk");
  });
});

describe("fetchCompletedTasks", () => {
  it("fetches completed tasks for given days", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            task_id: "t1",
            content: "Done task",
            project_id: "p1",
            section_id: null,
            completed_at: "2024-01-07T12:00:00Z",
            id: "c1",
          },
        ],
      }),
    });

    const result = await fetchCompletedTasks(TOKEN, 7);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://api.todoist.com/sync/v9/items/completed/get_all"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("since=");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Done task");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(fetchCompletedTasks(TOKEN, 7)).rejects.toThrow("Todoist API error: 403 Forbidden");
  });
});
