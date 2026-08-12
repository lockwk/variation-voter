"use client";

import { ThumbsDown, ThumbsUp, X } from "@untitledui/icons";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { BadgeWithIcon } from "@/components/base/badges/badges";
import { cx } from "@/utils/cx";
import type { VariationWithAggregates } from "@/db/queries";

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

const SORT_LABELS: Record<SortMode, string> = { all: "All", new: "New", top: "Top" };

export function VariationList({
  voterTitle,
  variations,
  selectedId,
  sortMode,
  onSelect,
  onSortModeChange,
  isOpen,
  onClose,
}: {
  voterTitle: string;
  variations: VariationWithAggregates[];
  selectedId: string | null;
  sortMode: SortMode;
  onSelect: (id: string) => void;
  onSortModeChange: (mode: SortMode) => void;
  /** Whether the nav is open as a mobile drawer (ignored at the `md` breakpoint and up, where it's always visible). */
  isOpen: boolean;
  onClose: () => void;
}) {
  const sorted = sortVariations(variations, sortMode);

  return (
    <nav
      className={cx(
        "w-72 shrink-0 border-r border-secondary flex flex-col bg-primary",
        // When closed on mobile, invisible (not just translated off-screen) keeps
        // the drawer's controls out of the tab order and the accessibility tree.
        "fixed inset-y-0 left-0 z-40 -translate-x-full invisible transition-[transform,visibility] duration-200 ease-linear md:static md:visible md:translate-x-0",
        isOpen && "translate-x-0 visible"
      )}
    >
      <div className="p-4 border-b border-secondary">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold truncate">{voterTitle}</h1>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="md:hidden shrink-0 p-1 -m-1 text-tertiary hover:text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>
        <ButtonGroup
          className="mt-3"
          size="sm"
          disallowEmptySelection
          selectedKeys={[sortMode]}
          onSelectionChange={(keys) => onSortModeChange(Array.from(keys)[0] as SortMode)}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <ButtonGroupItem key={mode} id={mode} className="selected:bg-active selected:text-primary">
              {SORT_LABELS[mode]}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sorted.map((variation) => (
          <li key={variation.id}>
            <button
              type="button"
              onClick={() => onSelect(variation.id)}
              aria-current={variation.id === selectedId}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-primary_hover aria-[current=true]:bg-active"
            >
              <span className="truncate">{variation.title}</span>
              <span className="flex gap-1 shrink-0">
                <span className="sr-only">
                  {variation.up} upvotes, {variation.down} downvotes
                </span>
                <span aria-hidden="true" className="flex gap-1">
                  <BadgeWithIcon color="success" iconLeading={ThumbsUp}>
                    <span className="tabular-nums">{variation.up}</span>
                  </BadgeWithIcon>
                  <BadgeWithIcon color="error" iconLeading={ThumbsDown}>
                    <span className="tabular-nums">{variation.down}</span>
                  </BadgeWithIcon>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
