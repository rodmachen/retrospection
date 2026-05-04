import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { checkBearerToken } from "@/api/auth";
import { getSessionOptions, type SessionData } from "@/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    // API routes: accept either a valid session cookie or a valid Bearer token.
    // This preserves the existing CLI/webhook bearer-token flow.
    const sessionCookie = request.cookies.get("retro_session");
    if (sessionCookie) {
      const response = NextResponse.next();
      const session = await getIronSession<SessionData>(
        request,
        response,
        getSessionOptions()
      );
      if (session.authenticated) {
        return response;
      }
    }

    const apiKey = process.env.API_KEY;
    const authHeader = request.headers.get("authorization");
    if (apiKey && checkBearerToken(authHeader, apiKey)) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // UI routes: require a valid session cookie; redirect to /login otherwise.
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    getSessionOptions()
  );
  if (!session.authenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *   /login             — password form (public)
     *   /api/login         — login API (public)
     *   /api/webhook/*     — Todoist webhook (bearer-token gated separately)
     *   _next/*            — Next.js internals
     *   Static assets      — favicon, images, etc.
     */
    "/((?!login|api/login|api/health|api/webhook|_next/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
