# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Convention:** entries flag when applying an update requires installers to
run `npm run db:migrate` (or `npx drizzle-kit migrate` against production) or
to set a new/changed environment variable. If an entry doesn't say so, a plain
code update (`git pull` / `npm update`) is enough — no migration or env
changes needed.

## [Unreleased]

### Added
- Config-driven agent skill (`plugin/skills/variation-voter/`) that resolves
  the target instance and admin token from env vars or
  `~/.variation-voter/config`, so any agent can create a voter and return a
  share link without hardcoding an instance.
- `docs/INSTALL.md` — a full, copy-pasteable self-host install guide covering
  provisioning, local/Vercel deployment, first-voter walkthrough, optional
  agent setup, updating, and troubleshooting.
- `LICENSE` (MIT).

### Changed
- Hardened `scripts/create.mjs` and clarified the distinction between
  npm-updatable tooling (scaffolder, CLI, skill) and the git-based app core
  (routes, schema, migrations) — see `docs/INSTALL.md` § Updating.
- `package.json` configured for npm publishing: scoped package name, `files`
  allowlist, `publishConfig`, and MIT license metadata.

## [0.1.0] - 2026-08-13

Initial self-hostable release.

### Added
- Next.js app for creating shareable voting pages ("voters") with
  `url` / `image` / `embed` variations, anonymous 👍/👎 voting, and comments.
- Neon Postgres + Drizzle ORM schema and migrations.
- Vercel Cron daily cleanup of expired/archived voters.
- Authoring CLI (`npm run voter -- create/add/list/link/close/delete`) and
  admin HTTP API, both authenticated with a shared `ADMIN_TOKEN`.
- `npx create-variation-voter` guided setup script (`scripts/create.mjs`).
- Deploy-to-Vercel button and self-host documentation.
- Installable, config-driven Claude Code agent skill for creating voters from
  any repo.
- npm publishing configuration (scoped package name, `files` allowlist,
  `publishConfig`).

**Requires:** `npm run db:migrate` on first install (creates all tables);
`DATABASE_URL`, `ADMIN_TOKEN`, `CRON_SECRET`, `PUBLIC_BASE_URL` env vars.

[Unreleased]: https://github.com/lockwk/variation-voter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lockwk/variation-voter/releases/tag/v0.1.0
