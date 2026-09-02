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

Two version numbers exist, and they move independently:

- The **root app** (`variation-voter`, `private: true`) is never published to
  npm. Its user-facing changes are what `CHANGELOG.md` tracks.
- **`create-variation-voter/`** is the npm scaffolder (`npx
  create-variation-voter`). Bump its version only when that tool's own behavior
  changes (different setup prompts, generated files, etc.) — not for general
  product changes.
