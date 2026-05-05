# Habits Calendar Frontend — v1

## Context

The retrospection app currently has no UI — only Next.js API routes that read from a Postgres mirror of Todoist data. We want a habit-tracking dashboard that visually mirrors the Streaks iOS app: each habit gets its own monthly calendar of circle-shaped day cells, with completed days marked, skipped days X'd, and pending days neutral. This first PR ships a **read-only**, password-gated dashboard. A follow-up PR will add click-to-cycle interactions that write back to our DB (no Todoist push).

### Confirmed decisions

- **Layout**: All habits stacked vertically, one calendar per row, grouped by section. Same on phone and desktop (calendars get more horizontal room on desktop but layout stays single-column).
- **Source of truth**: Our Postgres DB. Webhooks update from Todoist; the UI will (in v2) write back to our DB only — never push to Todoist.
- **Day states (v1 read-only)**: Completed (row in `task_completions`), Skipped (row in `task_skipped_dates`), Pending (neither). All non-marked days render uniformly — no "missed vs not-scheduled" distinction.
- **Auth**: Password page → httpOnly cookie session. One shared password from `APP_PASSWORD` env var.
- **Aesthetic**: Light, paper-like — cream background, ink-style marks, serif heading font.
- **v1 scope**: Read-only stacked monthly calendar with prev/next month navigation. No click-to-cycle. No write endpoints. Click-to-cycle is v2.
- **(For v2 reference) Manual completion timestamp**: `completedAt = noon UTC of the displayed date`.

### Out of scope for v1

- Click-to-cycle interactions and the corresponding POST/DELETE endpoints
- Weekly view, books view, Pomodoro calendar (other items in `frontend-ideation.md`)
- Multi-user accounts; remains single-user
- Pushing changes back to Todoist

---

## Critical files

**To be created:**
- `app/layout.tsx` — root HTML, fonts, global styles
- `app/globals.css` — Tailwind directives, theme tokens
- `app/page.tsx` — habits dashboard (server component)
- `app/login/page.tsx` — password form
- `app/api/login/route.ts` — POST: validate password, set cookie
- `app/api/logout/route.ts` — POST: clear cookie
- `middleware.ts` (repo root) — protect all routes except `/login` and `/api/login`
- `src/auth/session.ts` — sign/verify session cookie
- `src/web/month-grid.ts` — pure month-grid math (Monday-first)
- `src/web/habits-client.ts` — typed fetcher for `/api/habits/completions`
- `src/web/components/MonthHeader.tsx` — month label + prev/next links
- `src/web/components/HabitCalendar.tsx` — one habit's monthly grid
- `src/web/components/DayCell.tsx` — single day circle
- `src/web/__tests__/month-grid.test.ts` — vitest
- `src/auth/__tests__/session.test.ts` — vitest
- `tailwind.config.ts`, `postcss.config.mjs` — Tailwind v4 setup

**To be modified:**
- `package.json` — add Tailwind v4, `iron-session` (or built-in JWT-style cookie)
- `next.config.ts` — no changes expected; flag if needed
- `vitest.config.ts` (or `vitest.config.mts`) — confirm jsdom env if needed for component tests (not required for v1, all logic tests are pure)

**Reused as-is:**
- `app/api/habits/completions/route.ts:23-35` — response shape we render against
- `src/api/queries.ts:149-236` — `queryHabitCompletions`, already groups by section with `sectionOrder`

---

## Pre-flight (one-time before Step 1)

1. Confirm we're on a feature branch `feature/habits-calendar-v1` (not `main`).
2. Confirm `.claude/settings.local.json` is gitignored.
3. Open the PR after Step 1's first commit; update PR description after each step.

---

## Steps

### Step 1 — Frontend infrastructure: Tailwind, theme, root layout ✅

**Goal**: Get a styled "Hello" page rendering at `/` so the rest of the steps have a frame to build inside.

