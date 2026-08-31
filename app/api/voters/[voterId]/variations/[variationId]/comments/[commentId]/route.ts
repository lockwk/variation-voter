import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { commentStatusSchema } from "@/lib/validation";
import { updateCommentStatus, deleteComment } from "@/db/queries";
import { findActiveVariationError, resolveViewerId } from "../../_shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string; commentId: string }> }
) {
  const { voterId, variationId, commentId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = commentStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const viewerId = resolveViewerId(request);
  const comment = await updateCommentStatus(db, {
    id: commentId,
    viewerId,
    status: parsed.data.status,
  });
  // updateCommentStatus scopes its UPDATE to (id, viewerId), so a null result
  // covers both "no such comment" and "comment belongs to another viewer".
  // Authorization here is anonymous-cookie-scoped only (no admin concept), so
  // we don't try to tell those two cases apart — 403 either way, matching the
  // author-scoped delete below.
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 403 });
  }
  return NextResponse.json({ comment });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string; commentId: string }> }
) {
  const { voterId, variationId, commentId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const viewerId = resolveViewerId(request);
  const deleted = await deleteComment(db, { id: commentId, viewerId });
  if (!deleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
