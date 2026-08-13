---
name: variation-voter
description: >-
  Create shareable up/down voting pages for design or build variations and
  return a share link. Use when the user says "set up a variation voter",
  "create a voter", "spin up a voter", "vote on these variations/concepts/
  options", "get feedback on these designs", or wants stakeholders to vote
  👍/👎 on multiple options. Creates a voter in the configured instance, adds
  each concept as a variation (embed / url / image), and returns the link.
---

# Variation Voter

## What this does

Variation Voter is one self-hosted app instance (Next.js + Postgres). A
"voter" is a poll: a title plus a list of "variations" — opaque content
slots that anonymous visitors vote 👍/👎 on and can comment on. Each voter
you create is just data in that instance, not new code. The end product of
every run of this skill is a working `<instance>/v/<voterId>` link, which
expires after 7 days unless overridden.

## Before you start — load config

This skill is instance-agnostic: it never hardcodes a URL or token. Resolve
credentials in this exact order, and stop as soon as one source succeeds:

1. **Env vars.** If both `VARIATION_VOTER_URL` and
   `VARIATION_VOTER_ADMIN_TOKEN` are already set in the shell, use them.
2. **Config file.** Otherwise, look for `~/.variation-voter/config`
   (dotenv-style). If it exists, load it:
   ```bash
   set -a; . ~/.variation-voter/config; set +a
   ```
3. **Missing → stop.** If neither source provides both values, **stop and
   tell the user exactly this** — do not guess, invent, or ask them to paste
   a token into chat:

   > I need a Variation Voter instance configured before I can create a
   > voter. Either export `VARIATION_VOTER_URL` and
   > `VARIATION_VOTER_ADMIN_TOKEN` in your shell, or create
   > `~/.variation-voter/config` (copy `.variation-voter.config.example`
   > from the variation-voter repo, fill in your instance URL and
   > `ADMIN_TOKEN`, then `chmod 600` it). Re-run once that's set.

Never echo the resolved token back to the user or print it in a command you
show them — only use it in the `Authorization` header.

## The 3-step contract

Every run is: **create the voter → add each variation → return the link.**
Full command/curl syntax is in `reference.md` — read it before your first
create call in a session.

## Choosing `kind` per concept

| Concept is… | Use | Why / caveat |
|---|---|---|
| Self-contained HTML/CSS snippet (static markup, no JS behavior) | `embed` | Rendered inline via DOMPurify. **`<script>` and `on*` handlers are stripped** — no interactivity. A whitelisted `<iframe>` tag survives. |
| Deployed / publicly reachable interactive preview (Vercel preview, live site, CodeSandbox, Storybook URL) | `url` | Rendered in a sandboxed iframe, preserves interaction. **Must be reachable by external voters' browsers — never `localhost` or anything behind auth/VPN.** |
| Static comp, screenshot, or exported mockup | `image` | Rendered as `<img src>`. **Must already be a public image URL** — there is no upload endpoint, so host it first. |

Rule of thumb: interactive + publicly deployed → `url`; static picture →
`image`; small static HTML/CSS you can write inline → `embed`. If a concept
is only interactive at `localhost`, deploy it first (or fall back to a
screenshot `image`) and say so — never silently add an unreachable `url`.

## Two execution modes

- **Inside the Variation Voter app repo itself** (this repo, or a fork of
  it): use the CLI, `npm run voter -- create/add/link/...`.
- **In any other repo**: there's no CLI available, so use raw `curl`
  against the admin API. Full request/response shapes are in
  `reference.md`.

Both modes hit the same instance and the same admin API — pick whichever
matches where you're currently working.

## After creating

1. Add every variation before sharing the link.
2. Print the share link (`shareUrl` from the create response, or construct
   `$VARIATION_VOTER_URL/v/$VOTER_ID`).
3. Tell the user it expires in 7 days by default (`--expires-in-days` /
   `expiresInDays` to override), and that `close` makes it read-only while
   `delete` removes it immediately.

## Read `reference.md` before your first create call

`reference.md` has the full config-resolution details, CLI and curl command
reference, expanded kind-decision guide with failure modes, how to prepare
content per kind, voter management, troubleshooting, and one-time instance
provisioning. Read it before making the first API call in a session.
