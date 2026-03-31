import "dotenv/config";
import { getDb } from "../src/db/client";
import { insertTaskCompletion } from "../src/sync/upsert";

// Missing completions identified by comparing Todoist Activity Log against DB.
// Skipped: deleted tasks (Les Devoirs, old Marais without emoji), test tasks,
// and Workout (Mar 26) with unclear project mapping.
const MISSING_COMPLETIONS = [
  { date: "2026-03-31", task: "🔵 Marais", taskId: "6gF8fgQjV5V68wqQ" },
  { date: "2026-03-31", task: "🟦 Writing", taskId: "6g8hpWJ9Wvxg285G" },
  { date: "2026-03-30", task: "🟦 Cardio", taskId: "6gF7xHfPrqW6rH5Q" },
  { date: "2026-03-29", task: "🟦 Writing", taskId: "6g8hpWJ9Wvxg285G" },
  { date: "2026-03-29", task: "🔵 Marais", taskId: "6gF8fgQjV5V68wqQ" },
  { date: "2026-03-29", task: "🔵 Taking Charge", taskId: "6gF8jXqVQjhf7PQQ" },
  { date: "2026-03-27", task: "🔵 Marais", taskId: "6gF8fgQjV5V68wqQ" },
  { date: "2026-03-27", task: "🔵 Taking Charge", taskId: "6gF8jXqVQjhf7PQQ" },
  { date: "2026-03-27", task: "React Course", taskId: "6gG66F5MqqH4h6RC" },
  { date: "2026-03-27", task: "🟦 Writing", taskId: "6g8hpWJ9Wvxg285G" },
  { date: "2026-03-26", task: "🔵 Taking Charge", taskId: "6gF8jXqVQjhf7PQQ" },
  { date: "2026-03-26", task: "🟦 Writing", taskId: "6g8hpWJ9Wvxg285G" },
  { date: "2026-03-26", task: "🟦 Strength", taskId: "6gF7xH5q4QRRMmWQ" },
  { date: "2026-03-26", task: "🔵 Marais", taskId: "6gF8fgQjV5V68wqQ" },
] as const;

async function main() {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  console.log(`Backfilling ${MISSING_COMPLETIONS.length} missing completions...`);

  for (const entry of MISSING_COMPLETIONS) {
    // insertTaskCompletion uses onConflictDoNothing — idempotent
    await insertTaskCompletion(db, {
      taskId: entry.taskId,
      completedAt: null,
      completedDate: entry.date,
    });
    console.log(`  ✓ ${entry.date}  ${entry.task}`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} rows attempted (duplicates silently skipped by DB).`);
  console.log("Run again to verify idempotency — output should be the same with 0 new inserts.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
