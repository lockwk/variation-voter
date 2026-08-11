// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VariationList, sortVariations, type SortMode } from "@/app/v/[voterId]/variation-list";
import type { VariationWithAggregates } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

function makeVariation(overrides: Partial<VariationWithAggregates>): VariationWithAggregates {
  return {
    id: "id",
    title: "Title",
    description: null,
    kind: "url",
    src: "https://example.com",
    position: 0,
    createdAt: new Date("2026-01-01"),
    up: 0,
    down: 0,
    score: 0,
    comments: [],
    ...overrides,
  };
}

describe("sortVariations", () => {
  const variations = [
    makeVariation({ id: "a", position: 1, createdAt: new Date("2026-01-01"), score: 1 }),
    makeVariation({ id: "b", position: 0, createdAt: new Date("2026-01-03"), score: 5 }),
    makeVariation({ id: "c", position: 2, createdAt: new Date("2026-01-02"), score: -1 }),
  ];

  it("sorts by position for 'all'", () => {
    expect(sortVariations(variations, "all").map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by createdAt descending for 'new'", () => {
    expect(sortVariations(variations, "new").map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by score descending for 'top'", () => {
    expect(sortVariations(variations, "top").map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
});

describe("VariationList", () => {
  it("calls onSelect with the clicked variation id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VariationList
        voterTitle="Nav refresh"
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={onSelect}
        onSortModeChange={() => {}}
      />
    );
    await user.click(screen.getByText("Option A"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("calls onSortModeChange when a sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <VariationList
        voterTitle="Nav refresh"
        variations={[]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={() => {}}
        onSortModeChange={onSortModeChange}
      />
    );
    await user.click(screen.getByText("Top"));
    expect(onSortModeChange).toHaveBeenCalledWith("top");
  });

  it("does not clear the selection when the already-active sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <VariationList
        voterTitle="Nav refresh"
        variations={[]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={() => {}}
        onSortModeChange={onSortModeChange}
      />
    );
    await user.click(screen.getByText("All"));
    // react-aria's single-selection toggle group re-fires onSelectionChange
    // with the same key rather than being a true no-op, but it must never
    // clear the selection (which would call onSortModeChange(undefined)).
    for (const call of onSortModeChange.mock.calls) {
      expect(call[0]).toBe("all");
    }
  });
});
