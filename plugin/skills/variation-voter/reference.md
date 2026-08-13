# Variation Voter — reference

Full runbook for the `variation-voter` skill. Read this before making your
first API call in a session.

## Config resolution & file format

Resolution order (stop at the first that succeeds — see SKILL.md):

1. Shell env vars `VARIATION_VOTER_URL` and `VARIATION_VOTER_ADMIN_TOKEN`.
2. `~/.variation-voter/config`, dotenv-style, loaded with:
   ```bash
   set -a; . ~/.variation-voter/config; set +a
   ```
   File format (matches `.variation-voter.config.example` in the repo):
   ```
   VARIATION_VOTER_URL=https://your-instance.vercel.app
   VARIATION_VOTER_ADMIN_TOKEN=<token from your Vercel ADMIN_TOKEN env>
   ```
   No trailing slash on the URL. `chmod 600` the file since it holds a
   credential.
3. If neither resolves both values, stop and print the exact message in
   SKILL.md's "Before you start" section. Do not prompt the user to paste
   the token into chat, and never print the resolved token value anywhere.

## CLI mode (inside the Variation Voter app repo)

Requires `VARIATION_VOTER_URL` / `VARIATION_VOTER_ADMIN_TOKEN` to be set in
the environment the CLI runs in (it reads them directly, see `cli/config.ts`).

```bash
npm run voter -- create "Nav refresh" [--description "..."] [--expires-in-days 14]
# -> prints: Created voter <id>
#            <shareUrl>

npm run voter -- add <voterId> --title "Live default" --url https://preview-a.vercel.app
npm run voter -- add <voterId> --title "Mockup"       --image https://cdn.example.com/mock.png
npm run voter -- add <voterId> --title "Static markup" --embed '<div class="card">...</div>'
# exactly one of --url / --image / --embed is required per `add` call

npm run voter -- link <voterId>     # prints "$VARIATION_VOTER_URL/v/<voterId>"
npm run voter -- list               # id, title, status, expiresAt for every voter
npm run voter -- close <voterId>    # archives — read-only, still viewable
npm run voter -- delete <voterId>   # deletes immediately, irreversible
```

## curl mode (any other repo — no CLI available)

All admin endpoints require `Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN`
and `Content-Type: application/json` (`lib/admin-auth.ts`).

**Create a voter** — `POST /api/admin/voters`
Body: `{title, description?, expiresInDays?}` (`title` 1–200 chars,
`description` ≤2000 chars, `expiresInDays` integer 0–365, default 7 if
omitted — see `lib/validation.ts`).
Response `201`: `{voter: {...}, shareUrl}`.

```bash
set -a; . ~/.variation-voter/config; set +a

resp=$(curl -sS -X POST "$VARIATION_VOTER_URL/api/admin/voters" \
  -H "Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Nav refresh","description":"Pick the header treatment"}')

VOTER_ID=$(printf '%s' "$resp" | jq -r '.voter.id')
echo "$VOTER_ID"
```

Use `jq` to parse `voterId` out of the response and reuse it in the
following calls — don't try to hand-parse JSON.

**Add a variation** — `POST /api/admin/voters/$VOTER_ID/variations`
Body: `{title, description?, kind, src}` (`kind` is exactly one of
`"url" | "image" | "embed"`; `src` is any non-empty string — the API does
**not** validate that it's a real/reachable URL, see "Failure modes"
below). Response `201`: `{variation: {...}}`. `404` if `voterId` is wrong.

```bash
curl -sS -X POST "$VARIATION_VOTER_URL/api/admin/voters/$VOTER_ID/variations" \
  -H "Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Live default","kind":"url","src":"https://preview-a.vercel.app"}'
```

Repeat once per variation.

**Share link.** Prefer constructing it yourself:
`"$VARIATION_VOTER_URL/v/$VOTER_ID"` — this always works. The create
response also includes `shareUrl`, but that's built server-side from the
instance's `PUBLIC_BASE_URL` env var, which falls back to
`http://localhost:3000` if unset (`app/api/admin/voters/route.ts`). If the
printed `shareUrl` looks like `localhost` on a deployed instance, use the
constructed link instead and flag that `PUBLIC_BASE_URL` needs fixing.

**List / close / delete:**
```bash
curl -sS "$VARIATION_VOTER_URL/api/admin/voters" \
  -H "Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN"

curl -sS -X POST "$VARIATION_VOTER_URL/api/admin/voters/$VOTER_ID/close" \
  -H "Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN"

curl -sS -X DELETE "$VARIATION_VOTER_URL/api/admin/voters/$VOTER_ID" \
  -H "Authorization: Bearer $VARIATION_VOTER_ADMIN_TOKEN"
```

## Expanded kind decision guide

| Situation | Pick | Notes |
|---|---|---|
| Live Vercel preview, deployed branch, Storybook/Chromatic link, CodeSandbox | `url` | Rendered `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups">` (`app/v/[voterId]/stage.tsx`). Preserves real interaction. |
| Only runs at `http://localhost:...` | deploy first, then `url` | Never pass a localhost/private-network `src` — external voters can't reach it and will see a blank iframe. If you can't deploy quickly, fall back to a screenshot as `image` and tell the user why. |
| Target sets `X-Frame-Options: DENY` or a `frame-ancestors` CSP | `image` (screenshot) instead of `url` | The iframe will refuse to load regardless of reachability. Take/host a screenshot. |
| Figma export, exported PNG/JPG, screenshot of a static comp | `image` | Must already be a public URL — no upload endpoint exists. `resolve-variation-input.ts` passes the string through as-is; a local file path will not work. |
| Small static HTML/CSS you're writing yourself, no interactivity needed | `embed` | Sanitized with DOMPurify before render — `<script>` tags and `on*` attribute handlers are stripped, so JS-driven behavior silently disappears. A whitelisted `<iframe>` (with `allow`, `allowfullscreen`, `frameborder`, `scrolling`, `loading`, `referrerpolicy` attrs) is allowed through if you need an embedded frame. |
| Static HTML/CSS but you need real interactivity (JS) | `url`, not `embed` | Deploy it (even a throwaway static host) and use `url` — `embed` will silently drop scripts and inline event handlers. |

