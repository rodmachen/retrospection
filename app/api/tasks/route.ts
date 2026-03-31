import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryTasks } from "@/api/queries";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filters = {
    completed:
      searchParams.has("completed")
        ? searchParams.get("completed") === "true"
        : undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    limit: searchParams.has("limit")
      ? Math.min(parseInt(searchParams.get("limit")!, 10) || 50, 200)
      : 50,
    offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  };

  const db = getDb();
  const tasks = await queryTasks(db, filters);
  return NextResponse.json(tasks);
}
