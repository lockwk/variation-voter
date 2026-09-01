"use client";

import { ThumbsUp } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cx } from "@/utils/cx";
import { useScrollFade, SCROLL_FADE_STYLE } from "./use-scroll-fade";
import type { VariationWithAggregates, VoteDirection } from "@/db/queries";

export type SortMode = "all" | "new" | "top";

export function sortVariations(
  variations: VariationWithAggregates[],
  mode: SortMode
): VariationWithAggregates[] {
  const copy = [...variations];
  if (mode === "all") return copy.sort((a, b) => a.position - b.position);
  if (mode === "new") return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return copy.sort((a, b) => b.score - a.score);
}

// The "all" mode still sorts by position, but the design renames its
// displayed tab label to "Version" (D2) — the SortMode key is unchanged.
const SORT_LABELS: Record<SortMode, string> = { all: "Version", new: "New", top: "Top" };

export function VariationList({
  variations,
  selectedId,
  sortMode,
  onSelect,
  onSortModeChange,
  onVote,
  votingId,
  voterStatus,
}: {
  variations: VariationWithAggregates[];
  selectedId: string | null;
  sortMode: SortMode;
  onSelect: (id: string) => void;
  onSortModeChange: (mode: SortMode) => void;
  /** Casts/toggles a vote for the currently-selected row's inline control (E3/F3). */
  onVote: (variationId: string, direction: VoteDirection) => void;
  /** The variation id with an in-flight vote request, if any — disables its controls. */
  votingId: string | null;
  voterStatus: "active" | "archived";
}) {
  const sorted = sortVariations(variations, sortMode);

  // "V#" row prefixes (E2) are a stable identity tied to each variation's
  // underlying position, not to its index in the currently sorted list —
  // otherwise switching sort mode would relabel every row.
  const positionRank = new Map(
    [...variations].sort((a, b) => a.position - b.position).map((variation, index) => [variation.id, index + 1])
  );

  const [listRef, showFade] = useScrollFade<HTMLUListElement>([sorted.length]);

  return (
    // J1: hugs its content (flex-grow 0, basis auto) up to a hard cap of 50%
    // of the list+comments region (see rail.tsx) — never reserving empty
    // space below a short list, but never exceeding half when long. Comments
    // (flex-1 in rail.tsx) always absorbs whatever this doesn't use.
    <div className="flex flex-initial min-h-0 max-h-[50%] flex-col gap-2">
      <ToggleButtonGroup
        aria-label="Sort by"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[sortMode]}
        onSelectionChange={(keys) => onSortModeChange(Array.from(keys)[0] as SortMode)}
        className="shrink-0 flex items-center gap-1"
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <ToggleButton
            key={mode}
            id={mode}
            className="flex h-6 items-center justify-center rounded-md px-3 py-2 text-xs font-semibold text-[#FFFFFF80] outline-none transition-colors selected:bg-[#424242] selected:text-[#FFFFFFE6] not-selected:hover:bg-[#FFFFFF0D] not-selected:hover:text-[#FFFFFFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {SORT_LABELS[mode]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {/* flex-auto (basis: auto, not 0) so this contributes its natural
          content height when the list above is hugging content — a
          flex-1/basis-0 child here would collapse to zero height instead of
          sizing the parent to the rows. Once the parent's height is
          determined (content height, or capped+shrunk at 50%), this still
          shrinks to fit and the ul's overflow-y-auto scrolls as needed. */}
      <div className="relative flex-auto min-h-0">
        <ul ref={listRef} className="h-full overflow-y-auto flex flex-col gap-0.5 scrollbar-hide">
          {/* `initial={false}` skips the mount pop-in for rows already on
              screen (page load, switching sort mode's underlying data isn't
              add/remove); `layout` lets a row glide to its new slot — both
              on sort-mode reorders and when a sibling row enters/exits above
              it — instead of snapping. The transition itself is inherited
              from voter-shell.tsx's <MotionConfig> house spring. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {sorted.map((variation) => {
              const isSelected = variation.id === selectedId;
              const disabled = voterStatus === "archived" || votingId === variation.id;
              return (
                <motion.li
                  key={variation.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  {/* The whole row is a single selection target: a full-bleed
                      button underneath the visible content (F5/bugfix). The
                      row's title + padding + gaps + non-selected vote counts
                      all sit in a pointer-events-none overlay so clicks on any
                      of them fall through to this button instead of landing in
                      dead space. Only the SELECTED row's real vote button
                      re-enables pointer events, so it stays independently
                      clickable/hoverable without ever nesting a <button>
                      inside this one. Non-selected rows' vote area is
                      display-only and not interactive (KEV-199). */}
                  <div className="relative rounded-[4px] transition-[scale] duration-100 has-[>button:active]:scale-[0.98]">
                    <button
                      type="button"
                      onClick={() => onSelect(variation.id)}
                      aria-current={isSelected}
                      aria-label={`V${positionRank.get(variation.id)} ${variation.title}`}
                      className={cx(
                        "absolute inset-0 h-full w-full rounded-[4px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:scale-100",
                        isSelected ? "bg-[#3C3C3C]" : "bg-transparent hover:bg-[#333333]"
                      )}
                    />
                    <div className="relative flex items-center justify-between self-stretch gap-2 pl-3 pr-1 py-1 pointer-events-none">
                      <span className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="shrink-0 text-xs font-semibold text-[#FFFFFF80]">
                          V{positionRank.get(variation.id)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#FFFFFFE6]">
                          {variation.title}
                        </span>
                      </span>
                      <div className={cx("flex shrink-0 items-center", isSelected && "pointer-events-auto")}>
                        <span className="sr-only">
                          {variation.up} upvote{variation.up === 1 ? "" : "s"}
                        </span>
                        <UpvoteControl
                          variation={variation}
                          isSelected={isSelected}
                          disabled={disabled}
                          onVote={onVote}
                        />
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {showFade && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8" style={SCROLL_FADE_STYLE} />
        )}
      </div>
    </div>
  );
}

