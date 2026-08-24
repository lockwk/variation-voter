# Variation Voter

Spin up a shareable voting page for design/build variations in seconds —
external people vote 👍/👎, leave a short comment, and results aggregate
server-side. No login for voters; the author authenticates with one shared
admin token.

## How it works — workshop vs gallery

Your local clone is the **workshop**: the build template, the `pipeline/`
scripts, and the `node_modules` that build variations all live here. A
deployed Vercel instance is the **gallery**: it serves the public `/v/<id>`
voter links that other people open and vote on. Publishing builds variations
locally, in the workshop, then uploads the built bundles to the deployed
gallery over the admin API — nothing gets built on Vercel itself.

## Get started

The fastest path from nothing to a live, shareable voter is a guided install
inside Claude Code:

1. In Claude Code, run the **`install-variation-voter`** skill. It runs
   `npx create-variation-voter` to scaffold the app, deploys it to Vercel,
   and writes the local CLI config that points at that deployment.
2. Then use the **`build-variation-voter`** skill to spin up a voter — say
   something like *"build 5 variations of X"* and it dispatches parallel
   build subagents and publishes a real `/v/<id>` link.

That's the whole chain: `npx create-variation-voter` → `install-variation-voter` →
`build-variation-voter`. Your only manual action anywhere in this chain is a single
browser "Accept" click the first time Vercel provisions a free database for you — the
agent drives every other step, including creating the required Blob storage for app
variations.

Prefer to do it by hand instead? Keep reading.

```bash
npx create-variation-voter my-voter
cd my-voter
npm install
vercel link
vercel integration add neon --plan free_v3 -m auth=false   # accept terms in browser once
vercel blob create-store my-voter-bundles --access public --yes
vercel env add ADMIN_TOKEN production      # value from .env.local
vercel env add CRON_SECRET production      # value from .env.local
vercel --prod                              # first deploy; runs migrations
```

`create-variation-voter` downloads the app into `my-voter/` and auto-generates
`ADMIN_TOKEN` and `CRON_SECRET` into `my-voter/.env.local` — it doesn't ask you
for anything. `vercel link` connects the project; the Neon integration
provisions a free database and injects `DATABASE_URL` automatically (accepting
marketplace terms is a one-time click, not something to repeat per project);
the Blob store is **required** for app-variation uploads to work and must be
created with `--access public`. Then set `PUBLIC_BASE_URL` to the printed
deploy URL and redeploy so share links resolve correctly:

```bash
vercel env add PUBLIC_BASE_URL production   # paste the URL vercel --prod just printed
vercel --prod
```

This stands up both the local **workshop** and the deployed **gallery** in one
pass. See [`docs/deploy.md`](docs/deploy.md) for the full reference, including
the manual (non-integration) database path and teardown steps.

If you've already cloned the repo yourself, set up `.env.local` manually
instead:

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ADMIN_TOKEN, CRON_SECRET
npm run db:migrate
npm run dev
```

### Manual deploy (reference)

No agent available, or you'd rather drive Vercel yourself? This is the same
end state the `install-variation-voter` skill automates.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/lockwk/variation-voter&env=DATABASE_URL,ADMIN_TOKEN,CRON_SECRET,PUBLIC_BASE_URL&envDescription=Neon+connection+string+and+a+shared+admin+token&project-name=variation-voter&repository-name=variation-voter)

1. Click the button above (or fork the repo and import it into Vercel yourself).
2. Create a free [Neon](https://neon.tech) project and copy its **direct/unpooled**
   connection string (not the pooled one Neon's dashboard shows first — that one can
   break build-time migrations) into `DATABASE_URL`.
3. Set `ADMIN_TOKEN` to any long random string — this is the only credential that authorizes voter creation.
4. Set `CRON_SECRET` to another long random string — Vercel Cron sends it automatically on scheduled cleanup runs.
5. Set `PUBLIC_BASE_URL` to your deployed URL (e.g. `https://your-app.vercel.app`), used to build share links.
6. Create a **public** Blob store — required for app-variation uploads —
   `vercel blob create-store <name> --access public --yes`, which injects `BLOB_READ_WRITE_TOKEN`.
