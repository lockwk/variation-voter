// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VoterPage from "@/app/v/[voterId]/page";
import VoterVariationPage from "@/app/v/[voterId]/[variationId]/page";
import { db } from "@/db/client";
import { createVoter, addVariation } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

describe("voter page routes", () => {
  it("renders the shell with the first variation selected by default", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    await addVariation(db, voter.id, { title: "Option A", kind: "image", src: "https://a" });

    const jsx = await VoterPage({ params: Promise.resolve({ voterId: voter.id }) });
    render(jsx);

    expect(screen.getByRole("img", { name: "Option A" })).toBeInTheDocument();
  });

  it("renders the shell with a deep-linked variation selected", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    await addVariation(db, voter.id, { title: "Option A", kind: "image", src: "https://a" });
    const b = await addVariation(db, voter.id, { title: "Option B", kind: "image", src: "https://b" });

    const jsx = await VoterVariationPage({
      params: Promise.resolve({ voterId: voter.id, variationId: b.id }),
    });
    render(jsx);

    expect(screen.getByRole("img", { name: "Option B" })).toBeInTheDocument();
  });
});