// E3/KEV-199: upvote-only control per row (downvote removed). Non-selected
// rows are display-only (plain icon + count, no background chip, not
// interactive) — only the SELECTED row's control is a real, focusable vote
// button. Its #484848 chip is a pure hover/press/focus-visible affordance on
// itself: never persistent just from being selected, and never reachable on
// a non-selected row. Count brightens whenever the row is selected
// (hovered or not) and stays muted otherwise; voting alone doesn't brighten
// it. The thumb only reflects the viewer's voted state (green) or muted —
// hover never changes the thumb, only the chip does.
function UpvoteControl({
  variation,
  isSelected,
  disabled,
  onVote,
}: {
  variation: VariationWithAggregates;
  isSelected: boolean;
  disabled: boolean;
  onVote: (variationId: string, direction: VoteDirection) => void;
}) {
  const isVoted = variation.viewerVote === "up";
  const count = variation.up;
  const iconColorClass = isVoted ? "text-[var(--color-accent)]" : "text-[#FFFFFF80]";
  const countColorClass = isSelected ? "text-[#E8E8E8]" : "text-[#FFFFFF80]";

  if (!isSelected) {
    return (
      <span className="flex items-center justify-center gap-1 p-2" aria-hidden="true">
        <ThumbsUp aria-hidden="true" className={cx("size-4", iconColorClass)} strokeWidth={1.25} />
        <span className={cx("w-5 text-center text-xs font-semibold tabular-nums", countColorClass)}>{count}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isVoted}
      aria-label={`Thumbs up, ${count} vote${count === 1 ? "" : "s"}`}
      onClick={(event) => {
        // Defense in depth: this button already sits above the row's
        // full-bleed selection button via pointer-events layering (not DOM
        // nesting), so a click here never reaches it — but stop propagation
        // too in case this ever gets moved back inside a shared ancestor.
        event.stopPropagation();
        onVote(variation.id, "up");
      }}
      className="flex items-center justify-center gap-1 rounded-[2px] p-2 outline-none transition-colors hover:bg-[#484848] active:bg-[#484848] focus-visible:bg-[#484848] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-default"
    >
      <ThumbsUp aria-hidden="true" className={cx("size-4", iconColorClass)} strokeWidth={1.25} />
      <span className={cx("w-5 text-center text-xs font-semibold tabular-nums", countColorClass)}>{count}</span>
    </button>
  );
}
