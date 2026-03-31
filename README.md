# Retrospection

Captures and preserves all Todoist task activity in its own database, then exposes it via REST endpoints. Todoist's free tier only retains 7 days of completed task history — Retrospection keeps it all.

**Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL), Drizzle ORM, Vercel

## Setup

### 1. Clone and install

```bash
git clone https://github.com/rodmachen/retrospection
cd retrospection
npm install
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a project, and copy the **connection string (pooler mode)** from Settings → Database.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string |
| `TODOIST_API_TOKEN` | From Todoist Settings → Integrations → API token |
| `TODOIST_CLIENT_SECRET` | From [Todoist App Console](https://developer.todoist.com/appconsole.html) |
| `API_KEY` | Bearer token for REST auth — generate with `openssl rand -hex 32` |
| `TZ` | Your timezone (default: `America/Chicago`) |

### 4. Apply database schema

```bash
npx drizzle-kit push
```

### 5. Run the seed (one-time backfill)

```bash
npx tsx scripts/seed.ts
```

This fetches the last 7 days of completed tasks and all active tasks from Todoist.

### 6. Deploy to Vercel

```bash
vercel deploy
```

Set all env vars in the Vercel project settings (including `TZ`).

### 7. Register the webhook

Go to the [Todoist App Console](https://developer.todoist.com/appconsole.html) and register:

- **URL:** `https://<your-app>.vercel.app/api/webhook/todoist`
- **Events:** `item:added`, `item:updated`, `item:completed`, `item:uncompleted`, `item:deleted`

> **Order matters:** Run the seed *before* registering the webhook.

## REST API

All endpoints (except `/api/health`) require:
```
Authorization: Bearer <API_KEY>
```

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check (no auth) |
| `GET /api/tasks` | List tasks (`?completed=true&projectId=X&limit=50&offset=0`) |
| `GET /api/tasks/:id` | Single task |
| `GET /api/projects` | List projects with task counts |
| `GET /api/stats/completions` | Daily completion counts (`?days=30`) |
| `GET /api/sync/status` | Latest sync log entry |
| `POST /api/sync/trigger` | Manually trigger a full reseed |

## Development

```bash
npm run dev        # Start Next.js dev server
npm test           # Run tests (vitest)
npm run typecheck  # TypeScript check
npm run build      # Production build
```

## Architecture

```
Todoist API ──► seed script ──► Supabase (PostgreSQL)
                                     │
Todoist webhooks ──► /api/webhook ───┘
                                     │
REST clients ◄──── /api/* ───────────┘
```

- **`src/todoist/`** — Todoist REST/Sync API client
- **`src/db/`** — Drizzle schema and DB client
- **`src/sync/`** — Seed orchestrator, upsert functions, webhook event processor
- **`src/api/`** — Shared query functions and auth helper
- **`app/api/`** — Next.js route handlers
- **`scripts/`** — CLI entry points
