import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
  TodoistCompletedTask,
} from "./types";

const REST_BASE = "https://api.todoist.com/rest/v2";
const SYNC_BASE = "https://api.todoist.com/sync/v9";

async function apiGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function apiGetWithFallback<T>(
  url: string,
  token: string,
  fallback: T,
  label: string
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 410) {
    console.warn(`${label} returned 410 Gone — skipping`);
    return fallback;
  }

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchProjects(token: string): Promise<TodoistProject[]> {
  return apiGetWithFallback<TodoistProject[]>(
    `${REST_BASE}/projects`,
    token,
    [],
    "Projects API"
  );
}

export async function fetchSections(token: string): Promise<TodoistSection[]> {
  return apiGetWithFallback<TodoistSection[]>(
    `${REST_BASE}/sections`,
    token,
    [],
    "Sections API"
  );
}

export async function fetchActiveTasks(token: string): Promise<TodoistTask[]> {
  return apiGet<TodoistTask[]>(`${REST_BASE}/tasks`, token);
}

export async function fetchCompletedTasks(
  token: string,
  sinceDays: number
): Promise<TodoistCompletedTask[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceIso = since.toISOString();

  const url = `${SYNC_BASE}/items/completed/get_all?since=${encodeURIComponent(sinceIso)}&limit=200`;

  const items = await apiGetWithFallback<{ items: TodoistCompletedTask[] } | null>(
    url,
    token,
    null,
    "Completed tasks API"
  );
  return items?.items ?? [];
}
