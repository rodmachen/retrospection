import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryHabitCompletions } from "@/api/queries";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const project = searchParams.get("project") ?? "Habits";
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!start || !end || !dateRe.test(start) || !dateRe.test(end)) {
    return NextResponse.json(
      { error: "start and end query params are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const db = getDb();
  const habits = await queryHabitCompletions(db, project, start, end);

  return NextResponse.json(
    habits.map((h) => ({
      taskId: h.taskId,
      content: h.content,
      section: h.sectionName,
      labels: h.labels,
      description: h.description ?? "",
      createdDate: h.createdDate,
      isActive: true,
      completionDates: h.completionDates,
      skippedDates: h.skippedDates,
    }))
  );
}
