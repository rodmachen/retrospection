# Retrospection — Phase 1: Backend & Datastore

## Context

Todoist's free tier only retains 7 days of completed task history. Once that window closes, the data is gone. **Retrospection** is a new app that captures and preserves all Todoist task activity in its own database, then exposes it via simple REST endpoints for data access.

Phase 1 covers: Supabase database, Todoist API client, one-time seed script, webhook for real-time updates, and basic REST API routes. No frontend yet — the API approach (GraphQL, tRPC, or server components) will be decided in Phase 2 when the frontend arrives.

**Repo:** `retrospection` (separate from command-center)
**Stack:** Next.js (API routes only), TypeScript, Supabase (PostgreSQL), Drizzle ORM
**Hosting:** Vercel (deployed early for webhook endpoint)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo | Separate from command-center | Different concerns, deployment target, and DB. Clean separation. |
| Database | Supabase (hosted Postgres) | Free tier (500MB), first-class Vercel integration, JSONB + arrays for task metadata, window functions for analytics |
| ORM | Drizzle | TypeScript-native, schema-as-code, zero runtime overhead, generates SQL migrations |
| Data ingestion | One-time seed + webhook | Seed backfills 7 days, webhook catches all future events. No cron needed. |
| Webhook host | Vercel serverless function | `/api/webhook/todoist` — same platform as eventual frontend |
| API layer | Simple REST routes | A few Next.js API routes for programmatic access. Full API approach (GraphQL/tRPC/server components) deferred to Phase 2. |
| Todoist API client | New implementation | Separate repo can't import from command-center. Clean rewrite focused on raw data (not mapped to Reminder types). |

## Database Schema

```
projects:         id (PK), name, is_inbox, color, deleted_at, todoist_created_at, created_at, updated_at
sections:         id (PK), project_id (FK), name, order, created_at, updated_at
tasks:            id (PK), content, description, project_id (FK), section_id (FK),
                  parent_id (self-FK), priority, labels (TEXT[]), due_date, due_is_recurring,
                  due_string, due_timezone, is_completed, completed_at, deleted_at,
                  todoist_created_at, first_seen_at, last_synced_at, raw_json (JSONB),
                  created_at, updated_at
task_completions: id (SERIAL PK), task_id (FK), completed_at (TIMESTAMPTZ),
                  completed_date (DATE), created_at
webhook_events:   delivery_id (VARCHAR PK), event_type, created_at
sync_log:         id (SERIAL PK), type, started_at, completed_at, status, tasks_synced,
                  error_message, metadata (JSONB)
```

Key indexes: `tasks(project_id)`, `tasks(is_completed, completed_at)`, `tasks(due_date)`, `tasks(section_id)`.
UNIQUE constraint: `task_completions(task_id, completed_date)` — enforces one completion per task per day, enables `onConflictDoNothing` for seed idempotency.

**`completed_date` (DATE) column:** `task_completions` stores both a `completed_at` timestamp (NULL for recurring tasks) and a `completed_date` (DATE) derived using the `TZ` env var at write time. Analytics queries (`/api/stats/completions`) group by `completed_date` directly, avoiding `AT TIME ZONE` math and the UTC date-shift bug where a midnight-UTC timestamp for "2026-03-28" would shift to "2026-03-27" in Central Time.

**Timezone rule:** All timezone-aware logic reads from the `TZ` env var (default `America/Chicago`). Never hardcode the timezone. This applies to: `completed_date` derivation in Steps 4 and 5, "today" calculation in `item:uncompleted` rollback, and the seed script's recurring-task heuristic.

**`webhook_events` table:** Stores `X-Todoist-Delivery-ID` from each webhook request. The handler inserts the delivery ID first — if it violates the UNIQUE constraint, return 200 OK immediately (idempotent). This prevents duplicate `task_completions` rows when Todoist retries a timed-out webhook.

### Recurring Task Completion Problem

For one-off tasks, `tasks.is_completed` + `tasks.completed_at` works fine. But for **recurring tasks**, completing one occurrence doesn't mark the task as done — Todoist advances the `due_date` to the next occurrence and the task stays active. The completed tasks API does not return recurring task completions on the free tier.

The `task_completions` ledger table solves this. Each completion (recurring or one-off) gets its own row. This is the same problem solved in the command-center habits tracker (`src/core/habits.ts:116-130`), where the heuristic is: if a recurring task's `due_date` has advanced past today, it was completed today.

