// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CommentsPanel } from "@/app/v/[voterId]/comments-panel";
import type { VariationWithAggregates } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

function makeVariation(overrides: Partial<VariationWithAggregates>): VariationWithAggregates {
  return {
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
    ...overrides,
  };
}

// Capture the real fetch before any test stubs it — a blanket mock would also
// hijack the Neon HTTP driver's own calls made during tests/setup.ts's global
// `afterEach` DB cleanup, so unmatched calls fall through to it.
const realFetch = global.fetch;

afterEach(() => vi.restoreAllMocks());

describe("CommentsPanel", () => {
  it("enables the composer for an active voter even when the viewer hasn't voted", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({ viewerVote: null })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.queryByText(/vote to unlock commenting/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/add a comment about option a/i)).not.toBeDisabled();
  });

  it("renders a comment with no associated vote with no thumb icon", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({
          viewerVote: null,
          comments: [
            { id: "c1", comment: "neutral note", voterName: "Kevin", createdAt: new Date(), direction: null, isOwn: false },
          ],
        })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    const commentText = screen.getByText("neutral note");
    const item = commentText.closest("li");
    expect(item).not.toBeNull();
    expect(item?.querySelector("svg")).not.toBeInTheDocument();
  });

  it("disables the send button while the comment is empty and enables it once there's text (28Z-0)", async () => {
    const user = userEvent.setup();
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({ viewerVote: "up" })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    const sendButton = screen.getByLabelText(/send comment/i);
    const commentInput = screen.getByLabelText(/add a comment about option a/i);

    expect(sendButton).toBeDisabled();

    await user.type(commentInput, "nice!");
    expect(sendButton).not.toBeDisabled();

    await user.clear(commentInput);
    expect(sendButton).toBeDisabled();

    await user.type(commentInput, "   ");
    expect(sendButton).toBeDisabled();
  });

  it("locks the composer entirely for an archived voter, even if the viewer had already voted", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({ viewerVote: "up" })}
        voterStatus="archived"
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.getByLabelText(/add a comment about option a/i)).toBeDisabled();
  });

  it("POSTs to the comments endpoint, fires onCommentSubmit, and clears only the comment field", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/")) {
          return new Response(JSON.stringify({ comment: { id: "comment1" } }), { status: 200 });
        }
        return realFetch(url, init);
      })
    );
    const onCommentSubmit = vi.fn();
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({ id: "a", viewerVote: "up" })}
        voterStatus="active"
        onCommentSubmit={onCommentSubmit}
      />
    );

    await user.type(screen.getByLabelText(/your name/i), "Kevin");
    await user.type(screen.getByLabelText(/add a comment about option a/i), "nice!");
    await user.click(screen.getByLabelText(/send comment/i));

    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/comments",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body).toEqual({ comment: "nice!", voterName: "Kevin" });
    await vi.waitFor(() => expect(onCommentSubmit).toHaveBeenCalledWith("a", "nice!", "Kevin"));
    expect(screen.getByLabelText(/add a comment about option a/i)).toHaveValue("");
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Kevin");
  });

  it("does nothing when submitting an empty comment", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/")) return new Response("{}", { status: 200 });
        return realFetch(url, init);
      })
    );
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({ id: "a", viewerVote: "up" })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    await user.click(screen.getByLabelText(/send comment/i));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders each comment with its vote-direction icon, name, and text (H1)", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({
          viewerVote: "up",
          comments: [
            { id: "c1", comment: "too busy", voterName: "Kevin", createdAt: new Date(), direction: "down", isOwn: false },
          ],
        })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.getByText("too busy")).toBeInTheDocument();
    expect(screen.getByText("Kevin")).toBeInTheDocument();
  });

  it("labels the viewer's own comment '(You)', falling back to bare 'You' with no name", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({
          viewerVote: "up",
          comments: [
            { id: "c1", comment: "own with name", voterName: "Kevin", createdAt: new Date(), direction: "up", isOwn: true },
            { id: "c2", comment: "own no name", voterName: null, createdAt: new Date(), direction: "up", isOwn: true },
          ],
        })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.getByText("Kevin (You)")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows an 'Anonymous' fallback for a nameless comment that isn't the viewer's own", () => {
    render(
      <CommentsPanel
        voterId="voter1"
        variation={makeVariation({
          viewerVote: "up",
          comments: [
            { id: "c1", comment: "no name given", voterName: null, createdAt: new Date(), direction: "up", isOwn: false },
          ],
        })}
        voterStatus="active"
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });
});
