# Habits Completions API Endpoint

## Context

The command-center daily briefing is being refactored to show a 7-day rolling habits display (see `command-center/docs/plans/briefing-refactor-4.md`). It needs an API endpoint that returns per-task completion data for the Habits project, grouped by section, for a given date range. No existing endpoint provides this — `/api/stats/completions` returns aggregated daily counts, and `/api/tasks` doesn't include completion history.

**Dependency:** This must be deployed before command-center's briefing refactor can be tested end-to-end.

---

## Step 1: New query function

**Model: Sonnet** | TDD

Add `queryHabitCompletions(db, projectName, startDate, endDate)` to `src/api/queries.ts`. Joins `tasks` → `projects` (by name), `tasks` → `task_completions` (by date range), and `tasks` → `sections` (for section name). Only top-level tasks (`parentId IS NULL`), excluding soft-deleted.

Returns: `{ taskId, content, sectionName, labels, description, isCompleted, deletedAt, completionDates[] }[]`

The flat SQL rows (one per task per completion date) are aggregated in JS into one object per task with a `completionDates` array. Tasks with no completions in the range are still returned (with empty array) so the consumer knows all active habits.

**Files modified:**
- `src/api/queries.ts` — new exported function
- `src/__tests__/api/queries.test.ts` — new tests

**Reuse:** Existing `Db` type, Drizzle operators (`eq`, `and`, `isNull`, `sql`), table imports from `src/db/schema.ts`. Follow patterns from `queryTasks()` and `queryCompletionStats()`.

**Verify:** `npx vitest run src/__tests__/api/queries.test.ts`

---

## Step 2: New API endpoint

**Model: Sonnet** | Tests-alongside

Create `GET /api/habits/completions` with query params:
- `project` — project name (default: `"Habits"`)
- `start` — start date YYYY-MM-DD (required)
- `end` — end date YYYY-MM-DD (required)

**Response shape:**
```json
[
  {
    "taskId": "abc123",
    "content": "🏋️ Cardio",
    "section": "Workout",
    "labels": ["Workout"],
    "description": "",
    "isActive": true,
    "completionDates": ["2026-04-01", "2026-04-03", "2026-04-04"]
  }
]
```

`isActive` = `isCompleted === false && deletedAt === null`. Already covered by existing Bearer auth middleware (matches `/api/((?!health|webhook).*)`).

**Files created:**
- `app/api/habits/completions/route.ts`

**Reuse:** Thin route handler pattern from `app/api/tasks/route.ts` and `app/api/stats/completions/route.ts`.

**Verify:** Deploy to Vercel. `curl -H "Authorization: Bearer $API_KEY" .../api/habits/completions?start=2026-03-29&end=2026-04-04` returns expected JSON.

---

## Critical Files

| File | Role |
|------|------|
| `src/api/queries.ts` | New `queryHabitCompletions()` function |
| `src/db/schema.ts` | Existing schema (tasks, task_completions, projects, sections) |
| `app/api/habits/completions/route.ts` | New endpoint (to create) |
| `app/api/tasks/route.ts` | Reference pattern for route handler |
