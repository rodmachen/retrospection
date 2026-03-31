import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryCompletionStats } from "@/api/queries";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = Math.min(parseInt(searchParams.get("days") ?? "30", 10) || 30, 365);

  const db = getDb();
  const stats = await queryCompletionStats(db, days);
  return NextResponse.json(stats);
}
