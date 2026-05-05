# Batch 2 — Step 4: Stacked monthly calendar UI

You are an Opus subagent in a multi-agent implementation pipeline. The orchestrator has prepared everything; do **not** re-plan, do **not** ask questions. Execute Step 4 directly and commit it.

This step is tagged **context-clear: yes** in the plan. You are starting a fresh chapter — the prior steps (auth + utilities) are foundational and you should not need to re-derive them; just consume the artifacts they produced.

## Working directory and branch

- CWD: `/Users/rodmachen/code/retrospection`
- Branch: you are already on `feature/habits-calendar-v1`. Steps 1-3 are committed. Do not switch branches. Do not push.
- Repo CI lives at `.github/workflows/ci.yml`. Keep it green.

## Plan

The full plan is at `docs/plans/let-s-get-back-to-curried-spring.md`. Read **§"Step 4 — Stacked monthly calendar UI"** carefully. It defines the goal, files to create, the visual states, and the verification checklist. It is authoritative.

The prior batch's results are at `docs/implementation/let-s-get-back-to-curried-spring/results/batch-1.json`. Read it once to understand what utilities, fonts, theme tokens, and auth flow you can rely on. In particular:

- Tailwind v4 theme tokens (`--color-paper`, `--color-ink`, `--color-ink-muted`, `--color-mark`, `--font-serif`, `--font-sans`) live in `app/globals.css`. Use the corresponding `bg-paper`, `text-ink`, `font-serif`, etc. utility classes.
- `src/web/month-grid.ts` exports `getMonthGrid`, `formatYmd`, `parseMonthParam`, `addMonths`. Reuse — do not reimplement.
- `src/web/habits-client.ts` exports `fetchHabitCompletions` and the `HabitCompletion` type. Use them.
- Auth middleware redirects unauthenticated UI requests to `/login`. The dashboard at `/` can assume an authenticated session; you must not duplicate auth logic.

## Implementation notes

- `app/page.tsx` is a Next 15 server component. `searchParams` is a Promise — destructure with `await`. The current month default should use UTC: `new Date(Date.UTC(year, monthIndex, 1))`.
- When the server component fetches `/api/habits/completions`, forward the request's cookies. Use `next/headers` `cookies()` to read incoming cookies, then pass them as a `Cookie` header to `fetchHabitCompletions`.
- `MonthHeader` uses `<Link>` (from `next/link`) for prev/next navigation. Each link points to `?month=YYYY-MM`.
- `HabitCalendar`:
  - Section label small, dim (`text-ink-muted`).
  - Habit name larger, serif.
  - Right-aligned ratio (e.g. `12/30` — count of `completionDates` in this month / total month days). Use `text-ink-muted`.
  - Day-of-week row: M T W T F S S, single letters, `text-ink-muted`, small.
  - Grid of `<DayCell>` components — 7 columns. Use CSS grid (`grid grid-cols-7 gap-1` or similar).
- `DayCell`:
  - Pure presentational, takes `{ date: Date, inMonth: boolean, status: 'completed'|'skipped'|'pending' }`.
  - Render a fixed-aspect-ratio square (`aspect-square`) with the day number centered.
  - `pending` — outlined circle (`border border-ink/30`), day number `text-ink`.
  - `completed` — filled `bg-mark` circle, day number `text-paper`.
  - `skipped` — render an "X" mark (use a Lucide `X` icon if you add `lucide-react`, or an inline SVG; do not use the literal character "X" — it looks shoddy at the size we want).
  - `inMonth=false` — fade everything to `opacity-30`.
- `classifyDay(date, completionDates, skippedDates)`:
  - Format `date` as YYYY-MM-DD via `formatYmd` from `src/web/month-grid.ts`.
  - Returns `'completed'` if YYYY-MM-DD is in `completionDates`, else `'skipped'` if in `skippedDates`, else `'pending'`.
  - Place this in `src/web/classify-day.ts` (new file). Co-located test in `src/web/__tests__/classify-day.test.ts`.
- Grouping in `app/page.tsx`: sort habits by `sectionOrder` ascending, then by `content` ascending within each section. Render section headings (`<h2 className="font-serif text-2xl">{sectionName}</h2>`) once per section.
- Page header: month label centered, prev/next on the sides. Match the Streaks-style proportions but in paper aesthetic — the inspiration screenshot is in the plan's user-facing context; trust your design judgment for spacing and sizing on both phone (375px) and desktop (≥1280px).

## Decision: do you add `lucide-react`?

Yes, add it as a dependency for the X icon (and for future v2 work). It's small, tree-shakable, and you'll likely want more icons later. Note it in the commit body.

## Commit policy

- One commit. Subject: `Step 4: Stacked monthly calendar UI`.
- Use HEREDOC. Stage specific files. Co-author trailer:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

- Body: explain the visual design choices (typography, spacing, circle vs X), the dependency addition (`lucide-react`), and confirm verification steps.

## Verify (must all pass before committing)

- `npm run typecheck` — exits 0
- `npm run lint` — exits 0
- `npm test` — `classifyDay` tests added and passing alongside existing suite
- `npm run build` — exits 0

You CANNOT run a dev server in headless mode. Do not attempt visual verification beyond confirming the build succeeds. Document in the commit body that visual verification (mobile/desktop widths, prev/next nav, seeded data display) is deferred to Step 5/manual review.

## Batch completion

After committing, write a JSON results file at:

`docs/implementation/let-s-get-back-to-curried-spring/results/batch-2.json`

Schema:

```json
{
  "batch": 2,
  "steps": [
    {
      "step": 4,
      "commitSha": "...",
      "filesChanged": [...],
      "verify": {"typecheck": "pass", "lint": "pass", "test": "pass", "build": "pass"},
      "designDecisions": "...",
      "notes": "..."
    }
  ],
  "assumptions": ["..."],
  "blockers": []
}
```

If you encounter a blocker (e.g. utilities from Batch 1 don't match what you need), populate `blockers` and stop. Otherwise complete and commit.
