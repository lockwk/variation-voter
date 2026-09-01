"use client";

import { useEffect, useRef, useState } from "react";
import { Menu02 } from "@untitledui/icons";
import { Toaster, toast } from "sonner";
import type { VoterDetail, VoteDirection } from "@/db/queries";
import { computeOptimisticVote } from "@/lib/optimistic-vote";
import { type SortMode } from "./variation-list";
import { Rail } from "./rail";
import { Stage } from "./stage";
import { useVoterPolling } from "./use-voter-polling";
import { CommentToast, VoteToast } from "./toast";

// The count of OTHER viewers' votes on a variation — mirrors the up/down
// decomposition in applySnapshot's merge below, so the viewer's own vote
// (including a downvote) never contributes to the "N new votes" toast.
function othersVoteCount(variation: Pick<VoterDetail["variations"][number], "up" | "down" | "viewerVote">): number {
  const othersUp = variation.up - (variation.viewerVote === "up" ? 1 : 0);
  const othersDown = variation.down - (variation.viewerVote === "down" ? 1 : 0);
  return othersUp + othersDown;
}

type SnapshotEntry = { commentIds: Set<string>; othersCount: number };

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
  // The viewer's own optimistic vote per variationId, keyed while a local
  // vote (in flight or just-reconciled) hasn't yet been confirmed by a poll —
  // see applySnapshot, which is the only place entries are cleared.
  const pendingVotesRef = useRef<Map<string, VoteDirection | null>>(new Map());
  // Real DB ids of just-submitted comments not yet seen in a poll response —
  // kept so applySnapshot's server-authoritative merge doesn't momentarily
  // drop a comment the viewer just posted.
  const pendingCommentIdsRef = useRef<Set<string>>(new Set());
  // KEV-161: per-variation last-seen comment ids + others' vote counts, used
  // solely to diff each poll snapshot against the previous one for toast
  // purposes — independent of (and read before) the merge state above.
  const prevSnapshotRef = useRef<Map<string, SnapshotEntry>>(new Map());
  // True only for the very first snapshot after mount, so seeding
  // prevSnapshotRef never fires a burst of toasts for pre-existing activity.
  const isFirstSnapshotRef = useRef(true);

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
    // Keep the poller's vote merge from reverting this click while it's in
    // flight (or before the next poll confirms it) — see applySnapshot.
    pendingVotesRef.current.set(variationId, optimistic.viewerVote);

    try {
      const response = await fetch(`/api/voters/${voter.id}/variations/${variationId}/votes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        applyVariation(variationId, snapshot);
        pendingVotesRef.current.set(variationId, snapshot.viewerVote);
        setVoteError("Couldn't record your vote. Please try again.");
        return;
      }
      const { vote, state } = await response.json();
      // Reconcile to the server's authoritative outcome — "removed" is the
      // toggle-off/undo case (vote: null); "added"/"switched" both carry the
      // vote's (possibly server-decided) direction.
      const reconciledVote = state === "removed" ? null : (vote?.direction ?? optimistic.viewerVote);
      applyVariation(variationId, { viewerVote: reconciledVote });
      pendingVotesRef.current.set(variationId, reconciledVote);
    } catch {
      applyVariation(variationId, snapshot);
      pendingVotesRef.current.set(variationId, snapshot.viewerVote);
      setVoteError("Couldn't record your vote. Please try again.");
    } finally {
      setVotingId(null);
    }
  }

  // H2: the submitter's own comment prepends immediately with "{name} (You)"
  // (bare "You" with no name) and a "now" timestamp; the server-reloaded copy
  // stays labeled the same way once it comes back marked isOwn. `id`/`createdAt`
  // are the real DB values from the POST response (not fabricated) so the
  // poller's dedup-by-id merge (applySnapshot) recognizes this comment the
  // moment a poll picks it up, instead of ever showing it twice.
  function recordCommentOptimistic(
    variationId: string,
    comment: string,
    voterName: string | null,
    id: string,
    createdAt: string | Date
  ) {
    pendingCommentIdsRef.current.add(id);
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              comments: [
                {
                  id,
                  comment,
                  voterName,
                  createdAt: new Date(createdAt),
                  direction: v.viewerVote ?? null,
                  isOwn: true,
                },
                ...v.comments,
              ],
            }
          : v
      )
    );
  }

  // KEV-90: every open tab quietly re-fetches the full voter snapshot every
  // ~5s (see use-voter-polling.ts) so new comments and vote counts from other
  // viewers show up without a refresh. This is the only place merging
  // happens, since this component owns `variations` state.
  //
  // Matches server variations to local ones by id (local order wins; a server
  // variation not present locally is ignored — this component never adds or
  // removes variations from a poll). For each matched pair:
  //
  // Vote merge decomposes "mine" vs "others" so a just-cast vote is never
  // reverted by a poll that hasn't caught up yet, while other viewers' votes
  // still land immediately.
  //
  // Comment merge is server-authoritative + a pending overlay: start from the
  // server's list (already ordered, already carries the right isOwn), and
  // keep only the local pending comments the server hasn't echoed back yet.
  //
  // Only variations whose merged fields actually changed are replaced, and
  // setVariations is skipped entirely if nothing changed anywhere (the common
  // case) — this is what keeps five-second polling invisible.
  function applySnapshot(server: VoterDetail) {
    // KEV-161: diff this snapshot against the previous one to fire toasts for
    // OTHER viewers' new activity. Runs before the merge below (and reads
    // pendingCommentIdsRef before the merge deletes entries from it) so the
    // viewer's own just-posted comment is reliably excluded.
    if (isFirstSnapshotRef.current) {
      // Seed silently — no toasts for activity that predates this mount.
      isFirstSnapshotRef.current = false;
    } else {
      const prev = prevSnapshotRef.current;
      for (const v of server.variations) {
        const prevEntry = prev.get(v.id);
        // A variation with no prior entry is being seen for the first time
        // this poll (e.g. it wasn't present in the previous snapshot) —
        // treat it like the first-snapshot seed and skip toasts for it.
        if (!prevEntry) continue;

        for (const comment of v.comments) {
          if (
            !prevEntry.commentIds.has(comment.id) &&
            !comment.isOwn &&
            !pendingCommentIdsRef.current.has(comment.id)
          ) {
            toast.custom(
              (id) => (
                <CommentToast
                  message={`New comment on ${v.title}`}
                  onClick={() => {
                    selectVariation(v.id);
                    toast.dismiss(id);
                  }}
                  onDismiss={() => toast.dismiss(id)}
                />
              ),
              { duration: 4000 }
            );
          }
        }

        const othersCount = othersVoteCount(v);
        const delta = Math.max(0, othersCount - prevEntry.othersCount);
        for (let i = 0; i < delta; i++) {
          toast.custom(
            (id) => (
              <VoteToast
                message={`New vote on ${v.title}`}
                onClick={() => selectVariation(v.id)}
                onDismiss={() => toast.dismiss(id)}
              />
            ),
            { duration: 4000 }
          );
        }
      }
    }
    // Update unconditionally every poll (even when the merge below leaves
    // `variations` untouched) so vote/comment counts never drift out from
    // under the next diff.
    prevSnapshotRef.current = new Map(
      server.variations.map((v) => [
        v.id,
        { commentIds: new Set(v.comments.map((c) => c.id)), othersCount: othersVoteCount(v) },
      ])
    );

    let changed = false;
    const next = variations.map((local) => {
      const match = server.variations.find((v) => v.id === local.id);
      if (!match) return local;

      const othersUp = match.up - (match.viewerVote === "up" ? 1 : 0);
      const othersDown = match.down - (match.viewerVote === "down" ? 1 : 0);
      const pending = pendingVotesRef.current.get(local.id);
      const myVote = pending !== undefined ? pending : match.viewerVote;
      const up = othersUp + (myVote === "up" ? 1 : 0);
      const down = othersDown + (myVote === "down" ? 1 : 0);
      const score = up - down;
      const viewerVote = myVote;

      // A vote POST in flight for this row keeps its pending value in force;
      // otherwise, once the server agrees with it, the entry's job is done.
      if (votingId !== local.id && pending !== undefined && match.viewerVote === pending) {
        pendingVotesRef.current.delete(local.id);
      }

      const pendingIds = pendingCommentIdsRef.current;
      const unmatchedPending = local.comments.filter(
        (c) => pendingIds.has(c.id) && !match.comments.some((sc) => sc.id === c.id)
      );
      // `server` came from `await response.json()` (use-voter-polling.ts), so
      // every comment's createdAt arrived as a JSON string, not a Date —
      // re-hydrate it here so mergedComments satisfies VariationComment's
      // `createdAt: Date` contract before it ever reaches CommentItem's
      // relativeTimeFrom (lib/relative-time.ts), which calls date.getTime().
      const serverComments = match.comments.map((c) => ({
        ...c,
        createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt),
      }));
      const seen = new Set<string>();
      const mergedComments = [...unmatchedPending, ...serverComments].filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      for (const c of match.comments) {
        pendingIds.delete(c.id);
      }

      const votesChanged =
        local.up !== up || local.down !== down || local.score !== score || local.viewerVote !== viewerVote;
      const commentsChanged =
        local.comments.length !== mergedComments.length ||
        local.comments.some((c, i) => c.id !== mergedComments[i]?.id);

      if (!votesChanged && !commentsChanged) return local;

      changed = true;
      return { ...local, up, down, score, viewerVote, comments: mergedComments };
    });

    if (!changed) return;
    setVariations(next);
  }

  useVoterPolling({ voterId: voter.id, onSnapshot: applySnapshot });

  return (
    <>
      <Toaster position="bottom-right" duration={4000} theme="dark" gap={8} offset={16} />
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
    </>
  );
}
