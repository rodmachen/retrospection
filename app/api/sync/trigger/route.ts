import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runSeed } from "@/sync/seed";

export async function POST() {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TODOIST_API_TOKEN not configured" },
      { status: 500 }
    );
  }

  const timezone = process.env.TZ || "America/Chicago";
  const db = getDb();

  const result = await runSeed(db, token, timezone);
  return NextResponse.json({ status: "ok", result });
}
