// Todoist API v1 raw response types

export interface TodoistDue {
  date: string;
  is_recurring: boolean;
  string: string;
  datetime?: string;
  timezone?: string | null;
  lang?: string;
}

/** API v1 project object (PersonalProjectSyncView) */
export interface ApiProject {
  id: string;
  name: string;
  color: string;
  inbox_project: boolean;
  is_deleted: boolean;
  is_archived: boolean;
  created_at: string | null;
}

/** API v1 section object (SectionSyncView) */
export interface ApiSection {
  id: string;
  project_id: string;
  name: string;
  section_order: number;
  is_deleted: boolean;
  is_archived: boolean;
  added_at: string;
}

/** API v1 task object (ItemSyncView) */
export interface ApiTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  priority: number;
  labels: string[];
  due: TodoistDue | null;
  checked: boolean;
  is_deleted: boolean;
  completed_at: string | null;
  added_at: string | null;
}

// Internal normalized types (used throughout the app)

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  is_inbox_project: boolean;
  created_at: string;
}

export interface TodoistSection {
  id: string;
  project_id: string;
  name: string;
  order: number;
}

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  priority: number;
  labels: string[];
  due: TodoistDue | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TodoistCompletedTask {
  task_id: string;
  content: string;
  project_id: string;
  section_id: string | null;
  completed_at: string;
  id: string;
}

/** Cursor-paginated response (projects, sections, tasks) */
export interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
}

/** Completed tasks response uses "items" not "results" */
export interface CompletedTasksResponse {
  items: ApiTask[];
  next_cursor: string | null;
}
