# Feedback report

## Addressed

- **[non-blocking]** middleware.ts:59 — `/api/health` now unprotected — `3e73403`: Added `api/health` to the matcher's negative lookahead alongside `api/login` and `api/webhook`. The README documents this endpoint as no-auth; the middleware was inadvertently protecting it after Step 2.

- **[non-blocking]** habits-client.ts:9-10 — null section/sectionOrder defaults — `fbf85d2`: Applied defaults at the API serialisation layer in `app/api/habits/completions/route.ts`: `sectionName ?? 'Uncategorized'` and `sectionOrder ?? Number.MAX_SAFE_INTEGER`. Habits with no Todoist section now sort last and render under an "Uncategorized" heading rather than keying as `null` in the Map and producing NaN sort values.

- **[non-blocking]** habits-client.ts:32-33 — VERCEL_URL fallback for self-fetch — `fbf85d2`: Added a middle tier: `INTERNAL_BASE_URL` → `https://${VERCEL_URL}` (when Vercel injects it) → `http://localhost:3000`. Documented `INTERNAL_BASE_URL` in `.env.example` with a comment explaining the Vercel behaviour. The direct-DB alternative would have required restructuring the server component and removing the session-cookie forwarding path; the fallback chain is the lower-scope fix.

- **[non-blocking]** HabitCalendar.tsx:58-60 — removed invalid `role="grid"` — `e5df48d`: Dropped `role="grid"` and `aria-label` from the day-cell container. Without `role="row"` / `role="gridcell"` descendants, asserting `role="grid"` creates a broken ARIA pattern that is worse than implicit semantics.

- **[non-blocking]** DayCell.tsx:19-42 — sr-only status text for completed cells — `e5df48d`: Added `<span aria-hidden="true">{day}</span><span className="sr-only">{day} (completed)</span>` to the completed branch, following the same pattern already used for skipped. Pending cells remain bare (the number is the natural default state).

- **[non-blocking]** docs/implementation/smoke-test — deleted unrelated artifacts — `3e73403`: Removed `docs/implementation/smoke-test/results/result.json` and `stdout.json`, which arrived via a housekeeping commit and are unrelated to the habits-calendar feature.

- **[non-blocking]** app/api/logout/route.ts — no sign-out UI — `ff4d1a2`: Updated `POST /api/logout` to redirect to `/login` after destroying the session (was returning JSON). Added a Sign out form in the `app/page.tsx` footer that posts to `/api/logout`.

- **[non-blocking]** HabitCalendar.tsx:72 — `key={date.toISOString()}` → `key={formatYmd(date)}` — `e5df48d`: Dates are already unique within a month grid; the YMD key matches the identity used everywhere else in the file. `formatYmd` imported from `month-grid.ts` (already a dependency).

## Deferred

None.

## New issues surfaced during fixes

None.
