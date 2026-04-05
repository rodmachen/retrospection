# Retrospection

Retrospection is a backend system that captures and preserves all Todoist task activity in a persistent database. Todoist's free tier only retains 7 days of completed task history. Retrospection keeps an indefinite record of every task and completion, enabling long-term analytics and habit tracking.

**Status:** Phase 1 complete (backend only). Phase 2 (frontend) not started.

## Tech Stack

- **Framework:** Next.js 15 (API routes only, no UI)
- **Language:** TypeScript 5.7 (strict mode)
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM
- **Hosting:** Vercel (serverless + Edge Middleware)
- **External API:** Todoist API v1
- **Testing:** Vitest (73 tests)
- **CI:** GitHub Actions (typecheck + tests on push/PR)

## Data Model

### Tables

**projects** — Todoist projects (e.g., Habits, Engineering, Interests)
- `id`, `name`, `isInbox`, `color`, `deletedAt`, `todoistCreatedAt`, `createdAt`, `updatedAt`

**sections** — Sections within projects
- `id`, `projectId` (FK → projects), `name`, `order`, `createdAt`, `updatedAt`

**tasks** — Individual tasks with subtask nesting via `parentId`
- `id`, `content`, `description`, `projectId` (FK → projects), `sectionId` (FK → sections), `parentId` (self-reference for subtasks, up to 4 levels)
- `priority` (1–4), `labels` (text array), `dueDate`, `dueIsRecurring`, `dueString`, `dueTimezone`
- `isCompleted`, `completedAt`, `deletedAt` (soft delete)
- `todoistCreatedAt`, `firstSeenAt`, `lastSyncedAt`, `rawJson` (full Todoist payload)

**task_completions** — Completion ledger. One row per task per day. This is the key table for analytics.
- `id`, `taskId` (FK → tasks), `completedAt` (timestamp, NULL for recurring tasks), `completedDate` (DATE in user's timezone)
- Unique constraint on `(taskId, completedDate)` — max one completion per task per day

**webhook_events** — Deduplication of Todoist webhook deliveries
- `deliveryId` (PK), `eventType`, `createdAt`

**sync_log** — Audit trail of all sync operations
- `id`, `type` ("seed" or "webhook"), `startedAt`, `completedAt`, `status`, `tasksSynced`, `errorMessage`, `metadata`

### Key Relationships

- Projects → Sections → Tasks (hierarchical)
- Tasks → Tasks via `parentId` (subtask nesting, up to 4 levels)
- Tasks → TaskCompletions (one task can have many completion records, especially recurring tasks)

## API Endpoints

All endpoints return JSON. Protected endpoints require `Authorization: Bearer <API_KEY>` header.

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Returns `{ status: "ok" }` |

### Protected (Bearer auth)

| Endpoint | Method | Params | Returns |
|----------|--------|--------|---------|
| `/api/tasks` | GET | `completed` (bool), `projectId` (string), `nested` (bool), `limit` (1–200), `offset` | Array of tasks. When `nested=true`, returns tree with `subtasks[]` on each parent. Limit/offset apply to parents only. |
| `/api/tasks/:id` | GET | — | Single task object, or 404 |
| `/api/projects` | GET | — | Array of projects, each with `taskCount` |
| `/api/stats/completions` | GET | `days` (1–365, default 30) | Array of `{ completedDate, count }` grouped by day, descending |
| `/api/sync/status` | GET | — | Latest sync_log entry |
| `/api/sync/trigger` | POST | — | Triggers full resync from Todoist. Returns counts. |

### Webhook (HMAC auth, no Bearer token)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/todoist` | POST | Receives Todoist events. Verified via HMAC-SHA256 of raw body using client secret. Deduplicates by delivery ID. |

**Subscribed events:** `item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`, `project:added`, `project:updated`, `project:deleted`

### Example Task Object

```json
{
  "id": "6gF8fgQjV5V68wqQ",
  "content": "🔵 Marais",
  "description": "",
  "projectId": "6gF283Vm6P7X48mx",
  "sectionId": null,
  "parentId": null,
  "priority": 4,
  "labels": [],
  "dueDate": "2026-04-01",
  "dueIsRecurring": true,
  "dueString": "every day",
  "dueTimezone": null,
  "isCompleted": false,
  "completedAt": null,
  "deletedAt": null,
  "firstSeenAt": "2026-03-30T19:57:20.243Z",
  "lastSyncedAt": "2026-03-31T18:57:50.489Z",
  "subtasks": []
}
```

### Example Nested Response (`?nested=true`)

```json
[
  {
    "id": "parent-id",
    "content": "Workout",
    "subtasks": [
      { "id": "child-1", "content": "Cardio", "parentId": "parent-id", "subtasks": [] },
      { "id": "child-2", "content": "Strength", "parentId": "parent-id", "subtasks": [] }
    ]
  }
]
```

## Key Capabilities

### Recurring Task Tracking
Todoist doesn't expose recurring completions on the free tier. The `task_completions` ledger solves this — each completion of a recurring task gets its own row, with `completedDate` in the user's timezone. The task itself stays active (`isCompleted: false`) with its due date advanced.

### Completion Analytics
The `/api/stats/completions` endpoint returns daily completion counts. The `completedDate` (DATE) column enables correct timezone-aware grouping without query-time math. Supports up to 365 days of history.

### Subtask Nesting
The `?nested=true` parameter on `/api/tasks` builds a tree structure from flat task data using `parentId` references. Supports Todoist's full 4-level hierarchy. Orphan subtasks (parent not in result set) appear at the top level.

### Idempotent Sync
All sync operations are safe to re-run. Task upserts use `ON CONFLICT DO UPDATE`. Completion inserts use `ON CONFLICT DO NOTHING` (unique on `taskId + completedDate`). Webhook deliveries are deduplicated by ID.

### Soft Deletes
Deleted tasks and projects retain their records with a `deletedAt` timestamp. All queries filter by `deletedAt IS NULL`. Completion history is preserved even after deletion.

## Current Data (as of March 2026)

- 6 projects: Basics, Engineering, Getting Started, Habits, Inbox, Interests
- 17 sections
- ~55 active tasks
- ~42 completion records spanning Mar 24–31
- Real-time webhook sync active

## Planned Frontend Views

1. **Weekly Grid** — Tasks grouped by category with daily completion status (check/cross) and weekly totals. Navigation between weeks.
2. **Books/Ongoing** — View for long-running tasks and projects.
3. **Pomodoro Calendar** — Color-coded calendar of work sessions (requires Pomodoro data integration).
4. **Monthly Single-Task** — Completion history for one task across a full month.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase pooler connection string |
| `TODOIST_API_TOKEN` | Todoist personal API token |
| `TODOIST_CLIENT_SECRET` | Webhook HMAC verification secret |
| `API_KEY` | Bearer token for REST endpoints |
| `TZ` | Timezone for completion grouping (default: `America/Chicago`) |

## Project Structure

```
app/api/           — Next.js route handlers (all endpoints)
src/api/           — Shared query functions, auth helper
src/db/            — Drizzle schema, DB connection singleton
src/todoist/       — Todoist API client and types
src/sync/          — Seed, webhook, and upsert logic
src/__tests__/     — Full test suite
scripts/           — CLI scripts (seed, backfill)
middleware.ts      — Edge Middleware (Bearer auth)
docs/plans/        — Architecture plans and ideation
```
