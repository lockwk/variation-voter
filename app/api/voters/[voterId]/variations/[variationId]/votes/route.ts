import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { castVoteSchema, updateVoteSchema } from "@/lib/validation";
import { toggleVote, attachCommentToVote } from "@/db/queries";
import { variations, voters } from "@/db/schema";
import { getViewerIdFromRequest } from "@/lib/viewer";
import { newId } from "@/lib/ids";

// middleware.ts guarantees the vv_viewer cookie on every real request; this
// fallback only covers callers that invoke the handler directly without
// going through middleware (e.g. unit tests), so the handler never crashes
// for lack of an identity — it just treats that single request as its own
// anonymous viewer.
function resolveViewerId(request: Request): string {
  return getViewerIdFromRequest(request) ?? newId();
}

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

  const viewerId = resolveViewerId(request);
  const result = await toggleVote(db, variationId, viewerId, parsed.data.direction);
  // "added" is a genuinely new resource (201); "switched" updates the existing
  // vote row and "removed" undoes it entirely, so both are 200 with vote: null
  // on removal — callers (see stage.tsx) must guard on a possibly-null vote.
  return NextResponse.json(
    { vote: result.vote, state: result.state },
    { status: result.state === "added" ? 201 : 200 }
  );
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

  const viewerId = resolveViewerId(request);
  const vote = await attachCommentToVote(db, variationId, viewerId, parsed.data);
  if (!vote) {
    return NextResponse.json({ error: "Vote before commenting" }, { status: 409 });
  }
  return NextResponse.json({ vote });
}
