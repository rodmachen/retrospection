# Plan: Skipped Dates Tracking for Habits

## Context

Todoist doesn't distinguish between a habit that was **missed** (due but not done) and one that was **skipped** (intentionally postponed). Currently the system only tracks Completed (a `task_completions` record exists) vs. no record. The user wants three states:

- **Completed** — completion record exists for that date
- **Missed** — no completion AND no skip record (task was due but not done)
- **Skipped** — user manually moved the due date forward (intentional postponement)

**How skips happen:** For a daily recurring task, completing it on Monday makes Todoist advance the due date to Tuesday. If the user then changes the due date to Wednesday, Tuesday is "skipped." This enables MWF-style scheduling for daily tasks.

## Design Decisions

1. **New `task_skipped_dates` table** mirrors `task_completions` (no `reason` field — unnecessary complexity)
2. **Skip detection only via `item:updated` webhook** — full sync (`seed.ts`) lacks old-state context; graceful degradation to "Missed" if a webhook is missed
3. **`item:completed` does NOT trigger skips** — Todoist auto-advancing the due date after completion is normal behavior, not a skip
4. **Skip date range:** old due date (inclusive) through new due date (exclusive). E.g., moving from Monday to Thursday → skip Mon, Tue, Wed
5. **Backward moves clean up skips:** when the due date moves backward, delete skip records on or after the new due date. This makes the system self-correcting (no max cap needed)
6. **Query uses dual LEFT JOIN** with Set-based deduplication to avoid cross-product duplicates; fine for typical 7-day views

---

## Step 0: Extract shared date utility ✅

**Model: Sonnet** | Tests-alongside

The `getTodayInTimezone` function is duplicated in `webhook.ts` and `upsert.ts`. Extract it and add a `getDatesBetween` helper needed for skip date generation.

**Files:**
- `src/utils/dates.ts` — new: export `getTodayInTimezone(tz)` and `getDatesBetween(start, end)` (start inclusive, end exclusive)
- `src/sync/webhook.ts` (line 54-56) — remove local function, import from utils
- `src/sync/upsert.ts` (line 164-166) — remove local function, import from utils
- `src/__tests__/utils/dates.test.ts` — new: test both functions (fake timers for timezone, various date ranges including same-day, adjacent, multi-day)

**Verify:** `npx vitest run` — full suite passes, no regressions from import change.

---

## Step 1: Schema — add `taskSkippedDates` table ✅

**Model: Sonnet** | Tests-alongside

**Files:**
- `src/db/schema.ts` — add table (mirrors `taskCompletions` pattern: serial PK, taskId FK, `skippedDate` date, `createdAt` timestamp, unique on `(taskId, skippedDate)`), add relations
- `src/__tests__/db/schema.test.ts` — add table name and column tests

**Verify:** `npx vitest run src/__tests__/db/schema.test.ts`

---

## Step 2: Upsert — add `insertTaskSkippedDate` function ✅

**Model: Sonnet** | TDD

Add insert and delete functions following `insertTaskCompletion` pattern (`src/sync/upsert.ts:113-129`).

**Files:**
- `src/sync/upsert.ts` — add:
  - `insertTaskSkippedDate(db, { taskId, skippedDate })` with `onConflictDoNothing`
  - `deleteTaskSkippedDatesFrom(db, taskId, fromDate)` — deletes skips where `skippedDate >= fromDate` (used for backward moves)
- `src/__tests__/sync/upsert.test.ts` — test insert values/conflict strategy, test delete calls correct where clause

**Verify:** `npx vitest run src/__tests__/sync/upsert.test.ts`

---

## Step 3: Webhook — detect skips on `item:updated` ✅

**Model: Opus** | TDD

Modify `handleItemUpsert` (`src/sync/webhook.ts:110-119`) to detect forward due date changes on recurring tasks.

**Logic (before the existing `upsertTasks` call):**
1. `SELECT dueDate, dueIsRecurring FROM tasks WHERE id = taskId`
2. Parse incoming `due.date` and `due.is_recurring` from eventData
3. Guard clauses → no action if: task not in DB, old dueDate null, not recurring (either old or new), incoming date = old date
4. **Forward move** (incoming > old): `getDatesBetween(oldDueDate, incomingDueDate)` → insert each as skip record
5. **Backward move** (incoming < old): `deleteTaskSkippedDatesFrom(db, taskId, incomingDueDate)` → remove invalidated skips
6. Proceed with normal `upsertTasks`

**Files:**
- `src/sync/webhook.ts` — modify `handleItemUpsert`, import `insertTaskSkippedDate`, `deleteTaskSkippedDatesFrom`, and `getDatesBetween`
- `src/__tests__/sync/webhook.test.ts` — 9 test cases:
  1. Creates skip records when recurring task due date moves forward
  2. No skips for non-recurring tasks
  3. No skips when task not in DB
  4. No skips when old dueDate is null
  5. No skips when dates are equal
  6. Single skip when dates one day apart
  7. **Backward move deletes skips on/after new date**
  8. **Backward move does not delete skips before new date**
  9. Upsert still called after both forward and backward moves

**Verify:** `npx vitest run src/__tests__/sync/webhook.test.ts`

---

## Step 4: Query — add `skippedDates` to habit completions ✅

**Model: Sonnet** | TDD

**Files:**
- `src/api/queries.ts` — in `queryHabitCompletions` (line 142): add second LEFT JOIN on `taskSkippedDates` (date-range filtered), add `skippedDate` to select, aggregate into `skippedDates[]` using Set deduplication, update `HabitRow` type
- `src/__tests__/api/queries.test.ts` — update existing tests to assert `skippedDates: []`, add tests for populated skipped dates and cross-product deduplication

**Verify:** `npx vitest run src/__tests__/api/queries.test.ts`

---

## Step 5: API endpoint — expose `skippedDates` ✅

**Model: Sonnet** | Tests-alongside

**Files:**
- `app/api/habits/completions/route.ts` — add `skippedDates: h.skippedDates` to response map (one line)

**Verify:** `npx vitest run` (full suite)

---

## Step 6: Generate and apply migration ✅

**Model: Sonnet**

1. `npx drizzle-kit generate` → review generated SQL in `./src/db/migrations/`
2. `npx drizzle-kit push` to apply
3. Verify table exists in database

---

## End-to-End Verification

1. All tests pass: `npx vitest run`
2. Type check: `npx tsc --noEmit`
3. Start dev server, curl the endpoint:
   ```
   GET /api/habits/completions?start=2026-03-29&end=2026-04-04
   ```
   Response should include `skippedDates` array (empty until real skip events flow in)
4. Simulate a skip: manually change a daily habit's due date forward in Todoist, verify webhook creates skip records and they appear in the API response
