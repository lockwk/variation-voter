// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  comments: [{ id: "c1", comment: "too busy", voterName: "Kevin", createdAt: new Date() }],
};

// Task 16 wires these up; this task's Stage accepts but doesn't yet use them.
const stubStageProps = {
  voterId: "voter1",
  voterStatus: "active" as const,
  onVoteCast: () => {},
  onCommentSubmit: () => {},
};

describe("Stage", () => {
  it("shows an empty state when nothing is selected", () => {
    render(<Stage variation={null} {...stubStageProps} />);
    expect(screen.getByText(/no variation selected/i)).toBeInTheDocument();
  });

  it("renders a sandboxed iframe for kind 'url'", () => {
    render(<Stage variation={base} {...stubStageProps} />);
    const iframe = screen.getByTitle("Option A");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "https://preview.example/a");
    expect(iframe).toHaveAttribute("sandbox");
  });

  it("renders an img for kind 'image'", () => {
    render(
      <Stage
        variation={{ ...base, kind: "image", src: "https://example.com/b.png" }}
        {...stubStageProps}
      />
    );
    expect(screen.getByRole("img", { name: "Option A" })).toHaveAttribute(
      "src",
      "https://example.com/b.png"
    );
  });

  it("renders comments with the commenter's name", () => {
    render(<Stage variation={base} {...stubStageProps} />);
    expect(screen.getByText("too busy")).toBeInTheDocument();
    expect(screen.getByText("Kevin")).toBeInTheDocument();
  });
});
