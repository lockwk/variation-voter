# Variation Voter

Spin up a shareable variation-voting environment in seconds — by talking to an
agent. List design/build variations down the left, let external people (PMs,
clients, stakeholders, users) vote each one up or down and leave a short comment
on **why**, and sort the results **All / New / Top**.

Voters are **ephemeral** (they auto-expire after 7 days), **multi-user** (real
votes aggregated server-side, no login to vote), and **content-agnostic** — a
variation slot holds a live URL (iframe), an image, or an embed, so you never
rebuild the thing being voted on.

> **Status:** pre-implementation. The approved design lives in
> [`docs/superpowers/specs/2026-08-10-variation-voter-design.md`](docs/superpowers/specs/2026-08-10-variation-voter-design.md).
> No application code exists yet.

## How it works (once built)

- **One app, many voters.** A single Next.js app on Vercel + Neon Postgres hosts
  every voter as rows in a database — creating a voter is an API/CLI call, not a
  new deployment.
- **Agent-driven authoring.** You tell an agent "spin one up, put these in it";
  it calls a small CLI/API (`voter create`, `voter add …`) and hands you a share
  link.
- **Self-hostable.** Others run their **own** instance with their **own** free
  Neon database — nobody shares a backend.

## Planned stack

Next.js (App Router) · Neon Postgres · Drizzle ORM · Vercel (hosting + Cron
cleanup). See the spec for the full data model, agent interface, lifecycle, and
distribution plan.

## For the agent picking this up

Start with [`AGENTS.md`](AGENTS.md).
