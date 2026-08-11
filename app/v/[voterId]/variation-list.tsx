"use client";

import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
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
}: {
  voterTitle: string;
  variations: VariationWithAggregates[];
  selectedId: string | null;
  sortMode: SortMode;
  onSelect: (id: string) => void;
  onSortModeChange: (mode: SortMode) => void;
}) {
  const sorted = sortVariations(variations, sortMode);

  return (
    <nav className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold">{voterTitle}</h1>
        <div className="mt-3 flex gap-1">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              color={sortMode === mode ? "primary" : "secondary"}
              onClick={() => onSortModeChange(mode)}
            >
              {SORT_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sorted.map((variation) => (
          <li key={variation.id}>
            <button
              type="button"
              onClick={() => onSelect(variation.id)}
              aria-current={variation.id === selectedId}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 aria-[current=true]:bg-gray-100"
            >
              <span className="truncate">{variation.title}</span>
              <span className="flex gap-1 shrink-0">
                <Badge color="success">{variation.up}</Badge>
                <Badge color="error">{variation.down}</Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
