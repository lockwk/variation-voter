# Environment Isolation + Production Hardening cluster

## Context

Variation Voter is a solo project on **Vercel Hobby + Neon Postgres + Vercel Blob**. The
databases were just split into three (prod=`ancient-violet`, dev/preview=`damp-sky`,
test=`rapid-glade`) and a `drizzle-kit migrate` step now auto-runs at build time. This cluster
hardens what that split left unfinished and doubles as groundwork for the npm self-host
distribution goal, so every decision favors solutions that generalize to **any** self-hoster,
not just this one deployment.

Four tickets were in scope: KEV-79, KEV-80, KEV-84, KEV-85. **Reading the current code first
changed the picture materially** — two are already fixed, and one is being deferred by decision
(see below). What actually remains is small.

---

## 1. What's already resolved (no work needed)

- **KEV-84 (`deleteVoter` leaks Blob bundles) — FIXED in code (commit #12).**
  `db/queries.ts` now has a shared `deleteAppBundles()` helper (`~L78`). **Both** `deleteVoter`
  (`~L90`) and `purgeExpiredAndArchivedVoters` (`~L305`) SELECT the `kind:"app"` variation ids
  *before* the cascading row delete, then best-effort `storage.deleteBundle(id)` (errors swallowed).
  No leak under normal operation. → Verify a regression test exists, then close.

- **KEV-80 core (tests wipe the dev DB) — FIXED in config.**
  A dedicated `.env.test.local` supplies a separate test `DATABASE_URL` (`rapid-glade`), and
  `vitest.config.ts:7` loads it via `loadEnv("test", …)`. `npm test` no longer touches dev data.
  What's left is minor (see Chunk C) — not the dangerous part.

- **The prod/dev/test DB split itself** is done and correct; `db/client.ts` resolves
  `DATABASE_URL` from process env, so "which DB" is purely which env file is loaded.

## 2. Open decisions (resolved)

1. **Per-env Blob store (separate token per env) vs one shared store? → SEPARATE token per env.**
   Rationale: isolates non-prod churn so it can be wiped wholesale (`vercel blob empty-store`),
   removes the shared-`bundles/`-namespace collision, and needs **zero app code** (the driver
   already just reads whatever `BLOB_READ_WRITE_TOKEN` it's given) — the clean default for self-hosters.

2. **Neon–Vercel per-preview branch DBs vs one shared dev/preview DB? → ONE shared dev/preview DB (`damp-sky`).**
   Rationale: per-preview branching adds a Vercel integration + per-preview migrations + Neon-specific
   lifecycle that doesn't port to self-hosters; a shared preview DB plus the non-prod purge (Chunk B)
   covers the actual pain. Revisit only if preview data collisions become real.

3. **KEV-79 dedicated bundle origin (subdomain vs separate project vs other)? → DEFER the whole ticket.**
   Rationale: the isolation only pays off if *untrusted* parties can upload bundles. Today (and under
   the confirmed "all bundles are trusted / agent-built" model) there is no stranger to fence out, so
   same-origin is acceptable. Parked with a trigger note. **If ever needed**, the recommended substrate
   is a **separate Vercel project** (its own free `*.vercel.app` origin, no custom domain purchase),
   sharing the Blob store/DB — recorded so it's not re-litigated. A secondary direct-open/stored-XSS
   surface exists but is negligible for a trusted, solo tool.

4. **Re-validate KEV-80. → Mostly resolved (see §1).** Remaining = commit a template env + setup docs,
   and (optionally, deferred) cross-workspace test isolation. Downgraded to a tidy-up item.

---

## 3. Work chunks (each ready to become its own workspace/PR)

### Chunk A — Per-environment Blob store isolation  (KEV-85, storage half)
- Provision a **separate Vercel Blob store** for non-prod (preview + dev), distinct from prod;
  wire an **environment-scoped `BLOB_READ_WRITE_TOKEN`** in Vercel (prod token → prod store,
  preview/dev token → non-prod store).
- Update `.env.example` and the deploy/self-host doc to explain "one Blob store token per environment."
- **~No app code** — the driver in `lib/storage/index.ts:20` already selects by token. This is
  Vercel config + docs.
- **Verify:** trigger a preview deploy, publish an app-variation, confirm the object lands in the
  non-prod store (not prod).

### Chunk B — Non-prod cleanup path  (KEV-85, lifecycle half)
- The cron only fires on prod (Vercel behavior), so non-prod DB rows + bundles never auto-clean.
  Add a **documented manual/scheduled purge for non-prod**: a small `npm run purge:nonprod` that
  calls `GET /api/cron/cleanup` with the `CRON_SECRET` bearer (route already only needs that token —
  `app/api/cron/cleanup/route.ts:9`), and document `vercel blob empty-store` as the wholesale
  escape hatch (safe *because* Chunk A isolated the non-prod store).
- Optional: default test/preview voters created via the CLI to a shorter `expiresInDays`.
- **Depends on Chunk A** (a wholesale blob wipe is only safe once the non-prod store is separate).
- **Verify:** create a non-prod voter with an already-past `expiresAt`, run the purge, confirm the
  row and its bundle are gone.

### Chunk C — Verify-and-close KEV-84 + KEV-80, commit template envs + self-host docs
- **KEV-84:** confirm (or add) a test asserting the bundle is deleted when its voter is deleted via
  `deleteVoter`; then close the ticket.
- **KEV-80:** commit a `.env.test.local.example`; write a single deploy/self-host doc covering all env
  vars per environment (`DATABASE_URL` ×3, per-env `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`,
  `ADMIN_TOKEN`, `PUBLIC_BASE_URL`) and the test-DB setup step; then close the ticket.
  *Deferred (not this cluster):* cross-workspace test-DB isolation via per-run schema / txn rollback —
  build only if simultaneous-workspace test collisions actually start biting.
- **Verify:** `npm test` passes; the new bundle-deletion test fails if `deleteAppBundles` is removed.

### Parked — KEV-79 (dedicated bundle origin)
No work this cluster. Leave a ticket note: *"Deferred while all bundles are trusted/agent-built.
Revisit if uploads open to untrusted users; recommended substrate = separate Vercel project for a
distinct `*.vercel.app` origin."*

---

## 4. Sequence, dependencies, parallelism

```
Chunk A (Blob isolation) ──► Chunk B (non-prod purge)      [B soft-depends on A]
Chunk C (verify/close + docs)  ── fully independent ──► can run in parallel with A and B
```

- **Start in parallel:** Chunk A and Chunk C (different files, no overlap).
- **Chunk B follows A** (needs the isolated non-prod store before documenting a wholesale wipe).
- The self-host **docs surface is shared** — Chunk A adds the per-env Blob token, Chunk C owns the
  consolidated env/deploy doc; A should append to the doc C creates (or C lands first). Coordinate so
  they don't both rewrite the same doc section.

**On execution:** these three chunks are small enough that a five-agent fan-out isn't warranted;
Chunk A (config-heavy) + Chunk C (tests/docs) can each be one agent, Chunk B one agent after A —
~3 implementation agents, plus a reviewer. I'll confirm the split at build time.

## 5. End-to-end verification

- **A:** preview deploy writes a bundle to the non-prod store; prod store untouched.
- **B:** `npm run purge:nonprod` removes an expired non-prod voter + its bundle; `vercel blob
  empty-store` clears the non-prod store without touching prod.
- **C:** `npm test` green; bundle-deletion regression test present and load-bearing;
  `.env.test.local.example` + deploy doc committed; KEV-80 & KEV-84 closed.
