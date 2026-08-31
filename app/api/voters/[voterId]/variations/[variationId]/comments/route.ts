import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { commentSchema } from "@/lib/validation";
import { createComment } from "@/db/queries";
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
  const { comment, voterName, anchorType, selector, offsetX, offsetY } = parsed.data;
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
