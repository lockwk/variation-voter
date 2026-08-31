import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { commentSchema } from "@/lib/validation";
import { createComment, createReply } from "@/db/queries";
import { findActiveVariationError, resolveViewerId } from "../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string }> }
) {
  const { voterId, variationId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const viewerId = resolveViewerId(request);
  const { comment, voterName, anchorType, selector, offsetX, offsetY, parentCommentId } = parsed.data;

  // KEV-183: a `parentCommentId` on the body means this is a reply to an
  // existing root pin, not a new pin drop — routed to createReply, which
  // does the flat-thread validation (parent exists on this variation, and is
  // itself a root) that zod alone can't express. No separate route: replies
  // still POST to the same `/comments` endpoint as root comments.
  if (parentCommentId) {
    const result = await createReply(db, { variationId, viewerId, comment, voterName, parentCommentId });
    if (!result.ok) {
      const message =
        result.error === "parent_not_root"
          ? "Cannot reply to a reply — replies must target a root comment."
          : "Parent comment not found on this variation.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ comment: result.comment }, { status: 201 });
  }

  const created = await createComment(db, {
    variationId,
    viewerId,
    comment,
    voterName,
    anchorType,
    selector: selector ?? undefined,
    offsetX: offsetX ?? undefined,
    offsetY: offsetY ?? undefined,
  });
  // A new pin comment is a genuinely new resource, so 201 (mirrors the votes
  // route's "added" case) rather than the bare 200 this handler used before
  // anchor support landed.
  return NextResponse.json({ comment: created }, { status: 201 });
}
