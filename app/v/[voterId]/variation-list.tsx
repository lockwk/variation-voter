"use client";

import { ThumbsDown, ThumbsUp } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cx } from "@/utils/cx";
import { ThumbUpVoted, ThumbDownVoted } from "./voted-thumb-icons";
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
      <div className="shrink-0 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#E8E8E8]">Sort by</span>
        <ToggleButtonGroup
          aria-label="Sort by"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[sortMode]}
          onSelectionChange={(keys) => onSortModeChange(Array.from(keys)[0] as SortMode)}
          className="flex items-center gap-1"
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <ToggleButton
              key={mode}
              id={mode}
              className="flex h-6 items-center justify-center rounded-md px-3 text-sm font-semibold text-[#737373] outline-none transition-colors selected:bg-[#424242] selected:text-[#E8E8E8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {SORT_LABELS[mode]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
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
                      dead space. Only the SELECTED row's real vote buttons
                      re-enable pointer events, so they stay independently
                      clickable without ever nesting a <button> inside this
                      one. */}
                  <div className="relative rounded-lg">
                    <button
                      type="button"
                      onClick={() => onSelect(variation.id)}
                      aria-current={isSelected}
                      aria-label={`V${positionRank.get(variation.id)} ${variation.title}`}
                      className={cx(
                        "absolute inset-0 h-full w-full rounded-lg outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        isSelected ? "bg-[#424242]" : "bg-[#2B2B2B] hover:bg-[#424242]"
                      )}
                    />
                    <div className="relative flex items-center justify-between gap-2 pl-3 pr-2 py-2 pointer-events-none">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        <span className="text-[#A1A1AA]">V{positionRank.get(variation.id)}</span>{" "}
                        <span className="text-[#E8E8E8]">{variation.title}</span>
                      </span>
                      <div className={cx("flex shrink-0 items-center", isSelected && "pointer-events-auto")}>
                        <span className="sr-only">
                          {variation.up} upvotes, {variation.down} downvotes
                        </span>
                        <div className="flex items-center gap-0.5">
                          <VoteSegment
                            direction="up"
                            variation={variation}
                            isSelected={isSelected}
                            disabled={disabled}
                            onVote={onVote}
                          />
                          <VoteSegment
                            direction="down"
                            variation={variation}
                            isSelected={isSelected}
                            disabled={disabled}
                            onVote={onVote}
                          />
                        </div>
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

// E3: inline two-segment vote control per row, replacing the old green/red
// count badges. Non-selected rows are display-only (plain icon + count);
// only the selected row's segments are interactive vote buttons, and only
// then do they pick up the F1/F2 voted-state colors.
function VoteSegment({
  direction,
  variation,
  isSelected,
  disabled,
  onVote,
}: {
  direction: VoteDirection;
  variation: VariationWithAggregates;
  isSelected: boolean;
  disabled: boolean;
  onVote: (variationId: string, direction: VoteDirection) => void;
}) {
  const Icon = direction === "up" ? ThumbsUp : ThumbsDown;
  const count = direction === "up" ? variation.up : variation.down;
  const roundedClass = direction === "up" ? "rounded-l-[4px]" : "rounded-r-[4px]";
  const base = cx("flex items-center gap-1 justify-center p-2", roundedClass);

  if (!isSelected) {
    return (
      <span className={base} aria-hidden="true">
        <Icon aria-hidden="true" className="size-4" color="#A1A1AA" />
        <span className="w-5 text-center text-sm font-semibold tabular-nums text-[#E8E8E8]">{count}</span>
      </span>
    );
  }

  const isVotedThisDirection = variation.viewerVote === direction;
  // The raised bevel (top highlight + bottom shadow) is constant across states so
  // the button never changes size or "pops" a border when its vote state flips —
  // only the background color changes. Both edges are INSET box-shadows (not a real
  // border) so they add zero layout height.
  const style = {
    backgroundColor: isVotedThisDirection
      ? direction === "up"
        ? "#86EFAC"
        : "#FCA5A5"
      : "#E8E8E8",
    boxShadow: "inset 0 0.5px 0 #FFFFFF80, inset 0 -0.5px 0 #0000004D",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isVotedThisDirection}
      aria-label={`Thumbs ${direction}, ${count} vote${count === 1 ? "" : "s"}`}
      onClick={(event) => {
        // Defense in depth: this button already sits above the row's
        // full-bleed selection button via pointer-events layering (not DOM
        // nesting), so a click here never reaches it — but stop propagation
        // too in case this ever gets moved back inside a shared ancestor.
        event.stopPropagation();
        onVote(variation.id, direction);
      }}
      style={style}
      className={cx(
        base,
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-default"
      )}
    >
      {isVotedThisDirection ? (
        direction === "up" ? (
          <ThumbUpVoted className="size-4" />
        ) : (
          <ThumbDownVoted className="size-4" />
        )
      ) : (
        <Icon aria-hidden="true" className="size-4" color="#212121" fill="none" />
      )}
      <span className="w-5 text-center text-sm font-semibold tabular-nums text-[#212121]">{count}</span>
    </button>
  );
}
