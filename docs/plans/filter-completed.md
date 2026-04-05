# Filter "Completed Forever" Habits from Completions Endpoint

## Context

When a recurring habit is "completed forever" in Todoist, its `isCompleted` field becomes `true`. The `queryHabitCompletions()` function already filters out deleted habits (`deletedAt IS NULL`) but does not filter out completed-forever habits. This causes habits like "Quizlet" to keep appearing in the response with `isActive: false`, rendering as `➖` (skipped) on every day of the week — a row that provides no useful information and should be removed entirely.

**Fix:** Add `eq(tasks.isCompleted, false)` to the WHERE clause.

## Step 1: Add isCompleted filter and test (tests-alongside, **Sonnet**)

**Files modified:**
- `src/api/queries.ts`
- `src/__tests__/api/queries.test.ts`

**Change in `queries.ts` line 170:**

```typescript
// Before:
.where(and(isNull(tasks.parentId), isNull(tasks.deletedAt)))

// After:
.where(and(isNull(tasks.parentId), isNull(tasks.deletedAt), eq(tasks.isCompleted, false)))
```

**Test:** Add a test case in the existing `describe("queryHabitCompletions")` block confirming that only `isCompleted: false` rows are expected in results.

Note: The existing mock-based test pattern doesn't truly validate SQL WHERE clauses (the mock chain doesn't filter). The test documents the expected contract. Full SQL validation would require integration tests (out of scope).

**`isActive` field in route handler** (`app/api/habits/completions/route.ts:30`): Keep as-is. It will always be `true` now, but removing it could break API consumers.

**Verify:**
```bash
npx vitest run src/__tests__/api/queries.test.ts
```
All tests pass.

**Commit, push, open PR.**

## Step 2: Manual verification (**Sonnet**)

After deploying or running locally, confirm Quizlet no longer appears:

```bash
curl "http://localhost:3000/api/habits/completions?start=2026-03-29&end=2026-04-04"
```

No habits with `isActive: false` should appear in the response.
