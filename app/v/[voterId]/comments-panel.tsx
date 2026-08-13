"use client";

import { useState } from "react";
import { ArrowUp, Lock01, ThumbsDown, ThumbsUp } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { relativeTimeFrom } from "@/lib/relative-time";
import { useScrollFade } from "./use-scroll-fade";
import type { VariationComment, VariationWithAggregates } from "@/db/queries";

// H3: same scroll-fade treatment as the variation list (E4).
const SCROLL_FADE_STYLE = { background: "linear-gradient(180deg, transparent, rgba(33,33,33,0.35))" };

export function CommentsPanel({
  voterId,
  variation,
  voterStatus,
  onCommentSubmit,
}: {
  voterId: string;
  variation: VariationWithAggregates | null;
  voterStatus: "active" | "archived";
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listRef, showFade] = useScrollFade<HTMLUListElement>([variation?.comments.length ?? 0]);

  // A draft comment is scoped to whichever variation it was typed for — carrying
  // it across a switch would risk posting "meant for A" onto variation B. The
  // name is kept (a real visitor's name doesn't change between variations).
  // Resetting during render (React's "adjusting state when a prop changes"
  // pattern) rather than in an effect avoids an extra post-mount render pass.
  const [trackedVariationId, setTrackedVariationId] = useState(variation?.id ?? null);
  if ((variation?.id ?? null) !== trackedVariationId) {
    setTrackedVariationId(variation?.id ?? null);
    setComment("");
    setError(null);
  }

  // Comments (G3) and voting (route.ts's findActiveVariationError) are both
  // gated behind an active, voted-on variation.
  const locked = voterStatus === "archived" || !variation || variation.viewerVote === null;
  // The send button's enabled look (design node 28Z-0) tracks whether there's
  // actually something to submit, not just whether the composer is unlocked.
  const canSubmit = !locked && !isSubmitting && comment.trim().length > 0;

  async function submit() {
    if (!variation || locked || isSubmitting) return;
    const trimmed = comment.trim();
    // Empty comment does nothing — there's no vote-attach step left to skip
    // past (that already happened when the vote was cast), unlike the old flow.
    if (!trimmed) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: trimmed, voterName: name.trim() || undefined }),
      });
      if (!response.ok) {
        setError("Couldn't save your comment. Please try again.");
        return;
      }
      onCommentSubmit(variation.id, trimmed, name.trim() || null);
      setComment("");
    } catch {
      setError("Couldn't save your comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <div className="shrink-0 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#E8E8E8]">Comments</h2>
        {variation && variation.viewerVote === null && (
          <div className="flex items-center gap-1 text-[#A1A1AA]">
            <Lock01 aria-hidden="true" className="size-4" />
            <span className="text-xs font-medium">Vote to unlock commenting</span>
          </div>
        )}
      </div>

      <div
        className={cx("shrink-0 flex flex-col gap-0.5 rounded-lg", locked && "opacity-50")}
        aria-disabled={locked}
      >
        <div className="flex h-12 items-center rounded-t-lg bg-[#2B2B2B] py-2 pl-3 pr-2">
          <input
            aria-label="Your name (optional)"
            placeholder="Your name (optional)"
            value={name}
            disabled={locked}
            onChange={(event) => setName(event.target.value)}
            className="w-full min-w-0 bg-transparent text-sm text-[#E8E8E8] outline-none placeholder:text-[#A1A1AA] disabled:cursor-not-allowed"
          />
        </div>
        <div className="flex h-12 items-center gap-2 rounded-b-lg bg-[#2B2B2B] py-2 pl-3 pr-2">
          <input
            aria-label={`Add a comment about ${variation?.title ?? "this variation"}`}
            placeholder={`Add a comment about ${variation?.title ?? "this variation"}`}
            value={comment}
            disabled={locked}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#E8E8E8] outline-none placeholder:text-[#A1A1AA] disabled:cursor-not-allowed"
          />
          <button
            type="button"
            aria-label="Send comment"
            disabled={!canSubmit}
            onClick={submit}
            style={
              canSubmit
                ? { boxShadow: "inset 0 -0.5px 0 #0000004D", borderTop: "0.5px solid #FFFFFF80" }
                : undefined
            }
            className={cx(
              "flex size-8 shrink-0 items-center justify-center rounded-[4px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed",
              canSubmit ? "bg-[#E8E8E8]" : "bg-[#52525B]"
            )}
          >
            <ArrowUp aria-hidden="true" className="size-4" color="#2B2B2B" />
          </button>
        </div>
      </div>
      {error && <p className="shrink-0 text-xs text-error-primary">{error}</p>}

      <div className="relative flex-1 min-h-0">
        <ul ref={listRef} className="flex h-full flex-col gap-6 overflow-y-auto scrollbar-hide">
          {!variation || variation.comments.length === 0 ? (
            <li className="text-sm text-[#A1A1AA]">No comments yet.</li>
          ) : (
            variation.comments.map((item) => <CommentItem key={item.id} comment={item} />)
          )}
        </ul>
        {showFade && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8" style={SCROLL_FADE_STYLE} />
        )}
      </div>
    </div>
  );
}

// H2: own comments (including the server-reloaded copy of an optimistically
// prepended one, since isOwn survives the reload) always read "{name} (You)",
// falling back to bare "You" when no name was entered.
function commentDisplayName(comment: VariationComment): string {
  const trimmedName = comment.voterName?.trim();
  if (comment.isOwn) return trimmedName ? `${trimmedName} (You)` : "You";
  return trimmedName || "Anonymous";
}

function CommentItem({ comment }: { comment: VariationComment }) {
  const DirectionIcon = comment.direction === "up" ? ThumbsUp : ThumbsDown;
  const directionColor = comment.direction === "up" ? "#86EFAC" : "#FCA5A5";

  return (
    <li className="flex flex-col gap-3 py-2 pl-3 pr-2">
      <div className="flex items-center gap-2">
        <DirectionIcon aria-hidden="true" className="size-4 shrink-0" color={directionColor} />
        <span className="truncate text-sm font-medium text-primary">{commentDisplayName(comment)}</span>
        <span className="shrink-0 text-sm text-tertiary">{relativeTimeFrom(comment.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm font-medium text-primary">{comment.comment}</p>
    </li>
  );
}
