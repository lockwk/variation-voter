import { config } from "dotenv";
config({ path: ".env.local" });

import { defineConfig } from "drizzle-kit";
import { requireEnv } from "./lib/env";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireEnv("DATABASE_URL") },
});
