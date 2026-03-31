import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryLatestSync } from "@/api/queries";

export async function GET() {
  const db = getDb();
  const latest = await queryLatestSync(db);

  if (!latest) {
    return NextResponse.json({ status: "never_synced" });
  }

  return NextResponse.json(latest);
}
