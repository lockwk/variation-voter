# Start here (for the implementing agent)

This repo was seeded from a brainstorming session. The product design is **done
and approved**; the next job is to turn it into an implementation plan and then
build it.

## What exists

- `docs/superpowers/specs/2026-08-10-variation-voter-design.md` — the approved
  design spec (source of truth). Read it in full first.
- `README.md` — public-facing summary.
- No application code yet.

## What to do next

1. Read the spec end to end.
2. Invoke the **`superpowers:writing-plans`** skill to turn the spec into a
   step-by-step implementation plan (save it under `docs/superpowers/plans/`).
3. Then implement per that plan (Next.js App Router + Neon Postgres + Drizzle +
   Vercel Cron cleanup + a thin authoring CLI/API), following
   `superpowers:executing-plans`.

## Ground rules from the design

- **Single-tenant v1:** only the instance owner authors voters, protected by a
  shared `ADMIN_TOKEN`. No login system, no multi-tenancy yet.
- **Public voting is anonymous and unlimited** — no dedup, name optional on a
  comment.
- **Voters auto-expire after 7 days** (overridable at create time); a daily
  Vercel Cron purges expired/archived voters (cascade delete).
- **Content slots are opaque:** `url` (iframe) | `image` | `embed`. Never
  re-author the variation being voted on inside this tool.
- **Free-tier first:** Vercel + Neon. Neon chosen for scale-to-zero + auto-resume.
- **Self-host is a first-class goal:** README needs a Deploy-to-Vercel button and
  a one-time `npx create-variation-voter` setup path — `npx` is per *instance*,
  never per voter.

See the spec's "Non-goals", "Success criteria", and "Open questions" sections
before making scope decisions.

## Distribution

Variation Voter ships a config-driven Claude Code skill in
`plugin/skills/variation-voter/` (see `SKILL.md` and `reference.md` there) so
any agent can create a voter and return a share link once it's installed and
pointed at a configured instance. For the full install/self-host/publish
story — provisioning, deploying, first voter, agent setup, updating, and
maintainer release steps — see `docs/INSTALL.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
