import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { purgeExpiredAndArchivedVoters } from "@/db/queries";
import { requireEnv } from "@/lib/env";

const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), ARCHIVE_GRACE_MS);
  return NextResponse.json({ deletedCount: deletedIds.length, deletedIds });
}
