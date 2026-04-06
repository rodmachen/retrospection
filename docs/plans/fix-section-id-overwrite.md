# Fix: Seed overwrites section_id for recurring tasks

## Context

The `/api/habits/completions` endpoint returns `section: null` for tasks in the "Coding Studies" section (e.g. "React Course"), causing the briefing to group them under "General" instead.

**Root cause:** In `src/sync/seed.ts:57-69`, the completed-tasks loop hardcodes `section_id: null` when upserting task stubs. For recurring tasks that appear in both the active tasks list and the completed tasks history (last 7 days), the completed-task upsert runs second and overwrites the correct `section_id` set by the active-task upsert.

**Files to modify:**
- `src/sync/seed.ts` — skip task upsert for completed tasks that already exist
- `src/__tests__/sync/seed.test.ts` — add regression test

## Steps

### Step 1: Fix seed to skip upsert for existing tasks (TDD) — **Sonnet** ✅

**Files:** `src/__tests__/sync/seed.test.ts`, `src/sync/seed.ts`

1a. **Test first:** Add a test where a recurring task appears in both `syncAll.activeTasks` and `fetchCompletedTasks` (same task ID). Assert that `upsertTasks` is NOT called with `section_id: null` for that task — the active task's data should be preserved.

1b. **Implement:** In `seed.ts`, collect the active task IDs into a `Set` after upserting them. In the completed-tasks loop, skip the `upsertTasks` call if the task ID is already in the set. The `insertTaskCompletion` call still runs — only the task-stub upsert is skipped.

```typescript
// After upsertTasks(db, apiActiveTasks):
const activeTaskIds = new Set(apiActiveTasks.map((t) => t.id));

// In the completed-tasks loop:
if (!activeTaskIds.has(ct.task_id)) {
  await upsertTasks(db, [{ ... }]);
}
await insertTaskCompletion(db, { ... });
```

**Verify:** `npx vitest run src/__tests__/sync/seed.test.ts` — all tests pass including the new regression test.

### Step 2: Verify end-to-end — **Sonnet** ✅

**Files:** none (verification only)

Run the full test suite to confirm no regressions: `npx vitest run`

**Verify:** All tests pass. Confirm the habits query test (if any) still works correctly.