- Install Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss`) as devDeps.
- Create `postcss.config.mjs` with `@tailwindcss/postcss`.
- Create `app/globals.css` with `@import "tailwindcss";` plus a `@theme` block defining:
  - `--color-paper`: warm cream (e.g. `#f6efe1`)
  - `--color-ink`: near-black (e.g. `#1a1614`)
  - `--color-ink-muted`: ~50% ink
  - `--color-mark`: warm accent for completed (e.g. burnt umber `#7a3e1b`)
  - `--font-serif`: heading family (Playfair Display or Lora via `next/font/google`)
  - `--font-sans`: body family (Inter via `next/font/google`)
- Create `app/layout.tsx`:
  - Root HTML with `<body>` using `bg-paper text-ink font-sans` and the loaded fonts as CSS variables.
  - `<title>Retrospection</title>`.
- Create a placeholder `app/page.tsx` that renders an `<h1 className="font-serif">Habits</h1>` and the current month label.

**Files modified**: `package.json`, `package-lock.json`, `app/layout.tsx` (new), `app/globals.css` (new), `app/page.tsx` (new), `postcss.config.mjs` (new). Do **not** add `tailwind.config.ts` — Tailwind v4 uses CSS-based config via `@theme`.

**Tests**: tests-alongside (none required this step; trivial).

**Verify**:
- `npm run build` exits 0.
- `npm run dev`, visit `http://localhost:3000/` → cream background, serif "Habits" heading visible.
- `npm run typecheck` exits 0.

**Model**: Sonnet / medium.

**Effort justification**: Tailwind v4 setup with Next 15 is documented but new enough to have minor footguns (PostCSS plugin name, CSS-based theme block). Routine but not zero-risk. No ambiguity in requirements.

**Context-clear**: no — this is the first implementation step.

---

### Step 2 — Auth: password page + cookie session middleware ✅

**Goal**: All non-login routes (UI and API alike, except `/api/login` and `/api/webhook/*`) require a valid session cookie or redirect/401.

- Add `iron-session` (lightweight signed-cookie sessions; no Redis needed).
- Add env var `APP_PASSWORD` (document in `.env.example`) and `SESSION_SECRET` (32+ chars).
- `src/auth/session.ts`:
  - `getSessionOptions()` returning iron-session config (cookieName: `retro_session`, password: `SESSION_SECRET`, cookie: `{ httpOnly, secure: prod, sameSite: 'lax', maxAge: 30 days }`).
  - `getSession(req, res)` and `hasValidSession(req)` helpers.
- `app/api/login/route.ts`:
  - POST: read `{ password }` from JSON body. If matches `APP_PASSWORD`, save `{ authenticated: true }` to session. Return 200/401.
- `app/api/logout/route.ts`: POST clears the session.
- `app/login/page.tsx`: simple centered form (paper theme), client component, posts to `/api/login`, redirects to `/` on success, shows error message on 401.
- `middleware.ts` (repo root):
  - Match all paths except `/login`, `/api/login`, `/api/webhook/:path*`, and `_next/*` static.
  - For UI routes without a valid cookie → redirect to `/login`.
  - For API routes without a valid cookie AND no valid `Authorization: Bearer <API_KEY>` → return 401. (Preserves existing webhook/CLI bearer-token clients.)

**Files modified**: `package.json`, `middleware.ts` (new), `app/login/page.tsx` (new), `app/api/login/route.ts` (new), `app/api/logout/route.ts` (new), `src/auth/session.ts` (new), `src/auth/__tests__/session.test.ts` (new), `.env.example` (new or modified).

**Tests**: TDD for the session helper (cookie validation logic). Tests-alongside for the route handlers (manual verification is sufficient given simple shape).

**Verify**:
- `npm test` — session-helper tests pass.
- `npm run dev`. Visit `/` unauthenticated → redirected to `/login`.
- Submit wrong password → see "Incorrect password" inline error, stay on `/login`.
- Submit correct password → redirected to `/`, see Step 1's heading.
- `curl localhost:3000/api/habits/completions?...` without auth → 401.
- `curl` with `Authorization: Bearer $API_KEY` → 200 (existing CLI flow still works).

**Model**: Sonnet / medium.

**Effort justification**: Cookie sessions and middleware are standard ground in Next 15 with iron-session. Minor risk: middleware running on edge runtime restricts what iron-session APIs are usable — verify by running. No deep ambiguity.

