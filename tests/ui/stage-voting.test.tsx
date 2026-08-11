// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Stage } from "@/app/v/[voterId]/stage";
import type { VariationWithAggregates } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

const variation: VariationWithAggregates = {
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
};

// Capture the real fetch before any test stubs it. The Neon HTTP driver used by
// tests/setup.ts's global `afterEach` (`db.delete(...)`) makes its own fetch calls to
// clean up the DB between tests — a blanket fetch mock would hijack those too and break
// DB cleanup, so the mock below only intercepts calls to the votes API and delegates
// everything else (like Neon's queries) to the real fetch.
const realFetch = global.fetch;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/api/")) {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ vote: { id: "vote1" } }), { status: 201 });
        }
        return new Response(JSON.stringify({ vote: { id: "vote1" } }), { status: 200 });
      }
      return realFetch(url, init);
    })
  );
});
afterEach(() => vi.restoreAllMocks());

describe("Stage voting", () => {
  it("posts exactly one vote and fires onVoteCast when thumbs-up is clicked", async () => {
    const user = userEvent.setup();
    const onVoteCast = vi.fn();
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="active"
        onVoteCast={onVoteCast}
        onCommentSubmit={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));

    expect(onVoteCast).toHaveBeenCalledWith("a", "up");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/votes",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reveals the comment/name form after voting and PATCHes the same vote instead of posting a second one", async () => {
    const user = userEvent.setup();
    const onCommentSubmit = vi.fn();
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="active"
        onVoteCast={() => {}}
        onCommentSubmit={onCommentSubmit}
      />
    );

    await user.click(screen.getByRole("button", { name: /thumbs down/i }));
    await user.type(await screen.findByLabelText(/why/i), "too busy");
    await user.type(screen.getByLabelText(/name/i), "Kevin");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onCommentSubmit).toHaveBeenCalledWith("a", "too busy", "Kevin");
    // Exactly one POST (the click) and one PATCH (the comment) — never two POSTs,
    // which would double-count the vote.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/voters/voter1/variations/a/votes",
      expect.objectContaining({ method: "PATCH" })
    );
    const lastCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
    expect(lastCallBody).toEqual({ voteId: "vote1", comment: "too busy", voterName: "Kevin" });
  });

  it("hides voting controls and shows a read-only notice for archived voters", () => {
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="archived"
        onVoteCast={() => {}}
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /thumbs up/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });
});
