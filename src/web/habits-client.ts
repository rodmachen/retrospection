// Server-side fetch helper for /api/habits/completions.
// Uses INTERNAL_BASE_URL (defaults to http://localhost:3000) so it works
// both in local dev and in environments where the external hostname is not
// reachable from within the same process.

export interface HabitCompletion {
  taskId: string;
  content: string;
  section: string;
  sectionOrder: number;
  labels: string[];
  description: string;
  createdDate: string;
  isActive: boolean;
  completionDates: string[];
  skippedDates: string[];
}

interface FetchParams {
  project?: string;
  start: string;
  end: string;
  cookie?: string;
}

export async function fetchHabitCompletions({
  project = "Habits",
  start,
  end,
  cookie,
}: FetchParams): Promise<HabitCompletion[]> {
  const base =
    process.env.INTERNAL_BASE_URL ?? "http://localhost:3000";
  const url = new URL("/api/habits/completions", base);
  url.searchParams.set("project", project);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const headers: Record<string, string> = {};
  if (cookie) {
    headers["cookie"] = cookie;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(
      `fetchHabitCompletions failed: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<HabitCompletion[]>;
}
