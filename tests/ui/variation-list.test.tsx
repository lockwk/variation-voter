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
    viewerVote: null,
    comments: [],
    ...overrides,
  };
}

const noop = () => {};

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
  // The row's ONLY selection affordance is now a single full-bleed <button>
  // per row (bugfix: previously a small inline text button left most of the
  // row's area — padding, gaps, and the non-selected vote-count display —
  // unclickable). The title text itself is plain, non-interactive markup
  // layered visually on top of that button, so it must be found by the
  // row's accessible name (its aria-label), not by querying the text node.
  it("calls onSelect with the clicked variation id when the row's selection control is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={onSelect}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    await user.click(screen.getByRole("button", { name: "V1 Option A" }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  // Locks in the hit-box fix itself: the title text must not be the click
  // target (nor nested inside any button — that would also be invalid HTML
  // once the row wraps it), because it sits inside a pointer-events-none
  // overlay so real clicks anywhere on the row — including the padding above
  // and below the text, and the vote-count display on non-selected rows —
  // fall through to the single full-row button underneath instead of
  // landing on inert text.
  it("renders the row title as plain text, not inside any button", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    expect(screen.getByText("Option A").closest("button")).not.toBeInTheDocument();
  });

  // Locks in the layering mechanism that makes the whole row clickable: the
  // visible content (title + vote display) sits in a pointer-events-none
  // overlay on a non-selected row, so clicks pass through to the row's
  // selection button beneath — including clicks over the vote-count area,
  // which used to be a dead zone (a plain, non-interactive <span>).
  it("lets clicks pass through the non-selected row's vote-count display to the selection control", () => {
    const { container } = render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A", up: 3, down: 1 })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    const overlay = container.querySelector("li > div > div");
    expect(overlay).toHaveClass("pointer-events-none");
  });

  it("calls onSortModeChange when a sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <VariationList
        variations={[]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={onSortModeChange}
        onVote={noop}
        votingId={null}
        voterStatus="active"
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
        variations={[]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={onSortModeChange}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    await user.click(screen.getByText("Version"));
    // react-aria's single-selection toggle group re-fires onSelectionChange
    // with the same key rather than being a true no-op, but it must never
    // clear the selection (which would call onSortModeChange(undefined)).
    for (const call of onSortModeChange.mock.calls) {
      expect(call[0]).toBe("all");
    }
  });

  // E3: non-selected rows are display-only — plain counts, no vote buttons.
  it("shows plain, non-interactive counts on a non-selected row", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A", up: 3, down: 1 })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    expect(screen.queryByRole("button", { name: /thumbs up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /thumbs down/i })).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // E3/F3: only the selected row's segments are the interactive vote UI.
  // Also locks in that casting a vote never also re-fires row selection —
  // the vote buttons live in a sibling overlay above the row's selection
  // button (not nested inside it), and stopPropagation on their click
  // guards against that regressing if the markup ever changes.
  it("renders interactive vote buttons only on the selected row, calls onVote, and does not also call onSelect", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    const onSelect = vi.fn();
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId="a"
        sortMode={"all" as SortMode}
        onSelect={onSelect}
        onSortModeChange={noop}
        onVote={onVote}
        votingId={null}
        voterStatus="active"
      />
    );
    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    expect(onVote).toHaveBeenCalledWith("a", "up");
    expect(onSelect).not.toHaveBeenCalled();
  });

  // F1: the voted-up segment turns badge-green; the other stays neutral light.
  it("colors the voted-up segment green and leaves the down segment neutral", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A", up: 1, viewerVote: "up" })]}
        selectedId="a"
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    expect(screen.getByRole("button", { name: /thumbs up/i })).toHaveStyle({ backgroundColor: "#86EFAC" });
    expect(screen.getByRole("button", { name: /thumbs down/i })).toHaveStyle({ backgroundColor: "#E8E8E8" });
  });

  // F2: mirror of F1 for the down direction.
  it("colors the voted-down segment red and leaves the up segment neutral", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A", down: 1, viewerVote: "down" })]}
        selectedId="a"
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="active"
      />
    );
    expect(screen.getByRole("button", { name: /thumbs down/i })).toHaveStyle({ backgroundColor: "#FCA5A5" });
    expect(screen.getByRole("button", { name: /thumbs up/i })).toHaveStyle({ backgroundColor: "#E8E8E8" });
  });

  it("disables (but still shows) the selected row's vote buttons for an archived voter", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId="a"
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId={null}
        voterStatus="archived"
      />
    );
    expect(screen.getByRole("button", { name: /thumbs up/i })).toBeDisabled();
  });

  it("disables the selected row's vote buttons while its vote is in flight", () => {
    render(
      <VariationList
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId="a"
        sortMode={"all" as SortMode}
        onSelect={noop}
        onSortModeChange={noop}
        onVote={noop}
        votingId="a"
        voterStatus="active"
      />
    );
    expect(screen.getByRole("button", { name: /thumbs up/i })).toBeDisabled();
  });
});
