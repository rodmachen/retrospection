# Batch 1 — Steps 1, 2, 3

You are a subagent in a multi-agent implementation pipeline. The orchestrator has prepared everything; do **not** re-plan, do **not** ask questions. Execute the steps below directly and commit each one separately.

## Working directory and branch

- CWD: `/Users/rodmachen/code/retrospection`
- Branch: you are already on `feature/habits-calendar-v1`. Do not switch branches. Do not push (the orchestrator handles pushes).
- Repo CI lives at `.github/workflows/ci.yml`. Keep it green: every commit must pass `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Plan

The full plan is at `docs/plans/let-s-get-back-to-curried-spring.md`. Read it once, then execute Steps 1, 2, and 3 in order. Each step has a Goal, file list, Verify list, and effort/model tag — those are authoritative.

## Commit policy

- One commit per step. Three commits total in this batch.
- Stage specific files by name. Do **not** use `git add .` or `git add -A`.
- Use a HEREDOC for every commit message. Include the co-author trailer:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

- Commit message body must explain *why* and reference the plan step (e.g., "Step 1: ...").
- Never `--amend`. If a hook fails, fix and create a new commit.
- Never use `--no-verify`. If a hook fails, address the underlying issue.

## Step-by-step instructions

### Step 1 — Frontend infrastructure

Per plan §"Step 1 — Frontend infrastructure". Notes:

- Use Tailwind v4 (`tailwindcss@^4`, `@tailwindcss/postcss@^4`, `postcss`). Do NOT create a `tailwind.config.ts`; theme tokens go in `app/globals.css` via `@theme`.
- Use `next/font/google` for fonts. Choose **Lora** for `--font-serif` and **Inter** for `--font-sans` unless you have a strong reason otherwise.
- The `app/layout.tsx` should import `./globals.css`.
- Keep `app/page.tsx` minimal — a single `<main>` with the heading and current month label. The real dashboard lands in Step 4.

**Verify (must all pass before committing)**:
- `npm run typecheck` exits 0
- `npm run lint` exits 0
- `npm test` exits 0 (tests still pass — no new tests this step)
- `npm run build` exits 0

Then commit. Subject: `Step 1: Tailwind, theme, root layout`. Body: explain the paper aesthetic, font choices, and that this scaffolds the UI for subsequent steps.

### Step 2 — Auth

Per plan §"Step 2 — Auth". Notes:

- Add `iron-session` (latest ^8). It works on the Edge runtime in Next 15 middleware.
- `SESSION_SECRET` must be at least 32 chars; throw a clear error in `getSessionOptions` if it is shorter or unset.
- Cookie options: `{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 }`.
- The `middleware.ts` matcher must exclude `/login`, `/api/login`, `/api/webhook/:path*`, `_next/*`, and static assets (favicon, etc.). Use a `config.matcher` regex/array.
- For API routes the middleware accepts EITHER a valid session cookie OR a valid `Authorization: Bearer <API_KEY>` header — preserves the CLI/webhook flow.
- For UI routes, missing/invalid cookie → redirect to `/login`.
- `app/login/page.tsx` is a client component with a single password input, submit button, and inline error area. Style with paper aesthetic.
- TDD the session helper (`hasValidSession` and the `SESSION_SECRET` length validation). Write tests first, then implementation.
- Add `APP_PASSWORD`, `SESSION_SECRET` to `.env.example` (create the file if absent) with placeholder values and a comment.

**Verify**:
- `npm test` — new session-helper tests pass alongside the existing suite.
- `npm run typecheck`, `npm run lint`, `npm run build` all green.
- Document the manual verification steps in the commit body but do NOT run them (no dev server in headless mode).

Commit. Subject: `Step 2: Cookie session auth + login page + middleware`. Body: explain auth strategy, the dual-acceptance API rule, and confirm tests pass.

### Step 3 — Month grid + API client

Per plan §"Step 3 — Month grid + API client utilities (TDD)". Notes:

- Strict TDD. Write `src/web/__tests__/month-grid.test.ts` first with all six test cases listed in the plan, run vitest to confirm they fail, then implement `src/web/month-grid.ts` until they pass.
- Use UTC for all date math (`Date.UTC`, `getUTCDay`, etc.). Avoid local-time `Date` constructors.
- Monday-first: `getUTCDay()` returns 0 for Sunday; map to Monday-first index with `(d + 6) % 7`.
- `fetchHabitCompletions` is a server-side helper (uses `process.env.INTERNAL_BASE_URL ?? 'http://localhost:3000'` for the base; document this assumption in the commit body). It should pass the session cookie through. Type its return as a named exported `HabitCompletion[]` interface that exactly matches the JSON shape returned by `app/api/habits/completions/route.ts`.

**Verify**:
- `npm test` — month-grid tests pass.
- `npm run typecheck`, `npm run lint` all green.
- `npm run build` exits 0.

Commit. Subject: `Step 3: Month grid utilities + habits API client (TDD)`. Body: explain TDD approach, UTC + Monday-first decisions, and the typed client shape.

## Batch completion

After Step 3 commits successfully, write a JSON results file at:

`docs/implementation/let-s-get-back-to-curried-spring/results/batch-1.json`

Schema:

```json
{
  "batch": 1,
  "steps": [
    {"step": 1, "commitSha": "...", "filesChanged": [...], "verify": {"typecheck": "pass", "lint": "pass", "test": "pass", "build": "pass"}, "notes": "..."},
    {"step": 2, "commitSha": "...", "filesChanged": [...], "verify": {...}, "notes": "..."},
    {"step": 3, "commitSha": "...", "filesChanged": [...], "verify": {...}, "notes": "..."}
  ],
  "assumptions": ["..."],
  "blockers": []
}
```

If you encounter a blocker you cannot resolve, populate `blockers` with a clear description and stop. Otherwise complete all three steps. Do not ask the orchestrator for confirmation between steps.
