# Feedback — Address review findings

You are a Sonnet subagent. The Opus reviewer produced a JSON list of findings; your job is to address them.

## Inputs

1. **Review findings**: `docs/implementation/let-s-get-back-to-curried-spring/results/review.json`
2. **Plan**: `docs/plans/let-s-get-back-to-curried-spring.md`
3. **Working tree**: branch `feature/habits-calendar-v1`, all five steps committed.

## Working directory and branch

- CWD: `/Users/rodmachen/code/retrospection`
- Branch: `feature/habits-calendar-v1`. Do not switch branches. Do not push.

## What to do

1. Read `review.json`. Group findings by severity.
2. **All `blocking` items must be addressed.** No exceptions.
3. **`non-blocking` items: address by best judgment.** Prefer addressing them. Only defer one if it would meaningfully expand scope OR if you disagree (with reasoning). Document deferrals.
4. For each addressed item: edit the relevant file(s), run the verification (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`), and ensure all are green before committing.
5. Make ONE commit per logical group of fixes. Multiple commits OK if the fixes are unrelated. Use HEREDOC with co-author trailer:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
6. Subject prefix: `Review: <short description>` (e.g. `Review: Fix UTC handling in month rollover`).

## If review is empty

If `review.json` is `[]`, write the feedback report stating that nothing required addressing, do not make any commits, and exit cleanly.

## Output

Write `docs/implementation/let-s-get-back-to-curried-spring/feedback-report.md` (note: in the implementation root, not in `results/`). Markdown, with sections:

```markdown
# Feedback report

## Addressed
- **[blocking|non-blocking]** {description} — {commit sha or "no commit needed"}: {what was done}
- ...

## Deferred
- **[non-blocking]** {description}: {why deferred — one to two sentences}
- ...

## New issues surfaced during fixes
- {description, severity, recommendation} — or "None"
```

Also write `docs/implementation/let-s-get-back-to-curried-spring/results/feedback.json`:

```json
{
  "addressedCount": N,
  "deferredCount": N,
  "commits": ["sha1", "sha2", ...],
  "newIssues": [...]
}
```

## Hard rule

If addressing a finding requires unbounded design re-work or contradicts the plan's confirmed decisions, do NOT do it. Document under "Deferred" with the reason. Plan adherence beats reviewer aesthetic preferences.
