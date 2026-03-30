import type {
  TodoistProject,
  TodoistSection,
  TodoistTask,
  TodoistCompletedTask,
  SyncResponse,
  SyncProject,
  SyncSection,
  SyncItem,
} from "./types";

const SYNC_BASE = "https://api.todoist.com/sync/v9";

async function syncRequest(
  token: string,
  resourceTypes: string[]
): Promise<SyncResponse> {
  const response = await fetch(`${SYNC_BASE}/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sync_token: "*",
      resource_types: resourceTypes,
    }),
  });

  if (!response.ok) {
    throw new Error(`Todoist Sync API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<SyncResponse>;
}

function mapProject(p: SyncProject): TodoistProject {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    is_inbox_project: p.is_inbox_project,
    created_at: p.added_at,
  };
}

function mapSection(s: SyncSection): TodoistSection {
  return {
    id: s.id,
    project_id: s.project_id,
    name: s.name,
    order: s.section_order,
  };
}

function mapItem(item: SyncItem): TodoistTask {
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
    completed_at: item.date_completed ?? null,
    created_at: item.added_at,
  };
}

export async function fetchProjects(token: string): Promise<TodoistProject[]> {
  const data = await syncRequest(token, ["projects"]);
  return data.projects
    .filter((p) => !p.is_deleted && !p.is_archived)
    .map(mapProject);
}

export async function fetchSections(token: string): Promise<TodoistSection[]> {
  const data = await syncRequest(token, ["sections"]);
  return data.sections
    .filter((s) => !s.is_deleted && !s.is_archived)
    .map(mapSection);
}

export async function fetchActiveTasks(token: string): Promise<TodoistTask[]> {
  const data = await syncRequest(token, ["items"]);
  return data.items
    .filter((item) => !item.is_deleted && !item.checked)
    .map(mapItem);
}

export async function fetchCompletedTasks(
  _token: string,
  _sinceDays: number
): Promise<TodoistCompletedTask[]> {
  // Completed tasks API is no longer available (410 Gone on REST v2,
  // and the Sync API only returns active items). Return empty — the
  // webhook will capture all future completions.
  console.warn("Completed tasks backfill unavailable — webhook will capture future completions");
  return [];
}
