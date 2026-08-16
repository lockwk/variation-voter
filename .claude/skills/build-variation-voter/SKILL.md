---
name: build-variation-voter
description: Turn an idea into N built app variations shown side-by-side in a live voter link. Use when asked to "build a voter for <idea>", "show me N versions/variations to vote on", "make variations to A/B test", or "spin up a voter for X" — dispatches parallel build subagents and publishes a real /v/<id> link.
---

# Build Variation Voter

Orchestrate: idea -> N distinct briefs -> N apps built in parallel -> one voter link.
You are the orchestrator throughout. Do not write app code yourself — subagents do.

## 1. Inputs

- **Idea** (required): whatever the creator describes, freeform.
- **Count N**: whatever the creator asks for (any N >= 2). If unspecified, default to 3.
- **Axis of variation**: whatever the creator asks for — distinct concepts, distinct visual
  designs, a named set of directions ("one playful, one minimal, one data-dense"), or "you
  decide". Interpret their intent; do not impose a fixed axis of your own.

## 2. Pre-flight

Confirm before doing any work:

- `variation-apps/_template/` exists (the scaffold source).
- `VARIATION_VOTER_URL` and `VARIATION_VOTER_ADMIN_TOKEN` are set in the environment, and
  `VARIATION_VOTER_ADMIN_TOKEN` matches the target server's `ADMIN_TOKEN`. If missing, stop
  and ask the creator for them (or point at `README.md` setup) rather than guessing a value.
- The target `VARIATION_VOTER_URL` is reachable (e.g. `curl -sf "$VARIATION_VOTER_URL" >/dev/null`
  for a local dev server, or a quick `npm run voter -- list` to confirm auth works end to end).

## 3. Write N briefs

Expand the idea into exactly N briefs that are **concretely different**, not near-duplicates.
Each brief has: a short `title`, a one-line `description`, and a specific `direction` (what
makes this one distinct — the concept, the visual language, or the named axis value it embodies).

If anything should be held constant across all variations (so voters are comparing the axis and
not noise — e.g. same copy, same data, same brand colors, same feature set), write that once as
a shared **constants** block. Every build subagent gets the same constants plus its own brief.

Pick a short `runId` for this batch (e.g. `date +%Y%m%d-%H%M%S` or a slug of the idea) and a
slug per brief (e.g. `warm-minimal`, `data-dense`).

## 4. Scaffold + build (parallel)

For each brief, scaffold first (cheap, sequential is fine), then build in parallel.

```bash
node pipeline/scaffold-variation.mjs <slug> --run <runId>
```

This copies `variation-apps/_template/` (deps pre-installed) into `.variations/<runId>/<slug>/`
and prints the scaffold path and the dist path it will produce (`<scaffold path>/dist`). Do this
for all N briefs before dispatching any subagents.

Then dispatch **N build subagents in parallel**, one per brief — see
`superpowers:dispatching-parallel-agents` for the mechanics of a same-message parallel batch.
Use the `Agent` tool, `subagent_type: "claude"` (or `general-purpose`), model `sonnet`, one call
per brief, all in a single message so they run concurrently.

Give each subagent, self-contained (it has no memory of this conversation):

- Its scaffold path (`.variations/<runId>/<slug>/`).
- The shared constants block (verbatim).
- Its brief (title, description, direction).
- The contract from `variation-apps/_template/README.md`: only edit files under `src/`, keep
  it a self-contained SPA with hardcoded/mock data, no network calls, no reading query params
  or `window` globals, `base: "./"` in `vite.config.ts` is already set — never hardcode `/`
  asset paths.
- Instruction to run `npm run build` inside its scaffold directory, and to **iterate on any
  TypeScript/Vite errors** until it passes, bounded to a few retries (~5) before giving up.
- Instruction to verify `dist/index.html` exists before reporting success.
- The exact reply format: `SUCCESS <distPath> <one-line summary>` or `FAIL <reason>`.

Reference `variation-apps/pick-duel/` as the quality bar for a finished variation (polish,
motion, a real interaction loop) if the brief calls for that level of craft.

## 5. Failure policy

Collect only `SUCCESS` results. For each `FAIL`, you may re-dispatch that one brief once with
the failure reason appended to its prompt — do not loop indefinitely.

If fewer than 2 builds ultimately succeed, **stop**. Report which briefs failed and why. Do not
create a voter with 0 or 1 variation — that isn't a meaningful comparison.

## 6. Publish

Write a manifest for the successful builds:

```json
{
  "voter": { "title": "<derived from the idea>", "description": "<optional, one line>" },
  "variations": [
    { "title": "<brief title>", "description": "<brief description>", "distDir": "<distPath>" }
  ]
}
```

Save it (e.g. `.variations/<runId>/manifest.json`) and run:

```bash
tsx pipeline/publish-voter.ts .variations/<runId>/manifest.json
```

This creates the voter, uploads each dist via `add-app`, and prints a summary plus the `/v/<id>`
link. It aborts if fewer than 2 valid builds are passed — Step 5 should already have caught this,
but treat an abort here as authoritative too.

Return to the creator: the printed link, and a short list mapping each variation to what it is
(title + direction), so they know what they're looking at before opening it.

## 7. Notes

- App variation bundles are served same-origin for now — fine for trusted, agent-built content;
  hardening is tracked separately (KEV-79).
- Do **not** run the repo's full `npm test` around a voter you intend to keep — the suite
  truncates the shared dev DB and will destroy it (KEV-80).