7. Deploy. Then run migrations once against your database: `npx drizzle-kit migrate` (with `DATABASE_URL` set locally to your Neon connection string).

Each self-hosted instance runs against its own Neon database — nobody else's usage ever touches your backend or your bill.

For the full env-var reference (per-environment `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`,
`CRON_SECRET`, `ADMIN_TOKEN`, `PUBLIC_BASE_URL`), plus how to set up a dedicated test
database, see [`docs/deploy.md`](docs/deploy.md).

## Using it

```bash
export VARIATION_VOTER_URL=https://your-app.vercel.app
export VARIATION_VOTER_ADMIN_TOKEN=<your ADMIN_TOKEN>

npm run voter -- create "Nav refresh"
npm run voter -- add <voterId> --title "Live default" --url https://preview.example/a
npm run voter -- add <voterId> --title "Option B" --url https://preview.example/b
npm run voter -- link <voterId>
```

Send the printed link to whoever needs to weigh in. `npm run voter -- close <voterId>` makes it read-only; `npm run voter -- delete <voterId>` removes it immediately. Otherwise it expires automatically after 7 days.

The two commands build the link from different sources. `voter -- link` prints
it from `VARIATION_VOTER_URL` (the CLI setting above — where bundles get
uploaded), while `voter -- create` returns a share URL the server builds from
the deployed instance's `PUBLIC_BASE_URL`. If `PUBLIC_BASE_URL` is unset, that
`create` share URL falls back to `http://localhost:3000/v/<id>`, which only
works on the author's own machine. Set **both** `VARIATION_VOTER_URL` and
`PUBLIC_BASE_URL` to the **same** deployed host so either command yields a
working, shareable link.

Variations can also be self-contained apps instead of a URL/image/embed — build a
Vite (or similar) bundle to a `dist/` directory, then upload it directly:

```bash
npm run voter -- add-app <voterId> --title "Option C" --dir path/to/dist
```

This zips `dist/` and uploads it; the voter page serves it same-origin in an iframe.

## Building a voter from an idea (pipeline/skill)

To go from a freeform idea straight to a voter with N agent-built variations, use
the `build-variation-voter` skill (`.claude/skills/build-variation-voter/SKILL.md`)
in Claude Code. It expands your idea into distinct briefs, dispatches parallel
build subagents, and publishes the result — you get back a real `/v/<id>` link.

Under the hood the skill drives two deterministic helper scripts in `pipeline/`,
which you can also run by hand:

```bash
# Copy the build template into a fresh per-run, per-slug scaffold
npm run variation:scaffold -- <slug> --run <runId>

# After each scaffold is built out (npm run build → dist/), publish them all
npm run variation:publish -- path/to/manifest.json
```

The manifest passed to `variation:publish` looks like:

```json
{
  "voter": { "title": "Settings page redesign", "description": "optional" },
  "variations": [
    { "title": "Sidebar nav", "description": "optional", "distDir": ".variations/<run>/sidebar-nav/dist" }
  ]
}
```

At least 2 variations need a valid `dist/index.html` or the script aborts without
creating a voter.

## Using the Agentation toolbar

The Agentation annotation toolbar only appears in local development (`npm run dev`) — it's gated on `process.env.NODE_ENV === "development"` and is excluded from production builds. Use it in the browser to click and annotate elements on the page and leave visual feedback notes.

To hand annotations back to a coding agent, set up the Agentation MCP server locally (optional, per-developer): run `npx add-mcp` (works with many agents) or `agentation-mcp init` (Claude Code). It defaults to port 4747 and exposes tools like `agentation_get_all_pending`. Restart your coding agent after MCP setup so it picks up annotations.

## Known limitations

App-variation bundles are served **same-origin** and framed with
`sandbox="allow-scripts allow-same-origin"`. That's not a strong security
boundary — it's acceptable only for **trusted, agent-built content**, which is
exactly this tool's model. Stronger isolation via a dedicated bundle origin is
tracked as a future improvement (KEV-79).
