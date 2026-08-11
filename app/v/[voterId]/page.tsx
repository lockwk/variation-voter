import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";
import { VoterShell } from "./voter-shell";

export default async function VoterPage({ params }: { params: Promise<{ voterId: string }> }) {
  const { voterId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) notFound();
  return <VoterShell voter={voter} initialVariationId={voter.variations[0]?.id ?? null} />;
}
