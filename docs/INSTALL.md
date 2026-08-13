# Installing Variation Voter

This is the full, copy-pasteable install guide. If you just want the short
version, see the [Quickstart in the README](../README.md#quickstart) — come
back here for details, self-hosting on Vercel, and troubleshooting.

Variation Voter is a **Next.js app you deploy yourself** (own Neon database,
own Vercel project or your own server, own `ADMIN_TOKEN`). There is no shared
hosted instance — every installer runs their own.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the code](#2-get-the-code)
3. [Provision a database](#3-provision-a-database)
4. [Configure environment variables](#4-configure-environment-variables)
5. [Create the database tables](#5-create-the-database-tables)
6. [Run it — locally or on Vercel](#6-run-it--locally-or-on-vercel)
7. [Create your first voter](#7-create-your-first-voter)
8. [Optional: agent setup](#8-optional-agent-setup)
9. [Updating / uninstalling](#9-updating--uninstalling)
10. [Troubleshooting](#10-troubleshooting)
11. [Maintainer: releasing new versions](#11-maintainer-releasing-new-versions)

---

## 1. Prerequisites

- **Node.js 20.9 or later** and npm (Next.js 16 requires Node ≥ 20.9).
- A free **[Neon](https://neon.tech)** account (serverless Postgres).
- A **[Vercel](https://vercel.com)** account, if you want to deploy — or just
  run it locally with `npm run dev`.
- Optional: **[Claude Code](https://claude.com/claude-code)**, only needed if
  you want an agent to create voters for you (step 8).

Check your Node version:

```bash
node --version
# expect v20.9.0 or higher
```

## 2. Get the code

Fork the repository on GitHub (recommended, so you can pull upstream updates
later — see [§9](#9-updating--uninstalling)), then clone your fork:

```bash
git clone https://github.com/<your-username>/variation-voter.git
cd variation-voter
npm install
```

Expect `npm install` to finish with no errors and create a `node_modules/`
directory.

## 3. Provision a database

1. Create a free project at [neon.tech](https://neon.tech).
2. Open the project's **Connection Details** panel and copy the **pooled**
   connection string (starts with `postgres://` or `postgresql://`).
3. Keep it handy — it goes into `DATABASE_URL` in the next step.

## 4. Configure environment variables

Variation Voter needs four environment variables:

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Your Neon pooled connection string from step 3. |
| `ADMIN_TOKEN` | A long random secret. Whoever holds it can create, close, and delete voters via the CLI or admin API — treat it like a password. |
| `CRON_SECRET` | A long random secret. Vercel Cron sends this automatically on the daily cleanup run; it stops random callers from triggering cleanup. |
| `PUBLIC_BASE_URL` | The real, publicly reachable URL of your deployed instance (e.g. `https://your-app.vercel.app`). **This must be correct or share links break** — the server falls back to `http://localhost:3000` when it's unset, so every `shareUrl` your instance returns would be unusable to anyone but you. |

You have two ways to set these — pick one.

### Option A: guided setup (recommended)

```bash
node scripts/create.mjs
```

This prompts for your Neon `DATABASE_URL` and your public base URL, generates
random `ADMIN_TOKEN` and `CRON_SECRET` values for you, and writes
`.env.local`. Expect output ending in a "Next steps" list. If `.env.local`
already exists, the script aborts rather than overwrite it — remove or rename
the existing file first if you want to re-run it.

### Option B: manual setup

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in all four values by hand:

```bash
DATABASE_URL=postgres://...          # from step 3
ADMIN_TOKEN=$(openssl rand -hex 24)  # generate and paste in, or run this and copy the output
CRON_SECRET=$(openssl rand -hex 24)  # same idea, a different secret
PUBLIC_BASE_URL=http://localhost:3000  # replace with your real deployed URL once you have one
```

## 5. Create the database tables

```bash
npm run db:migrate
```

Expect log output listing each migration applied, ending without errors. This
runs Drizzle's migrator against `DATABASE_URL` from `.env.local`.

## 6. Run it — locally or on Vercel

### Run locally

```bash
npm run dev
```

Expect `Ready` in the console and the app served at `http://localhost:3000`.
Local instances work fine for creating and testing voters, but **anyone you
share a link with must be able to reach the URL in `PUBLIC_BASE_URL`** — a
`localhost` URL only works on your own machine, so use the Vercel path below
for anything you'll actually send to other people.

### Deploy to Vercel

**Option 1 — Deploy button.** Click the button at the top of the
[README](../README.md), which pre-fills the four required env vars. If you
forked the repo, first edit the button's `repository-url` in `README.md` to
point at your fork (see the note above the button).

**Option 2 — Vercel CLI.**

```bash
npm install -g vercel   # if you don't have it already
vercel link
vercel env add DATABASE_URL
vercel env add ADMIN_TOKEN
vercel env add CRON_SECRET
vercel env add PUBLIC_BASE_URL
vercel deploy --prod
```

Either way, once the project is deployed:

1. Confirm all four env vars are set in the Vercel project settings
   (Project → Settings → Environment Variables).
2. Run migrations once against the **production** database:

   ```bash
   DATABASE_URL="<your Neon connection string>" npx drizzle-kit migrate
   ```

   Expect the same "migrations applied" output as step 5.
3. Confirm the daily cleanup cron is registered: check `vercel.json` in this
   repo — it should contain a `crons` entry for `/api/cron/cleanup` — and
   confirm it shows up under Project → Settings → Cron Jobs in the Vercel
   dashboard after deploy.

## 7. Create your first voter

Point the CLI at your instance:

```bash
export VARIATION_VOTER_URL=https://your-app.vercel.app   # or http://localhost:3000
export VARIATION_VOTER_ADMIN_TOKEN=<the ADMIN_TOKEN you set above>
```

Worked example — a voter with two variations:

```bash
npm run voter -- create "Nav refresh"
# Created voter 3f9a1c2e-...
# https://your-app.vercel.app/v/3f9a1c2e-...

npm run voter -- add 3f9a1c2e-... --title "Live default" --url https://preview-a.example.com
npm run voter -- add 3f9a1c2e-... --title "Option B" --url https://preview-b.example.com

npm run voter -- link 3f9a1c2e-...
# https://your-app.vercel.app/v/3f9a1c2e-...
```

Open the printed `/v/<voterId>` link in a browser. Expect both variations to
render, with 👍/👎 buttons and a comment box under each.

`npm run voter -- close <voterId>` makes a voter read-only; `npm run voter --
delete <voterId>` removes it immediately. Otherwise every voter expires
automatically after 7 days (override with `--expires-in-days` on `create`).

## 8. Optional: agent setup

If you use Claude Code, you can install the bundled `variation-voter` skill
so an agent responds directly to "set up a variation voter with these
concepts" — in this repo or any other.

1. Install the skill. Either:
   - Install the bundled plugin (see `plugin/.claude-plugin/plugin.json`), or
   - Symlink or copy the skill directory into your personal skills folder:

     ```bash
     ln -s "$(pwd)/plugin/skills/variation-voter" ~/.claude/skills/variation-voter
     ```

2. Create your local, gitignored config so the skill knows which instance to
   talk to:

   ```bash
   mkdir -p ~/.variation-voter
   cp .variation-voter.config.example ~/.variation-voter/config
   chmod 600 ~/.variation-voter/config
   ```

3. Edit `~/.variation-voter/config` and fill in your instance URL and admin
   token:

   ```bash
   VARIATION_VOTER_URL=https://your-app.vercel.app
   VARIATION_VOTER_ADMIN_TOKEN=<your ADMIN_TOKEN>
   ```

From then on, any agent session — in this repo or an unrelated one — can
create a voter, add variations, and hand you back a share link. The skill
never hardcodes or echoes your token; if the config is missing it stops and
tells you what to set instead of guessing.

## 9. Updating / uninstalling

Variation Voter has two update paths, and it matters which one applies:

- **Tool-level pieces (scaffolder, CLI, skill files)** — if you installed
  this as an npm package, `npm update` (or `npx create-variation-voter@latest`
  for a fresh scaffold) pulls in the newest CLI and skill.
- **The deployed app itself** (routes, schema, migrations) — npm cannot
  reach into an already-deployed instance. Update it the same way you'd
  update any forked app:

  ```bash
  git fetch upstream          # add the upstream remote first if you haven't:
                               # git remote add upstream https://github.com/<original-owner>/variation-voter.git
  git merge upstream/main
  npm install
  npm run db:migrate          # or, against prod: DATABASE_URL="..." npx drizzle-kit migrate
  vercel deploy --prod        # or redeploy however you normally do
  ```

  Check `CHANGELOG.md` first — entries that touch the database or env vars
  say so explicitly.

**Rotating `ADMIN_TOKEN`:** generate a new value (`openssl rand -hex 24`),
update it in `.env.local` (local) or Vercel's env vars (deployed) and
redeploy, and update `~/.variation-voter/config` on every machine that uses
the skill or CLI against this instance. The old token stops working as soon
as the new deploy is live.

**Uninstalling:** delete the Vercel project and the Neon project (or just the
database), and remove `~/.variation-voter/config` and the skill symlink if
you set up agent access.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank iframe on a `url` variation | The `src` is `localhost`, a private/internal URL, or the target sends `X-Frame-Options: DENY` / a restrictive `frame-ancestors` CSP | Deploy the content somewhere publicly reachable, or switch that variation to `image` (screenshot) instead of `url`. |
| `401 Unauthorized` from the CLI or admin API | `VARIATION_VOTER_ADMIN_TOKEN` (or the `Authorization: Bearer` header) doesn't match the instance's `ADMIN_TOKEN` | Re-check the token in `.env.local` / Vercel env vars against what you exported or put in `~/.variation-voter/config`. |
| Migration errors / `npm run db:migrate` fails | Database unreachable, or `DATABASE_URL` malformed | Confirm the connection string is the pooled one from Neon, and that your network can reach it. |
| Share link points at `http://localhost:3000` in production | `PUBLIC_BASE_URL` is unset or wrong on the deployed instance | Set `PUBLIC_BASE_URL` to your real deployed URL in Vercel env vars and redeploy. |
| `embed` variation shows no interactivity | Embeds are sanitized static HTML/CSS — `<script>` tags and `on*` handlers are stripped by design | Use `url` (sandboxed iframe) instead if the content needs to run script. |

If the agent skill is involved, its `reference.md` has an equivalent
troubleshooting table with agent-specific failure modes (curl vs. CLI mode,
config resolution order, etc.) — see `plugin/skills/variation-voter/reference.md`.

---

## 11. Maintainer: releasing new versions

This section is for whoever maintains this repo's npm package
(`create-variation-voter` scaffolder, CLI, and skill files) — not for
installers.

1. Make sure `CHANGELOG.md` has an entry for the release under `Unreleased`,
   moved into a new version section. Call out explicitly if the release
   requires installers to run `npm run db:migrate` or add a new env var —
   those are the two things a plain `npm update` can't do for them.
2. Decide the version bump using semver:
   - **patch** — skill/CLI/docs fixes, no behavior change for installers.
   - **minor** — additive features (new CLI flag, new skill capability) that
     don't require any action from existing installers.
   - **major** — anything that requires an existing installer to run a new
     migration or set a new/changed env var. Call this out loudly in the
     CHANGELOG and the release notes.
3. Cut the release:

   ```bash
   npm version <patch|minor|major>
   git push && git push --tags
   npm publish
   ```

   `npm version` bumps `package.json`, commits, and tags in one step;
   `npm publish` uses the `files` allowlist in `package.json` so only the
   scaffolder, CLI, and skill files ship — not the whole Next.js app.
4. Confirm the publish: `npm view <package-name> version` should show the new
   version.
