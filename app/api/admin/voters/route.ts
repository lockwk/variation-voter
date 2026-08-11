import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { createVoterSchema } from "@/lib/validation";
import { createVoter, listVoters } from "@/db/queries";

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createVoterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const voter = await createVoter(db, parsed.data);
  return NextResponse.json({ voter, shareUrl: shareUrlFor(voter.id) }, { status: 201 });
}

export async function GET(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const voters = await listVoters(db);
  return NextResponse.json({ voters });
}

function shareUrlFor(voterId: string): string {
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base}/v/${voterId}`;
}
