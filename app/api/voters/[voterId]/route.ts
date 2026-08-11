import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  const { voterId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
