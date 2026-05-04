# Context — Habits Calendar Frontend v1

**Plan**: [`docs/plans/let-s-get-back-to-curried-spring.md`](../../plans/let-s-get-back-to-curried-spring.md)
**Started**: 2026-05-04
**Branch**: `feature/habits-calendar-v1`
**Orchestrator**: Opus 4.7 / xhigh

## Summary

First UI for the retrospection app: a Streaks-inspired, password-gated, read-only monthly habit dashboard. Each habit gets its own monthly calendar (circle cells, marked completed/skipped/pending), grouped by section, stacked vertically. Light "paper" aesthetic with serif headings. Click-to-cycle interactions are deferred to v2.

## Plan

| Step | Title | Model | Effort | Context-clear | Tests | Depends on |
|------|-------|-------|--------|---------------|-------|------------|
| 1 | Frontend infra: Tailwind + theme + layout | Sonnet | medium | no | alongside | — |
| 2 | Auth: password page + cookie session middleware | Sonnet | medium | no | TDD (session helper) | 1 |
| 3 | Month grid + API client utilities | Sonnet | medium | no | TDD | — |
| 4 | Stacked monthly calendar UI | Opus | high | YES | alongside (classifyDay) | 1, 2, 3 |
| 5 | Polish: empty/error/loading + README | Sonnet | medium | no | none | 4 |

## Batches

- **Batch 1** (Sonnet/medium): Steps 1, 2, 3 — three sequential commits in one subagent run
- **Batch 2** (Opus/high): Step 4 — context-clear before starting; one commit
- **Batch 3** (Sonnet/medium): Step 5 — one commit

## Pre-flight notes

- `main` has branch protection: no direct pushes; PRs only. The unpushed housekeeping commit on local main (`089b49c`, "Remove settings.local.json from tracking; archive completed plans") will travel with the feature branch and appear in the PR diff. Reviewer should be aware. (Alternative: merge it via a separate PR first; chose to bundle for speed.)
- CI is configured at `.github/workflows/ci.yml` — subagents must keep it green.
- Vitest, ESLint, TypeScript already configured per `package.json`.
- No frontend code exists yet; `app/` only contains API routes.

## Assumptions

- Plan filename `let-s-get-back-to-curried-spring.md` is auto-generated; user did not rename when invoking `/multi-agent-plan`. Treating as accepted.
- All user decisions captured in plan's "Confirmed decisions" section.
- Subagents will commit per step using HEREDOC and stage specific files (per user's commit-format memory).

## Step results

### Batch 1 — Steps 1, 2, 3 ✅

- **Step 1** (`aa4e4d4`): Tailwind v4 + Lora/Inter fonts + paper theme + root layout. Added `.eslintrc.json` (extends `next/core-web-vitals`) because `next lint` was unconfigured.
- **Step 2** (`7fd8afd`): iron-session cookie auth, `/login` page, `/api/login` + `/api/logout`, middleware accepting cookie OR bearer token. Six TDD'd session-helper tests pass.
- **Step 3** (`4e0024f`): `src/web/month-grid.ts` (UTC, Monday-first) + `habits-client.ts`. 12 TDD'd month-grid tests cover leap years, week boundaries, year rollover.

All four checks (typecheck/lint/test/build) green for every commit.

**Subagent assumptions worth noting in review**:
- `INTERNAL_BASE_URL` env var added (defaults to `http://localhost:3000`) for server-side fetch from server components.
- `.eslintrc.json` added (was missing).

### Batch 2 — Step 4 ✅

- **Step 4** (`04fa278`): Stacked monthly calendar UI. `app/page.tsx` (async server component, forwards cookies to API via `next/headers`), `MonthHeader` (Lucide chevrons), `HabitCalendar`, `DayCell` (Lucide X for skipped, filled circle for completed), `classifyDay` helper with co-located tests. Single-column `max-w-2xl mx-auto` layout. Added `lucide-react`.

**Subagent design call**:
- Dropped the per-habit "small dim section label" on individual habits because section headings already group them. Reasonable, but flag for review confirmation.

### Batch 3 — Step 5 ✅

- **Step 5** (`581334f`): Empty state copy, `app/error.tsx` (client component, reset button), `app/loading.tsx` (server skeleton), README "Running locally" section, frontend-ideation.md linkback, all five plan step headings updated to `✅`.

All five plan steps complete. Implementation phase done.

### Review (Opus/xhigh) ✅

8 findings, 0 blocking. Real correctness/a11y items: `/api/health` lost public exception, nullable `section`/`sectionOrder` typing gap, Vercel `INTERNAL_BASE_URL` would break self-fetch, `role="grid"` ARIA misuse, no sr-only status on completed cells. Plus housekeeping (unrelated smoke-test artifacts), missing logout UI, and a key-format nit. See `review.md` and `results/review.json`.

### Feedback (Sonnet/high) ✅

All 8 findings addressed across 4 commits. None deferred. Final verification: typecheck + lint + 136 tests + build all green.

| Commit | Findings addressed |
|---|---|
| `3e73403` | `/api/health` matcher exception + delete smoke-test artifacts |
| `fbf85d2` | Nullable section defaults at API layer + VERCEL_URL fallback chain + `.env.example` |
| `e5df48d` | Drop bad ARIA role + sr-only completed status + `formatYmd` key |
| `ff4d1a2` | `/api/logout` redirect + Sign out button in dashboard footer |

## Completion

All six tasks complete. Branch `feature/habits-calendar-v1` is ready to push and PR. Final commit count: 1 (plan) + 5 (steps) + 4 (review fixes) = 10 feature commits, plus the housekeeping carry-over `089b49c`.


