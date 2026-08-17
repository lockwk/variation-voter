// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Stage } from "@/app/v/[voterId]/stage";
import type { VariationWithAggregates } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

const base: VariationWithAggregates = {
  id: "a",
  title: "Option A",
  description: "The current live version",
  kind: "url",
  src: "https://preview.example/a",
  position: 0,
  createdAt: new Date(),
  up: 2,
  down: 1,
  score: 1,
  viewerVote: null,
  comments: [],
};

// B3/B4/I1: the stage is now a pure media pane — title/description, vote
// buttons, and comments all moved into the rail (see rail.tsx and
// comments-panel.tsx), so Stage only ever takes `variation`.
describe("Stage", () => {
  it("shows an empty state when nothing is selected", () => {
    render(<Stage variation={null} />);
    expect(screen.getByText(/no variation selected/i)).toBeInTheDocument();
  });

  it("renders a sandboxed iframe for kind 'url'", () => {
    render(<Stage variation={base} />);
    const iframe = screen.getByTitle("Option A");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "https://preview.example/a");
    expect(iframe).toHaveAttribute("sandbox");
  });

  it("renders an img for kind 'image'", () => {
    render(<Stage variation={{ ...base, kind: "image", src: "https://example.com/b.png" }} />);
    expect(screen.getByRole("img", { name: "Option A" })).toHaveAttribute(
      "src",
      "https://example.com/b.png"
    );
  });

  it("renders an iframe embed for kind 'embed' instead of stripping it", async () => {
    const { container } = render(
      <Stage
        variation={{
          ...base,
          kind: "embed",
          src: '<iframe src="https://www.youtube.com/embed/xyz" allowfullscreen></iframe>',
        }}
      />
    );
    const iframe = await waitFor(() => {
      const el = container.querySelector("iframe");
      expect(el).not.toBeNull();
      return el;
    });
    expect(iframe).toHaveAttribute("src", "https://www.youtube.com/embed/xyz");
  });

  it("still strips dangerous attributes like onerror from embed content", async () => {
    const { container } = render(
      <Stage variation={{ ...base, kind: "embed", src: '<img src="x" onerror="alert(1)">' }} />
    );
    const img = await waitFor(() => {
      const el = container.querySelector("img");
      expect(el).not.toBeNull();
      return el;
    });
    expect(img).not.toHaveAttribute("onerror");
  });

  it("renders no title, description, vote buttons, or comments — those moved to the rail", () => {
    render(<Stage variation={base} />);
    expect(screen.queryByRole("heading", { name: "Option A" })).not.toBeInTheDocument();
    expect(screen.queryByText(/current live version/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /thumbs/i })).not.toBeInTheDocument();
  });
});
