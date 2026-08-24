# create-variation-voter

Scaffold a self-hosted [Variation Voter](https://github.com/lockwk/variation-voter) instance.

```bash
npx create-variation-voter my-voter
```

This downloads the Variation Voter app into `./my-voter` (no `git clone`
needed), generates an `ADMIN_TOKEN` and `CRON_SECRET`, and writes them to
`my-voter/.env.local`. It does **not** ask you for a database connection
string or any other value — the rest of setup (database, storage, deploying
to Vercel) is driven from there.

After it finishes, the recommended path is to run the **`install-variation-voter`**
skill in Claude Code (see the main [README](../README.md#get-started)) — it drives
`vercel link`, provisions a free database via Vercel's Neon integration (one
browser "Accept" click, first time only), sets up required Blob storage for
app variations, and deploys to Vercel for you.

Prefer to drive it by hand instead?

```bash
cd my-voter
npm install
vercel link
vercel integration add neon --plan free_v3 -m auth=false   # accept terms in browser once
vercel blob create-store my-voter-bundles --access public --yes
vercel env add ADMIN_TOKEN production      # value from .env.local
vercel env add CRON_SECRET production      # value from .env.local
vercel --prod                              # first deploy; runs migrations
```

Then set `PUBLIC_BASE_URL` to the printed deploy URL (`vercel env add PUBLIC_BASE_URL production`)
and redeploy (`vercel --prod`) so share links point at the right host. See
[`docs/deploy.md`](../docs/deploy.md) for the full reference, including the manual
(non-integration) database path.

This is just the setup wrapper — it does not itself contain the app.
Variation Voter's application code lives in the private/main repository;
this package only fetches a copy of it and gets your local `.env.local`
ready.
