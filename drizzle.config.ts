import { config } from "dotenv";
config({ path: ".env.local" });

import { defineConfig } from "drizzle-kit";
import { requireEnv } from "./lib/env";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? requireEnv("DATABASE_URL"),
  },
});
