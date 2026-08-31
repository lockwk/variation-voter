// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CommentsPanel } from "@/app/v/[voterId]/comments-panel";
import type { VariationComment, VariationWithAggregates } from "@/db/queries";

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

function makeComment(overrides: Partial<VariationComment>): VariationComment {
  return {
    id: "c1",
    comment: "a note",
    voterName: null,
    createdAt: new Date(),
    direction: null,
    isOwn: false,
    anchorType: "point",
    selector: null,
    offsetX: null,
    offsetY: null,
    status: "open",
    seq: 1,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

// KEV-172 (all-kinds-use-pins pass): the old plain-text "Your name" + "Add a
// comment about <title>" composer is gone — every variation kind now places
// comments exclusively via a pin clicked onto the stage
// (annotation-layer.tsx), so this panel is purely a read/manage pin tracker,
// for every kind, with no way to author a new comment from here.
describe("CommentsPanel", () => {
  it("never renders a plain-text composer, for any variation kind", () => {
    for (const kind of ["app", "image", "embed", "url"] as const) {
      cleanup();
      render(<CommentsPanel variation={makeVariation({ kind })} onSelectPin={() => {}} />);
      expect(screen.queryByLabelText(/add a comment about option a/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/send comment/i)).not.toBeInTheDocument();
    }
  });

  it("shows 'No comments yet' when there are no pins", () => {
    render(<CommentsPanel variation={makeVariation({})} />);
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  // KEV-172 (pinned-comment model): a comment is a pin, not a vote — the
  // row never renders a thumbs-up/down direction icon, regardless of
  // `comment.direction`.
  it("never renders a vote-direction icon on a comment row", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          viewerVote: null,
          comments: [makeComment({ comment: "neutral note", voterName: "Kevin" })],
        })}
      />
    );
    const commentText = screen.getByText("neutral note");
    const item = commentText.closest("li");
    expect(item).not.toBeNull();
    expect(item?.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders each comment with its name, text, and pin number (H1)", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          viewerVote: "up",
          comments: [makeComment({ comment: "too busy", voterName: "Kevin", direction: "down", seq: 3 })],
        })}
      />
    );
    expect(screen.getByText("too busy")).toBeInTheDocument();
    expect(screen.getByText("Kevin")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    const item = screen.getByText("too busy").closest("li");
    expect(item?.querySelector("svg")).not.toBeInTheDocument();
  });

  it("labels the viewer's own comment '(You)', falling back to bare 'You' with no name", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          viewerVote: "up",
          comments: [
            makeComment({ id: "c1", comment: "own with name", voterName: "Kevin", direction: "up", isOwn: true, seq: 1 }),
            makeComment({ id: "c2", comment: "own no name", voterName: null, direction: "up", isOwn: true, seq: 2 }),
          ],
        })}
      />
    );
    expect(screen.getByText("Kevin (You)")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows an 'Anonymous' fallback for a nameless comment that isn't the viewer's own", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          viewerVote: "up",
          comments: [makeComment({ comment: "no name given", voterName: null, direction: "up" })],
        })}
      />
    );
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  // KEV-172 chunk 4: the pin tracker groups by status — open pins prominent,
  // completed pins dimmed under a "Completed" heading — and numbers are the
  // server-frozen `seq`, not list position.
  it("splits pins into open and completed sections, ordered by their frozen pin number", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          comments: [
            makeComment({ id: "c3", comment: "third", seq: 3, status: "open" }),
            makeComment({ id: "c1", comment: "first", seq: 1, status: "complete" }),
            makeComment({ id: "c2", comment: "second", seq: 2, status: "open" }),
          ],
        })}
      />
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    const listItems = screen.getAllByRole("listitem");
    const texts = listItems.map((li) => li.textContent ?? "");
    // "second" (open, #2) then "third" (open, #3) before the Completed
    // divider, "first" (#1, but completed) after it.
    const secondIdx = texts.findIndex((t) => t.includes("second"));
    const thirdIdx = texts.findIndex((t) => t.includes("third"));
    const dividerIdx = texts.findIndex((t) => t === "Completed");
    const firstIdx = texts.findIndex((t) => t.includes("first"));
    expect(secondIdx).toBeLessThan(thirdIdx);
    expect(thirdIdx).toBeLessThan(dividerIdx);
    expect(dividerIdx).toBeLessThan(firstIdx);
  });

  it("only shows complete/delete actions on the viewer's own pins", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          comments: [makeComment({ id: "mine", comment: "mine", isOwn: true }), makeComment({ id: "theirs", comment: "theirs", isOwn: false })],
        })}
        onToggleCommentStatus={() => {}}
        onRequestDeleteComment={() => {}}
      />
    );
    expect(screen.getByLabelText(/mark comment complete/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/mark comment complete/i)).toHaveLength(1);
    expect(screen.getByLabelText(/delete comment/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/delete comment/i)).toHaveLength(1);
  });

  it("marks the author's own pin complete via the toggle", async () => {
    const user = userEvent.setup();
    const onToggleCommentStatus = vi.fn();
    render(
      <CommentsPanel
        variation={makeVariation({ id: "a", comments: [makeComment({ id: "c1", isOwn: true, status: "open" })] })}
        onToggleCommentStatus={onToggleCommentStatus}
      />
    );
    await user.click(screen.getByLabelText(/mark comment complete/i));
    expect(onToggleCommentStatus).toHaveBeenCalledWith("a", "c1", "complete");
  });

  it("reopens the author's own completed pin via the toggle", async () => {
    const user = userEvent.setup();
    const onToggleCommentStatus = vi.fn();
    render(
      <CommentsPanel
        variation={makeVariation({ id: "a", comments: [makeComment({ id: "c1", isOwn: true, status: "complete" })] })}
        onToggleCommentStatus={onToggleCommentStatus}
      />
    );
    await user.click(screen.getByLabelText(/reopen comment/i));
    expect(onToggleCommentStatus).toHaveBeenCalledWith("a", "c1", "open");
  });

  // Delete no longer deletes (or even confirms) inline — clicking the trash
  // icon just requests confirmation, which voter-shell.tsx surfaces as a
  // shared modal (see tests/ui/voter-shell.test.tsx for the full open/confirm/
  // cancel round trip through that modal).
  it("requests delete confirmation (not a direct delete) when the trash icon is clicked", async () => {
    const user = userEvent.setup();
    const onRequestDeleteComment = vi.fn();
    render(
      <CommentsPanel
        variation={makeVariation({ id: "a", comments: [makeComment({ id: "c1", isOwn: true })] })}
        onRequestDeleteComment={onRequestDeleteComment}
      />
    );
    await user.click(screen.getByLabelText(/^delete comment$/i));
    expect(onRequestDeleteComment).toHaveBeenCalledWith("a", "c1");
  });

  it("selects a pin (calls onSelectPin) when its row is clicked", async () => {
    const user = userEvent.setup();
    const onSelectPin = vi.fn();
    render(
      <CommentsPanel
        variation={makeVariation({ comments: [makeComment({ id: "c1", comment: "click me" })] })}
        onSelectPin={onSelectPin}
      />
    );
    await user.click(screen.getByLabelText(/select pin 1 on the stage/i));
    expect(onSelectPin).toHaveBeenCalledWith("c1");
  });

  // KEV-172 polish pass, item 1: selection is now sticky (no auto-clear
  // timer) and conveyed via `aria-pressed` in addition to the background
  // fill, so it isn't shown by color alone.
  it("shows the selected row as aria-pressed and keeps other rows unpressed", () => {
    render(
      <CommentsPanel
        variation={makeVariation({
          comments: [makeComment({ id: "c1", comment: "one" }), makeComment({ id: "c2", comment: "two", seq: 2 })],
        })}
        selectedPinId="c1"
      />
    );
    expect(screen.getByLabelText(/select pin 1 on the stage/i)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/select pin 2 on the stage/i)).toHaveAttribute("aria-pressed", "false");
  });

  it("wraps the complete/reopen and delete actions with an accessible name (tooltip labels)", () => {
    render(
      <CommentsPanel variation={makeVariation({ comments: [makeComment({ id: "c1", isOwn: true, status: "open" })] })} />
    );
    expect(screen.getByLabelText(/mark comment complete/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^delete comment$/i)).toBeInTheDocument();
  });

  it("shows a failed complete/delete error", () => {
    render(<CommentsPanel variation={makeVariation({})} commentError="Couldn't update this comment. Please try again." />);
    expect(screen.getByText(/couldn.t update this comment/i)).toBeInTheDocument();
  });
});
