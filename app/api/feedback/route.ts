import { NextResponse } from "next/server";
import { feedbackSchema } from "@/lib/validation";
import { isLinearConfigured, sendFeedbackToLinear } from "@/lib/linear";
import { getViewerIdFromRequest } from "@/lib/viewer";

// KEV-207: lets a voter send product feedback about Variation Voter itself
// (not commentary on the variations being voted on) straight to Kevin, via a
// Linear Triage issue. See lib/linear.ts for the actual Linear call — kept
// separate so it's testable in isolation and so a DB-backup sink (mentioned
// there) can be bolted on later without touching this route.
//
// This endpoint is deliberately public and cross-origin: every self-hosted
// install's client posts here (see FEEDBACK_ENDPOINT in voter-shell.tsx) so
// all feedback lands in Kevin's Linear, not scattered across installs that
// have no LINEAR_API_KEY. `Access-Control-Allow-Origin: *` is correct for a
// public, credential-less intake endpoint like this one — no cookies or
// auth are required or read from cross-origin callers (getViewerIdFromRequest
// will usually come back null for them, which lib/linear.ts already handles).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400, headers: CORS_HEADERS });
  }

  if (!isLinearConfigured()) {
    console.warn("app/api/feedback: LINEAR_API_KEY is not set — feedback submission dropped.");
    return NextResponse.json({ error: "Feedback is not configured" }, { status: 503, headers: CORS_HEADERS });
  }

  const { message, voterId, path, origin } = parsed.data;
  const viewerId = getViewerIdFromRequest(request);

  try {
    await sendFeedbackToLinear({ message, voterId, viewerId, path, origin });
  } catch (error) {
    console.error("app/api/feedback: failed to create Linear issue:", error);
    return NextResponse.json({ error: "Could not send feedback" }, { status: 502, headers: CORS_HEADERS });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
}
