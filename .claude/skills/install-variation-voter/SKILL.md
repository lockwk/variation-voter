---
name: install-variation-voter
description: Guide a brand-new user from nothing to a self-hosted Variation Voter instance. Use when asked to "install variation voter", "set me up", "walk me through installation", "deploy my own variation voter", or "self-host it" — ends in a live public Vercel URL, then hands off to build-variation-voter.
---

# Install Variation Voter

Orchestrate: scaffold -> link Vercel -> provision database -> provision Blob storage ->
set secrets -> deploy -> verify -> local config. You drive every command. The user is a
designer, not an engineer — they should never need to open a terminal, read a stack trace, or
know what an env var is.

**Foolproof rule:** the user's only manual action in this entire flow is a single browser
"Accept" click the first time you run the Neon integration (Step 4) — that's a legal
marketplace-terms consent, so an agent can't and shouldn't click through it. Everything else
you run yourself. If any step seems to require the user to already know something (what a
connection string is, what "unpooled" means, how to open a terminal), that's a bug — do it for
them and just tell them what happened in plain language.

Keep the **workshop vs gallery** model straight the whole way through: the local clone is the
**workshop** (build template, pipeline scripts, `node_modules` used to build variations); the
Vercel deploy is the **gallery** (serves the public voter links). `VARIATION_VOTER_URL` must
point at the **deployed** URL — never `localhost` — or the links you print won't be shareable.

## 1. Pre-flight

Confirm before doing any work:

- `node` and `npm` are present (`node -v`, `npm -v`). If missing, stop and point the user at
  https://nodejs.org — don't guess a version.
- The `vercel` CLI is installed and logged in (`vercel whoami`). If it errors, run
  `npm i -g vercel && vercel login` yourself (see the `vercel-cli` skill) — `vercel login` opens
  a browser the user approves, then control returns to you.
- The user has a Vercel account (implied by `vercel whoami` succeeding above). If they don't,
  stop and point them at https://vercel.com/signup — that one's on them, an agent can't sign up
  on someone else's behalf.

## 2. Scaffold + install

```bash
npx create-variation-voter <dir>
cd <dir>
npm install
```

This generates `ADMIN_TOKEN` and `CRON_SECRET` into `.env.local`. **Capture both values now, to
files, before continuing:**

```bash
grep '^ADMIN_TOKEN=' .env.local | cut -d= -f2- | tr -d '\n' > /tmp/vv-admin-token.txt
grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\n' > /tmp/vv-cron-secret.txt
```

Do this now, not later: `vercel link` (Step 3) and the Neon integration (Step 4) rewrite
`.env.local` and wrap every value in double quotes when they do (e.g.
`ADMIN_TOKEN="21c1...701"`). Grabbing the pristine, unquoted values into files right after
scaffolding — before that rewrite happens — sidesteps the quoting trap in Step 6 entirely. Using
files rather than shell variables also means the values survive even if later commands run in
separate shell sessions.

## 3. Link the Vercel project

```bash
vercel link
```

Creates (or links) the Vercel project this instance will deploy to. Accept the CLI's prompts
(project name, scope) with sensible defaults unless the user has a preference.

## 4. Database

**Default (recommended): Vercel-Neon integration.**

```bash
vercel integration add neon --plan free_v3 -m auth=false
```

The **first time** you (or anyone) run this in a Vercel account, it opens a browser tab asking
to accept Neon's marketplace terms. Tell the user: *"Vercel needs you to click one 'Accept'
button in the browser tab that just opened — that's it, I'll take it from there."* Once they
click it, the CLI resumes automatically and finishes provisioning — you don't need to do
anything else, and on every future run (new projects, future users) this step is fully
automatic with no click at all.

This provisions a free Neon database, connects it to the project, and injects `DATABASE_URL`
(pooled) and `DATABASE_URL_UNPOOLED` (direct) into the project's env vars, pulling both into
`.env.local`. Migrations automatically use the unpooled URL — nothing else to configure.

**Fallback (manual Neon) — only if the integration is unavailable or the user specifically
wants their own Neon account managed separately:**

1. Create a free project at https://neon.tech.
2. In its dashboard, copy the **direct / unpooled** connection string — *not* the pooled one
   the dashboard shows by default. The pooled string can break the build-time migration step.
3. Never have the user paste the connection string into chat. Instead:

   ```bash
   vercel env add DATABASE_URL production
   ```

   This prompts for the value — have the user paste it there, or paste it yourself if they've
   shared it with you outside of chat history you'd retain.
