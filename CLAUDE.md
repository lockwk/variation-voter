# CLAUDE.md

Instructions for Claude agents working in this repo.

## Release notes (do this when you close a ticket)

`CHANGELOG.md` at the repo root is the running record of **user-facing** changes
to Variation Voter (Keep a Changelog format).

- **Only add a line for a user-facing change** — something a person using or
  self-hosting Variation Voter can see or do differently. Do **not** add a line
  for internal-only work (refactors, infra, tests, tooling, DB isolation, CI).
  When in doubt, leave it out.
- Put the note under the `## [Unreleased]` section, in plain language, under the
  right heading (`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` /
  `Security`), tagged with the ticket ID —
  e.g. `- Voter side panel now shows comment cards (KEV-204)`.
- Do not invent a version number or date. `[Unreleased]` is cut to a dated
  version heading only at release time.

## Versioning

Two `package.json` files carry a version number, and they're kept in
**lockstep** (always the same number):

- The **root app** (`variation-voter`, `private: true`) is never published to
  npm. Its user-facing changes are what `CHANGELOG.md` tracks.
- **`create-variation-voter/`** is the npm scaffolder (`npx
  create-variation-voter`).

`npm run release` (below) bumps both together, so there's nothing to do by
hand here — just keep `CHANGELOG.md` up to date as you go.

## Releasing

One command ships a release: `npm run release <version|patch|minor|major>`.

- `<version>` can be an exact version (`0.3.0`) or a bump keyword (`patch`,
  `minor`, `major`), computed from the current version in the root
  `package.json`.
- The release notes are pulled **verbatim** from whatever's under
  `## [Unreleased]` in `CHANGELOG.md` — so add notes there before releasing
  (see "Release notes" above). If `[Unreleased]` is empty, the script stops
  and tells you there's nothing to release.
- It shows you the new version and the exact notes, then asks
  `Publish this release? [y/N]` before doing anything. Answer anything other
  than `y`/`yes` and it stops — nothing is changed. Pass `--yes` to skip the
  prompt (useful for CI or non-interactive runs).
- Before asking, it checks that your working tree is clean, you're on `main`
  and up to date with `origin/main`, the tag doesn't already exist, and
  `gh` (GitHub CLI) is installed and logged in — if any of those fail, it
  tells you what to fix and stops.
- Once confirmed, it: bumps both `package.json` versions to the same number,
  refreshes `package-lock.json`, turns `## [Unreleased]` in `CHANGELOG.md`
  into a dated version heading (and starts a fresh empty `[Unreleased]`),
  commits, tags, and pushes to `main` — then creates the GitHub release
  (marked "Latest"), which is what `npx create-variation-voter` and
  `npm run update-variation-voter` both pick up.
- The tag push also kicks off the npm publish of `create-variation-voter` in
  the background (`.github/workflows/release.yml`) — the script tells you
  how to watch it (`gh run watch`), but you don't need to do anything else.