### Failure modes to watch for

- **No `src` format validation server-side.** `addVariationSchema` accepts
  any non-empty string as `src` (`lib/validation.ts`). A typo'd URL will
  pass the API call and only fail when a voter's browser tries to render
  it. Sanity-check the scheme (`https://...`) and, if possible, reachability
  before sending.
- **Blank iframe** almost always means: `localhost`/private URL, or the
  target's `X-Frame-Options`/CSP blocking framing. See troubleshooting below.

## Preparing content per kind

- **`url`**: deploy a preview first if the concept only exists locally
  (Vercel preview deploy, a static host, CodeSandbox/StackBlitz share link,
  etc.). Confirm the URL loads in a plain browser tab before using it.
- **`image`**: host the image publicly first (upload to any public bucket/
  CDN, a GitHub raw URL, an existing public asset host). There is no upload
  endpoint in Variation Voter itself.
- **`embed`**: hand-write static HTML/CSS as a single string. Keep it
  self-contained (inline styles or a `<style>` block) since it's injected
  into the page's DOM directly — don't rely on external stylesheets that
  may not be loaded. Remember scripts and `on*` handlers will be stripped.

## Managing voters

- `list` (CLI) / `GET /api/admin/voters` (curl) — shows `id`, `title`,
  `status`, `expiresAt` for every voter on the instance.
- `close <voterId>` — archives it: still viewable at its link, but voting/
  commenting is disabled (read-only).
- `delete <voterId>` — deletes immediately and irreversibly.
- **Expiry**: voters auto-expire 7 days after creation unless
  `--expires-in-days` / `expiresInDays` was set at creation (0–365, per
  `lib/validation.ts`). A daily cron job (`/api/cron/cleanup`) sweeps
  expired voters — mention the expiry window whenever you hand back a link.

## Troubleshooting

- **`401 Unauthorized`** — token is missing or doesn't match the instance's
  `ADMIN_TOKEN` env var (`lib/admin-auth.ts` compares
  `Authorization: Bearer <token>` against it exactly). Re-check
  `~/.variation-voter/config` or the env vars; don't retry with a guessed
  token.
- **`404 Voter not found`** — wrong `voterId` in the URL path, e.g. reusing
  an ID from a different instance or a deleted voter.
- **`400` with a validation error body** — payload failed `lib/validation.ts`
  schema checks: `title` empty or over 200 chars, `description` over 2000
  chars, `kind` not one of `url`/`image`/`embed`, or empty `src`. The
  response body is the flattened Zod error — read it to see which field.
- **Blank iframe on the voting page** — the `url` variation's `src` is
  either unreachable from the voter's browser (localhost, private network,
  auth-gated) or the target sends `X-Frame-Options`/`frame-ancestors` that
  blocks embedding. Fix: redeploy to a public URL, or switch that variation
  to `image` with a screenshot.
- **Embed content looks stripped or inert** — DOMPurify removed `<script>`
  tags and `on*` attributes from an `embed` variation
  (`app/v/[voterId]/stage.tsx`). This is by design; if you need JS
  behavior, use `url` instead.
- **Share link points at `localhost` from a deployed instance** — the
  instance's `PUBLIC_BASE_URL` env var is unset or wrong. Construct the
  link yourself as `"$VARIATION_VOTER_URL/v/$VOTER_ID"` and tell the user
  to fix `PUBLIC_BASE_URL` in their Vercel project env.

## One-time provisioning (before the skill can be used against a new instance)

Do this once per Variation Voter instance (the person doing this is simply
the first installer — nothing here is owner-specific):

1. **Deploy the app.** Use the repo's "Deploy with Vercel" button, or fork +
   `vercel` CLI import.
2. **Provision a database.** Create a free [Neon](https://neon.tech) project
   and copy its pooled connection string.
3. **Set Vercel env vars** on the project:
   - `DATABASE_URL` — the Neon connection string.
   - `ADMIN_TOKEN` — a long random string; this is the credential the skill
     and CLI use.
   - `CRON_SECRET` — a long random string; Vercel Cron sends it
     automatically on the scheduled cleanup run.
   - `PUBLIC_BASE_URL` — the real deployed URL (e.g.
     `https://your-instance.vercel.app`). **Required**, or `shareUrl` in
     create responses falls back to `http://localhost:3000`
     (`app/api/admin/voters/route.ts`).
4. **Run migrations once** against the prod database:
   ```bash
   DATABASE_URL=<neon connection string> npx drizzle-kit migrate
   ```
5. **Confirm the daily cron** is wired (`vercel.json` → `/api/cron/cleanup`)
   so expired voters get swept.
6. **Save the config** so the skill can find it:
   ```bash
   mkdir -p ~/.variation-voter
   cp .variation-voter.config.example ~/.variation-voter/config
   # edit VARIATION_VOTER_URL and VARIATION_VOTER_ADMIN_TOKEN in it
   chmod 600 ~/.variation-voter/config
   ```
