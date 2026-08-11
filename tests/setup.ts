import { afterEach } from "vitest";
import { db } from "@/db/client";
import { voters, variations, votes } from "@/db/schema";

afterEach(async () => {
  try {
    await db.delete(votes);
    await db.delete(variations);
    await db.delete(voters);
  } catch {
    // Skip cleanup if database connection fails (e.g., when fetch is mocked)
  }
});
