import { afterEach } from "vitest";
import { db } from "@/db/client";
import { voters, variations, votes, comments } from "@/db/schema";

afterEach(async () => {
  await db.delete(comments);
  await db.delete(votes);
  await db.delete(variations);
  await db.delete(voters);
});
