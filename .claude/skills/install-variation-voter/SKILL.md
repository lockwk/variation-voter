---
name: install-variation-voter
description: Guide a brand-new user from nothing to a self-hosted Variation Voter instance. Use when asked to "install variation voter", "set me up", "walk me through installation", "deploy my own variation voter", or "self-host it" — ends in a live public Vercel URL, then hands off to build-variation-voter.
---

# Install Variation Voter

Orchestrate: scaffold -> provision Postgres -> deploy to Vercel -> verify -> local config.
You are the guide throughout. The end state is a live Vercel instance plus local shell config
that authenticates against it — then you hand off to `build-variation-voter`.

Keep the **workshop vs gallery** model straight the whole way through: the local clone is the
**workshop** (build template, pipeline scripts, `node_modules` used to build variations); the
Vercel deploy is the **gallery** (serves the public voter links). The CLI must point
`VARIATION_VOTER_URL` at the **deployed** URL — never `localhost` — or the links you print
won't be shareable.

## 1. Pre-flight

Confirm before doing any work:

- `node` and `npm` are present (`node -v`, `npm -v`). If missing, stop and point the user at
  https://nodejs.org — don't guess a version.
- The `vercel` CLI is installed and logged in (`vercel whoami`). If it errors, stop and have
  the user run `npm i -g vercel && vercel login` (see the `vercel-cli` skill) before continuing.
- The user has a Vercel account (implied by `vercel whoami` succeeding above). If they don't,
  stop and point them at https://vercel.com/signup.
- The user has a Neon (or any Postgres-compatible) account, or intends to use Vercel's native
  Postgres integration (Step 3 covers both). If neither, stop and point them at
  https://neon.tech — don't provision anything on their behalf without confirming which path
  they want.

## 2. Scaffold + install

```bash
npx create-variation-voter <dir>
cd <dir>
npm install
```

The scaffolder generates `ADMIN_TOKEN` and `CRON_SECRET` into `.env.local` as part of the guided
setup. **Capture both values** — you'll reuse them as the Vercel project env vars in Step 4, and
`ADMIN_TOKEN` again as `VARIATION_VOTER_ADMIN_TOKEN` in Step 6.

## 3. Provision Postgres (Neon)

**Recommended:** use Vercel's native Neon/Postgres Marketplace integration from the project's
Storage tab (or `vercel integration add`) — it auto-injects `DATABASE_URL` into the project's
environment variables, so Step 4 can skip setting it by hand.

**Fallback:** create a project at https://neon.tech, open its dashboard, and copy the connection
string it gives you.

Either way, capture `DATABASE_URL`. Never commit it to a file the user might check in — it's a
value you pass to `vercel env add`, not something to write into the repo.

## 4. Deploy to Vercel

Lean on the `vercel-cli` skill for command details; don't invent flags — if unsure, run
`vercel <command> --help`.

```bash
vercel link
```

Set each env var (`environment` is a **positional** argument, not a flag):

```bash
vercel env add DATABASE_URL production --value "<connection string>" --yes
vercel env add ADMIN_TOKEN production --value "<from .env.local>" --yes
vercel env add CRON_SECRET production --value "<from .env.local>" --yes
vercel env add PUBLIC_BASE_URL production --value "https://<project>.vercel.app" --yes
```

**Ordering rule — determine the stable production domain first.** Before deploying, work out
the project's `<project>.vercel.app` domain (visible after `vercel link`, or via
`vercel project inspect <project>`). Set `PUBLIC_BASE_URL` to that domain and make sure
`DATABASE_URL` is set, **then** run:

```bash
vercel --prod
```

This prints the deployed URL to stdout. The order matters because `vercel.json`'s
`buildCommand` (`drizzle-kit migrate && next build`) runs migrations at build time — it needs
`DATABASE_URL` in place before that first build — and `PUBLIC_BASE_URL` needs to already be
correct so share links generated after deploy don't point at the wrong host.

If `PUBLIC_BASE_URL` was only set **after** a first deploy, **redeploy** (`vercel --prod` again)
so the running instance picks up the corrected value.

## 5. Verify the deployed instance

Site is reachable:

```bash
curl -sf https://<deployed>/ >/dev/null
```

Admin token works — `GET /api/admin/voters` returns **200**. Export the token into this shell
first (nothing auto-loads it from `.env.local`), then curl:

```bash
export ADMIN_TOKEN=<same value written to .env.local in Step 2>
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ADMIN_TOKEN" https://<deployed>/api/admin/voters
```

Expect `200`. A `401` means the token sent doesn't match the server's `ADMIN_TOKEN` — see
Section 7.

## 6. Write local config

```bash
export VARIATION_VOTER_URL=https://<deployed>
export VARIATION_VOTER_ADMIN_TOKEN=<same value as ADMIN_TOKEN>
```

The CLI (`cli/config.ts`) reads these directly from `process.env` — nothing auto-loads them
from `.env.local` or any other file. Suggest the user add both `export` lines to their shell
profile (`~/.zshrc` etc.) so they persist across terminal sessions.

`VARIATION_VOTER_URL` must be the **deployed** Vercel URL, never `localhost` — a localhost link
isn't reachable by anyone else.

Confirm end-to-end:

```bash
npm run voter -- list
```

## 7. Failure / troubleshooting

One issue per bullet — report the specific cause, don't loop:

- **`vercel whoami` fails / not logged in** — run `vercel login` and retry.
- **Build fails on migration step** — `DATABASE_URL` is missing or wrong in the Vercel project's
  Production env vars; re-check Step 3/4 and redeploy.
- **Verify (Step 5) returns 401** — first confirm `ADMIN_TOKEN` is actually exported in this shell
  (an empty variable sends `Bearer ` and always 401); then check `VARIATION_VOTER_ADMIN_TOKEN` (or
  the token you curled with) equals the server's `ADMIN_TOKEN`, re-copying from `.env.local` / Vercel
  env vars.
- **Share link shows `localhost`** — `PUBLIC_BASE_URL` is unset or wrong in Vercel, or it was set
  after the first deploy and the app wasn't redeployed; fix the value and run `vercel --prod` again.
- **`npx create-variation-voter` not found** — fall back to cloning the repo directly and running
  its setup script instead of the npm scaffolder.

## 8. Handoff

**You're set up — now tell me to spin up a voter.**

## Notes

- The server's `ADMIN_TOKEN` (Vercel env var) and the CLI's `VARIATION_VOTER_ADMIN_TOKEN` (shell
  env var) must always stay equal — they're the same secret in two different places.
- `PUBLIC_BASE_URL` is read at request time (`app/api/admin/voters/route.ts`) to build each
  voter's share link (`${base}/v/${id}`), so changing it requires a redeploy to take effect.
- Optional: `BLOB_READ_WRITE_TOKEN` gives you a dedicated per-environment Blob store for
  app-variation bundles instead of local-filesystem storage — see `docs/deploy.md` if you want it.
- Carried over from `build-variation-voter`: app-variation bundles are served same-origin for
  now — fine for trusted, agent-built content; hardening is tracked separately (KEV-79). And do
  **not** run the repo's full `npm test` against a live/deployed database — the suite truncates
  the shared dev DB and will destroy it (KEV-80).
