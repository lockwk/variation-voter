import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { voters } from "@/db/schema";

describe("db connection", () => {
  it("can insert and read a voter row", async () => {
    await db.insert(voters).values({
      id: "smoke-test-1",
      title: "Smoke test",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const rows = await db.select().from(voters);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Smoke test");
  });
});
