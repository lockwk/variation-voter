# Variation Voter

Spin up a shareable voting page for design/build variations in seconds —
external people vote 👍/👎, leave a short comment, and results aggregate
server-side. No login for voters; the author authenticates with one shared
admin token.

## Deploy your own instance

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<owner>/<repo>&env=DATABASE_URL,ADMIN_TOKEN,CRON_SECRET,PUBLIC_BASE_URL&envDescription=Neon+connection+string+and+a+shared+admin+token&project-name=variation-voter&repository-name=variation-voter)

Replace `<owner>/<repo>` above with this repository's actual GitHub path
once it's pushed.

1. Click the button above (or fork the repo and import it into Vercel yourself).
2. Create a free [Neon](https://neon.tech) project and copy its connection string into `DATABASE_URL`.
3. Set `ADMIN_TOKEN` to any long random string — this is the only credential that authorizes voter creation.
4. Set `CRON_SECRET` to another long random string — Vercel Cron sends it automatically on scheduled cleanup runs.
5. Set `PUBLIC_BASE_URL` to your deployed URL (e.g. `https://your-app.vercel.app`), used to build share links.
6. Deploy. Then run migrations once against your database: `npx drizzle-kit migrate` (with `DATABASE_URL` set locally to your Neon connection string).

Each self-hosted instance runs against its own Neon database — nobody else's usage ever touches your backend or your bill.

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

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ADMIN_TOKEN, CRON_SECRET
npm run db:migrate
npm run dev
```

After cloning, run `node scripts/create.mjs` instead of the manual `.env.local` setup for a guided walkthrough.

## Using the Agentation toolbar

The Agentation annotation toolbar only appears in local development (`npm run dev`) — it's gated on `process.env.NODE_ENV === "development"` and is excluded from production builds. Use it in the browser to click and annotate elements on the page and leave visual feedback notes.

To hand annotations back to a coding agent, set up the Agentation MCP server locally (optional, per-developer): run `npx add-mcp` (works with many agents) or `agentation-mcp init` (Claude Code). It defaults to port 4747 and exposes tools like `agentation_get_all_pending`. Restart your coding agent after MCP setup so it picks up annotations.
