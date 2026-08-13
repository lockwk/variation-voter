import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { variations, voters } from "@/db/schema";
import { getViewerIdFromRequest } from "@/lib/viewer";
import { newId } from "@/lib/ids";

// middleware.ts guarantees the vv_viewer cookie on every real request; this
// fallback only covers callers that invoke a handler directly without going
// through middleware (e.g. unit tests), so a handler never crashes for lack
// of an identity — it just treats that single request as its own anonymous
// viewer.
export function resolveViewerId(request: Request): string {
  return getViewerIdFromRequest(request) ?? newId();
}

export async function findActiveVariationError(voterId: string, variationId: string) {
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
