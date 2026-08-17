# Distribution roadmap: npm-installable, agent-guided self-host

**Status:** in progress · **Started:** 2026-08-16 · **Owner:** Kevin (manager) + Sonnet subagents

This is the **single source of truth** for shipping Variation Voter as something a stranger can install and stand up. It lives on `main`, so every branch/Conductor workspace inherits it. **As each PR lands, check off its box and update the status table below.**

---

## The goal

A new user runs `npx create-variation-voter`, is **guided by an agent** through installing and deploying it, then says *"spin up a voter and build 5 variations of this"* and gets a **public link** to share with real people for votes and comments.

## What's already done (the engine)

The hard part exists and works:

- `build-variation-voter` skill dispatches parallel build subagents → real Vite app bundles → hosted → rendered in iframes → publishes a `/v/<id>` link.
- Public voting page: anonymous 👍/👎 + one comment per variation, aggregation, expiry, cron cleanup.
- Admin API + CLI to create voters and upload app bundles; Blob/local-fs storage drivers.

## What's missing (the wrapper)

Nothing lets an outsider *obtain* and *stand up* the app:

1. Not installable — `package.json` is `private`, repo not public, README Deploy button has `<owner>/<repo>` placeholders.
2. `create-variation-voter` only writes `.env.local` into an already-cloned repo; it doesn't fetch the app. README also documents a contradictory entry point (`node scripts/create.mjs`).
3. No guided-install agent skill — the "walk me through installation" piece.

## Decisions (locked 2026-08-16)

1. Guided install **ends in a Vercel deploy** (free public URL + real DB) — localhost links aren't externally shareable.
2. Distribution = **`npx create-variation-voter`** scaffolder that downloads the app + guided setup (like `create-next-app`). Only the small create-CLI is published to npm; the app is fetched from GitHub.
3. **No web creation UI for v1** — agent/CLI-driven voter creation is enough.

## Mental model to preserve

The user's **local clone is the "workshop"** (build template, pipeline scripts, node_modules to build variations); the **Vercel deploy is the "gallery"** (serves the public voter links). `publish-voter.ts` builds locally and uploads bundles to the deployed instance via the admin API. So the guided install must point `VARIATION_VOTER_URL` at the **deployed** URL, not localhost.

---

## PR sequence & progress

| # | Branch / PR | Scope | Depends on | Status |
|---|-------------|-------|-----------|--------|
| 0 | `docs/distribution-roadmap` | Land this roadmap (docs-only) | — | 🟡 in progress |
| 1 | `feat/real-installer` | Scaffolder fetches app + guided setup; npm-package create CLI; fix README entry point; update `create.test.ts` | — | ⬜ not started |
| 2 | `feat/install-skill` | New `install-variation-voter` guided-install skill | — | ⬜ not started |
| 3 | `feat/wire-and-docs` | Align install→build handoff, `shareUrl`/`PUBLIC_BASE_URL` check, docs, KEV-79 caveat | PRs 1 & 2 | ⬜ not started |
| R | Release & verify (**not a PR**) | Make repo public + fix Deploy button; `npm publish create-variation-voter`; clean-room end-to-end run | PR 3 | ⬜ not started |

PR 1 and PR 2 are independent and run in **parallel**. PR 3 wires them once both merge. Step R is operational and requires **Kevin's go/no-go** — nothing goes public until then.

---

## The end-to-end journey we're building

1. `npx create-variation-voter my-voter` → downloads the app into `./my-voter`, runs guided local setup.
2. **Install skill** walks the user through: provision Neon Postgres → deploy to Vercel → set env (`DATABASE_URL`, `ADMIN_TOKEN`, `CRON_SECRET`, `PUBLIC_BASE_URL`, optional Blob) → verify the deployed instance is reachable → write local config (`VARIATION_VOTER_URL` = deployed URL, `VARIATION_VOTER_ADMIN_TOKEN`).
3. User: *"spin up a voter and build 5 variations of X"* → existing **build skill** builds locally, uploads to the deployed instance, prints the public `/v/<id>` link.
4. User shares the link; external people vote and comment; user re-opens the same link to see tallies.

---

## Work detail per PR

### PR 1 — `feat/real-installer`
*Files: `scripts/create.mjs`, `package.json`, `README.md`, npm packaging for the create CLI.*
- [ ] Rework `scripts/create.mjs` to **fetch the app** into a new/empty dir (degit/tarball of the published repo) then run the existing guided `.env.local` prompts. Preserve env-generation logic + its test (`tests/scripts/create.test.ts`).
- [ ] Package a minimal **`create-variation-voter`** for npm so `npx create-variation-voter` works from nothing. App repo stays unpublished.
- [ ] Fix the README `npx` vs `node scripts/create.mjs` contradiction → one documented entry point.
- [ ] Update `create.test.ts` for the new fetch behavior; existing tests still green.

### PR 2 — `feat/install-skill`
*New: `.claude/skills/install-variation-voter/SKILL.md` (mirrors the quality bar of `build-variation-voter`).*
- [ ] Run the scaffolder; `npm install`.
- [ ] Provision a Neon DB (guide dashboard step or use CLI); capture `DATABASE_URL`.
- [ ] Deploy to Vercel via `vercel` CLI (lean on the `vercel-cli` skill); set env incl. `PUBLIC_BASE_URL` = assigned Vercel URL; build-time `drizzle-kit migrate` runs via `vercel.json`.
- [ ] **Verify** deployed instance reachable + admin token works (`GET /api/admin/voters`).
- [ ] Write local config so the build skill's preflight passes: `VARIATION_VOTER_URL` + `VARIATION_VOTER_ADMIN_TOKEN` (see `cli/config.ts`).
- [ ] Hand off: *"You're set up — now tell me to spin up a voter."*

### PR 3 — `feat/wire-and-docs`
- [ ] Confirm `build-variation-voter` preflight reads exactly the config `install-variation-voter` produces (`cli/config.ts`, `cli/api-client.ts`).
- [ ] Confirm `shareUrl` uses deployed `PUBLIC_BASE_URL` (`app/api/admin/voters/route.ts`), not localhost.
- [ ] Update `README.md` / `docs/deploy.md`: single install path + workshop-vs-gallery model.
- [ ] Note the **iframe isolation** limitation (same-origin bundles, KEV-79) as a "trusted agent-built content only" caveat.

### Step R — Release & verify (operational, not a PR)
- [ ] Make repo public; fill real `owner/repo` in README Deploy button + `build-variation-voter` GitHub refs.
- [ ] `npm publish create-variation-voter`.
- [ ] Clean-room dry run (see Verification).

---

## Out of scope for v1

- Web UI to create/manage voters (decision 3).
- Creator login / private results dashboard / CSV export (public link doubles as results view).
- KEV-79 dedicated-origin iframe hardening; KEV-80 test-suite-truncates-dev-DB footgun (keep the skill's existing warnings).

## Verification (definition of done)

1. From an empty folder on a clean profile: `npx create-variation-voter demo` produces a working local app (no manual git clone).
2. Following the `install-variation-voter` skill yields a **live public Vercel URL** + local config that authenticates against it.
3. Build skill preflight / `npm run voter -- list` succeeds against the deployed instance.
4. "Build 5 variations of <idea>" → a `/v/<id>` link on the **public domain**; incognito window shows 5 iframed apps and lets an anonymous visitor vote + comment; re-opening shows the recorded tally.
5. Existing tests pass (`tests/`, `pipeline/publish-voter.test.ts`, storage/API); `create.test.ts` updated.
