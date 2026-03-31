import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  verifyHmac,
  isDuplicateDelivery,
  recordDelivery,
  processWebhookEvent,
} from "@/sync/webhook";
import type { WebhookPayload } from "@/sync/webhook";

export async function POST(request: NextRequest) {
  const clientSecret = process.env.TODOIST_CLIENT_SECRET;
  const todoistToken = process.env.TODOIST_API_TOKEN;
  const timezone = process.env.TZ || "America/Chicago";

  if (!clientSecret || !todoistToken) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  // Read raw body for HMAC verification
  const rawBody = await request.text();

  // Verify HMAC signature
  const signature = request.headers.get("x-todoist-hmac-sha256");
  if (!signature || !verifyHmac(rawBody, clientSecret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Deduplicate by delivery ID
  const deliveryId = request.headers.get("x-todoist-delivery-id");
  if (!deliveryId) {
    return NextResponse.json(
      { error: "Missing delivery ID" },
      { status: 400 }
    );
  }

  const db = getDb();

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (await isDuplicateDelivery(db, deliveryId)) {
    return NextResponse.json({ status: "ok", duplicate: true });
  }

  // Process first, then record delivery so retries aren't permanently blocked on failure
  await processWebhookEvent(db, payload, timezone, todoistToken);
  await recordDelivery(db, deliveryId, payload.event_name);

  return NextResponse.json({ status: "ok" });
}
