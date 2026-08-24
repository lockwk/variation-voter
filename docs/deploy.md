# Deploy / self-host guide

Variation Voter is designed to run as three separate environments — production,
dev/preview, and test — each backed by its **own** Postgres database. This doc
lists every environment variable the app needs, which environments need it, and
how to set up the one-time local test-database step.

For the guided, agent-driven path, see the README's
[Get started](../README.md#get-started) section — running the
`install-variation-voter` skill is the recommended way to stand up an
instance. For the manual "click Deploy, fill in four env vars" version, see
[Manual deploy (reference)](../README.md#manual-deploy-reference). This doc
goes deeper: it's the reference for every env var across every environment.

### Workshop vs gallery

Your local clone is the **workshop** (build template, `pipeline/` scripts,
`node_modules` used to build variations); a deployed Vercel instance is the
**gallery** (serves the public `/v/<id>` voter links). Publishing builds
locally and uploads the built bundles to the deployed gallery over the admin
API. See the README's [How it works](../README.md#how-it-works--workshop-vs-gallery)
section for the full framing.

## Environments at a glance

| Environment | Where it runs | Database | Blob store | Purpose |
| --- | --- | --- | --- | --- |
| **production** | Vercel production deployment | dedicated prod DB | dedicated prod Blob store | the real, public instance |
| **dev / preview** | `npm run dev` locally, and Vercel preview deployments | one shared dev/preview DB | dedicated non-prod Blob store (see Chunk A note below) | day-to-day development and PR previews |
| **test** | `npm test` (vitest) | dedicated, disposable test DB | none (local filesystem, see below) | automated test suite only |

Each environment reads its config from a different env file:

- Production: environment variables set in the Vercel project (Production scope).
- Dev/preview: `.env.local` (local dev) and Vercel Preview-scoped env vars (preview deploys).
- Test: `.env.test.local`, loaded by `vitest.config.ts` via `loadEnv("test", ...)`.

**Never point more than one environment's database or Blob store at the same
underlying resource.** The prod/dev/test split exists specifically so that
tests, local development, and preview deploys can never touch — let alone
wipe — production data.

## Environment variables

### `DATABASE_URL`

Postgres connection string, read by `db/client.ts`. Needed in **every**
environment, and must be a **separate database per environment**:

- **Production** — a dedicated production database (e.g. its own Neon project/branch).
- **Dev/preview** — a separate, shared dev/preview database. Fine for it to
  accumulate manual test data; workspace tooling may wipe it periodically
  (see `scripts/wipe-dev-db.ts`).
- **Test** — a separate, disposable database reserved only for `npm test`.
  `tests/setup.ts` truncates `voters`/`variations`/`votes`/`comments` after
  *every single test*, so this must never be a database you care about. See
  [Setting up the test database](#setting-up-the-test-database) below.

**Recommended provisioning path: Vercel's Neon integration.**

```bash
vercel integration add neon --plan free_v3 -m auth=false
```

The first time this runs in a given Vercel account, it opens a browser tab to accept Neon's
marketplace terms — a one-time manual click, then the CLI resumes and finishes on its own. It
provisions a free Neon database, connects it to the project, and injects **both**
`DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) into the project's env vars,
pulling both into `.env.local`. Migrations are configured to use the unpooled URL automatically
— nothing else to wire up.

**Fallback: manual Neon.** Create a free project at https://neon.tech and copy its connection
string, then set it with `vercel env add DATABASE_URL production` (paste when prompted — never
commit it or paste it into a chat transcript) and again in local `.env.local` for running
migrations from your machine.

**Pooled vs. unpooled matters.** Neon's dashboard shows the **pooled** connection string first
by default — don't use that one for `DATABASE_URL` if you're setting it manually. The
build-time migration step (`drizzle-kit migrate`) needs a **direct/unpooled** connection; pooled
connections can silently break migrations. This is exactly why the integration path above
injects both variables and points migrations at the unpooled one automatically — it's the
easiest way to avoid this footgun.

After provisioning a database, run migrations against it once:

```bash
npx drizzle-kit migrate
```

(In this repo's own Vercel deployment, migrations also auto-run at build time —
see `vercel.json` / build command — but that's a deployment-specific
convenience, not something self-hosters need to replicate.)

**Note on `vercel env pull`:** it rewrites `.env.local` with every value wrapped in double
quotes (e.g. `DATABASE_URL="postgres://..."`). That's valid for tools that parse `.env` files
properly, but can trip up anything that naively `source`s the file or splits on `=` without
stripping quotes — check any custom tooling that reads `.env.local` directly if values start
showing up with literal quote characters included.

### `BLOB_READ_WRITE_TOKEN`

Vercel Blob token, read by `lib/storage/index.ts`. Used to store "app"
variation bundles (self-contained built React apps uploaded via
`npm run voter -- add-app`).

- When **set**, bundles are stored in Vercel Blob (`VercelBlobBundleStorage`).
- When **unset**, bundles fall back to the local filesystem under `.bundles/`
  (`LocalFsBundleStorage`) — this is what local dev and the test suite use by
  default, so you don't need a Blob store just to run `npm run dev` or `npm test`.

**Required for production if you intend to publish app variations.** A production deploy with
no Blob store will happily serve link/image/embed variations, but `add-app` uploads fail with a
cryptic error the moment someone tries to publish a self-contained app. Create the store
explicitly:

```bash
vercel blob create-store <name> --access public --yes
```

`--access public` is **required**, not a default to leave alone — the app uploads bundles
expecting a publicly-readable store, and a private store breaks uploads in a way that's hard to
root-cause after the fact. This injects `BLOB_READ_WRITE_TOKEN` into the project and connects
the store automatically; no separate `vercel env add` step is needed for it.

Recommended: one token per environment (production and dev/preview each get
their own Blob store), the same isolation principle as `DATABASE_URL`.

#### Per-environment Blob store (KEV-86)

Give non-prod its **own** Blob store so preview/dev bundle churn is isolated from
production and can be wiped wholesale without risking prod objects. The app needs
**no code change** — the driver in `lib/storage/index.ts` just uses whatever
`BLOB_READ_WRITE_TOKEN` it's given, and Vercel scopes that variable per environment:

- **Production** deploys get the token for the **prod** store.
- **Preview + Development** get the token for the **non-prod** store.

Because Vercel env vars are per-environment, the single `BLOB_READ_WRITE_TOKEN` name
holds a *different value in each scope*, so each environment reads/writes only its own store.

**Important — narrow the existing store first.** A store's project connection defaults to
**All Environments**, so the original store already sets `BLOB_READ_WRITE_TOKEN` for Preview
and Development. Before connecting a second store to those scopes, change the existing (prod)
store's connection to **Production only**, or the tokens will collide.

##### Dashboard steps

The store's connection settings live on the **store's own page**, which you reach from the
**team-level** Storage (click your team name at the top-left, then the **Storage** tab) — *not*
the project-level Storage tab (that one only offers "Connect").

1. **Narrow the existing (prod) store to Production only.**
   Team **Storage** → click your existing Blob store (e.g. `variation-voter-bundles`) to open
   its page → **Projects** tab → click the **⋯** next to your project → **Update Project
   Connection**. In the **Environments** dropdown, check **Production** only (uncheck Preview
   and Development), keep **"Add a read-write token env var to this connection"** checked, and
   **Save Changes**. (The **Sensitive** toggle turns on automatically once Development is
   unchecked — that's expected and fine; it only hides the value in the dashboard, the app
   still receives it.)
2. **Create the non-prod store.**
   Team **Storage** → **Create Database** → **Blob** → name it (e.g. `variation-voter-nonprod`)
   → **Access: Public** (match the prod store, since bundle URLs are served publicly) → **Create**.
   Region can't be changed later; the default (`iad1`) is fine.
3. **Connect the non-prod store to Preview + Development only.**
   In the **Connect a Project** dialog, pick your project. In **Environments**, choose
   **Preview + Development** (leave Production unchecked). Leave the **Custom Environment
   Variable Prefix** as **`BLOB`** — this is what produces the `BLOB_READ_WRITE_TOKEN` name the
   app reads; changing it would break storage. Keep **"Add a read-write token env var to this
   connection"** checked (Sensitive stays off here because Development can't be sensitive), then
   **Connect Project**.
4. **Pick up the new tokens.** Redeploy (or trigger a new preview) so deployments read the
   scoped token. For local dev, run `vercel env pull` to refresh `.env.local`.

You can confirm the split under **Project → Settings → Environment Variables**: filter by
environment and check `BLOB_READ_WRITE_TOKEN` — Production shows one value (prod store) and
Preview/Development show another (non-prod store).

##### CLI steps

```bash
# 0. Link the project locally if you haven't:
vercel link

# 1. Narrow the existing prod store to Production only.
#    (Do this in the dashboard — Store → Projects → ⋯ → Update Project Connection →
#     Production only. The CLI creates/connects stores but connection re-scoping of an
#     existing store is a dashboard action.)

# 2. Create the non-prod store and connect it to preview + development only.
#    --access must match how bundles are served (public for served bundles).
#    --environment is repeatable; omit production so prod keeps its own store.
vercel blob create-store variation-voter-nonprod --access public \
  --environment preview --environment development --yes

# 3. Verify the scoped token exists for the right environments:
vercel env ls

# 4. Refresh local env if you use the non-prod store locally:
vercel env pull
```

> If `create-store --environment` isn't available in your CLI version, create the store
> without `--yes`/`--environment`, then connect it from the dashboard (step 3 above), or
> set the variable directly: `vercel env add BLOB_READ_WRITE_TOKEN preview` and again for
> `development` (development must be a separate command — Vercel rejects combining it with
> preview/production), pasting the non-prod store's read-write token from the store's
> **.env.local** / tokens view.

**Verify isolation:** trigger a preview deploy (or `vercel env pull` + local dev), publish an
app-variation (`npm run voter -- add-app ...`), then in team **Storage** open the non-prod
store's **Browser** tab and confirm the new bundle object appears there — and that the prod
store's object count is unchanged.

### `CRON_SECRET`

Bearer token that authorizes the daily cleanup cron
(`app/api/cron/cleanup/route.ts`), which purges expired/archived voters (and
their app-variation bundles). Vercel Cron sends this automatically on
scheduled runs in production. Needed in production; only needed elsewhere if
you want to trigger the cleanup endpoint manually (e.g. a non-prod purge
script) against that environment.

### `ADMIN_TOKEN`

Shared bearer token that authorizes voter/variation authoring endpoints (the
only credential gating who can create content — voting itself is anonymous
and unauthenticated). Needed wherever you intend to author voters: production,
and dev/preview if you're testing the authoring flow there.

### `PUBLIC_BASE_URL`

Base URL used to build shareable voter links (e.g. `https://your-app.vercel.app`
in production, `http://localhost:3000` in local dev), read at request time by
`shareUrlFor()` in `app/api/admin/voters/route.ts`. Needed in every
environment that serves the app to real users or a browser — not needed for
the test suite, which never renders a real shareable link.

**A voter's printed link is only externally shareable when the deployed
instance's `PUBLIC_BASE_URL` is set to its deployed URL.** If it's unset,
`shareUrlFor()` falls back to `http://localhost:3000`, so the link only works
on the author's own machine — anyone else opening it gets nothing. This is a
separate setting from the CLI's `VARIATION_VOTER_URL` (read by `cli/config.ts`,
used to decide where bundles get uploaded) — but for a working link, both
must point at the **same** deployed host.

## Setting up the test database

1. Create a **separate** Postgres database reserved only for the test suite
   (e.g. a dedicated Neon project or branch — never reuse the prod or
   dev/preview database).
2. Run migrations against it once: `DATABASE_URL=<test-db-url> npx drizzle-kit migrate`.
3. Copy the template env file and fill in the test database's connection string:

   ```bash
   cp .env.test.local.example .env.test.local
   ```

   Edit `.env.test.local` and set `DATABASE_URL` to the test database's
   connection string. This file is gitignored — it's never committed, and each
   contributor/workspace sets up their own.
4. Run `npm test`. `vitest.config.ts` loads `.env.test.local` via
   `loadEnv("test", ...)`, so the suite runs entirely against the test
   database and never touches dev or production data.

`BLOB_READ_WRITE_TOKEN` is intentionally left unset for the test environment —
tests exercise the local-filesystem storage driver (`.bundles/`) instead of a
real Blob store, so no Blob provisioning is needed just to run `npm test`.

## Non-prod cleanup

The cleanup cron (`GET /api/cron/cleanup`) only runs automatically in
production (Vercel Cron is a production-only feature), so dev/preview data and
bundles don't get automatically purged. Two mechanisms are available for
non-prod:

### `npm run purge:nonprod`

Runs the same cleanup the cron runs: it triggers `GET /api/cron/cleanup`,
which purges expired voters plus archived voters past the 24h grace period,
along with their app-variation bundles. This only removes voters that are
actually expired/archived — it is not a wholesale wipe.

It targets a configurable base URL, resolved in this order:
`VARIATION_VOTER_URL` → `PUBLIC_BASE_URL` → `http://localhost:3000`, and
authenticates with `CRON_SECRET` (read from `.env.local` or the environment).

Usage examples:

```bash
# Against local dev — run the dev server in one terminal:
npm run dev
# ...then in another terminal (uses localhost:3000 + .env.local's CRON_SECRET):
npm run purge:nonprod

# Against a preview deployment:
VARIATION_VOTER_URL=https://<preview>.vercel.app CRON_SECRET=<that env's secret> npm run purge:nonprod
```

### Wholesale escape hatch — `vercel blob empty-store`

For clearing **all** non-prod bundle objects at once (e.g. resetting the
non-prod store), use the Vercel CLI's `empty-store` command (verified against
Vercel CLI 56.3.2 and the current docs, updated 2026-07-15):

