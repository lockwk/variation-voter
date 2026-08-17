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

> #### Per-environment Blob store (KEV-86 / Chunk A)
>
> Placeholder — provisioning specifics (creating a second Vercel Blob store
> for non-prod, wiring the environment-scoped `BLOB_READ_WRITE_TOKEN` in the
> Vercel dashboard so Preview/Development deploys use the non-prod store while
> Production uses its own) land in a follow-up chunk. The storage driver
> already supports this with **no app code changes** — it's purely a Vercel
> config + token-provisioning step. This section will be filled in then.

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
