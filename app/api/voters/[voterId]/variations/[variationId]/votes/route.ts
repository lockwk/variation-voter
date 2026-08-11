import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { castVoteSchema, updateVoteSchema } from "@/lib/validation";
import { castVote, attachCommentToVote } from "@/db/queries";
import { variations, voters } from "@/db/schema";

async function findActiveVariationError(voterId: string, variationId: string) {
  const [row] = await db
    .select({ voterId: variations.voterId, status: voters.status })
    .from(variations)
    .innerJoin(voters, eq(voters.id, variations.voterId))
    .where(eq(variations.id, variationId));

  if (!row || row.voterId !== voterId) {
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });
  }
  if (row.status !== "active") {
    return NextResponse.json({ error: "Voting is closed for this voter" }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string }> }
) {
  const { voterId, variationId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = castVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vote = await castVote(db, variationId, parsed.data);
  return NextResponse.json({ vote }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string }> }
) {
  const { voterId, variationId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = updateVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { voteId, ...update } = parsed.data;
  const vote = await attachCommentToVote(db, voteId, variationId, update);
  if (!vote) {
    return NextResponse.json({ error: "Vote not found" }, { status: 404 });
  }
  return NextResponse.json({ vote });
}
