import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(() => {
  Object.assign(process.env, loadEnv("test", process.cwd(), ""));
  return {
    plugins: [react()],
    test: {
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      globals: false,
      // Multiple test files share one live Postgres database, and tests/setup.ts
      // truncates voters/variations/votes in a global afterEach. Running test
      // files concurrently lets one file's truncation wipe data out from under
      // another file's in-flight test, so files must run sequentially.
      fileParallelism: false,
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, ".") },
    },
  };
});
