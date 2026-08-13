import type { VoteDirection } from "@/db/queries";

export type OptimisticVoteState = {
  up: number;
  down: number;
  score: number;
  viewerVote: VoteDirection | null;
};

/**
 * Computes the optimistic up/down/score/viewerVote delta for clicking
 * direction `direction` on a variation whose current tallies/vote are
 * `current`. Mirrors the server's toggle semantics (db/queries.ts#toggleVote)
 * so the UI updates instantly without waiting on the round trip:
 *  - already voted `direction`  -> undo (decrement, clear viewerVote)
 *  - voted the opposite direction -> switch (move the count over)
 *  - no vote yet                -> add (increment, set viewerVote)
 */
export function computeOptimisticVote(
  current: Pick<OptimisticVoteState, "up" | "down" | "viewerVote">,
  direction: VoteDirection
): OptimisticVoteState {
  let up = current.up;
  let down = current.down;
  let viewerVote: VoteDirection | null;

  if (current.viewerVote === direction) {
    if (direction === "up") up -= 1;
    else down -= 1;
    viewerVote = null;
  } else if (current.viewerVote !== null) {
    if (direction === "up") {
      up += 1;
      down -= 1;
    } else {
      down += 1;
      up -= 1;
    }
    viewerVote = direction;
  } else {
    if (direction === "up") up += 1;
    else down += 1;
    viewerVote = direction;
  }

  return { up, down, score: up - down, viewerVote };
}