4. Also add the same value to local `.env.local` (`DATABASE_URL=...`) so migrations can run
   from your machine too.

## 5. Blob storage (required)

App variations (self-contained built apps, not just links) are uploaded as bundles to Vercel
Blob. **Skip this and app-variation uploads will fail with a cryptic error** — this step is not
optional.

```bash
vercel blob create-store <name> --access public --yes
```

Must be `--access public`. The app uploads bundles expecting a public store; a private store
breaks uploads in a way that's hard to diagnose after the fact. This injects
`BLOB_READ_WRITE_TOKEN` into the project and connects the store automatically.

## 6. Set the two generated secrets

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` are already injected by Steps 4–5. Set the other two
using the pristine values you captured to files in Step 2 — pipe them straight in rather than
retyping at the interactive prompt:

```bash
cat /tmp/vv-admin-token.txt | vercel env add ADMIN_TOKEN production
cat /tmp/vv-cron-secret.txt | vercel env add CRON_SECRET production
rm -f /tmp/vv-admin-token.txt /tmp/vv-cron-secret.txt
```

**Do not re-read these values from `.env.local` at this point.** By Step 6, `vercel link`
(Step 3) and/or the Neon integration (Step 4) have already rewritten the file and wrapped every
value in double quotes — e.g. `ADMIN_TOKEN="21c1...701"`. The local CLI loads `.env.local`
through `dotenvx`, which strips those quotes before using the value. If you instead re-extract
from the file here with a plain `grep | cut`, you'll capture the surrounding quotes too and push
a quoted string to Vercel as production's `ADMIN_TOKEN` — the deployed value and the value the
CLI actually uses will then silently disagree. This is a real failure mode that has bitten a
clean-room run of this exact flow: nothing errors at push time, and the mismatch only surfaces
later as a 401 (see Step 9's note and Troubleshooting).

If the files from Step 2 are gone and you must re-read from `.env.local` after Steps 3–4 have
run, strip the surrounding quotes explicitly before using the value:

```bash
grep '^ADMIN_TOKEN=' .env.local | cut -d= -f2- | sed 's/^"//;s/"$//'
```

These are shared secrets, not something to invent fresh here — the deployed instance and the
local CLI must agree on `ADMIN_TOKEN`.

## 7. First deploy

```bash
vercel --prod
```

The build runs `drizzle-kit migrate && next build` against the database injected in Step 4, then
deploys. This prints the deployed production URL — capture it, you need it next.

## 8. Set the public URL and redeploy

```bash
vercel env add PUBLIC_BASE_URL production
```

Enter the deployed URL from Step 7 (e.g. `https://<project>.vercel.app`) when prompted. Then
redeploy so the running instance picks up the change:

```bash
vercel --prod
```

This second deploy is required — share links generated before this point would otherwise point
at the wrong host.

## 9. Verify

Site is reachable:

```bash
curl -s -o /dev/null -w "%{http_code}" https://<deployed>/
```

Expect `200`.

