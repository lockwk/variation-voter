// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VoterShell } from "@/app/v/[voterId]/voter-shell";
import type { VoterDetail } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

const voter: VoterDetail = {
  id: "voter1",
  title: "Nav refresh",
  description: null,
  status: "active",
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
  archivedAt: null,
  variations: [
    {
      id: "a",
      title: "Option A",
      description: null,
      kind: "url",
      src: "https://preview.example/a",
      position: 0,
      createdAt: new Date(),
      up: 0,
      down: 0,
      score: 0,
      comments: [],
    },
    {
      id: "b",
      title: "Option B",
      description: null,
      kind: "url",
      src: "https://preview.example/b",
      position: 1,
      createdAt: new Date(),
      up: 0,
      down: 0,
      score: 0,
      comments: [],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("VoterShell", () => {
  it("selects the first variation by default and shows its stage", () => {
    render(<VoterShell voter={voter} initialVariationId="a" />);
    expect(screen.getByTitle("Option A")).toBeInTheDocument();
  });

  it("switches the stage and updates the URL when a different variation is clicked", async () => {
    const user = userEvent.setup();
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<VoterShell voter={voter} initialVariationId="a" />);

    await user.click(screen.getByText("Option B"));

    expect(screen.getByTitle("Option B")).toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/v/voter1/b");
  });
});
