# Variation Voter — Design

- **Date:** 2026-08-10
- **Status:** Approved (design); ready for implementation planning
- **Ticket:** [KEV-22 — Variation voter](https://linear.app/kevin-lockwood/issue/KEV-22/variation-voter)
- **Author:** Kevin Lockwood (with Claude)

## Problem & motivation

Design/build work always benefits from iteration, and iterations often need
outside input — from product managers, clients, stakeholders, or users — to
compare options and decide. Today, getting that input means asking an agent to
hand-build a bespoke "playground" each time: a left-hand navigation, N
variations, the first one defaulting to what's live, then walking the agent
through adapting each subsequent variation. That is slow and token-expensive to
build **every single time**, and the current playgrounds (in
`apps/cruise-demo/src/playground/`) only store votes in one person's
`localStorage`, so they can't actually gather input from a group.

**Variation Voter** is a standalone tool that lets a designer/builder spin up a
shareable voting environment in seconds — by *talking to an agent* — where
external people can view multiple variations, vote them up or down, and leave a
short comment explaining why.

## Goals

- **Spin up a voter conversationally, near-free.** The shell is built once; a
  new voter is *data*, not code. The author tells an agent "spin one up, put
  these in it," and the agent makes a few API/CLI calls and returns a share link.
- **Real multi-user voting.** External people vote and comment through a shared
  link; results aggregate server-side across everyone.
- **Content-agnostic slots.** A variation is an opaque slot — the shell doesn't
  care what's inside. It can hold a live URL (rendered in an iframe, preserving
  motion/interactivity), a static image, or an embed snippet.
- **Ephemeral by default.** Voters are temporal — once everyone has weighed in,
  they're disposable. The system cleans up after itself so the database never
  grows into a junk pile.
- **Free to run.** Stay within free tiers (Vercel + Neon).
- **Reusable across projects and by others.** Client-agnostic; others can stand
  up their **own** instance with their **own** database so they never touch the
  author's backend or cost.

## Non-goals (v1)

- **Author authentication / multi-tenancy.** v1 is single-tenant: only the
  instance owner creates voters (protected by a shared admin token). No login
  system, no per-user workspaces.
- **The per-voter `npx` scaffolder** (the "a project per voter" model) — rejected
  as the expensive path. `npx` is used *once per person to stand up an instance*,
  not per voter.
- **Threaded / reply comments.** Comments are flat, one per vote.
- **Vote deduplication / one-vote-per-person.** Voting is anonymous and
  unlimited by explicit choice.
- **Rebuilding live components inside the tool.** Interactive variations are
  referenced by preview URL and iframed, never re-authored in the voter.

## Users

- **Author (Kevin, via an agent):** creates voters and populates their
  variations conversationally. Never edits a GUI or a config file by hand.
- **Voters (stakeholders, clients, PMs, users):** open a share link, browse
  variations, vote, and comment. No account, no login.

## Core concept

A **Voter** is a titled, time-boxed collection of **Variations**. Each Variation
is a content slot (URL / image / embed). Anyone with the link can cast **Votes**
(up or down) on any variation, optionally attaching a short comment and an
optional name. The voter page lists variations down the left, renders the
selected one in the stage, shows aggregate 👍/👎 counts and comments, and can
sort the list **All / New / Top**.

## Architecture overview

A single **Next.js (App Router) app on Vercel**, backed by **Neon Postgres**
(via Drizzle ORM). One deployment hosts *many* voters — each voter is rows in the
database, not a separate deploy. Three surfaces:

1. **Public voter page** (`/v/<voterId>`) — the shareable shell. Read-and-vote;
   no auth.
2. **Authoring API** (`/api/admin/*`) — CRUD for voters/variations, protected by
   a shared `ADMIN_TOKEN`. Driven by the agent (directly or via a thin CLI).
3. **Cleanup cron** — a daily Vercel Cron route that purges expired/archived
   voters.

## Data model

```
Voter
  id           text (short slug, used in the share URL)   PK
  title        text
  description  text?                                       nullable
  status       enum('active','archived')  default 'active'
  createdAt    timestamptz  default now()
  expiresAt    timestamptz                                 -- default createdAt + 7 days
  archivedAt   timestamptz?                                nullable

Variation
  id           text  PK
  voterId      text  FK -> Voter.id  (cascade delete)
  title        text
  description  text?
  kind         enum('url','image','embed')
  src          text            -- iframe URL | image URL | embed HTML
  position     integer         -- default display order (0-based)
  createdAt    timestamptz  default now()

Vote
  id           text  PK
  variationId  text  FK -> Variation.id  (cascade delete)
  direction    enum('up','down')
  comment      text?           -- optional "why?"
  voterName    text?           -- optional attribution
  createdAt    timestamptz  default now()
```

Aggregates are computed by query, not stored:

- **up / down counts** per variation = `count(*)` grouped by `direction`.
- **score** = `up - down` (drives the **Top** sort).
- **comments** = votes with a non-empty `comment`.

## The shell (built once)

**Route:** `/v/<voterId>` (public share link).

**Layout:** left navigation + stage, mirroring the current playground.

- **Left nav:** the variation list. Each row shows title, its 👍/👎 counts, and a
  selected state. A **sort control** at the top switches the list order:
  - **All** — default order by `position` (as added).
  - **New** — by `createdAt` descending (newest variations first).
  - **Top** — by `score` descending (most-liked first).
