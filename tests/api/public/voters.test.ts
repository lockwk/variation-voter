import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/voters/[voterId]/route";
import { db } from "@/db/client";
import { createVoter, addVariation, castVote } from "@/db/queries";

describe("GET /api/voters/:voterId", () => {
  it("404s for a missing voter", async () => {
    const response = await GET(new Request("http://localhost/api/voters/nope"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns voter, variations, and aggregates with no auth", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });

    const response = await GET(new Request(`http://localhost/api/voters/${voter.id}`), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voter.title).toBe("Nav refresh");
    expect(body.voter.variations[0].up).toBe(1);
  });
});
