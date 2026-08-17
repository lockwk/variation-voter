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

## Starter prompts (hand these to the build subagents)

Each PR's code is written by a **Sonnet 5 subagent** working on its own branch off `main`. Copy the matching block verbatim as the subagent's kickoff prompt. All three assume the subagent reads this roadmap first for shared context (workshop = local clone, gallery = Vercel deploy).

### PR 1 — `feat/real-installer`

> You are implementing PR 1 of `docs/plans/2026-08-16-npm-distribution-roadmap.md` (read it first for context). Work on branch `feat/real-installer` off `main`.
>
> **Goal:** make `npx create-variation-voter <dir>` work from an empty directory — today `scripts/create.mjs` only writes `.env.local` into an *already-cloned* repo.
>
> **Do:**
> 1. Rework `scripts/create.mjs` so it (a) **fetches the app** into a new/empty target directory — use a tarball/degit-style download of the public GitHub repo (no `.git` history needed), guard against a non-empty target, then (b) runs the existing guided `.env.local` prompts (`DATABASE_URL`, `PUBLIC_BASE_URL`, auto-generate `ADMIN_TOKEN` + `CRON_SECRET`) inside that directory. Preserve the current env-generation logic exactly.
> 2. Package the create CLI so it publishes cleanly to npm as `create-variation-voter` (correct `bin`, `files` allowlist, `main`/`exports` as needed, node engine, zero-or-minimal deps). Do **not** un-private or publish the main app package — only the create CLI is meant for npm. If a separate thin package dir is cleaner than the root `package.json`, do that and explain the layout in the PR body.
> 3. Fix the README contradiction: pick `npx create-variation-voter` as the single documented entry point and remove/replace the `node scripts/create.mjs` instruction.
> 4. Update `tests/scripts/create.test.ts` to cover the new fetch-into-empty-dir behavior; keep all existing assertions that still apply. Mock the network fetch — tests must not hit GitHub.
>
> **Constraints:** don't fill in the real `<owner>/<repo>` in the README Deploy button or actually publish anything — that's the operational Step R. Leave a clearly-marked placeholder/TODO where the repo slug is needed. Don't touch the voter engine, DB schema, or the `build-variation-voter` skill.
>
> **Verify before reporting:** `npm run build` (or typecheck) passes; `npm test` passes (or the create test file in isolation if the full suite truncates the dev DB — see KEV-80); and a dry run of the scaffolder against a temp dir with a mocked/`file://` source produces a working tree + `.env.local`. Report `SUCCESS <summary of changes + any layout decisions>` or `FAIL <reason>`.

### PR 2 — `feat/install-skill`

> You are implementing PR 2 of `docs/plans/2026-08-16-npm-distribution-roadmap.md` (read it first for context). Work on branch `feat/install-skill` off `main`.
>
> **Goal:** create a guided-install agent skill that takes a brand-new user from nothing to a **live, reachable Vercel instance**, then hands off to the existing `build-variation-voter` skill.
>
> **Do:** create `.claude/skills/install-variation-voter/SKILL.md`, mirroring the structure, tone, and quality bar of `.claude/skills/build-variation-voter/SKILL.md` (read it first). The skill orchestrates:
> 1. Run `npx create-variation-voter <dir>` (PR 1's scaffolder) and `npm install`.
> 2. Provision a Neon Postgres DB — guide the dashboard steps, and use the Neon/Vercel CLI where available; capture `DATABASE_URL`.
> 3. Deploy to Vercel via the `vercel` CLI (lean on the existing `vercel-cli` skill). Set all env vars, including `PUBLIC_BASE_URL` = the assigned Vercel URL. Note build-time `drizzle-kit migrate` runs automatically per `vercel.json`.
> 4. **Verify** the deployed instance is reachable and the admin token works (`GET /api/admin/voters` returns 200).
> 5. Write local config so the build skill's preflight passes — `VARIATION_VOTER_URL` (the deployed URL) + `VARIATION_VOTER_ADMIN_TOKEN`. Read `cli/config.ts` to match the exact env/file the CLI expects.
> 6. End with an explicit handoff line: *"You're set up — now tell me to spin up a voter."*
>
> **Constraints:** this is a skill authoring task — no app/runtime code changes. Verify every file path, env var name, and command you reference actually exists in the repo (`cli/config.ts`, `cli/api-client.ts`, `vercel.json`, `docs/deploy.md`, `.env.example`) — do not invent flags. Include a preflight-checklist and a failure/troubleshooting section like the build skill has. Keep the deployed-URL-vs-localhost distinction explicit (the shareable link only works with `PUBLIC_BASE_URL` set to the deployed URL).
>
> **Verify before reporting:** re-read the finished SKILL.md and confirm every referenced path/command is real and the step order actually produces a reachable instance + valid local config. Report `SUCCESS <summary>` or `FAIL <reason>`.

### PR 3 — `feat/wire-and-docs` (after PR 1 + PR 2 merge)

> You are implementing PR 3 of `docs/plans/2026-08-16-npm-distribution-roadmap.md` (read it first). Work on branch `feat/wire-and-docs` off a `main` that already has PR 1 and PR 2 merged.
>
> **Goal:** make the install skill and the build skill connect cleanly, and update the docs to the single new path.
>
> **Do:**
> 1. Confirm `build-variation-voter`'s preflight reads exactly the config `install-variation-voter` writes (`VARIATION_VOTER_URL`, `VARIATION_VOTER_ADMIN_TOKEN`); trace `cli/config.ts` + `cli/api-client.ts`. If they mismatch, fix the mismatch (prefer changing the newer install skill to match the established CLI contract).
> 2. Confirm `shareUrl` uses the deployed `PUBLIC_BASE_URL` (`app/api/admin/voters/route.ts`) and document that the link is only externally shareable when it's set to the deployed URL.
> 3. Update `README.md` and `docs/deploy.md`: one install path (`npx create-variation-voter` → install skill → build skill) and the workshop (local clone) vs. gallery (Vercel deploy) model.
> 4. Add a short "known limitation" note about iframe isolation — app bundles are served same-origin (`allow-scripts allow-same-origin`); acceptable for trusted, agent-built content only (KEV-79).
>
> **Constraints:** no new features; wiring + docs only. Don't reopen KEV-79/KEV-80 — just document them.
>
> **Verify before reporting:** trace the full handoff (install writes config → build preflight reads it → publish prints a `PUBLIC_BASE_URL`-based link) and confirm no gap. Report `SUCCESS <summary>` or `FAIL <reason>`.

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
