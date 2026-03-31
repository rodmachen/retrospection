import "dotenv/config";
import { getDb } from "../src/db/client";
import { runSeed } from "../src/sync/seed";

async function main() {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("TODOIST_API_TOKEN environment variable is required");
    process.exit(1);
  }

  const timezone = process.env.TZ || "America/Chicago";
  console.log(`Starting seed (timezone: ${timezone})...`);

  const db = getDb();
  const result = await runSeed(db, token, timezone);

  console.log("\nSeed complete:");
  console.log(`  Projects:              ${result.projects}`);
  console.log(`  Sections:              ${result.sections}`);
  console.log(`  Active tasks:          ${result.activeTasks}`);
  console.log(`  Completed tasks:       ${result.completedTasks}`);
  console.log(`  Inferred completions:  ${result.inferredCompletions}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
