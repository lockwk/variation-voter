import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This app is built standalone and its dist/ output is served from the
// parent Next.js app's public/ directory, mounted at a subpath
// (/variations/pick-duel/). `base: "./"` makes every asset reference
// relative so the bundle works regardless of what path it's served under.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../public/variations/pick-duel",
    emptyOutDir: true,
  },
});