**Context-clear**: no.

---

### Step 3 — Month grid + API client utilities (TDD) ✅

**Goal**: Pure functions covering the calendar's date math and a typed fetcher, both unit-tested. No UI yet.

- `src/web/month-grid.ts`:
  - `getMonthGrid(year, month)`: returns `{ year, month, weeks: Date[][] }`. Weeks are Monday-first. Includes leading days from prior month and trailing days from next month so each week has 7 dates. Pure (no `Date.now()` dependency at runtime).
  - `formatYmd(date)`: returns `YYYY-MM-DD` in UTC.
  - `parseMonthParam(s)`: `'2026-04'` → `{ year: 2026, month: 4 }`; falls back to current month if invalid.
  - `addMonths(year, month, delta)`: `{ year, month }` math for prev/next links.
- `src/web/habits-client.ts`:
  - `fetchHabitCompletions({ project, start, end, cookie })`: calls `/api/habits/completions`. Server-side fetch; passes through cookies. Returns typed array matching `app/api/habits/completions/route.ts:23-35`.

**Files modified**: `src/web/month-grid.ts` (new), `src/web/habits-client.ts` (new), `src/web/__tests__/month-grid.test.ts` (new).

**Tests**: TDD. Cover:
- Month with 28 days (Feb 2026) — 5 weeks, leading + trailing.
- Month starting on Monday — no leading days.
- Month ending on Sunday — no trailing days.
- Leap year (Feb 2024).
- `formatYmd` always 10 chars, zero-padded.
- `addMonths` rolls year on December → January and January → December.

**Verify**:
- `npm test` — all `month-grid` tests pass.
- `npm run typecheck` exits 0.

**Model**: Sonnet / medium.

**Effort justification**: Pure date math is exactly the kind of thing TDD catches. Off-by-one and DST edge cases are easy to introduce; tests prevent regression. No ambiguity, no third-party complexity.

**Context-clear**: no.

---

### Step 4 — Stacked monthly calendar UI ✅

**Goal**: The dashboard renders. Default = current month, all habits stacked, grouped by section, with prev/next month navigation.

- `app/page.tsx` (server component):
  - Read `?month=YYYY-MM` from `searchParams`; default to current UTC month.
  - Compute `start` = first of month, `end` = last of month (in YYYY-MM-DD).
  - Server-side fetch `/api/habits/completions?project=Habits&start=...&end=...` (forwarding the session cookie).
  - Group habits by `section`, ordering by `sectionOrder` then `content`.
  - Render `<MonthHeader>` then for each section: a section heading then one `<HabitCalendar>` per habit.
