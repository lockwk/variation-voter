import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { closeVoter } from "@/db/queries";

export async function POST(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;
  const voter = await closeVoter(db, voterId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
