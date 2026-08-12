"use client";

import { useEffect, useRef, useState } from "react";
import { Menu02 } from "@untitledui/icons";
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
  const [isNavOpen, setIsNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const selected = variations.find((v) => v.id === selectedId) ?? null;

  function closeNav() {
    setIsNavOpen(false);
    menuButtonRef.current?.focus();
  }

  // Lets a mobile drawer-open user dismiss it with Escape, matching the
  // backdrop-click affordance below.
  useEffect(() => {
    if (!isNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeNav();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNavOpen]);

  function selectVariation(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, "", `/v/${voter.id}/${id}`);
    // Return focus to a visible element when dismissing the mobile drawer; guard
    // on isNavOpen so we don't focus the md:hidden menu button on desktop.
    if (isNavOpen) closeNav();
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
      {isNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeNav}
          className="fixed inset-0 z-30 bg-overlay/50 md:hidden"
        />
      )}
      <VariationList
        voterTitle={voter.title}
        variations={variations}
        selectedId={selectedId}
        sortMode={sortMode}
        onSelect={selectVariation}
        onSortModeChange={setSortMode}
        isOpen={isNavOpen}
        onClose={closeNav}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open variation menu"
          onClick={() => setIsNavOpen(true)}
          className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-secondary text-secondary hover:text-primary"
        >
          <Menu02 className="size-5 shrink-0" />
          <span className="truncate font-medium">{voter.title}</span>
        </button>
        <Stage
          variation={selected}
          voterId={voter.id}
          voterStatus={voter.status}
          onVoteCast={recordOptimisticVote}
          onVoteCastFailed={rollBackOptimisticVote}
          onCommentSubmit={recordComment}
        />
      </div>
    </div>
  );
}
