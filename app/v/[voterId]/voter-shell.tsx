"use client";

import { useEffect, useRef, useState } from "react";
import { Menu02 } from "@untitledui/icons";
import type { VoterDetail, VoteDirection } from "@/db/queries";
import { computeOptimisticVote } from "@/lib/optimistic-vote";
import { type SortMode } from "./variation-list";
import { Rail } from "./rail";
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
  // Only one row can vote at a time (the selected row's inline control, E3/F3);
  // tracking the in-flight variation id disables its buttons and guards
  // against a rapid double-click firing two POSTs for the same vote.
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
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

  function applyVariation(variationId: string, patch: Partial<VoterDetail["variations"][number]>) {
    setVariations((prev) => prev.map((v) => (v.id === variationId ? { ...v, ...patch } : v)));
  }

  // The optimistic toggle state machine for E3/F3's inline vote control:
  // clicking `direction` on `variationId` casts, switches, or undoes that
  // viewer's vote (see lib/optimistic-vote.ts for the three cases), applies
  // that instantly, then reconciles against the server's authoritative
  // { vote, state } — rolling back to the pre-click snapshot on failure so a
  // rejected request never leaves the displayed state permanently wrong.
  async function castVote(variationId: string, direction: VoteDirection) {
    if (votingId) return;
    const variation = variations.find((v) => v.id === variationId);
    if (!variation) return;

    const snapshot = { up: variation.up, down: variation.down, score: variation.score, viewerVote: variation.viewerVote };
    const optimistic = computeOptimisticVote(variation, direction);

    setVotingId(variationId);
    setVoteError(null);
    applyVariation(variationId, optimistic);

    try {
      const response = await fetch(`/api/voters/${voter.id}/variations/${variationId}/votes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        applyVariation(variationId, snapshot);
        setVoteError("Couldn't record your vote. Please try again.");
        return;
      }
      const { vote, state } = await response.json();
      // Reconcile to the server's authoritative outcome — "removed" is the
      // toggle-off/undo case (vote: null); "added"/"switched" both carry the
      // vote's (possibly server-decided) direction.
      applyVariation(variationId, {
        viewerVote: state === "removed" ? null : (vote?.direction ?? optimistic.viewerVote),
      });
    } catch {
      applyVariation(variationId, snapshot);
      setVoteError("Couldn't record your vote. Please try again.");
    } finally {
      setVotingId(null);
    }
  }

  // H2: the submitter's own comment prepends immediately with "{name} (You)"
  // (bare "You" with no name) and a "now" timestamp; the server-reloaded copy
  // stays labeled the same way once it comes back marked isOwn.
  function recordCommentOptimistic(variationId: string, comment: string, voterName: string | null) {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              comments: [
                {
                  id: `optimistic-${Date.now()}`,
                  comment,
                  voterName,
                  createdAt: new Date(),
                  direction: v.viewerVote ?? "up",
                  isOwn: true,
                },
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
      <Rail
        voterId={voter.id}
        variations={variations}
        selected={selected}
        selectedId={selectedId}
        sortMode={sortMode}
        onSelect={selectVariation}
        onSortModeChange={setSortMode}
        onVote={castVote}
        votingId={votingId}
        voteError={voteError}
        voterStatus={voter.status}
        onCommentSubmit={recordCommentOptimistic}
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
        <Stage variation={selected} />
      </div>
    </div>
  );
}
