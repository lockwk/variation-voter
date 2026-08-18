import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Self-contained bundle. base: "./" makes every asset reference relative so
// the built dist/ works when served from /apps/<id>/ (or any subpath). The
// dist/ produced here is zipped and uploaded to the voter via `voter add-app`.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
