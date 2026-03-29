import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
  verifyHmac,
  checkAndRecordDelivery,
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

  const payload: WebhookPayload = JSON.parse(rawBody);
  const isDuplicate = await checkAndRecordDelivery(
    db,
    deliveryId,
    payload.event_name
  );

  if (isDuplicate) {
    return NextResponse.json({ status: "ok", duplicate: true });
  }

  // Process the event
  await processWebhookEvent(db, payload, timezone, todoistToken);

  return NextResponse.json({ status: "ok" });
}
