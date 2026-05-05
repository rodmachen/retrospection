# Completions Fix, Backfill, and API Query Enhancements

## Context

Three related issues need addressing:

1. **Missing completions** — The `task_completions` table is missing many entries compared to the Todoist Activity Log. The gaps come from (a) recurring tasks whose webhook completions were silently dropped due to stale due dates in the DB, and (b) the user deleting and recreating tasks with the same names, leaving old task IDs with completions that don't map to current tasks.

2. **Recurring task webhook bug** — When `handleItemCompleted` processes a recurring task, it reads the old `dueDate` from the DB. If that date is stale (matches an already-recorded completion), `onConflictDoNothing` silently drops the new completion. This means future recurring completions are still at risk.

3. **Frontend queries** — The frontend needs: list of projects, list of tasks (with subtasks) by project, and list of all tasks. Projects endpoint exists. Task queries exist but don't handle subtask nesting via `parentId`.

---

## Step 1: Fix recurring task webhook completion handler ✅

**Model: Opus** | TDD | Files: `src/sync/webhook.ts`, `src/__tests__/sync/webhook.test.ts`

**The bug:** In `handleItemCompleted` (webhook.ts:130-151), the handler reads `oldDueDate` from the DB. If the DB is stale (e.g., seed captured the task before that day's completion), `oldDueDate` matches an already-completed date. The insert hits the unique constraint and `onConflictDoNothing` silently drops it.

**The fix:** The webhook `event_data.due.date` contains the NEW (advanced) due date. Compare it against the stored due date:
- If old due date **differs** from new due date → use old due date (normal case, existing behavior)
- If old due date **equals** new due date (stale DB) or task not found → fall back to `getTodayInTimezone(timezone)`

**Tests to add:**
1. Stale DB case: old `dueDate` equals incoming `due.date` → falls back to today
2. Task not in DB at all → falls back to today
3. Existing test (old dueDate differs from incoming) → continues using old dueDate (no change)

**Verify:** `npm run typecheck` and `npm test` pass. New test cases cover the stale-DB scenario.

---

## Step 2: Backfill missing completions from activity log ✅

**Model: Sonnet** | Tests-alongside | Files: `scripts/backfill-completions.ts`

One-time script to insert missing `task_completions` rows identified by comparing the Todoist Activity Log against the DB. Uses `insertTaskCompletion` (which has `onConflictDoNothing`) for idempotency.

**Missing completions to insert (mapped to current task IDs):**

| Date | Task | Task ID |
|------|------|---------|
| 2026-03-31 | 🔵 Marais | 6gF8fgQjV5V68wqQ |
| 2026-03-31 | 🟦 Writing | 6g8hpWJ9Wvxg285G |
| 2026-03-30 | 🟦 Cardio | 6gF7xHfPrqW6rH5Q |
| 2026-03-29 | 🟦 Writing | 6g8hpWJ9Wvxg285G |
| 2026-03-29 | 🔵 Marais | 6gF8fgQjV5V68wqQ |
| 2026-03-29 | 🔵 Taking Charge | 6gF8jXqVQjhf7PQQ |
| 2026-03-27 | 🔵 Marais | 6gF8fgQjV5V68wqQ |
| 2026-03-27 | 🔵 Taking Charge | 6gF8jXqVQjhf7PQQ |
| 2026-03-27 | React Course | 6gG66F5MqqH4h6RC |
| 2026-03-27 | 🟦 Writing | 6g8hpWJ9Wvxg285G |
| 2026-03-26 | 🔵 Taking Charge | 6gF8jXqVQjhf7PQQ |
| 2026-03-26 | 🟦 Writing | 6g8hpWJ9Wvxg285G |
| 2026-03-26 | 🟦 Strength | 6gF7xH5q4QRRMmWQ |
| 2026-03-26 | 🔵 Marais | 6gF8fgQjV5V68wqQ |

**Skipped (task not in DB / deleted / not needed):**
- 🟦 Les Devoirs — deleted from Todoist, not in tasks table
- test, test1, test2, test3 — test tasks, not needed
- Old "Marais" (without emoji) — deleted, recreated as 🔵 Marais
- Workout (Mar 26) — exists in Basics project but activity log shows Habits; unclear mapping

All inserted with `completedAt: null` (no exact timestamps from activity log). Script prints summary of inserts vs skips.

**Verify:** Run `npx tsx scripts/backfill-completions.ts` → outputs insert count. Query DB to confirm completions added. Run again → 0 new inserts (idempotent).

---

## Step 3: Add parentId index and subtask nesting to task queries ✅

**Model: Sonnet** | TDD for nesting logic, tests-alongside for route wiring

**Files:** `src/db/schema.ts`, `src/api/queries.ts`, `src/__tests__/api/queries.test.ts`, `app/api/tasks/route.ts`

### 3a: Add parentId index

Add `index("tasks_parent_id_idx").on(table.parentId)` to the tasks table indexes in `src/db/schema.ts`. Apply with `npx drizzle-kit push`.

### 3b: Add subtask nesting

1. **New pure function** `nestSubtasks(tasks[])` in `src/api/queries.ts`:
   - Takes flat task array, returns parent tasks with `subtasks: []` arrays
   - Parent = `parentId` is null; subtask = `parentId` is non-null
   - Orphan subtasks (parent not in result) appear at top level

2. **Update `queryTasks`** to support a `nested` filter:
   - When `nested: true`, fetch parent tasks matching filters, then fetch their subtasks separately, combine via `nestSubtasks`
   - `limit`/`offset` apply to parent tasks only; subtasks always included

3. **Update route** `app/api/tasks/route.ts`: add `?nested=true` query param

4. **Tests** for `nestSubtasks`: parents with children nested, orphan subtasks at top level, empty input

**Verify:** `npm run typecheck` and `npm test` pass. `curl /api/tasks?projectId=X&nested=true` returns tasks with subtasks nested. `curl /api/tasks` (without nested) returns flat list (unchanged behavior).

---

## Verification (end-to-end)

1. Webhook fix: complete a recurring task in Todoist → check `task_completions` has today's date
2. Backfill: `SELECT completed_date, t.content FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE t.content LIKE '%Writing%' ORDER BY completed_date;` → shows Mar 26-31
3. API: `curl -H "Authorization: Bearer $API_KEY" /api/tasks?projectId=6gF283Vm6P7X48mx&nested=true` → Habits tasks with subtasks
