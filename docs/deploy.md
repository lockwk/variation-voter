# Deploy / self-host guide

Variation Voter is designed to run as three separate environments — production,
dev/preview, and test — each backed by its **own** Postgres database. This doc
lists every environment variable the app needs, which environments need it, and
how to set up the one-time local test-database step.

For the quick "click Deploy, fill in four env vars" version, see the
[README's Deploy section](../README.md#deploy-your-own-instance). This doc goes
deeper: it's the reference for every env var across every environment.

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

After provisioning a database, run migrations against it once:

```bash
npx drizzle-kit migrate
```

(In this repo's own Vercel deployment, migrations also auto-run at build time —
see `vercel.json` / build command — but that's a deployment-specific
convenience, not something self-hosters need to replicate.)

### `BLOB_READ_WRITE_TOKEN`

Vercel Blob token, read by `lib/storage/index.ts`. Used to store "app"
variation bundles (self-contained built React apps uploaded via
`npm run voter -- add-app`).

- When **set**, bundles are stored in Vercel Blob (`VercelBlobBundleStorage`).
- When **unset**, bundles fall back to the local filesystem under `.bundles/`
  (`LocalFsBundleStorage`) — this is what local dev and the test suite use by
  default, so you don't need a Blob store just to run `npm run dev` or `npm test`.

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
in production, `http://localhost:3000` in local dev). Needed in every
environment that serves the app to real users or a browser — not needed for
the test suite, which never renders a real shareable link.

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
bundles don't get automatically purged. See the deferred Chunk B work for a
documented manual/scheduled non-prod purge path.
