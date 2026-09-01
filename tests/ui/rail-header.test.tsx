// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { RailHeader } from "@/app/v/[voterId]/rail";
import type { SortMode } from "@/app/v/[voterId]/variation-list";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

const noop = () => {};

// KEV-203 moved the sort ToggleButtonGroup out of VariationList and into
// RailHeader — these two tests were ported from variation-list.test.tsx
// (before the move) and re-target the new "Ver"/"New"/"Top" labels.
describe("RailHeader", () => {
  it("calls onSortModeChange when a sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <RailHeader sortMode={"all" as SortMode} onSortModeChange={onSortModeChange} onClose={noop} />
    );
    await user.click(screen.getByText("Top"));
    expect(onSortModeChange).toHaveBeenCalledWith("top");
  });

  it("does not clear the selection when the already-active sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <RailHeader sortMode={"all" as SortMode} onSortModeChange={onSortModeChange} onClose={noop} />
    );
    await user.click(screen.getByText("Ver"));
    // react-aria's single-selection toggle group re-fires onSelectionChange
    // with the same key rather than being a true no-op, but it must never
    // clear the selection (which would call onSortModeChange(undefined)).
    for (const call of onSortModeChange.mock.calls) {
      expect(call[0]).toBe("all");
    }
  });
});