```bash
# Confirm the non-prod store's id and read-write token:
vercel blob list-stores

# Empty the non-prod store (permanent, irreversible; --yes skips the prompt).
# --rw-token is what scopes the wipe to a specific store, so pass the
# non-prod store's read-write token here:
vercel blob empty-store --rw-token <nonprod-rw-token> --yes
```

`empty-store` deletes every blob in the targeted store; this is **permanent
and cannot be undone**. `--yes` (or `-y`) skips the confirmation prompt, which
is useful in CI/agent contexts. Note that `empty-store` does **not** take a
store-id argument — it empties whichever store the resolved Blob credentials
select (`.vercel` env files, then `BLOB_READ_WRITE_TOKEN`/OIDC env vars, then
the linked project's connected store). Always scope it explicitly by passing
the non-prod store's read-write token via `--rw-token`; do not rely on the
ambient/linked credentials, which may point at the production store.

**[KEV-86](#per-environment-blob-store-kev-86) gave non-prod its own isolated
Blob store (`variation-voter-nonprod`), separate from production. That
isolation is only protective when the command is actually pointed at the
non-prod store via its `--rw-token` — the separate store existing does not by
itself prevent an `empty-store` run scoped (by ambient credentials) at
production.**

Note that `empty-store` clears bundles only, not DB rows — the `voters`/
`variations` rows are cleared by `npm run purge:nonprod` (or would dangle
otherwise pointing at deleted bundles), so for a full non-prod reset you'd
use both.

## Tearing down an instance

If you're decommissioning a self-hosted instance entirely (not just resetting non-prod data —
see [Non-prod cleanup](#non-prod-cleanup) above for that), **order matters**: empty and delete
the Blob store *before* removing the Vercel project, not after.

```bash
# 1. Empty the store (permanent, irreversible):
vercel blob empty-store --rw-token <store-rw-token> --yes

# 2. Delete the (now-empty) store:
vercel blob delete-store <store-id> --yes

# 3. Only now remove the Vercel project:
vercel project rm <project-name>
```

**Why this order and not the reverse:** deleting the Vercel project first strands the Blob
store — its read-write token was issued through that project's connection, so once the project
is gone you have no working credential to authenticate `empty-store` against it, and
`delete-store` separately refuses to delete a non-empty store. Reversing steps 1–2 into after
step 3 leaves you with a non-empty, orphaned store you can no longer clear or remove through the
CLI. Always empty, then delete, then remove the project.

## Known limitations

App-variation bundles are served **same-origin** and framed with
`sandbox="allow-scripts allow-same-origin"` (`app/v/[voterId]/stage.tsx`).
That's not a strong security boundary — it's acceptable only for **trusted,
agent-built content**, which is exactly this tool's model. Stronger isolation
via a dedicated bundle origin is tracked as a future improvement (KEV-79). See
also the README's [Known limitations](../README.md#known-limitations) section.
