"use client";

import { X } from "@untitledui/icons";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cx } from "@/utils/cx";
import { VariationList, type SortMode } from "./variation-list";
import { CommentsPanel } from "./comments-panel";
import type { VariationWithAggregates, VoteDirection } from "@/db/queries";

// B1/B2: a single fixed-width left rail replaces the old 288px nav-only list —
// it now stacks branding, sort + variation list, and the comments pin tracker.
export function Rail({
  variations,
  selected,
  selectedId,
  sortMode,
  onSelect,
  onSortModeChange,
  onVote,
  votingId,
  voteError,
  voterStatus,
  isOpen,
  onClose,
  commentError,
  selectedPinId,
  onSelectPin,
  onToggleCommentStatus,
  onRequestDeleteComment,
}: {
  variations: VariationWithAggregates[];
  selected: VariationWithAggregates | null;
  selectedId: string | null;
  sortMode: SortMode;
  onSelect: (id: string) => void;
  onSortModeChange: (mode: SortMode) => void;
  onVote: (variationId: string, direction: VoteDirection) => void;
  votingId: string | null;
  voteError: string | null;
  voterStatus: "active" | "archived";
  /** Whether the nav is open as a mobile drawer (ignored at the `md` breakpoint and up, where it's always visible). */
  isOpen: boolean;
  onClose: () => void;
  /** Surfaced by a failed complete/delete (KEV-172 chunk 4), mirroring voteError. */
  commentError?: string | null;
  /** The pin most recently selected by a row or stage-pin click — a sticky
   * selection (not a one-shot pulse), echoed back so the matching row can
   * show itself as selected (KEV-172 polish pass, item 1). */
  selectedPinId?: string | null;
  onSelectPin?: (commentId: string) => void;
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  /** Opens the shared delete-confirmation modal (voter-shell.tsx), scoped to
   * this comment — the row itself no longer deletes directly. */
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  return (
    <nav
      className={cx(
        "w-[320px] shrink-0 flex flex-col gap-3 bg-[#212121] p-3",
        // A2: drop shadow separating the rail from the media pane, in addition to the border.
        "shadow-[0_8px_20px_#00000033]",
        // When closed on mobile, invisible (not just translated off-screen) keeps
        // the drawer's controls out of the tab order and the accessibility tree.
        "fixed inset-y-0 left-0 z-40 -translate-x-full invisible transition-[transform,visibility] duration-200 ease-linear md:static md:visible md:translate-x-0",
        isOpen && "translate-x-0 visible"
      )}
    >
      <RailHeader sortMode={sortMode} onSortModeChange={onSortModeChange} onClose={onClose} />
      {voterStatus === "archived" && (
        <p className="shrink-0 text-xs text-[#A1A1AA]">
          This voter is closed and read-only — voting is disabled.
        </p>
      )}
      {voteError && <p className="shrink-0 text-xs text-error-primary">{voteError}</p>}
      {/* J1: this wrapper — not `nav` — is the "available space" the list's
          50% cap (see variation-list.tsx) is measured against, so the split
          excludes the fixed header/status lines above it. */}
      <div className="flex flex-1 min-h-0 flex-col gap-3">
        <VariationList
          variations={variations}
          selectedId={selectedId}
          sortMode={sortMode}
          onSelect={onSelect}
          onVote={onVote}
          votingId={votingId}
          voterStatus={voterStatus}
        />
        <CommentsPanel
          variation={selected}
          commentError={commentError}
          selectedPinId={selectedPinId}
          voterStatus={voterStatus}
          onSelectPin={onSelectPin}
          onToggleCommentStatus={onToggleCommentStatus}
          onRequestDeleteComment={onRequestDeleteComment}
        />
      </div>
    </nav>
  );
}

// The "all" mode still sorts by position, but the design renames its
// displayed tab label to "Ver" (KEV-203) — the SortMode key is unchanged.
const SORT_LABELS: Record<SortMode, string> = { all: "Ver", new: "New", top: "Top" };

// C1: fixed VERVO product wordmark replaces the per-voter title in the rail
// header. The mobile-only close button keeps the drawer dismissible.
// KEV-203: the sort control (previously owned by VariationList) now lives
// here, right-aligned alongside the mobile close button — "EARLY ACCESS" is
// gone and the header no longer carries its own border/padding (the 12px
// gap to the section below comes from the nav's own `gap-3`, KEV-205).
export function RailHeader({
  sortMode,
  onSortModeChange,
  onClose,
}: {
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <LogoMark />
        <span className="font-body text-xs font-semibold tracking-[0.1em] text-[#FFFFFFE6]">
          VERVO
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ToggleButtonGroup
          aria-label="Sort by"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[sortMode]}
          onSelectionChange={(keys) => onSortModeChange(Array.from(keys)[0] as SortMode)}
          className="shrink-0 flex items-center gap-0.5"
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
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="md:hidden shrink-0 p-1 -m-1 text-tertiary hover:text-secondary"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}

// 5-column x 4-row pixel grid, addressed as [col][row]; x/y below are the
// literal offsets (px) of each cell within the 14x15 grid, per the KEV-199 comp.
const LOGO_GRID_X = [0, 3, 6, 9, 12] as const;
const LOGO_GRID_Y = [0, 4, 8, 12] as const;
const LOGO_ACCENT_CELLS: readonly (readonly boolean[])[] = [
  [true, true, false, false],
  [false, false, true, false],
  [false, false, false, true],
  [false, false, true, false],
  [true, true, false, false],
];

function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="relative size-5 shrink-0 overflow-hidden bg-[#212121]"
    >
      <span className="absolute left-[3px] top-[2px] h-[15px] w-[14px]">
        {LOGO_GRID_X.map((x, col) =>
          LOGO_GRID_Y.map((y, row) => (
            <span
              key={`${col}-${row}`}
              className="absolute h-[3px] w-[2px]"
              style={{
                left: x,
                top: y,
                backgroundColor: LOGO_ACCENT_CELLS[col][row]
                  ? "var(--color-accent)"
                  : "#00000080",
              }}
            />
          ))
        )}
      </span>
    </span>
  );
}