Admin auth works — with the token, `GET /api/admin/voters` returns `200`:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <ADMIN_TOKEN>" https://<deployed>/api/admin/voters
```

And without the token, the same request returns `401` (confirms the instance is actually
gated, not wide open):

```bash
curl -s -o /dev/null -w "%{http_code}" https://<deployed>/api/admin/voters
```

If either check doesn't match, see Troubleshooting below before moving on.

**These curl checks are necessary but not sufficient.** The authorized-request check above
reuses the exact same token value you just handled in Step 6, so if that value were malformed in
the same way on both sides (the quoting trap described in Step 6), this would still return `200`
— a false green that doesn't prove the deployed `ADMIN_TOKEN` actually matches what the real
client sends. Step 10's `npm run voter -- list` is the authoritative check: it loads the token
through `dotenvx`, the same path the CLI always uses, so it can catch a mismatch these curl
checks cannot. Don't treat the instance as verified until Step 10 also passes.

## 10. Local build credentials (authoritative verification)

Add two lines to the project's `.env.local` (the CLI now reads this file directly — no shell
profile editing needed):

```
VARIATION_VOTER_URL=https://<deployed-url>
VARIATION_VOTER_ADMIN_TOKEN=<same value as ADMIN_TOKEN>
```

Confirm end-to-end — **this is the check that actually proves the instance works**, not Step 9's
curl checks. It loads `VARIATION_VOTER_ADMIN_TOKEN` through `dotenvx`, the real client path, so
it will catch a token mismatch even when Step 9 came back all green:

```bash
npm run voter -- list
```

On a brand-new instance this prints `No voters yet.` — that's success, not an error. If instead
this fails with an unauthorized/401-style error, the token stored in Vercel doesn't match what
`dotenvx` parses out of the local `.env.local` — see the quoting trap explained in Step 6 and the
matching Troubleshooting bullet below.

## 11. Handoff

**You're set up — now tell me to spin up a voter.**

## Troubleshooting

One issue per bullet — diagnose the specific cause, don't loop blindly:

- **`vercel whoami` fails / not logged in** — run `vercel login`, have the user approve in the
  browser tab it opens, then retry.
- **The Neon "Accept" tab didn't resume the CLI** — the terminal running
  `vercel integration add neon ...` will hang waiting for the accept; if it's been more than a
  minute after the click, re-run the same command — it's safe to re-run and will detect the
  already-accepted terms.
- **`npm run voter -- list` (Step 10) fails with a 401/unauthorized error, even though Step 9's
  curl checks were green** — this is the quoting trap: Step 6 pushed a value to
  `ADMIN_TOKEN`/`CRON_SECRET` that still had surrounding double quotes attached (usually because
  `.env.local` was re-read after Step 3/4 rewrote it, instead of using the files captured in
  Step 2). Step 9's curl check can't catch this because it reuses the same value on both sides.
  Fix: get the pristine value (the Step 2 files, or the quote-strip command in Step 6), then
  `vercel env rm ADMIN_TOKEN production` (and the same for `CRON_SECRET`), re-add with the clean
  value, and redeploy.
- **Verify step (Step 9) returns 401 when it shouldn't** — the token used doesn't match the
  server's `ADMIN_TOKEN`. Re-check the value against what you set in Step 6 (`vercel env ls` can
  confirm the production value is set, though it won't print secrets). Note this curl check
  alone cannot detect the quoting trap above — a green result here doesn't rule it out.
- **App-variation upload fails** — almost always the Blob store from Step 5: either it wasn't
  created, or it wasn't created with `--access public`. Run `vercel blob list-stores` to check
  it exists, and re-create it with `--access public` if needed.
- **Share link shows `localhost`** — `PUBLIC_BASE_URL` is unset, wrong, or was set after the
  first deploy without a follow-up redeploy. Fix the value (Step 8) and run `vercel --prod`
  again.
- **Second `vercel --prod` (Step 8's redeploy) ends with `Error: fetch failed`** — this usually
  means the CLI just lost its log stream partway through, not that the deploy failed; the
  deployment itself typically still submitted and completed. Confirm with `vercel ls` or
  `vercel inspect <deployed-url>` before assuming it failed and retrying.
- **Waiting to confirm a deploy has finished (agent-driven runs)** — don't scrape the `vercel ls`
  table for `Ready`/`Building`; its formatting (colors, column widths) isn't reliable to parse
  programmatically. Use `vercel inspect <deployed-url>` instead and read its reported status.
- **`npx create-variation-voter` not found** — registry hiccup or npm cache issue; retry once,
  and if it still fails, fall back to cloning the source repo directly and running its setup
  script instead of the npm scaffolder.
- **Local variation-building fails later with an esbuild or other binary error** — Step 2's
  `npm install` can block some postinstall scripts (esbuild, fsevents, unrs-resolver) via
  `allow-scripts`; this doesn't affect the server-side deploy, but esbuild is used locally to
  build variations afterward. If that build step fails on a missing/broken esbuild binary, allow
  its postinstall to run (e.g. via `npm approve-scripts` / this project's allow-scripts
  mechanism) and reinstall.

## Notes

- The server's `ADMIN_TOKEN` (Vercel env var) and the CLI's `VARIATION_VOTER_ADMIN_TOKEN`
  (`.env.local`) must always stay equal — they're the same secret in two places.
- `PUBLIC_BASE_URL` is read at request time to build each voter's share link, so changing it
  always requires a redeploy to take effect.
- App-variation bundles are served same-origin for now — fine for trusted, agent-built content;
  hardening is tracked separately (KEV-79). Do **not** run the repo's full `npm test` against a
  live/deployed database — the suite truncates the shared dev DB and will destroy it (KEV-80).
