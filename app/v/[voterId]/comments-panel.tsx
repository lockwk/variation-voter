"use client";

import { CheckCircle, RefreshCcw01, Trash01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { relativeTimeFrom } from "@/lib/relative-time";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useScrollFade, SCROLL_FADE_STYLE } from "./use-scroll-fade";
import type { VariationComment, VariationWithAggregates } from "@/db/queries";

// KEV-172 chunk 4: this panel is a "pin tracker" for the selected variation's
// comments — open pins render prominently, completed ones dim into a section
// below, and each row (for its own author) carries a complete/reopen toggle
// and a delete action.
//
// KEV-172 (all-kinds-use-pins pass): the old plain-text "Your name" +
// "Add a comment about <title>" composer that used to live here for
// `url`/`embed` variations is gone — every variation kind now places comments
// exclusively by clicking a pin onto the stage (annotation-layer.tsx), so
// this panel is purely a read/manage surface, never a place to author a new
// comment. The pin composer's own name field (annotation-layer.tsx's
// PinComposer) already covers name capture, so nothing is lost.
//
// Delete itself just requests confirmation (onRequestDeleteComment) — the
// confirmation modal is shared with annotation-layer.tsx's pin card and lives
// one level up in voter-shell.tsx (see components/application/confirm-dialog.tsx).
export function CommentsPanel({
  variation,
  commentError,
  selectedPinId,
  onSelectPin,
  onToggleCommentStatus,
  onRequestDeleteComment,
}: {
  variation: VariationWithAggregates | null;
  /** A failed complete/delete (KEV-172 chunk 4), mirroring the stage's vote-error banner. */
  commentError?: string | null;
  /** The comment id most recently selected (row click, or a pin click on the
   * stage) — a sticky selection, echoed back so that row can show itself as
   * selected (KEV-172 polish pass, item 1). */
  selectedPinId?: string | null;
  /** Selects (or, if already selected, deselects) the given pin — shared
   * with the stage's pin click handler via voter-shell.tsx's single
   * selectPin toggle (KEV-172 polish pass, item 1). */
  onSelectPin?: (commentId: string) => void;
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  /** Opens the shared delete-confirmation modal (voter-shell.tsx), scoped to
   * this comment — a row no longer confirms/deletes inline. */
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  const [listRef, showFade] = useScrollFade<HTMLUListElement>([variation?.comments.length ?? 0]);

  const openPins = variation ? sortBySeq(variation.comments.filter((c) => c.status === "open")) : [];
  const completedPins = variation ? sortBySeq(variation.comments.filter((c) => c.status === "complete")) : [];
  const hasAnyPins = openPins.length > 0 || completedPins.length > 0;

  function rowProps(item: VariationComment, nextStatus: "open" | "complete") {
    return {
      comment: item,
      isSelected: selectedPinId === item.id,
      onSelect: () => onSelectPin?.(item.id),
      onRequestDelete: () => {
        if (variation) onRequestDeleteComment?.(variation.id, item.id);
      },
      onToggleStatus: () => {
        if (variation) onToggleCommentStatus?.(variation.id, item.id, nextStatus);
      },
    };
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <div className="shrink-0 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#E8E8E8]">Comments</h2>
      </div>

      {commentError && <p className="shrink-0 text-xs text-error-primary">{commentError}</p>}

      <div className="relative flex-1 min-h-0">
        <ul ref={listRef} className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-hide">
          {!variation || !hasAnyPins ? (
            <li className="mt-3 text-center text-sm text-[#A1A1AA]">No comments yet.</li>
          ) : (
            <>
              {openPins.map((item) => (
                <CommentRow key={item.id} {...rowProps(item, "complete")} />
              ))}
              {completedPins.length > 0 && (
                <li className="-mb-2 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-[#71717A]">
                  Completed
                </li>
              )}
              {completedPins.map((item) => (
                <CommentRow key={item.id} dimmed {...rowProps(item, "open")} />
              ))}
            </>
          )}
        </ul>
        {showFade && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8" style={SCROLL_FADE_STYLE} />
        )}
      </div>
    </div>
  );
}

function sortBySeq(comments: VariationComment[]): VariationComment[] {
  return [...comments].sort((a, b) => a.seq - b.seq);
}

// H2: own comments (including the server-reloaded copy of an optimistically
// prepended one, since isOwn survives the reload) always read "{name} (You)",
// falling back to bare "You" when no name was entered.
function commentDisplayName(comment: VariationComment): string {
  const trimmedName = comment.voterName?.trim();
  if (comment.isOwn) return trimmedName ? `${trimmedName} (You)` : "You";
  return trimmedName || "Anonymous";
}

function CommentRow({
  comment,
  dimmed = false,
  isSelected,
  onSelect,
  onRequestDelete,
  onToggleStatus,
}: {
  comment: VariationComment;
  dimmed?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <li className={cx("relative rounded-lg transition-opacity", dimmed && "opacity-50")}>
      {/* Same "full-bleed button underneath, content layered on top in a
          pointer-events-none overlay" pattern as variation-list.tsx's row
          selection — lets the row itself be one click target (select this
          pin, echoed on the stage — KEV-172 polish pass item 1) while the
          trailing action icons stay independent clickable targets, without
          nesting a <button> inside this one. A ring plus `aria-pressed`
          alongside the background fill means selection isn't conveyed by
          color alone. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`Select pin ${comment.seq} on the stage: ${comment.comment}`}
        className={cx(
          "absolute inset-0 h-full w-full rounded-lg outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          isSelected ? "bg-[#424242] ring-1 ring-inset ring-[#E8E8E8]" : "hover:bg-[#2B2B2B]"
        )}
      />
      <div className="relative flex items-start gap-2 py-2 pl-3 pr-2 pointer-events-none">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[#212121] bg-[#FACC15] text-[10px] font-semibold text-[#212121]"
        >
          {comment.seq}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-primary">{commentDisplayName(comment)}</span>
            <span className="shrink-0 text-sm text-tertiary">{relativeTimeFrom(comment.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm font-medium text-primary">{comment.comment}</p>
        </div>
        {comment.isOwn && (
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <Tooltip title={comment.status === "open" ? "Complete" : "Reopen"} placement="top">
              <TooltipTrigger
                aria-label={comment.status === "open" ? "Mark comment complete" : "Reopen comment"}
                onPress={onToggleStatus}
                className="flex size-6 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#E8E8E8]"
              >
                {comment.status === "open" ? (
                  <CheckCircle aria-hidden="true" className="size-4" />
                ) : (
                  <RefreshCcw01 aria-hidden="true" className="size-4" />
                )}
              </TooltipTrigger>
            </Tooltip>
            <Tooltip title="Delete" placement="top">
              <TooltipTrigger
                aria-label="Delete comment"
                onPress={onRequestDelete}
                className="flex size-6 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-error-primary"
              >
                <Trash01 aria-hidden="true" className="size-4" />
              </TooltipTrigger>
            </Tooltip>
          </div>
        )}
      </div>
    </li>
  );
}
