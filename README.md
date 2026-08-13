# Variation Voter

Spin up a shareable voting page for design/build variations in seconds —
external people vote 👍/👎, leave a short comment, and results aggregate
server-side. No login for voters; the author authenticates with one shared
admin token.

## Quickstart

```bash
git clone https://github.com/<your-username>/variation-voter.git
cd variation-voter
npm install
node scripts/create.mjs   # guided .env.local setup (Neon URL, base URL)
npm run db:migrate
npm run dev
```

That gets you a working local instance. For provisioning Neon, deploying to
Vercel, creating your first voter, and setting up the optional agent skill,
follow the full guide: **[docs/INSTALL.md](docs/INSTALL.md)**.

## Deploy your own instance

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/lockwk/variation-voter&env=DATABASE_URL,ADMIN_TOKEN,CRON_SECRET,PUBLIC_BASE_URL&envDescription=Neon+connection+string+and+a+shared+admin+token&project-name=variation-voter&repository-name=variation-voter)

If you forked this repo, edit the button's `repository-url` above to point at
`https://github.com/<your-username>/variation-voter` before using it — the
button always deploys the exact repo it points at, not your fork.

1. Click the button above (or fork the repo and import it into Vercel yourself).
2. Create a free [Neon](https://neon.tech) project and copy its connection string into `DATABASE_URL`.
3. Set `ADMIN_TOKEN` to any long random string — this is the only credential that authorizes voter creation.
4. Set `CRON_SECRET` to another long random string — Vercel Cron sends it automatically on scheduled cleanup runs.
5. Set `PUBLIC_BASE_URL` to your deployed URL (e.g. `https://your-app.vercel.app`), used to build share links.
6. Deploy. Then run migrations once against your database: `npx drizzle-kit migrate` (with `DATABASE_URL` set locally to your Neon connection string).

Each self-hosted instance runs against its own Neon database — nobody else's usage ever touches your backend or your bill.

### Provisioning checklist

Before creating your first voter, confirm all of this is done — roughly in
this order:

- [ ] Neon project created, pooled connection string copied.
- [ ] `DATABASE_URL` set (locally in `.env.local`, and/or in Vercel env vars).
- [ ] `ADMIN_TOKEN` set to a long random string.
- [ ] `CRON_SECRET` set to a different long random string.
- [ ] `PUBLIC_BASE_URL` set to your **real** deployed URL, not `localhost` —
      share links are built from this, so getting it wrong breaks every link
      you send out.
- [ ] Migrations run **after** `DATABASE_URL` is set and **before** you create
      a voter: `npm run db:migrate` locally, or
      `DATABASE_URL="..." npx drizzle-kit migrate` against production.
- [ ] Daily cleanup cron confirmed in `vercel.json` (and visible under
      Vercel → Project → Settings → Cron Jobs once deployed).

Full walkthrough with expected output at each step:
[docs/INSTALL.md](docs/INSTALL.md).

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

### Content reachability

Every variation's content lives outside this tool — `url` and `image`
variations point at a `src` you host elsewhere, and the app never re-authors
it. A few rules follow from that:

- **`url` and `image` `src` values must be publicly reachable** by whoever you
  send the voting link to. `http://localhost:...` or anything behind a VPN or
  auth wall will render a blank iframe or broken image for external voters.
- **`embed` is static HTML/CSS only.** It's rendered inline after
  sanitization — `<script>` tags and `on*` event handlers are stripped, so
  interactive behavior won't run. If a variation needs real interactivity,
  deploy it somewhere and use `url` instead.
- Sites that send `X-Frame-Options: DENY` or a restrictive `frame-ancestors`
  CSP won't load as a `url` iframe either — fall back to an `image` screenshot
  for those.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ADMIN_TOKEN, CRON_SECRET
npm run db:migrate
npm run dev
```

After cloning, run `node scripts/create.mjs` instead of the manual `.env.local` setup for a guided walkthrough.

## Agent setup (optional)

Variation Voter ships a config-driven Claude Code skill
(`plugin/skills/variation-voter/`) so an agent — in this repo or any other —
can respond to "set up a variation voter with these concepts" by creating a
voter against **your** instance and handing back the share link.

```bash
# 1. install the skill (symlink keeps it in sync with the repo copy)
ln -s "$(pwd)/plugin/skills/variation-voter" ~/.claude/skills/variation-voter

# 2. create your local, gitignored instance config
mkdir -p ~/.variation-voter
cp .variation-voter.config.example ~/.variation-voter/config
chmod 600 ~/.variation-voter/config
# then edit ~/.variation-voter/config and fill in
# VARIATION_VOTER_URL and VARIATION_VOTER_ADMIN_TOKEN
```

The skill resolves the instance URL and token from env vars first, then that
config file, and refuses to guess — if neither is set, it stops and tells you
exactly what to configure. Full details: `docs/INSTALL.md` §8 and
`plugin/skills/variation-voter/reference.md`.

## Using the Agentation toolbar

The Agentation annotation toolbar only appears in local development (`npm run dev`) — it's gated on `process.env.NODE_ENV === "development"` and is excluded from production builds. Use it in the browser to click and annotate elements on the page and leave visual feedback notes.

To hand annotations back to a coding agent, set up the Agentation MCP server locally (optional, per-developer): run `npx add-mcp` (works with many agents) or `agentation-mcp init` (Claude Code). It defaults to port 4747 and exposes tools like `agentation_get_all_pending`. Restart your coding agent after MCP setup so it picks up annotations.
