import { NextRequest, NextResponse } from "next/server";
import { checkBearerToken } from "@/api/auth";

export function middleware(request: NextRequest) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!checkBearerToken(authHeader, apiKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/((?!health|webhook).*)",
  ],
};
