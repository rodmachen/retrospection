import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryTaskById } from "@/api/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const task = await queryTaskById(db, id);

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}
