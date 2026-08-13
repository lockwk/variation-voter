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

function makeVoter(overrides: Partial<VoterDetail> = {}): VoterDetail {
  return {
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
        viewerVote: null,
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
        viewerVote: null,
        comments: [],
      },
    ],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

// Capture the real fetch before any test stubs it. The Neon HTTP driver used by
// tests/setup.ts's global `afterEach` (`db.delete(...)`) makes its own fetch calls to
// clean up the DB between tests — a blanket fetch mock would hijack those too and break
// DB cleanup, so unmatched calls always delegate to the real fetch.
const realFetch = global.fetch;

function stubApiFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/api/")) return handler(url, init);
      return realFetch(url, init);
    })
  );
}

describe("VoterShell", () => {
  it("selects the first variation by default and shows its stage", () => {
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);
    expect(screen.getByTitle("Option A")).toBeInTheDocument();
  });

  it("switches the stage and updates the URL when a different variation is clicked", async () => {
    const user = userEvent.setup();
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    // The row's title text is plain, non-interactive markup layered over a
    // full-row selection button (bugfix: the whole row is now the click
    // target, not just the inline text) — so the row is found by its
    // accessible name, not by querying the text node.
    await user.click(screen.getByRole("button", { name: "V2 Option B" }));

    expect(screen.getByTitle("Option B")).toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/v/voter1/b");
  });

  // Optimistic toggle state machine (ADD case): direction D on a variation
  // with no viewerVote yet increments D and sets viewerVote to D.
  it("casts an up vote, posting once and incrementing the count optimistically", async () => {
    const user = userEvent.setup();
    stubApiFetch(
      async () =>
        new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), { status: 201 })
    );
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/votes",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body).toEqual({ direction: "up" });
    expect(await screen.findByRole("button", { name: /thumbs up, 1 vote$/i })).toBeInTheDocument();
  });

  // Optimistic toggle state machine (UNDO case): clicking the same direction
  // again decrements it and clears viewerVote.
  it("undoes a vote when clicking the same direction again", async () => {
    const user = userEvent.setup();
    let call = 0;
    stubApiFetch(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ vote: null, state: "removed" }), { status: 200 });
    });
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    await screen.findByRole("button", { name: /thumbs up, 1 vote$/i });
    await user.click(screen.getByRole("button", { name: /thumbs up, 1 vote$/i }));

    expect(await screen.findByRole("button", { name: /thumbs up, 0 votes/i })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // Optimistic toggle state machine (SWITCH case): voting the opposite
  // direction moves the count across both segments in one step.
  it("switches from up to down, moving the count across both segments", async () => {
    const user = userEvent.setup();
    let call = 0;
    stubApiFetch(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ vote: { id: "vote-a", direction: "down" }, state: "switched" }), {
        status: 200,
      });
    });
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    await screen.findByRole("button", { name: /thumbs up, 1 vote$/i });
    await user.click(screen.getByRole("button", { name: /thumbs down/i }));

    expect(await screen.findByRole("button", { name: /thumbs down, 1 vote$/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /thumbs up, 0 votes/i })).toBeInTheDocument();
  });

  it("rolls back the optimistic vote and shows an error when the POST fails", async () => {
    const user = userEvent.setup();
    stubApiFetch(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));

    expect(await screen.findByText(/couldn.t record your vote/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /thumbs up, 0 votes/i })).toBeInTheDocument();
  });

  it("guards against a rapid double-click on thumbs-up firing two votes", async () => {
    const user = userEvent.setup();
    stubApiFetch(async () => {
      // Small artificial delay so the double-click's second click lands while
      // the first request is still in flight — the exact race the votingId
      // guard exists to close.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), {
        status: 201,
      });
    });
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.dblClick(screen.getByRole("button", { name: /thumbs up/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("disables the selected row's vote buttons and shows a read-only notice for archived voters", () => {
    render(<VoterShell voter={makeVoter({ status: "archived" })} initialVariationId="a" />);
    expect(screen.getByRole("button", { name: /thumbs up/i })).toBeDisabled();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  // H2: the composer is enabled from the start (commenting no longer requires
  // voting first), and the submitted comment prepends immediately labeled
  // "(You)" once the viewer has also voted.
  it("posts a comment after voting, prepending it labeled '(You)'", async () => {
    const user = userEvent.setup();
    stubApiFetch(async (url, init) => {
      if (init?.method === "POST" && typeof url === "string" && url.endsWith("/votes")) {
        return new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({ comment: { id: "comment-a" } }), { status: 200 });
    });
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    expect(screen.getByLabelText(/add a comment about option a/i)).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    await screen.findByRole("button", { name: /thumbs up, 1 vote$/i });

    expect(screen.getByLabelText(/add a comment about option a/i)).not.toBeDisabled();
    await user.type(screen.getByLabelText(/your name/i), "Kevin");
    await user.type(screen.getByLabelText(/add a comment about option a/i), "nice one");
    await user.click(screen.getByLabelText(/send comment/i));

    expect(await screen.findByText("nice one")).toBeInTheDocument();
    expect(await screen.findByText("Kevin (You)")).toBeInTheDocument();
  });

  it("does not leak a draft comment across a variation switch", async () => {
    const user = userEvent.setup();
    stubApiFetch(
      async () =>
        new Response(JSON.stringify({ vote: { id: "vote-a", direction: "up" }, state: "added" }), { status: 201 })
    );
    render(<VoterShell voter={makeVoter()} initialVariationId="a" />);

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));
    await screen.findByRole("button", { name: /thumbs up, 1 vote$/i });
    await user.type(screen.getByLabelText(/add a comment about option a/i), "meant for A");

    await user.click(screen.getByRole("button", { name: "V2 Option B" }));

    expect(screen.queryByDisplayValue("meant for A")).not.toBeInTheDocument();
  });
});
