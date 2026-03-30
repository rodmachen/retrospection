import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
  TodoistCompletedTask,
  ApiProject,
  ApiSection,
  ApiTask,
  PaginatedResponse,
  CompletedTasksResponse,
} from "./types";

const BASE = "https://api.todoist.com/api/v1";

async function apiGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Todoist API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch all pages from a cursor-paginated endpoint.
 * Works for endpoints that return { results: T[], next_cursor: string | null }.
 */
async function fetchAllPages<T>(
  baseUrl: string,
  token: string
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;

  do {
    const url: string = cursor
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}cursor=${cursor}`
      : baseUrl;
    const page: PaginatedResponse<T> = await apiGet<PaginatedResponse<T>>(url, token);
    all.push(...page.results);
    cursor = page.next_cursor;
  } while (cursor);

  return all;
}

// --- Mapping from API v1 types to internal types ---

function mapProject(p: ApiProject): TodoistProject {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    is_inbox_project: p.inbox_project,
    created_at: p.created_at ?? new Date().toISOString(),
  };
}

function mapSection(s: ApiSection): TodoistSection {
  return {
    id: s.id,
    project_id: s.project_id,
    name: s.name,
    order: s.section_order,
  };
}

function mapTask(item: ApiTask): TodoistTask {
  return {
    id: item.id,
    content: item.content,
    description: item.description ?? "",
    project_id: item.project_id,
    section_id: item.section_id || null,
    parent_id: item.parent_id || null,
    priority: item.priority,
    labels: item.labels ?? [],
    due: item.due ?? null,
    is_completed: item.checked,
    completed_at: item.completed_at ?? null,
    created_at: item.added_at ?? new Date().toISOString(),
  };
}

// --- Public API ---

export async function fetchProjects(
  token: string
): Promise<TodoistProject[]> {
  const raw = await fetchAllPages<ApiProject>(
    `${BASE}/projects?limit=200`,
    token
  );
  return raw
    .filter((p) => !p.is_deleted && !p.is_archived)
    .map(mapProject);
}

export async function fetchSections(
  token: string
): Promise<TodoistSection[]> {
  const raw = await fetchAllPages<ApiSection>(
    `${BASE}/sections?limit=200`,
    token
  );
  return raw
    .filter((s) => !s.is_deleted && !s.is_archived)
    .map(mapSection);
}

export async function fetchActiveTasks(
  token: string
): Promise<TodoistTask[]> {
  const raw = await fetchAllPages<ApiTask>(
    `${BASE}/tasks?limit=200`,
    token
  );
  return raw
    .filter((item) => !item.is_deleted && !item.checked)
    .map(mapTask);
}

export async function fetchCompletedTasks(
  token: string,
  sinceDays: number
): Promise<TodoistCompletedTask[]> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
    limit: "200",
  });

  const all: ApiTask[] = [];
  let cursor: string | null = null;

  do {
    const url: string = cursor
      ? `${BASE}/tasks/completed/by_completion_date?${params}&cursor=${cursor}`
      : `${BASE}/tasks/completed/by_completion_date?${params}`;
    const page: CompletedTasksResponse = await apiGet<CompletedTasksResponse>(url, token);
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);

  return all.map((item) => ({
    task_id: item.id,
    id: item.id,
    content: item.content,
    project_id: item.project_id,
    section_id: item.section_id,
    completed_at: item.completed_at ?? new Date().toISOString(),
  }));
}

/**
 * Fetch all projects, sections, and active tasks.
 * Convenience function for the seed script.
 */
export async function syncAll(token: string): Promise<{
  projects: TodoistProject[];
  sections: TodoistSection[];
  activeTasks: TodoistTask[];
}> {
  const [projects, sections, activeTasks] = await Promise.all([
    fetchProjects(token),
    fetchSections(token),
    fetchActiveTasks(token),
  ]);
  return { projects, sections, activeTasks };
}
