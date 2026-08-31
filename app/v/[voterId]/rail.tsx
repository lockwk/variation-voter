"use client";

import { Target04, X } from "@untitledui/icons";
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
        "w-[375px] shrink-0 flex flex-col gap-3 bg-[#212121] pt-2 pb-3 px-3",
        // A2: drop shadow separating the rail from the media pane, in addition to the border.
        "shadow-[0_8px_20px_#00000033]",
        // When closed on mobile, invisible (not just translated off-screen) keeps
        // the drawer's controls out of the tab order and the accessibility tree.
        "fixed inset-y-0 left-0 z-40 -translate-x-full invisible transition-[transform,visibility] duration-200 ease-linear md:static md:visible md:translate-x-0",
        isOpen && "translate-x-0 visible"
      )}
    >
      <RailHeader onClose={onClose} />
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
          onSortModeChange={onSortModeChange}
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

// C1: fixed VARIVO product wordmark replaces the per-voter title in the rail
// header. The mobile-only close button keeps the drawer dismissible.
function RailHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="shrink-0 flex items-center justify-between border-b border-[#3F3F46] pb-[7px]">
      <div className="flex items-center gap-1">
        <Target04 aria-hidden="true" className="size-4" color="#E8E8E8" />
        <span className="text-xs font-semibold tracking-[0.04em]">
          <span className="text-[#E8E8E8]">VARIVO</span>
          <span className="text-[#00E578]"> EARLY ACCESS</span>
        </span>
      </div>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="md:hidden shrink-0 p-1 -m-1 text-tertiary hover:text-secondary"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
