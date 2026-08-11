import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";
import { VoterShell } from "../voter-shell";

export default async function VoterVariationPage({
  params,
}: {
  params: Promise<{ voterId: string; variationId: string }>;
}) {
  const { voterId, variationId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) notFound();
  const exists = voter.variations.some((v) => v.id === variationId);
  return (
    <VoterShell
      voter={voter}
      initialVariationId={exists ? variationId : voter.variations[0]?.id ?? null}
    />
  );
}
