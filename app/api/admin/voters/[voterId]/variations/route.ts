import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { addVariationSchema } from "@/lib/validation";
import { addVariation } from "@/db/queries";
import { voters } from "@/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;

  const [voter] = await db.select({ id: voters.id }).from(voters).where(eq(voters.id, voterId));
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = addVariationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const variation = await addVariation(db, voterId, parsed.data);
  return NextResponse.json({ variation }, { status: 201 });
}