- `src/web/components/MonthHeader.tsx`:
  - Displays "April 2026" in serif font.
  - Prev/next as `<Link>`s to `?month=YYYY-MM` (anchor links so they're SSR-friendly).
- `src/web/components/HabitCalendar.tsx`:
  - Props: `{ habit, monthGrid }`.
  - Header row: habit content (e.g. "Cardio"), small dim section label, completion count e.g. `12/22`.
  - Day-of-week row (M T W T F S S).
  - Grid: 7 columns × N rows of `<DayCell>`.
- `src/web/components/DayCell.tsx`:
  - Props: `{ date, inMonth, status }` where `status` is `'completed' | 'skipped' | 'pending'`.
  - `inMonth=false` → faded number, no marker.
  - `pending` → outlined circle with the day number in ink.
  - `completed` → filled `bg-mark` circle, paper-colored numeral.
  - `skipped` → ink X mark, no circle.
  - Pure presentational component.
- A small classifier in the page or `HabitCalendar`: given a `Date` and a habit's `completionDates` and `skippedDates`, return `status`. Unit-test this if non-trivial.

**Files modified**: `app/page.tsx`, `src/web/components/MonthHeader.tsx` (new), `src/web/components/HabitCalendar.tsx` (new), `src/web/components/DayCell.tsx` (new), and a small `classifyDay` helper either alongside `month-grid.ts` or in `HabitCalendar.tsx` with co-located tests.

**Tests**: tests-alongside. Add unit tests for `classifyDay` (priority: completed beats skipped if both somehow exist; pending otherwise).

**Verify**:
- Seed DB with sample habits/completions: `npm run seed` if it exists, otherwise insert via SQL or a dev-only script. Document the command used in the commit body.
- `npm run dev`, visit `/` → see all habits with the current month's grid. Cells reflect seeded completions/skips. Prev/next month links work and update the URL.
- Manually load `/?month=2026-02` → February 2026 renders correctly.
- `npm test`, `npm run typecheck`, `npm run lint` all green.
- Mobile-width browser (≤375px): each calendar fits horizontally, day numbers are legible, no overflow.
- Desktop-width (≥1280px): page is centered with comfortable margins; calendars don't stretch absurdly wide.

**Model**: Opus / high.

**Effort justification**: This is where layout judgment, theming choices, and the click-target/circle-cell visual all come together. The Streaks aesthetic translated to "ink-on-paper" is novel enough that close calls about typography, spacing, circle size, and interaction affordance benefit from Opus. Compounding-mistake risk is moderate (a wrong base spacing decision propagates).

**Context-clear**: yes — Step 3 ends with pure-utility work; Step 4 begins UI/visual judgment, a logically distinct chapter.

---

### Step 5 — Polish, README, and PR finalization ✅

**Goal**: Empty/loading/error states, README updates, final lint/test pass, PR description complete.

- Empty state: if `/api/habits/completions` returns `[]`, render a friendly "No habits yet — make sure your Todoist 'Habits' project has tasks" message in serif.
- Error boundary: `app/error.tsx` with a simple "Something went wrong — try refreshing" message; logs the error.
- `app/loading.tsx`: cream background skeleton (one greyed calendar shape).
- README: short "Running locally" section — env vars (`APP_PASSWORD`, `SESSION_SECRET`, `API_KEY`, DB url), `npm run dev`, navigate to `/login`.
- Update `docs/plans/frontend-ideation.md` with a one-line note pointing to this plan as the realized v1 of "View 4 - Monthly".

**Files modified**: `app/error.tsx` (new), `app/loading.tsx` (new), `README.md`, `docs/plans/frontend-ideation.md`.

**Tests**: none required.

**Verify**:
- Temporarily empty the Habits project (or filter to a project that has no habits) → empty-state message shows.
- Throw in a server component (then revert) → error boundary catches it.
- Final pass: `npm test && npm run typecheck && npm run lint && npm run build` all green.
- PR description checklist reflects all five steps as ✅.

**Model**: Sonnet / medium.

**Effort justification**: Standard polish work; no novel decisions. Sonnet is right.

**Context-clear**: no.

---

## End-to-end verification (whole feature)

1. `npm install`, copy `.env.example` to `.env.local`, set `APP_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `API_KEY`.
2. Run any pending Drizzle migrations and seed sample data.
3. `npm run dev`. Visit `http://localhost:3000/` → redirected to `/login`.
4. Submit correct password → land on `/` and see all habits stacked, current month, with completed/skipped/pending cells matching the seeded data.
5. Click prev → URL becomes `?month=2026-03`, page shows March data.
6. Click next twice → `?month=2026-05`, future month, mostly pending cells.
7. Visit `/api/habits/completions?...` in a curl with `Bearer $API_KEY` → still works (CLI compatibility).
8. Visit same URL in the browser without logging in → 401.
9. Resize to 375px wide → calendars render legibly without horizontal scroll.
10. CI on the PR is green.

---

## Follow-up (v2, separate plan)

- Click-to-cycle on `<DayCell>`: Pending → Completed → Skipped → Pending.
- Put a pause in so if user quickly clicks through states, the API update call isn't made until a few second after it's finished, but local state will still keep the latest change.
- New `POST /api/habits/completions` and `DELETE /api/habits/completions` (and the same for `/api/habits/skipped`).
- Optimistic UI updates with rollback on error.
- Manual entries store `completedAt = noon UTC of displayedDate`.
- Decide a strategy for Todoist webhook conflicts with manual edits (likely: manual edits win, webhook never deletes a manual completion).
