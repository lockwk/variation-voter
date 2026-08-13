import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { commentSchema } from "@/lib/validation";
import { upsertComment } from "@/db/queries";
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
  const comment = await upsertComment(db, variationId, viewerId, parsed.data);
  return NextResponse.json({ comment });
}
