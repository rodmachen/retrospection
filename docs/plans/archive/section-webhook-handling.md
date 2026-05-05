# Plan: Section Webhook Handling

## Context

The Todoist webhook handler (`src/sync/webhook.ts`) processes `item:*` and `project:*` events but ignores `section:*` events. When a new section like "Job Search" is created in Todoist, it never reaches the `sections` DB table. Tasks reference the `section_id`, but the LEFT JOIN to `sections` in `queryHabitCompletions` returns null — causing tasks to appear under "General" instead of their correct section in the daily briefing habits display.

Sections are only synced during full seed (`src/sync/seed.ts`). Adding webhook handling closes this gap.

## Design Decision: Section Deletion

**Hard delete** (not soft delete). The `sections` table has no `deletedAt` column, and adding one requires a migration for a rare edge case. The existing LEFT JOIN already handles missing sections gracefully (returns null → "General"). When Todoist deletes a section, subsequent `item:updated` webhooks null out `section_id` on affected tasks anyway.

## Step 1: Add section webhook handlers and tests (TDD) ✅

**Model:** Sonnet
**Files:** `src/sync/webhook.ts`, `src/__tests__/sync/webhook.test.ts`

### Tests (`webhook.test.ts`)

1. Add `upsertSections` to the `vi.mock("../../sync/upsert", ...)` block (line 6) and to the import (line 19)
2. Add three test describes mirroring the project event tests (lines 450-493):
   - `section:added` — assert `upsertSections` called with `[{ id: "s1", project_id: "p1", name: "Job Search", order: 1 }]`
   - `section:updated` — assert `upsertSections` called with updated name
   - `section:deleted` — assert `db.delete` called (hard delete; `createMockDb` already has a `delete` chain at line 118)

### Implementation (`webhook.ts`)

1. Add imports: `upsertSections` from `"./upsert"`, `sections` from `"../db/schema"`, `TodoistSection` from `"../todoist/types"`
2. Add switch cases after the `project:deleted` case (around line 88):
   ```
   case "section:added":
   case "section:updated":
     await handleSectionUpsert(db, event_data);
     break;
   case "section:deleted":
     await handleSectionDeleted(db, event_data);
     break;
   ```
3. Add `handleSectionUpsert()`: extract `id`, `project_id`, `name`, `section_order` from event_data → construct `TodoistSection` (mapping `section_order` → `order`) → call `upsertSections(db, [section])`
4. Add `handleSectionDeleted()`: extract `id` → `db.delete(sections).where(eq(sections.id, sectionId))`

**Note:** Todoist webhook payloads use `section_order` (see `ApiSection` type at `src/todoist/types.ts:28`), but `TodoistSection` uses `order`. The handler must map this field.

**Verify:** `npx vitest run src/__tests__/sync/webhook.test.ts` — all existing + new tests pass

## Step 2: Add `createdDate` to habits completions API response ✅

**Model:** Sonnet | Tests-alongside
**Files:** `src/api/queries.ts`, `app/api/habits/completions/route.ts`, `src/__tests__/api/queries.test.ts`

The briefing shows ⛔️ (missed) for days before a habit was created — e.g. a task added today appears with 7 missed days for the past week. The fix is to expose the task's creation date so the consumer can show ➖ instead.

### Query (`src/api/queries.ts`)

Add `tasks.todoistCreatedAt` to the `queryHabitCompletions` select clause (line 155). Thread it through the `HabitAccumulator` type and the returned objects as `createdDate` (convert timestamp to YYYY-MM-DD string).

### API route (`app/api/habits/completions/route.ts`)

Add `createdDate: h.createdDate` to the response mapping (line 24).

### Tests

Update existing `queryHabitCompletions` tests to assert the new `createdDate` field is present and correctly formatted.

**Verify:** `npx vitest run src/__tests__/api/queries.test.ts` — existing + updated tests pass

## Step 3: Full verify and commit ✅

**Model:** Sonnet

**Verify:**
- `npx tsc --noEmit` — type check passes
- `npx vitest run` — full test suite passes
- Commit, push, update PR

## Key Files

| File | Role |
|------|------|
| `src/sync/webhook.ts` | Add switch cases + 2 handler functions (~25 lines) |
| `src/__tests__/sync/webhook.test.ts` | Add mock + 3 test describes (~45 lines) |
| `src/api/queries.ts` | Add `todoistCreatedAt` to habits query select + accumulator |
| `app/api/habits/completions/route.ts` | Add `createdDate` to API response |
| `src/sync/upsert.ts` | Existing `upsertSections` — reuse, no changes |
| `src/todoist/types.ts` | Existing `TodoistSection` type — reuse, no changes |
| `src/db/schema.ts` | Existing `sections` table — no changes, no migration |