- **Stage:** renders the selected variation by `kind`:
  - `url` → `<iframe src>` (sandboxed) — preserves motion/interaction.
  - `image` → `<img>`.
  - `embed` → sanitized embed HTML.
  - Shows the variation's title/description and its comment feed.
- **Voting:** a 👍 / 👎 pair. Clicking a direction records a vote immediately
  (counts update optimistically) and reveals a short optional **"why?" comment
  field** plus an optional **name** field. Submitting attaches the comment/name
  to that vote. Voting is anonymous and unlimited — no toggle, no dedup.
- **Archived voters** render read-only (counts and comments visible, voting
  disabled).

**Deep-linking:** `/v/<voterId>/<variationId>` selects a variation directly (the
same replaceState-based pattern the current playground uses).

## Agent interface

A thin CLI wrapping the authoring API (both usable; the CLI is the ergonomic
surface for the agent). All authoring calls require the `ADMIN_TOKEN`.

```
voter create "Nav refresh"                 # -> voterId + share link
voter add <voterId> --title "Live default" --url  https://preview.example/...
voter add <voterId> --title "Option B"     --image ./b.png        # uploads/points to an image
voter add <voterId> --title "Option C"     --embed '<iframe .../>'
voter list                                  # active voters + expiry
voter link <voterId>                        # print the share URL
voter close <voterId>                       # archive (link goes read-only)
voter delete <voterId>                      # hard delete (cascades)
```

This is the entire "cheap in time and tokens" win: creating a voter and filling
it is a handful of calls against an already-built shell — no per-voter code,
CSS, routing, or components.

**API endpoints (used by the CLI):**

- `POST /api/admin/voters` → create voter
- `POST /api/admin/voters/:id/variations` → add variation
- `GET  /api/admin/voters` → list
- `POST /api/admin/voters/:id/close` → archive
- `DELETE /api/admin/voters/:id` → delete
- `POST /api/voters/:id/variations/:vid/votes` → **public** cast vote (+comment)
- `GET  /api/voters/:id` → **public** read voter + variations + aggregates

## Lifecycle & cleanup

- Every voter gets `expiresAt = createdAt + 7 days` (overridable at create time).
- `voter close` sets `status='archived'` + `archivedAt` (link becomes read-only).
- `voter delete` hard-deletes the voter and cascades to variations/votes.
- A **daily Vercel Cron** route (`/api/cron/cleanup`) hard-deletes any voter
  where `expiresAt < now()`, and any archived voter past a short grace window.
  Idle voters self-destruct; the author never manually garbage-collects. Vote and
  comment rows are tiny text, so storage stays negligible regardless.

## Stack & hosting

- **Framework:** Next.js (App Router), TypeScript.
- **Hosting:** Vercel. *(Free Hobby tier is technically non-commercial; internal
  use is fine, but paid client engagements may warrant Vercel Pro or a swap to
  Cloudflare Pages. Not a v1 blocker.)*
- **Database:** **Neon Postgres** — Vercel-native, and it **scales to zero with
  auto-resume**, so an idle share link costs nothing yet wakes instantly (no
  manual un-pause). Chosen over Supabase (free projects pause after 7 days idle
  and need manual restore) and Turso (kept as a more-generous fallback if we ever
  outgrow Neon's free tier).
- **ORM:** Drizzle (lightweight, serverless-friendly with Neon).
- **Styling:** self-contained (e.g. Tailwind) — this is a standalone repo and does
  not depend on `@cocaptain/ui`.
- **Cron:** Vercel Cron (daily cleanup).

## Distribution / self-host

The tool is open-source on GitHub. Others run their **own** instance with their
**own** free-tier database — the author's backend is never shared, so nobody's
usage reads into the author's cost.

- **"Deploy to Vercel" button** in the README: fork → connect *their* Neon →
  set `DATABASE_URL` + `ADMIN_TOKEN` → deploy (~5 minutes, free tier).
- **`npx create-variation-voter`** (setup script): scaffolds config and walks a
  new user through connecting their DB and deploying — **once per instance**, not
  per voter. This is the correct home for the "npx" idea.

## Success criteria

- The author can, in a single agent turn, create a voter, add ≥2 variations
  (including one live-preview-URL slot pointed at the current live playground),
  and receive a working share link.
- A second person, on a different machine with no login, can open the link, vote
  up/down on a variation, leave a comment, and see their vote reflected in the
  aggregate counts.
- The list re-sorts correctly under All / New / Top.
- A voter past its 7-day expiry is gone after the next cleanup run.
- A second person can fork the repo and stand up their own working instance
  against their own Neon database using the README steps.

## Open questions / future phases

- **Author auth / multi-tenancy** — if the tool is ever hosted for multiple
  authors (rather than each self-hosting), it needs real auth and per-author
  scoping. Deferred.
- **Image hosting** — where uploaded `image` variations live (Vercel Blob vs.
  just requiring an image URL). v1 can start URL-only and add upload later.
- **Results export / summary** — a "download the feedback" or auto-summary view
  could be a natural follow-on.
- **Per-voter `npx` scaffolder** — explicitly rejected for v1; revisit only if
  the single-instance model proves limiting.
