# Batch 3 — Step 5: Polish, README, PR finalization

You are a subagent in a multi-agent implementation pipeline. The orchestrator has prepared everything; do **not** re-plan, do **not** ask questions. Execute Step 5 directly and commit it.

## Working directory and branch

- CWD: `/Users/rodmachen/code/retrospection`
- Branch: you are already on `feature/habits-calendar-v1`. Steps 1-4 are committed. Do not switch branches. Do not push.
- Keep CI green.

## Plan

The full plan is at `docs/plans/let-s-get-back-to-curried-spring.md`. Read **§"Step 5 — Polish, README, and PR finalization"** carefully.

Prior batch results: `docs/implementation/let-s-get-back-to-curried-spring/results/batch-1.json` and `batch-2.json`. The dashboard at `app/page.tsx` is built; you are adding the polish layer around it.

## Implementation notes

- **Empty state**: in `app/page.tsx`, when `habits.length === 0` (or after grouping, when no sections are rendered), render a friendly serif message: "No habits yet — make sure your Todoist 'Habits' project has tasks." Centered, paper aesthetic.
- **Error boundary** (`app/error.tsx`):
  - Client component (`"use client"` directive required by Next).
  - Props: `{ error: Error & { digest?: string }, reset: () => void }`.
  - Render: serif heading "Something went wrong", body in sans, a "Try again" button that calls `reset()`. Paper aesthetic.
  - `console.error(error)` so dev tools surface it.
- **Loading skeleton** (`app/loading.tsx`):
  - Server component.
  - Render the cream background and a single muted skeleton calendar shape (rounded rectangle + a faint 7×5 grid of circles using `bg-ink/5` or similar). Avoid spinners.
- **README updates**:
  - Read existing `README.md`. If a "Running locally" or similar section exists, integrate; otherwise add it.
  - Document required env vars: `APP_PASSWORD`, `SESSION_SECRET` (≥32 chars), `API_KEY`, `DATABASE_URL`, plus any new ones from Steps 1-4 (check `.env.example` if updated).
  - Document: `npm install`, run migrations, `npm run dev`, navigate to `http://localhost:3000/login`.
  - Keep additions concise.
- **Update `docs/plans/frontend-ideation.md`**:
  - Add a note at the top (above existing content) like: `> **View 4 - Monthly** is realized as of v1 — see [`let-s-get-back-to-curried-spring.md`](./let-s-get-back-to-curried-spring.md).` Keep the rest of the file intact.

## Plan checkmarks

After this step's commit, edit the plan file `docs/plans/let-s-get-back-to-curried-spring.md` to change every `### Step N — ... ✅ pending` heading to `### Step N — ... ✅` (replace `✅ pending` with just `✅`). All five steps. This is per the user's CLAUDE.md convention: "A plan with all steps checkmarked is considered complete."

## Commit policy

- One commit covering all of Step 5 + plan checkmarks.
- Subject: `Step 5: Empty/error/loading states + README + plan checkmarks`.
- HEREDOC body explaining what was added, what was verified.
- Co-author trailer:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Verify (must all pass before committing)

- `npm run typecheck` — exits 0
- `npm run lint` — exits 0
- `npm test` — exits 0
- `npm run build` — exits 0

## Batch completion

After committing, write `docs/implementation/let-s-get-back-to-curried-spring/results/batch-3.json`:

```json
{
  "batch": 3,
  "steps": [
    {
      "step": 5,
      "commitSha": "...",
      "filesChanged": [...],
      "verify": {"typecheck": "pass", "lint": "pass", "test": "pass", "build": "pass"},
      "notes": "..."
    }
  ],
  "planCheckmarksUpdated": true,
  "assumptions": ["..."],
  "blockers": []
}
```
