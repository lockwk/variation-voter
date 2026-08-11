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
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, ".") },
    },
  };
});
