// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VoterShell } from "@/app/v/[voterId]/voter-shell";
import type { VariationComment, VoterDetail } from "@/db/queries";

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

function makeOwnComment(overrides: Partial<VariationComment> = {}): VariationComment {
  return {
    id: "c1",
    comment: "fix this",
    voterName: "Kevin",
    createdAt: new Date(),
    direction: null,
    isOwn: true,
    anchorType: "point",
    selector: null,
    offsetX: null,
    offsetY: null,
    status: "open",
    seq: 1,
    ...overrides,
  };
}

// Builds a voter whose selected variation "a" carries one of the viewer's
// own pins, for the complete/delete tests below.
function makeVoterWithOwnComment(comment: VariationComment = makeOwnComment()): VoterDetail {
  return makeVoter({
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
        comments: [comment],
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
  });
}

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

  // KEV-172 (all-kinds-use-pins pass): the old plain-text composer is gone —
  // every variation kind now comments exclusively by clicking a pin onto the
  // stage (annotation-layer.tsx's PinComposer). This exercises that full
  // flow through VoterShell: toggle comment mode, click the image to drop a
  // draft pin, type into the composer, submit — same "(You)" labeling and
  // confirmed-then-render behavior (KEV-172 chunk 4) as the old composer had.
  function makeVoterWithImage(): VoterDetail {
    return makeVoter({
      variations: [
        {
          id: "a",
          title: "Option A",
          description: null,
          kind: "image",
          src: "https://preview.example/a.png",
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
          kind: "image",
          src: "https://preview.example/b.png",
          position: 1,
          createdAt: new Date(),
          up: 0,
          down: 0,
          score: 0,
          viewerVote: null,
          comments: [],
        },
      ],
    });
  }

  it("posts a pinned comment after clicking the stage, prepending it labeled '(You)'", async () => {
    const user = userEvent.setup();
    stubApiFetch(async (url, init) => {
      // Confirmed-then-render (KEV-172 chunk 4): voter-shell.tsx's
      // appendComment now renders straight from this server row (seq
      // included) rather than a client-guessed reconstruction, so the mock
      // has to look like the real POST /comments response.
      const body = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          comment: {
            id: "comment-a",
            variationId: "a",
            viewerId: "viewer-x",
            comment: body.comment,
            voterName: body.voterName ?? null,
            anchorType: "point",
            selector: null,
            offsetX: body.offsetX ?? 0.5,
            offsetY: body.offsetY ?? 0.5,
            status: "open",
            seq: 1,
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 201 }
      );
    });
    render(<VoterShell voter={makeVoterWithImage()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/^add a comment$/i));
    await user.click(screen.getByLabelText(/click to add a pinned comment/i));

    await user.type(screen.getByLabelText(/^your name/i), "Kevin");
    await user.type(screen.getByLabelText(/^comment$/i), "nice one");
    await user.click(screen.getByLabelText(/^post comment$/i));

    expect(await screen.findByText("nice one")).toBeInTheDocument();
    expect(await screen.findByText("Kevin (You)")).toBeInTheDocument();
  });

  it("discards a draft pin without posting when the composer is cancelled", async () => {
    const user = userEvent.setup();
    render(<VoterShell voter={makeVoterWithImage()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/^add a comment$/i));
    await user.click(screen.getByLabelText(/click to add a pinned comment/i));
    await user.type(screen.getByLabelText(/^comment$/i), "meant for A");

    await user.click(screen.getByLabelText(/^cancel comment$/i));

    expect(screen.queryByDisplayValue("meant for A")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^comment$/i)).not.toBeInTheDocument();
  });

  // KEV-172 chunk 4: complete/delete apply optimistically, then reconcile
  // against the PATCH/DELETE response — rolling back to the pre-click
  // snapshot on failure, mirroring castVote's rollback pattern above.
  it("marks the viewer's own pin complete optimistically", async () => {
    const user = userEvent.setup();
    stubApiFetch(async (url, init) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify({ comment: { id: "c1", status: "complete" } }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/mark comment complete/i));

    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/comments/c1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(await screen.findByLabelText(/reopen comment/i)).toBeInTheDocument();
  });

  it("rolls back marking a pin complete and shows an error when the PATCH fails", async () => {
    const user = userEvent.setup();
    stubApiFetch(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/mark comment complete/i));

    expect(await screen.findByText(/couldn.t update this comment/i)).toBeInTheDocument();
    // Rolled back to open — the toggle still reads "Mark comment complete".
    expect(await screen.findByLabelText(/mark comment complete/i)).toBeInTheDocument();
  });

  // Delete is now a two-step flow through a shared confirmation modal
  // (components/application/confirm-dialog.tsx) rather than an inline
  // "Delete?" swap — clicking the trash icon opens it, and only its own
  // Delete button actually deletes.
  it("opens a confirmation modal when the trash icon is clicked, and deletes the viewer's own pin optimistically once confirmed", async () => {
    const user = userEvent.setup();
    stubApiFetch(async (url, init) => {
      if (init?.method === "DELETE") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/^delete comment$/i));

    const dialog = await screen.findByRole("dialog", { name: /delete comment/i });
    expect(within(dialog).getByText(/are you sure you want to delete this comment\? this cannot be undone\./i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/comments/c1",
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() => expect(screen.queryByText("fix this")).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: /delete comment/i })).not.toBeInTheDocument();
  });

  it("cancels the confirmation modal without deleting anything", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    stubApiFetch(async (url, init) => {
      if (init?.method === "DELETE") onDelete();
      return new Response("{}", { status: 200 });
    });
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/^delete comment$/i));
    const dialog = await screen.findByRole("dialog", { name: /delete comment/i });
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /delete comment/i })).not.toBeInTheDocument();
    // The pin is untouched — still there, and still deletable again.
    expect(await screen.findByText("fix this")).toBeInTheDocument();
    expect(screen.getByLabelText(/^delete comment$/i)).toBeInTheDocument();
  });

  it("rolls back a delete and shows an error when the DELETE fails", async () => {
    const user = userEvent.setup();
    stubApiFetch(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);

    await user.click(screen.getByLabelText(/^delete comment$/i));
    const dialog = await screen.findByRole("dialog", { name: /delete comment/i });
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/couldn.t update this comment/i)).toBeInTheDocument();
    // Rolled back — the pin's row (and its comment text) is back.
    expect(await screen.findByText("fix this")).toBeInTheDocument();
  });

  // KEV-172 polish pass, item 1: replaces the old pulse-and-auto-clear
  // `activePinId` with a sticky `selectedPinId` — clicking the same row
  // again toggles the selection off (no separate "clear" control needed),
  // and a different row click would instead replace it outright.
  it("toggles a pin's selection off when its row is clicked a second time", async () => {
    const user = userEvent.setup();
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);
    const row = screen.getByLabelText(/select pin 1 on the stage/i);

    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");

    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "false");
  });

  // The old behavior auto-cleared the selection ~1200ms after selecting;
  // the new sticky selection must not — it should stay selected until an
  // explicit deselect (toggle-off, a different selection, Esc, or an
  // empty-canvas click), never on a timer.
  it("keeps a pin selected without auto-clearing after a delay", async () => {
    const user = userEvent.setup();
    render(<VoterShell voter={makeVoterWithOwnComment()} initialVariationId="a" />);
    const row = screen.getByLabelText(/select pin 1 on the stage/i);

    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");

    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(row).toHaveAttribute("aria-pressed", "true");
  });
});
