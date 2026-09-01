"use client";

import { useMemo } from "react";
import { CheckCircle, RefreshCcw01, Trash01 } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "@/utils/cx";
import { relativeTimeFrom } from "@/lib/relative-time";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useScrollFade, SCROLL_FADE_STYLE } from "./use-scroll-fade";
import type { VariationComment, VariationWithAggregates } from "@/db/queries";

// KEV-172 chunk 4: this panel is a "pin tracker" for the selected variation's
// comments — open pins render prominently, completed ones dim into a section
// below, and each row carries a complete/reopen toggle and a delete action.
// Any viewer of an active voter (anyone with the link) may manage any pin,
// own or not — the actions are gated only on the voter not being archived.
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
  voterStatus,
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
  /** Any viewer may complete/reopen or delete any comment, but only while
   * the voter is active — mirrors annotation-layer.tsx's
   * `canManage={voterStatus !== "archived"}` on the pin card so the two
   * manage surfaces agree. Optional to keep existing tests (which render
   * without a voter in play) working; treated as "active" when omitted. */
  voterStatus?: "active" | "archived";
  /** Selects (or, if already selected, deselects) the given pin — shared
   * with the stage's pin click handler via voter-shell.tsx's single
   * selectPin toggle (KEV-172 polish pass, item 1). */
  onSelectPin?: (commentId: string) => void;
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  /** Opens the shared delete-confirmation modal (voter-shell.tsx), scoped to
   * this comment — a row no longer confirms/deletes inline. */
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  const canManage = voterStatus !== "archived";
  const [listRef, showFade] = useScrollFade<HTMLUListElement>([variation?.comments.length ?? 0]);

  // KEV-183: this panel tracks pins, not the flat reply threads underneath
  // them — a reply (parentCommentId !== null) never gets its own numbered
  // pin marker on the stage (see annotation-layer.tsx), so it never gets a
  // real `seq` either (left at the schema default 0); mixing replies into
  // these seq-sorted lists would put them all first, ahead of pin #1. Instead
  // each reply renders nested under its parent row below (read-only — see
  // `repliesByParentId` and `CommentRow`'s own doc comment), so the panel and
  // the pin's own expanded card (annotation-layer.tsx) agree on what a
  // thread looks like.
  const rootComments = variation ? variation.comments.filter((c) => c.parentCommentId === null) : [];
  const openPins = sortBySeq(rootComments.filter((c) => c.status === "open"));
  const completedPins = sortBySeq(rootComments.filter((c) => c.status === "complete"));
  const hasAnyPins = openPins.length > 0 || completedPins.length > 0;

  // Same grouping + ordering (chronological, oldest first) as
  // annotation-layer.tsx's own `repliesByParentId` — keeping the sort
  // identical is what makes a reply thread read the same in both places.
  const repliesByParentId = useMemo(() => {
    const map = new Map<string, VariationComment[]>();
    for (const c of variation?.comments ?? []) {
      if (c.parentCommentId === null) continue;
      const list = map.get(c.parentCommentId);
      if (list) list.push(c);
      else map.set(c.parentCommentId, [c]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    return map;
  }, [variation]);

  function rowProps(item: VariationComment, nextStatus: "open" | "complete") {
    return {
      comment: item,
      replies: repliesByParentId.get(item.id) ?? [],
      canManage,
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
        <h2 className="text-xs font-semibold text-[#E8E8E8]">Comments</h2>
      </div>

      {commentError && <p className="shrink-0 text-xs text-error-primary">{commentError}</p>}

      <div className="relative flex-1 min-h-0">
        <ul ref={listRef} className="flex h-full flex-col gap-0.5 overflow-y-auto scrollbar-hide">
          {!variation || !hasAnyPins ? (
            <li className="mt-3 text-center text-xs text-[#A1A1AA]">No comments yet.</li>
          ) : (
            // KEV-199: a single AnimatePresence wraps open rows, the
            // "Completed" header, and completed rows — not two separate
            // scopes. A row keeps the same `key={item.id}` whether it's
            // rendered in the open group or the completed group below, so
            // marking it complete (or reopening it) is a REORDER of the same
            // element instance within one parent, not an exit from one list
            // paired with an enter into another. Each row's `layout` prop
            // (see `CommentRow`) then glides that same instance from its old
            // slot to its new one — and glides its neighbours to close the
            // gap — in one continuous motion, instead of relying on
            // `popLayout` to pop an exiting row out of flow (unreliable
            // under React 19) before the other list snaps shut.
            //
            // `key={variation.id}` still remounts the whole scope on a
            // variation switch: `initial={false}` only suppresses the
            // enter/`layout` animation on an AnimatePresence's *own first
            // mount*, NOT on a prop-driven content swap while it stays
            // mounted — so without the key, switching variations wrongly
            // runs enter+layout for the incoming rows (a row starts partway
            // down where the old, taller list sat, then slides up).
            // Remounting makes a variation switch a clean cut — new comments
            // render at rest at the top — while add/complete/reopen/delete
            // *within* a variation keeps the same key and still animates.
            <AnimatePresence key={variation.id} mode="popLayout" initial={false}>
              {openPins.map((item) => (
                <CommentRow key={item.id} {...rowProps(item, "complete")} />
              ))}
              {completedPins.length > 0 && (
                <motion.li
                  key="completed-header"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pt-4 pb-1 text-xs font-semibold text-[#FFFFFF80]"
                >
                  Completed
                </motion.li>
              )}
              {completedPins.map((item) => (
                <CommentRow key={item.id} dimmed {...rowProps(item, "open")} />
              ))}
            </AnimatePresence>
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

/**
 * A pin's root comment row (KEV-188 comp redesign). Replies (KEV-183's
 * flat-thread model) no longer render inline here — the full thread still
 * lives on the pin's own expanded card (annotation-layer.tsx); this panel
 * now only surfaces a "N replies" count, computed from `replies`, so the
 * row stays a compact single card. `replies` is otherwise unused (no
 * per-reply rendering), and a reply itself still has no independent
 * `onSelect`/`onRequestDelete`/`onToggleStatus` of its own — clicking
 * anywhere in this row selects the parent pin via the shared full-bleed
 * select `<button>` below.
 */
function CommentRow({
  comment,
  replies,
  dimmed = false,
  isSelected,
  canManage,
  onSelect,
  onRequestDelete,
  onToggleStatus,
}: {
  comment: VariationComment;
  /** This root comment's replies — only their count is shown now (the "N
   * replies" indicator); the full thread lives on the stage's pin card
   * (annotation-layer.tsx). */
  replies: VariationComment[];
  dimmed?: boolean;
  isSelected: boolean;
  /** Any viewer may complete/reopen or delete any comment while the voter
   * is active — gates the trailing action icons (previously `comment.isOwn`). */
  canManage: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onToggleStatus: () => void;
}) {
  return (
    // `layout` lets the remaining rows glide into place (rather than snap)
    // as an AnimatePresence sibling enters/exits above them; initial/animate/
    // exit are a gentle fade + small vertical slide — the transition itself
    // is inherited from voter-shell.tsx's <MotionConfig> house spring.
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={cx(
        "group relative transition-opacity transition-[scale] duration-100 has-[>button:active]:scale-[0.98]",
        dimmed && "opacity-50"
      )}
    >
      {/* Same "full-bleed button underneath, content layered on top in a
          pointer-events-none overlay" pattern as variation-list.tsx's row
          selection — lets the row itself be one click target (select this
          pin, echoed on the stage — KEV-172 polish pass item 1) while the
          trailing action icons stay independent clickable targets, without
          nesting a <button> inside this one. `aria-pressed` alongside the
          background fill means selection isn't conveyed by color alone. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`Select pin ${comment.seq} on the stage: ${comment.comment}`}
        className="peer absolute inset-0 h-full w-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:scale-100"
      />
      {/* The card rests transparent so it reads as the panel's own surface
          (KEV-188 review: no distinct fill behind a comment) — rows are
          separated by the list's 2px gap instead of a border (KEV-204), and
          the rounded corners here mean the hover/selected fill reads as its
          own card. The selected/hover treatment lives here on
          the content div rather than the select button underneath: because
          the content stays `pointer-events-none`, the button is still what
          receives the pointer, but its fill would sit *below* this div, so
          `isSelected` swaps the fill directly here (hover #333333, selected
          #3C3C3C) and hover is picked up via Tailwind's `peer`. Selection
          also carries `aria-pressed` on the button, so dropping the ring
          (KEV-188 review) doesn't make it color-only for assistive tech. */}
      <div
        className={cx(
          "relative flex flex-col gap-3 rounded-[4px] pt-3 pr-3 pb-3.5 pl-3 pointer-events-none transition-colors",
          isSelected ? "bg-[#3C3C3C]" : "group-hover:bg-[#333333]"
        )}
      >
        {/* Name + timestamp are one tight group (2px apart, per comp 2K0-0);
            the 12px container gap sits only between this group and the body. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex h-5 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] leading-4 font-bold text-black/90"
            >
              {comment.seq}
            </span>
            <span className="line-clamp-1 flex-grow text-xs leading-4 font-medium text-white/65">{commentDisplayName(comment)}</span>
            {canManage && (
              <div className="pointer-events-auto mr-1 flex shrink-0 items-center gap-2">
                <Tooltip title={comment.status === "open" ? "Complete" : "Reopen"} placement="top">
                  <TooltipTrigger
                    aria-label={comment.status === "open" ? "Mark comment complete" : "Reopen comment"}
                    onPress={onToggleStatus}
                    className="flex size-6 items-center justify-center rounded-[4px] text-white/50 hover:bg-[#484848] hover:text-[#E8E8E8]"
                  >
                    {comment.status === "open" ? (
                      <CheckCircle aria-hidden="true" className="size-3.5" />
                    ) : (
                      <RefreshCcw01 aria-hidden="true" className="size-3.5" />
                    )}
                  </TooltipTrigger>
                </Tooltip>
                <Tooltip title="Delete" placement="top">
                  <TooltipTrigger
                    aria-label="Delete comment"
                    onPress={onRequestDelete}
                    className="flex size-6 items-center justify-center rounded-[4px] text-white/50 hover:bg-[#484848] hover:text-error-primary"
                  >
                    <Trash01 aria-hidden="true" className="size-3.5" />
                  </TooltipTrigger>
                </Tooltip>
              </div>
            )}
          </div>
          <span className="pl-[22px] text-xs leading-4 font-medium text-white/50">{relativeTimeFrom(comment.createdAt)}</span>
        </div>
        <div className="flex flex-col gap-1.5 pl-[22px]">
          <p className="line-clamp-3 text-[13px] leading-[18px] whitespace-pre-wrap text-white/90">{comment.comment}</p>
          {replies.length > 0 && (
            <span className="text-xs leading-4 font-medium text-white/50">
              {replies.length === 1 ? "1 reply" : `${replies.length} replies`}
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}