**Webhook handling for recurring tasks:** `item:completed` fires for recurring tasks but with an empty `completed_at`. Read the old `due_date` from our DB before upserting. For recurring completions, set `completed_at` to **NULL** (we don't know the actual time) and rely solely on `completed_date` (DATE) = the old due date. This is more honest than fabricating a timestamp. Analytics queries use `completed_date` anyway.

**Seed script:** For the initial backfill, completed tasks from the API go into `task_completions`. Active recurring tasks with future due dates get a completion inferred for today (same heuristic as habits tracker). **Important caveat:** The seed can only infer *today's* recurring completions. Completions from 2+ days ago are unrecoverable — Todoist doesn't expose them in the completed API for recurring tasks, and the active task only holds the next due date. Once the webhook is live, this gap disappears.

## Webhook Design

Todoist webhooks fire for: `item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`, plus project/note/label events. Subscribe to all `item:*` events.

**Verification:** Each request includes an `X-Todoist-Hmac-SHA256` header — HMAC-SHA256 of the raw body using the app's `client_secret`, base64-encoded. Also includes `X-Todoist-Delivery-ID` for deduplication.

**Critical: recurring task completions.** `item:completed` fires for both one-off and recurring tasks, BUT for recurring tasks the `completed_at` field in the payload is **empty** (confirmed Todoist limitation). The task stays active with its due date advanced to the next occurrence. Our handler must read the old `due_date` from the DB before upserting, and use that as the completion timestamp in `task_completions`.

Webhook registration is done manually in the [Todoist App Management Console](https://developer.todoist.com/appconsole.html). Subscribe to: `item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`.

**Ordering: seed MUST run before webhook registration.** If a webhook fires for a task that doesn't exist in our DB yet, the `task_id` FK on `task_completions` would fail. To be safe, the webhook handler for `item:completed` and `item:updated` should also handle missing tasks: if the task isn't in the DB, fetch it from the Todoist API (`fetchActiveTasks` or by ID) and upsert it before processing the event. This makes the webhook self-healing if ordering is violated or a task was somehow missed by the seed.

---

## Step 1: Initialize Next.js project and deploy to Vercel ✅

**Model: Sonnet** | Tests-alongside | New repo

Create the `retrospection` repo with Next.js (App Router), TypeScript strict mode, and minimal config. No pages — just a health-check API route (`/api/health`). Deploy to Vercel to establish the public URL needed for the webhook.

**Files created:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`
- `app/api/health/route.ts` — returns `{ status: "ok" }`
- `.github/workflows/ci.yml` — type check + tests on push/PR
- `vitest.config.ts`

**Verify:** `npm run build` succeeds. Deploy to Vercel. `curl https://<app>.vercel.app/api/health` returns 200.

---

## Step 2: Set up Supabase and Drizzle schema ✅

**Model: Sonnet** | Tests-alongside | Files: `src/db/*`, `drizzle.config.ts`

1. Create Supabase project (manual step)
2. Install `drizzle-orm`, `postgres`, `drizzle-kit`
3. Define schema in `src/db/schema.ts` (projects, sections, tasks, task_completions, webhook_events, sync_log tables)
4. Create `src/db/client.ts` — connection factory reading `DATABASE_URL` from env
5. Generate and apply initial migration via `drizzle-kit`

**Files created:**
- `src/db/schema.ts` — Drizzle table definitions with indexes and relations
- `src/db/client.ts` — DB connection singleton
- `drizzle.config.ts` — Drizzle-kit config pointing to Supabase
- `src/db/migrations/` — generated SQL

**Verify:** `npx drizzle-kit push` applies schema to Supabase. Inspect tables via Supabase dashboard. Write a test that imports schema and verifies table/column names.

---

## Step 3: Build Todoist API client ✅

**Model: Sonnet** | TDD | Files: `src/todoist/*`

Build a focused Todoist API client that returns raw API types (not mapped to Reminder). Endpoints needed:
- `fetchProjects(token)` → `TodoistProject[]`
- `fetchSections(token)` → `TodoistSection[]`
- `fetchActiveTasks(token)` → `TodoistTask[]`
- `fetchCompletedTasks(token, sinceDays)` → `TodoistTask[]`

**Files created:**
- `src/todoist/types.ts` — Raw Todoist API response types
- `src/todoist/client.ts` — API client functions
- `src/__tests__/todoist/client.test.ts` — Tests with mocked fetch

**Verify:** Tests pass. Manual smoke test: `npx tsx src/todoist/client.ts` (with a small CLI harness) prints project names from real API.

---

## Step 4: Build seed script (one-time backfill) ✅

**Model: Opus** | TDD | Files: `src/sync/*`, `scripts/seed.ts`

The seed script fetches all current Todoist data (projects, sections, active tasks, 7 days of completed tasks) and upserts everything into Supabase. Uses Drizzle's `onConflictDoUpdate` for idempotent upserts.

For **completed tasks** (from the API): upsert the task row AND insert a `task_completions` row.
For **active recurring tasks** with due dates in the future: infer today's completion using the habits tracker heuristic (due date advanced past today = completed today) and insert into `task_completions`.

**Files created:**
- `src/sync/upsert.ts` — Upsert functions for each table (projects, sections, tasks, task_completions)
- `src/sync/seed.ts` — Orchestrates: fetch all → upsert all → infer recurring completions → log to sync_log
- `scripts/seed.ts` — CLI entry point (loads env, runs seed, reports counts)
- `src/__tests__/sync/upsert.test.ts` — Tests upsert logic with mocked DB

**Verify:** Run `npx tsx scripts/seed.ts`. Check Supabase dashboard for populated tables — verify `task_completions` has rows for both API-reported completions and inferred recurring completions. Run again — verify no duplicate completion rows (idempotent via UNIQUE constraint on `task_id + completed_date`, using `onConflictDoNothing`). Check `sync_log` has an entry with correct counts.

---

## Step 5: Build webhook endpoint ✅

**Model: Opus** | TDD | Files: `app/api/webhook/todoist/route.ts`, `src/sync/webhook.ts`

Implement the Todoist webhook handler as a Next.js API route:
1. **Deduplication:** Insert `X-Todoist-Delivery-ID` into `webhook_events`. If it violates the UNIQUE constraint, return 200 OK immediately — this is a retry of an already-processed event.
2. **Verify authenticity:** Compute HMAC-SHA256 of the raw request body using `TODOIST_CLIENT_SECRET` as the key, base64-encode it, and compare against the `X-Todoist-Hmac-SHA256` header.
3. Parse event type (`item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`)
4. For `item:added`: upsert task (reuse upsert from Step 4)
5. For `item:completed`: handles both one-off and recurring completions:
   - **One-off tasks**: `completed_at` is present in the payload. Insert a `task_completions` row with both `completed_at` (timestamp) and `completed_date` (DATE, parsed in user's TZ). Set `is_completed = true` and `completed_at` on the task row.
   - **Recurring tasks**: `completed_at` is **EMPTY in the payload** (confirmed Todoist limitation). The task stays active with its due date advanced. Read the **old due date from our DB**. Insert a `task_completions` row with `completed_date` = old due date (DATE), `completed_at` = NULL (we don't know the actual time). Do NOT set `is_completed = true` on the task row — it's still active. Upsert the task with the new advanced due date.
6. For `item:uncompleted`: set `is_completed = false`, clear `completed_at` on the task row. **Also delete the `task_completions` row** matching `task_id AND completed_date = today (read from TZ env var)`. This is more precise than "most recent" — handles edge cases like multiple same-day completions from manual date changes. Query: `DELETE FROM task_completions WHERE task_id = $1 AND completed_date = $today LIMIT 1`.
7. For `item:updated`: upsert the task row with new field values. Note: for recurring tasks, `item:completed` is the primary completion signal (see above). The `item:updated` event may also fire when the due date advances, but we handle completion recording in the `item:completed` path.
8. For `item:deleted`: soft-delete (set `deleted_at = NOW()` on the task row)
9. Log to `sync_log` with type `"webhook"`

Also handle `project:added`, `project:updated`, `project:deleted`.

**Key finding from API verification:** Todoist sends `item:completed` for BOTH one-off and recurring tasks, but the `completed_at` field is empty for recurring tasks. Our DB's stored `due_date` (before the advance) serves as the best proxy for when the completion occurred.

**Reference implementation:** The due-date-advancement heuristic is proven in `command-center/src/core/habits.ts:116-130`.

**Files created:**
- `app/api/webhook/todoist/route.ts` — Next.js POST handler
- `src/sync/webhook.ts` — Event processing logic (separated from route for testability)
- `src/__tests__/sync/webhook.test.ts` — Tests all event types + auth verification

**Verify:** Deploy to Vercel. Register webhook URL in Todoist App Console. Create/complete/delete a task in Todoist → check Supabase for the corresponding row change. Check `sync_log` for webhook entries.

---

## Step 6: Build simple REST API routes ✅

**Model: Sonnet** | TDD | Files: `app/api/*`, `src/api/*`

Add a few Next.js API routes for basic programmatic data access. These are intentionally minimal — the full API approach (GraphQL, tRPC, or direct server component queries) will be decided in Phase 2.

**Authentication:** All REST routes (except `/api/health` and `/api/webhook/todoist`) require `Authorization: Bearer <API_KEY>` header, checked against an `API_KEY` env var. Implemented as a **root `middleware.ts`** (Next.js Edge Middleware), NOT inside route handlers. This runs on Vercel's Edge Network, returning 401 instantly for missing/bad API keys before a serverless function ever spins up — protecting both data and free-tier compute from bots/scrapers. The matcher config excludes `/api/health` and `/api/webhook/todoist`.

**Timezone handling:** The `/api/stats/completions` query groups by `completed_date` (DATE column) directly, avoiding `AT TIME ZONE` math entirely. The timezone conversion happens at write time (Steps 4 and 5), not at query time.

**Routes:**
- `GET /api/tasks` — List tasks with query params: `completed`, `projectId`, `limit`, `offset`
- `GET /api/tasks/[id]` — Single task by ID
- `GET /api/projects` — List all projects with task counts
- `GET /api/stats/completions` — Daily completion counts from `task_completions` table (query param: `days`, default 30)
- `GET /api/sync/status` — Latest sync_log entry
- `POST /api/sync/trigger` — Manually trigger a full sync (reuses seed logic)

**Files created:**
- `middleware.ts` — Next.js Edge Middleware for Bearer token auth (checks `API_KEY` env var)
- `app/api/tasks/route.ts` — Tasks list endpoint
- `app/api/tasks/[id]/route.ts` — Single task endpoint
- `app/api/projects/route.ts` — Projects list endpoint
- `app/api/stats/completions/route.ts` — Completion stats endpoint
- `app/api/sync/status/route.ts` — Sync status endpoint
- `app/api/sync/trigger/route.ts` — Manual sync trigger
- `src/api/queries.ts` — Shared Drizzle query functions (used by routes)
- `src/__tests__/api/queries.test.ts` — Tests for query functions
- `src/__tests__/api/middleware.test.ts` — Tests for Edge Middleware auth

**Verify:** Deploy to Vercel. `curl /api/projects` without auth → 401. `curl -H "Authorization: Bearer $API_KEY" /api/projects` → JSON with project names. `curl .../api/stats/completions?days=7` → daily counts aligned to Central Time.

---

## Step 7: End-to-end verification

**Model: Sonnet** | Tests-alongside

Write an integration test that exercises the full pipeline:
1. Seed script populates DB from mocked Todoist responses
2. Webhook handler processes a simulated `item:completed` event
3. REST API returns the updated task as completed

Also: update `.env.example` with all required variables, update README with setup instructions.

**Files created:**
- `src/__tests__/e2e/pipeline.test.ts`
- `README.md` — Setup, env vars, deployment, webhook registration

**Verify:** `npm test` passes all tests. Full manual walkthrough: seed → create task in Todoist → see it via `/api/tasks` → complete task → see `isCompleted: true` via `/api/tasks/[id]`.

---

## Environment Variables

```
DATABASE_URL=           # Supabase connection string (pooler)
TODOIST_API_TOKEN=      # Personal API token from Todoist settings
TODOIST_CLIENT_SECRET=  # For webhook HMAC verification (from App Console)
API_KEY=                # Bearer token for REST endpoint auth
TZ=America/Chicago      # Timezone for daily completion grouping (default: America/Chicago)
```

## Dependencies

```json
{
  "dependencies": {
    "drizzle-orm": "^0.39.x",
    "postgres": "^3.4.x",
    "next": "^15.x",
    "react": "^19.x",
    "react-dom": "^19.x"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.x",
    "typescript": "^5.7.x",
    "vitest": "^4.x",
    "@types/node": "^22.x"
  }
}
```
