export interface TodoistDue {
  date: string;
  is_recurring: boolean;
  string: string;
  datetime?: string;
  timezone?: string;
}

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
