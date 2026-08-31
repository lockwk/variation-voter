import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { commentStatusSchema } from "@/lib/validation";
import { updateCommentStatus, deleteComment } from "@/db/queries";
import { findActiveVariationError } from "../../_shared";

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

  const comment = await updateCommentStatus(db, {
    id: commentId,
    status: parsed.data.status,
  });
  // updateCommentStatus scopes its UPDATE to id alone, so a null result means
  // the comment doesn't exist. Authorization policy here is "any viewer of
  // this voter may complete/reopen any comment" (no author restriction, no
  // admin concept) — findActiveVariationError above is still what gates this
  // on the voter being active (not archived).
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

  const deleted = await deleteComment(db, { id: commentId });
  if (!deleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
