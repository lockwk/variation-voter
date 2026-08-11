"use client";

import { useState } from "react";
import type { VoterDetail } from "@/db/queries";
import { VariationList, type SortMode } from "./variation-list";
import { Stage } from "./stage";

export function VoterShell({
  voter,
  initialVariationId,
}: {
  voter: VoterDetail;
  initialVariationId: string | null;
}) {
  const [selectedId, setSelectedId] = useState(initialVariationId);
  const [sortMode, setSortMode] = useState<SortMode>("all");
  const [variations, setVariations] = useState(voter.variations);

  const selected = variations.find((v) => v.id === selectedId) ?? null;

  function selectVariation(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, "", `/v/${voter.id}/${id}`);
  }

  function recordOptimisticVote(variationId: string, direction: "up" | "down") {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              up: direction === "up" ? v.up + 1 : v.up,
              down: direction === "down" ? v.down + 1 : v.down,
              score: direction === "up" ? v.score + 1 : v.score - 1,
            }
          : v
      )
    );
  }

  // Reverses recordOptimisticVote when the server rejects the vote (e.g. the
  // voter got archived mid-session), so a failed request never leaves the
  // displayed count permanently wrong.
  function rollBackOptimisticVote(variationId: string, direction: "up" | "down") {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              up: direction === "up" ? v.up - 1 : v.up,
              down: direction === "down" ? v.down - 1 : v.down,
              score: direction === "up" ? v.score - 1 : v.score + 1,
            }
          : v
      )
    );
  }

  function recordComment(variationId: string, comment: string, voterName: string | null) {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              comments: [
                { id: `optimistic-${v.comments.length}`, comment, voterName, createdAt: new Date() },
                ...v.comments,
              ],
            }
          : v
      )
    );
  }

  return (
    <div className="flex h-dvh">
      <VariationList
        voterTitle={voter.title}
        variations={variations}
        selectedId={selectedId}
        sortMode={sortMode}
        onSelect={selectVariation}
        onSortModeChange={setSortMode}
      />
      <Stage
        variation={selected}
        voterId={voter.id}
        voterStatus={voter.status}
        onVoteCast={recordOptimisticVote}
        onVoteCastFailed={rollBackOptimisticVote}
        onCommentSubmit={recordComment}
      />
    </div>
  );
}
