# Variation App Template

This is a scaffold for a single "app" variation in Variation Voter. It gets
copied per-variation, and the agent implementing that variation replaces
`src/` with the real app.

## Contract

- **Only edit files under `src/`.** Do not touch `vite.config.ts`,
  `package.json`, `tsconfig.json`, or `index.html` — these define the build
  contract that the upload pipeline relies on.
- Build with `npm run build`. The artifact is `dist/` (contains `index.html`
  plus `assets/*`), and it must be fully self-contained.
- Keep it a single self-contained SPA with hardcoded/mock data — no network
  calls, no external CDNs, no reading query params or `window` globals.
- Assets are served under a subpath, so `base: "./"` is required in
  `vite.config.ts` (already set) — never hardcode absolute `/` asset paths.

## Workflow

1. Copy this directory to `variation-apps/<your-variation-id>/`.
2. Replace the contents of `src/` (feel free to add sibling files, styles,
   etc. — everything under `src/` is fair game).
3. Run `npm install` (if not already installed) and `npm run build`.
4. The resulting `dist/` folder is zipped and uploaded via `voter add-app`.
