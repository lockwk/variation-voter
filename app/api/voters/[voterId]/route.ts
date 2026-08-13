import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";
import { getViewerIdFromRequest } from "@/lib/viewer";

export async function GET(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  const { voterId } = await params;
  const viewerId = getViewerIdFromRequest(request);
  const voter = await getVoterDetail(db, voterId, viewerId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
