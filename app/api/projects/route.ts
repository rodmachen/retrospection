import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { queryProjects } from "@/api/queries";

export async function GET() {
  const db = getDb();
  const projectList = await queryProjects(db);
  return NextResponse.json(projectList);
}
