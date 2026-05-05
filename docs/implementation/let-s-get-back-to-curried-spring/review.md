# Review summary

Opus reviewer (xhigh) returned **8 findings — all non-blocking, 0 blocking**.

## Findings (severity: non-blocking)

| # | Location | Theme |
|---|---|---|
| 1 | `middleware.ts:59` | `/api/health` lost its public exception when the matcher was rewritten — breaks documented unauthenticated probes |
| 2 | `src/web/habits-client.ts:9-10` | `section`/`sectionOrder` typed non-nullable but API can return null (LEFT JOIN); silently breaks grouping for sectionless habits |
| 3 | `src/web/habits-client.ts:32-33` | `INTERNAL_BASE_URL` localhost fallback breaks on Vercel deploy; not in `.env.example` |
| 4 | `src/web/components/HabitCalendar.tsx:58-60` | `role="grid"` declared but children lack matching `role="row"`/`role="gridcell"` — worse than implicit semantics |
| 5 | `src/web/components/DayCell.tsx:19-42` | Only skipped state has `sr-only` status; completed and pending are indistinguishable to AT |
| 6 | `docs/implementation/smoke-test/*` | Travel-along files from the housekeeping commit clutter the PR diff |
| 7 | `app/api/logout/route.ts` | Endpoint exists but no UI surface invokes it (plan-conforming; v2 candidate) |
| 8 | `src/web/components/HabitCalendar.tsx:72` | `key={date.toISOString()}` — style nit, switch to `formatYmd(date)` |

## Orchestrator notes

- Items 1, 2, 4, 5 are real correctness/accessibility issues — feedback agent should address all four.
- Item 3 has two suggested fixes; the smaller one (Vercel URL fallback + `.env.example` doc) is preferred over the architectural one (call DB directly from server component). The feedback prompt's "no unbounded design re-work" rule should keep the agent on the smaller fix.
- Item 6 should be addressed via a new delete commit, NOT history rewrite.
- Items 7 and 8 are low-value; agent's call.

Raw JSON: `results/review.json`.
