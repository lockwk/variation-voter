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

// Capture the real fetch before any test stubs it — see tests/ui/stage-voting.test.tsx
// for why a blanket mock would break the DB-cleanup afterEach in tests/setup.ts.
const realFetch = global.fetch;

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

  it("does not leak the voting panel's pending-vote state across a variation switch", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/")) {
          if (url.includes("/variations/a/votes") && init?.method === "POST") {
            return new Response(JSON.stringify({ vote: { id: "vote-a" } }), { status: 201 });
          }
          if (url.includes("/variations/b/votes") && init?.method === "POST") {
            return new Response(JSON.stringify({ vote: { id: "vote-b" } }), { status: 201 });
          }
          return new Response(JSON.stringify({ vote: { id: "unexpected" } }), { status: 200 });
        }
        return realFetch(url, init);
      })
    );

    render(<VoterShell voter={voter} initialVariationId="a" />);

    // Vote on A, revealing its comment form, and start typing a comment for it.
    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    const commentBox = await screen.findByLabelText(/why/i);
    await user.type(commentBox, "meant for A");

    // Switch to B without submitting — the comment form for A must not follow us.
    await user.click(screen.getByText("Option B"));
    expect(screen.getByTitle("Option B")).toBeInTheDocument();
    expect(screen.queryByLabelText(/why/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("meant for A")).not.toBeInTheDocument();

    // Voting on B must start a fresh flow scoped to B's own vote id, never A's.
    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/voters/voter1/variations/b/votes",
      expect.objectContaining({ method: "POST" })
    );
    const bCommentBox = await screen.findByLabelText(/why/i);
    await user.type(bCommentBox, "meant for B");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    // The only PATCH ever issued must target B's vote id — A's vote id can never
    // leak into a request made while B is selected.
    const patchCall = vi.mocked(fetch).mock.calls.find((call) => call[1]?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/voters/voter1/variations/b/votes");
    const patchBody = JSON.parse(patchCall?.[1]?.body as string);
    expect(patchBody.voteId).toBe("vote-b");
  });
});
