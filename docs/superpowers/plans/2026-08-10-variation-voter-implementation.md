# Variation Voter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js app where an author (via CLI/API) spins up shareable, time-boxed "voter" pages where anonymous visitors vote 👍/👎 and comment on content variations (URL/image/embed), with automatic cleanup.

**Architecture:** Single Next.js App Router app on Vercel. Neon Postgres (via Drizzle ORM, `neon-http` driver) stores `Voter` / `Variation` / `Vote` rows — one deployment, many voters. Three surfaces share the same DB layer: the public voter page (`/v/[voterId]`), an `ADMIN_TOKEN`-gated authoring API (`/api/admin/*`) fronted by a thin CLI, and a daily Vercel Cron route that purges expired/archived voters.

**Tech Stack:** Next.js 15 (App Router, TypeScript, React 19) · Tailwind CSS v4 · Untitled UI (v8) component library via the `untitledui` CLI · Neon Postgres + `@neondatabase/serverless` · Drizzle ORM + drizzle-kit · Zod (validation) · Vitest + Testing Library (tests) · Commander + `tsx` (CLI) · Vercel Cron.

## Global Constraints

- **Single-tenant v1:** only the instance owner authors voters, gated by one shared `ADMIN_TOKEN`. No login system, no per-user workspaces.
- **Public voting is anonymous and unlimited:** no dedup, no toggle; `comment` and `voterName` are optional on every vote.
- **Expiry:** every voter gets `expiresAt = createdAt + 7 days` by default, overridable at create time via `expiresInDays`.
- **Archive grace window:** an archived voter is hard-deleted 24 hours (`ARCHIVE_GRACE_MS`) after `archivedAt` — chosen as a concrete value for the spec's "short grace window."
- **Cleanup:** a daily Vercel Cron route hard-deletes any voter past `expiresAt`, and any archived voter past its grace window (cascades to variations/votes via FK `onDelete: "cascade"`).
- **Content slots are opaque:** `kind` ∈ `{url, image, embed}`. The shell never re-authors variation content — `url` renders in a sandboxed `<iframe>`, `image` in `<img>`, `embed` as sanitized HTML.
- **Free-tier first:** Vercel Hobby + Neon free tier. Only **public/free** Untitled UI components are used (no PRO-gated components) so a self-hoster never needs an Untitled UI license to run the tool.
- **Styling:** Tailwind CSS v4, self-contained — no dependency on `@cocaptain/ui`.
- **Comments are flat**, one per vote — no threading.
- **Archived voters are read-only:** the public vote API rejects new votes for a voter whose `status !== 'active'`, not just the UI.

---

## Phase 0 — Project scaffolding

### Task 1: Initialize the Next.js app, TypeScript, Tailwind v4, and test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.env.example`, `.gitignore` (append), `vitest.config.ts`, `tests/setup.ts`, `lib/env.ts`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string` from `lib/env.ts` — throws `Error("Missing required env var: " + name)` if unset. Every later task that reads an env var uses this.

- [ ] **Step 1: Scaffold the app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm
```

Answer "No" to Turbopack-specific prompts if asked; accept defaults otherwise.

- [ ] **Step 2: Write the failing test for `requireEnv`**

```ts
// tests/lib/env.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the value when set", () => {
    vi.stubEnv("SOME_VAR", "hello");
    expect(requireEnv("SOME_VAR")).toBe("hello");
  });

  it("throws when unset", () => {
    vi.stubEnv("SOME_VAR", "");
    expect(() => requireEnv("SOME_VAR")).toThrow("Missing required env var: SOME_VAR");
  });
});
```

- [ ] **Step 2b: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom dotenv
```

- [ ] **Step 3: Add vitest config and setup file**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

```ts
// tests/setup.ts
// Per-file DB cleanup hooks are added once db/client.ts exists (Task 4).
export {};
```

Add to `package.json` `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- tests/lib/env.test.ts`
Expected: FAIL with "Cannot find module '@/lib/env'"

- [ ] **Step 5: Implement `lib/env.ts`**

```ts
// lib/env.ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/lib/env.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Write `.env.example`**

```
DATABASE_URL=
ADMIN_TOKEN=
CRON_SECRET=
PUBLIC_BASE_URL=http://localhost:3000
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, vitest, and env helper"
```

### Task 2: Install Untitled UI base components and icons

**Files:**
- Modify: `package.json` (new deps), `app/globals.css` (Tailwind import Untitled UI adds/expects)
- Create (generated by CLI, verify after running): `components/base/button/button.tsx`, `components/base/badges/badges.tsx`, `components/base/input/input.tsx`, `components/base/textarea/textarea.tsx`, `components/application/empty-state/empty-state.tsx`

**Interfaces:**
- Produces: importable components at `@/components/base/button/button`, `@/components/base/badges/badges`, `@/components/base/input/input`, `@/components/base/textarea/textarea`, `@/components/application/empty-state/empty-state`. Later UI tasks (13-17) import from these exact paths.

- [ ] **Step 1: Install the icon package**

```bash
npm install @untitledui/icons
```

- [ ] **Step 2: Install the component bundle via the Untitled UI CLI**

```bash
npx untitledui@latest add button badges input textarea empty-state --yes
```

If it reports PRO access required for any of these five, stop and report back — they were verified `public`/free at planning time; do not substitute a hand-built component.

- [ ] **Step 3: Verify generated files and note actual exports**

```bash
ls components/base/button/ components/base/badges/
```

Open the generated `button.tsx` and `badges.tsx`, and note the exact exported component/prop names (e.g. `Button` with a `color`/`size` prop; `Badge` vs. `Badges` with a `type`/`color` prop). Tasks 13, 14, and 16 reference these — if the generated names differ from what's written there, use the generated names (the CLI output is the source of truth, not this document).

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with no missing-module errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: install Untitled UI base components (button, badges, input, textarea, empty-state)"
```

---

## Phase 1 — Data layer

### Task 3: Drizzle schema, Neon client, and drizzle-kit config

**Files:**
- Create: `db/schema.ts`, `db/client.ts`, `drizzle.config.ts`

**Interfaces:**
- Consumes: `requireEnv` from `lib/env.ts` (Task 1).
- Produces: tables `voters`, `variations`, `votes`; types `Voter`, `NewVoter`, `Variation`, `NewVariation`, `Vote`, `NewVote` (all from `db/schema.ts`); `db` (singleton `NeonHttpDatabase`) and `createDb(connectionString: string)` from `db/client.ts`. All later DB/API tasks import from these two files.

- [ ] **Step 1: Install DB dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

- [ ] **Step 2: Write the schema**

```ts
// db/schema.ts
import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const voterStatus = pgEnum("voter_status", ["active", "archived"]);
export const variationKind = pgEnum("variation_kind", ["url", "image", "embed"]);
export const voteDirection = pgEnum("vote_direction", ["up", "down"]);

export const voters = pgTable("voters", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: voterStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const variations = pgTable("variations", {
  id: text("id").primaryKey(),
  voterId: text("voter_id")
    .notNull()
    .references(() => voters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  kind: variationKind("kind").notNull(),
  src: text("src").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const votes = pgTable("votes", {
  id: text("id").primaryKey(),
  variationId: text("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  direction: voteDirection("direction").notNull(),
  comment: text("comment"),
  voterName: text("voter_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Voter = typeof voters.$inferSelect;
export type NewVoter = typeof voters.$inferInsert;
export type Variation = typeof variations.$inferSelect;
export type NewVariation = typeof variations.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
```

- [ ] **Step 3: Write the Neon client**

```ts
// db/client.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { requireEnv } from "@/lib/env";

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export const db = createDb(requireEnv("DATABASE_URL"));
```

- [ ] **Step 4: Write drizzle-kit config**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import { requireEnv } from "./lib/env";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: requireEnv("DATABASE_URL") },
});
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema for voters/variations/votes and Neon client"
```

### Task 4: Migrations and the test-database harness

This task requires a real reachable Postgres database for `DATABASE_URL` — a scratch Neon branch/project works well and is free.

**Files:**
- Create: `drizzle/` (generated migration SQL), `.env.test.local` (gitignored, not committed), `package.json` scripts
- Modify: `tests/setup.ts`, `vitest.config.ts`

**Interfaces:**
- Consumes: `db` from `db/client.ts`, `voters`/`variations`/`votes` from `db/schema.ts`.
- Produces: every test run starts against a real, empty-between-tests database. Tasks 5+ that touch `db` rely on this.

- [ ] **Step 1: Create a scratch Neon database and set env files**

Create a free Neon project (or a branch of an existing one) dedicated to tests. Write its connection string into `.env.test.local`:

```
DATABASE_URL=postgres://<test-connection-string>
```

Add `.env.test.local` and `.env.local` to `.gitignore` if not already present.

- [ ] **Step 2: Generate and apply the initial migration**

```bash
npx drizzle-kit generate
```

This writes SQL under `drizzle/`. Commit the generated SQL (migrations are tracked, not gitignored).

- [ ] **Step 3: Make vitest load `.env.test.local` before any module imports**

```ts
// vitest.config.ts
import { defineConfig, loadEnv } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(() => {
  Object.assign(process.env, loadEnv("test", process.cwd(), ""));
  return {
    plugins: [react()],
    test: {
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      globals: false,
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, ".") },
    },
  };
});
```

`loadEnv` runs while `vitest.config.ts` is evaluated, which happens before any test file (and therefore before `db/client.ts`) is imported — so `process.env.DATABASE_URL` is already the test database's URL by the time `db/client.ts` reads it.

- [ ] **Step 4: Apply the migration to the test database and add cleanup hooks**

```bash
npx drizzle-kit migrate
```

```ts
// tests/setup.ts
import { afterEach } from "vitest";
import { db } from "@/db/client";
import { voters, variations, votes } from "@/db/schema";

afterEach(async () => {
  await db.delete(votes);
  await db.delete(variations);
  await db.delete(voters);
});
```

- [ ] **Step 5: Write a smoke-test integration test**

```ts
// tests/db/schema.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { voters } from "@/db/schema";

describe("db connection", () => {
  it("can insert and read a voter row", async () => {
    await db.insert(voters).values({
      id: "smoke-test-1",
      title: "Smoke test",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const rows = await db.select().from(voters);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Smoke test");
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/db/schema.test.ts`
Expected: PASS. If it fails with a connection error, re-check `.env.test.local` and that the migration was applied.

- [ ] **Step 7: Add DB npm scripts**

Add to `package.json` `scripts`: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add initial migration and vitest test-database harness"
```

### Task 5: ID generation and input validation

**Files:**
- Create: `lib/ids.ts`, `lib/validation.ts`
- Test: `tests/lib/ids.test.ts`, `tests/lib/validation.test.ts`

**Interfaces:**
- Produces: `newId(): string` (10-char lowercase-alphanumeric slug) from `lib/ids.ts`; `createVoterSchema`, `addVariationSchema`, `castVoteSchema`, `updateVoteSchema` (Zod schemas) from `lib/validation.ts`. Used by `db/queries.ts` (Task 6) and every API route (Tasks 8-12). `updateVoteSchema` exists because the spec's voting flow is "click records the vote immediately, submitting the optional comment attaches it to *that same vote*" — Task 12 uses it for a PATCH that updates an existing vote row rather than inserting a second one.

- [ ] **Step 1: Install dependencies**

```bash
npm install nanoid zod
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/lib/ids.test.ts
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("generates a 10-character lowercase-alphanumeric id", () => {
    expect(newId()).toMatch(/^[0-9a-z]{10}$/);
  });

  it("generates distinct ids across calls", () => {
    expect(newId()).not.toBe(newId());
  });
});
```

```ts
// tests/lib/validation.test.ts
import { describe, expect, it } from "vitest";
import { createVoterSchema, addVariationSchema, castVoteSchema, updateVoteSchema } from "@/lib/validation";

describe("createVoterSchema", () => {
  it("accepts a title only", () => {
    expect(createVoterSchema.safeParse({ title: "Nav refresh" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(createVoterSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts an optional expiresInDays", () => {
    const result = createVoterSchema.safeParse({ title: "x", expiresInDays: 14 });
    expect(result.success).toBe(true);
  });
});

describe("addVariationSchema", () => {
  it("accepts a url variation", () => {
    const result = addVariationSchema.safeParse({
      title: "Live default",
      kind: "url",
      src: "https://preview.example/a",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid kind", () => {
    const result = addVariationSchema.safeParse({ title: "x", kind: "video", src: "y" });
    expect(result.success).toBe(false);
  });
});

describe("castVoteSchema", () => {
  it("accepts a bare direction", () => {
    expect(castVoteSchema.safeParse({ direction: "up" }).success).toBe(true);
  });

  it("accepts a comment and voterName", () => {
    const result = castVoteSchema.safeParse({
      direction: "down",
      comment: "too busy",
      voterName: "Kevin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid direction", () => {
    expect(castVoteSchema.safeParse({ direction: "sideways" }).success).toBe(false);
  });
});

describe("updateVoteSchema", () => {
  it("accepts a voteId with a comment", () => {
    const result = updateVoteSchema.safeParse({ voteId: "abc123", comment: "too busy" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing voteId", () => {
    expect(updateVoteSchema.safeParse({ comment: "too busy" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/lib/ids.test.ts tests/lib/validation.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement `lib/ids.ts`**

```ts
// lib/ids.ts
import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const generateId = customAlphabet(alphabet, 10);

export function newId(): string {
  return generateId();
}
```

- [ ] **Step 5: Implement `lib/validation.ts`**

```ts
// lib/validation.ts
import { z } from "zod";

export const createVoterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const addVariationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["url", "image", "embed"]),
  src: z.string().trim().min(1),
});

export const castVoteSchema = z.object({
  direction: z.enum(["up", "down"]),
  comment: z.string().trim().max(1000).optional(),
  voterName: z.string().trim().max(100).optional(),
});

export const updateVoteSchema = z.object({
  voteId: z.string().trim().min(1),
  comment: z.string().trim().max(1000).optional(),
  voterName: z.string().trim().max(100).optional(),
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/lib/ids.test.ts tests/lib/validation.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add id generation and Zod validation schemas"
```

### Task 6: Query helpers (CRUD + aggregates)

**Files:**
- Create: `db/queries.ts`
- Test: `tests/db/queries.test.ts`

**Interfaces:**
- Consumes: `db`/`Database` type from `db/client.ts`, tables from `db/schema.ts`, `newId` from `lib/ids.ts`.
- Produces: `createVoter`, `listVoters`, `addVariation`, `closeVoter`, `deleteVoter`, `getVoterDetail`, `castVote`, `attachCommentToVote`, `purgeExpiredAndArchivedVoters`, plus types `VoterDetail` and `VariationWithAggregates`. Every API route task (8-12, 18) calls these; the UI (Task 13) uses `VoterDetail`/`VariationWithAggregates`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/db/queries.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  createVoter,
  addVariation,
  closeVoter,
  deleteVoter,
  listVoters,
  getVoterDetail,
  castVote,
  attachCommentToVote,
  purgeExpiredAndArchivedVoters,
} from "@/db/queries";

describe("createVoter", () => {
  it("defaults expiry to 7 days out", async () => {
    const before = Date.now();
    const voter = await createVoter(db, { title: "Nav refresh" });
    const days = (voter.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(voter.status).toBe("active");
  });

  it("honors an explicit expiresInDays", async () => {
    const before = Date.now();
    const voter = await createVoter(db, { title: "x", expiresInDays: 1 });
    const days = (voter.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeLessThan(1.01);
  });
});

describe("addVariation", () => {
  it("assigns sequential positions in insertion order", async () => {
    const voter = await createVoter(db, { title: "x" });
    const a = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const b = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });
});

describe("closeVoter / deleteVoter", () => {
  it("archives a voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const archived = await closeVoter(db, voter.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).not.toBeNull();
  });

  it("returns null when closing a missing voter", async () => {
    expect(await closeVoter(db, "does-not-exist")).toBeNull();
  });

  it("hard-deletes a voter and cascades to variations/votes", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });

    await deleteVoter(db, voter.id);

    const detail = await getVoterDetail(db, voter.id);
    expect(detail).toBeNull();
  });
});

describe("listVoters", () => {
  it("lists all voters", async () => {
    await createVoter(db, { title: "x" });
    await createVoter(db, { title: "y" });
    expect(await listVoters(db)).toHaveLength(2);
  });
});

describe("getVoterDetail", () => {
  it("returns null for a missing voter", async () => {
    expect(await getVoterDetail(db, "nope")).toBeNull();
  });

  it("aggregates up/down counts, score, and comments per variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });
    await castVote(db, variation.id, { direction: "up", comment: "great", voterName: "Kevin" });
    await castVote(db, variation.id, { direction: "down" });

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations).toHaveLength(1);
    const v = detail!.variations[0];
    expect(v.up).toBe(2);
    expect(v.down).toBe(1);
    expect(v.score).toBe(1);
    expect(v.comments).toHaveLength(1);
    expect(v.comments[0].comment).toBe("great");
    expect(v.comments[0].voterName).toBe("Kevin");
  });
});

describe("castVote", () => {
  it("stores an anonymous up-vote", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const vote = await castVote(db, variation.id, { direction: "up" });
    expect(vote.direction).toBe("up");
    expect(vote.comment).toBeNull();
  });
});

describe("attachCommentToVote", () => {
  it("updates the existing vote row rather than creating a new one", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const vote = await castVote(db, variation.id, { direction: "up" });

    const updated = await attachCommentToVote(db, vote.id, variation.id, {
      comment: "too busy",
      voterName: "Kevin",
    });

    expect(updated?.id).toBe(vote.id);
    expect(updated?.comment).toBe("too busy");

    const detail = await getVoterDetail(db, voter.id);
    expect(detail?.variations[0].up).toBe(1); // still one vote, not two
    expect(detail?.variations[0].comments).toHaveLength(1);
  });

  it("returns null when the vote doesn't belong to the given variation", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variationA = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const variationB = await addVariation(db, voter.id, { title: "B", kind: "url", src: "https://b" });
    const vote = await castVote(db, variationA.id, { direction: "up" });

    expect(await attachCommentToVote(db, vote.id, variationB.id, { comment: "x" })).toBeNull();
  });
});

describe("purgeExpiredAndArchivedVoters", () => {
  it("deletes voters past expiresAt", async () => {
    const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);
    expect(deletedIds).toContain(voter.id);
    expect(await getVoterDetail(db, voter.id)).toBeNull();
  });

  it("deletes archived voters past the grace window but keeps recently archived ones", async () => {
    const stale = await createVoter(db, { title: "stale" });
    const fresh = await createVoter(db, { title: "fresh" });
    await closeVoter(db, stale.id);
    await closeVoter(db, fresh.id);

    // Simulate "stale" having been archived 2 days ago by purging with a 1-hour grace window
    // relative to "now" 2 days in the future.
    const twoDaysFromNow = new Date(Date.now() + 2 * 86_400_000);
    const deletedIds = await purgeExpiredAndArchivedVoters(db, twoDaysFromNow, 60 * 60 * 1000);

    expect(deletedIds).toContain(stale.id);
    expect(deletedIds).toContain(fresh.id); // both are "past grace" relative to two days from now
  });

  it("keeps active, unexpired voters", async () => {
    const voter = await createVoter(db, { title: "keep me" });
    const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), 86_400_000);
    expect(deletedIds).not.toContain(voter.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/db/queries.test.ts`
Expected: FAIL with "Cannot find module '@/db/queries'"

- [ ] **Step 3: Implement `db/queries.ts`**

```ts
// db/queries.ts
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { voters, variations, votes } from "./schema";
import { newId } from "@/lib/ids";

export type Database = NeonHttpDatabase<typeof schema>;

const DEFAULT_EXPIRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function createVoter(
  db: Database,
  input: { title: string; description?: string; expiresInDays?: number }
) {
  const id = newId();
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * DAY_MS);
  const [voter] = await db
    .insert(voters)
    .values({ id, title: input.title, description: input.description, expiresAt })
    .returning();
  return voter;
}

export async function listVoters(db: Database) {
  return db.select().from(voters).orderBy(voters.createdAt);
}

export async function addVariation(
  db: Database,
  voterId: string,
  input: { title: string; description?: string; kind: "url" | "image" | "embed"; src: string }
) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(variations)
    .where(eq(variations.voterId, voterId));
  const id = newId();
  const [variation] = await db
    .insert(variations)
    .values({ id, voterId, position: count, ...input })
    .returning();
  return variation;
}

export async function closeVoter(db: Database, voterId: string) {
  const [voter] = await db
    .update(voters)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(voters.id, voterId))
    .returning();
  return voter ?? null;
}

export async function deleteVoter(db: Database, voterId: string) {
  const [voter] = await db.delete(voters).where(eq(voters.id, voterId)).returning();
  return voter ?? null;
}

export type VariationWithAggregates = {
  id: string;
  title: string;
  description: string | null;
  kind: "url" | "image" | "embed";
  src: string;
  position: number;
  createdAt: Date;
  up: number;
  down: number;
  score: number;
  comments: { id: string; comment: string; voterName: string | null; createdAt: Date }[];
};

export type VoterDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  createdAt: Date;
  expiresAt: Date;
  archivedAt: Date | null;
  variations: VariationWithAggregates[];
};

export async function getVoterDetail(db: Database, voterId: string): Promise<VoterDetail | null> {
  const [voter] = await db.select().from(voters).where(eq(voters.id, voterId));
  if (!voter) return null;

  const rows = await db
    .select({
      id: variations.id,
      title: variations.title,
      description: variations.description,
      kind: variations.kind,
      src: variations.src,
      position: variations.position,
      createdAt: variations.createdAt,
      up: sql<number>`count(*) filter (where ${votes.direction} = 'up')::int`,
      down: sql<number>`count(*) filter (where ${votes.direction} = 'down')::int`,
    })
    .from(variations)
    .leftJoin(votes, eq(votes.variationId, variations.id))
    .where(eq(variations.voterId, voterId))
    .groupBy(variations.id);

  const commentRows = await db
    .select({
      id: votes.id,
      variationId: votes.variationId,
      comment: votes.comment,
      voterName: votes.voterName,
      createdAt: votes.createdAt,
    })
    .from(votes)
    .innerJoin(variations, eq(variations.id, votes.variationId))
    .where(and(eq(variations.voterId, voterId), isNotNull(votes.comment)))
    .orderBy(sql`${votes.createdAt} desc`);

  const variationsWithAggregates: VariationWithAggregates[] = rows.map((row) => ({
    ...row,
    score: row.up - row.down,
    comments: commentRows
      .filter((c) => c.variationId === row.id && c.comment)
      .map((c) => ({
        id: c.id,
        comment: c.comment as string,
        voterName: c.voterName,
        createdAt: c.createdAt,
      })),
  }));

  return { ...voter, variations: variationsWithAggregates };
}

export async function castVote(
  db: Database,
  variationId: string,
  input: { direction: "up" | "down"; comment?: string; voterName?: string }
) {
  const id = newId();
  const [vote] = await db.insert(votes).values({ id, variationId, ...input }).returning();
  return vote;
}

export async function attachCommentToVote(
  db: Database,
  voteId: string,
  variationId: string,
  input: { comment?: string; voterName?: string }
) {
  const [vote] = await db
    .update(votes)
    .set(input)
    .where(and(eq(votes.id, voteId), eq(votes.variationId, variationId)))
    .returning();
  return vote ?? null;
}

export async function purgeExpiredAndArchivedVoters(db: Database, now: Date, archiveGraceMs: number) {
  const graceDeadline = new Date(now.getTime() - archiveGraceMs);
  const deleted = await db
    .delete(voters)
    .where(
      sql`${voters.expiresAt} < ${now} or (${voters.status} = 'archived' and ${voters.archivedAt} < ${graceDeadline})`
    )
    .returning({ id: voters.id });
  return deleted.map((row) => row.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/db/queries.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add query helpers for voter/variation CRUD, aggregates, and cleanup"
```

---

## Phase 2 — Authoring API (`/api/admin/*`)

### Task 7: Admin auth helper

**Files:**
- Create: `lib/admin-auth.ts`
- Test: `tests/lib/admin-auth.test.ts`

**Interfaces:**
- Consumes: `requireEnv` from `lib/env.ts`.
- Produces: `isAuthorizedAdminRequest(request: Request): boolean`. Used by every route in Tasks 8-10.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin-auth.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";

describe("isAuthorizedAdminRequest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a matching Bearer token", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters", {
      headers: { authorization: "Bearer secret123" },
    });
    expect(isAuthorizedAdminRequest(request)).toBe(true);
  });

  it("rejects a mismatched token", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(isAuthorizedAdminRequest(request)).toBe(false);
  });

  it("rejects a missing header", () => {
    vi.stubEnv("ADMIN_TOKEN", "secret123");
    const request = new Request("http://localhost/api/admin/voters");
    expect(isAuthorizedAdminRequest(request)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/admin-auth.test.ts`
Expected: FAIL with "Cannot find module '@/lib/admin-auth'"

- [ ] **Step 3: Implement**

```ts
// lib/admin-auth.ts
import { requireEnv } from "./env";

export function isAuthorizedAdminRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token === requireEnv("ADMIN_TOKEN");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/admin-auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ADMIN_TOKEN bearer-auth helper"
```

### Task 8: `POST /api/admin/voters` (create) and `GET /api/admin/voters` (list)

**Files:**
- Create: `app/api/admin/voters/route.ts`
- Test: `tests/api/admin/voters.test.ts`

**Interfaces:**
- Consumes: `db` (Task 3), `isAuthorizedAdminRequest` (Task 7), `createVoterSchema` (Task 5), `createVoter`/`listVoters` (Task 6).
- Produces: `POST` returns `{ voter, shareUrl }` (201) or `{ error }` (401/400); `GET` returns `{ voters }` (200) or `{ error }` (401).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/admin/voters.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/admin/voters/route";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
  vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
});

function adminRequest(body?: unknown) {
  return new Request("http://localhost/api/admin/voters", {
    method: "POST",
    headers: { authorization: "Bearer secret123", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/admin/voters", () => {
  it("rejects an unauthorized request", async () => {
    const response = await POST(new Request("http://localhost/api/admin/voters", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const response = await POST(adminRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("creates a voter and returns a share URL", async () => {
    const response = await POST(adminRequest({ title: "Nav refresh" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.voter.title).toBe("Nav refresh");
    expect(body.shareUrl).toBe(`http://localhost:3000/v/${body.voter.id}`);
  });
});

describe("GET /api/admin/voters", () => {
  it("rejects an unauthorized request", async () => {
    const response = await GET(new Request("http://localhost/api/admin/voters"));
    expect(response.status).toBe(401);
  });

  it("lists created voters", async () => {
    await POST(adminRequest({ title: "A" }));
    const response = await GET(
      new Request("http://localhost/api/admin/voters", {
        headers: { authorization: "Bearer secret123" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voters).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/admin/voters.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/admin/voters/route'"

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/voters/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { createVoterSchema } from "@/lib/validation";
import { createVoter, listVoters } from "@/db/queries";

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createVoterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const voter = await createVoter(db, parsed.data);
  return NextResponse.json({ voter, shareUrl: shareUrlFor(voter.id) }, { status: 201 });
}

export async function GET(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const voters = await listVoters(db);
  return NextResponse.json({ voters });
}

function shareUrlFor(voterId: string): string {
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base}/v/${voterId}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api/admin/voters.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin create/list voters API route"
```

### Task 9: `POST /api/admin/voters/[voterId]/variations` (add variation)

**Files:**
- Create: `app/api/admin/voters/[voterId]/variations/route.ts`
- Test: `tests/api/admin/variations.test.ts`

**Interfaces:**
- Consumes: `db`, `isAuthorizedAdminRequest`, `addVariationSchema`, `addVariation`, `voters` table (Task 3), `createVoter` (for test setup).
- Produces: `POST` returns `{ variation }` (201), or `{ error }` (401 unauthorized, 404 unknown voterId, 400 invalid body).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/admin/variations.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/voters/[voterId]/variations/route";
import { db } from "@/db/client";
import { createVoter } from "@/db/queries";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
});

function addVariationRequest(body: unknown) {
  return new Request("http://localhost/api/admin/voters/x/variations", {
    method: "POST",
    headers: { authorization: "Bearer secret123", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/voters/:voterId/variations", () => {
  it("rejects an unauthorized request", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(
      new Request(`http://localhost/api/admin/voters/${voter.id}/variations`, { method: "POST" }),
      { params: Promise.resolve({ voterId: voter.id }) }
    );
    expect(response.status).toBe(401);
  });

  it("rejects an invalid kind", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(addVariationRequest({ title: "A", kind: "video", src: "y" }), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(400);
  });

  it("404s when the voter doesn't exist", async () => {
    const response = await POST(addVariationRequest({ title: "A", kind: "url", src: "https://a" }), {
      params: Promise.resolve({ voterId: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("adds a variation to the given voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await POST(
      addVariationRequest({ title: "Live default", kind: "url", src: "https://preview.example/a" }),
      { params: Promise.resolve({ voterId: voter.id }) }
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.variation.voterId).toBe(voter.id);
    expect(body.variation.position).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/admin/variations.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/voters/[voterId]/variations/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { addVariationSchema } from "@/lib/validation";
import { addVariation } from "@/db/queries";
import { voters } from "@/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;

  const [voter] = await db.select({ id: voters.id }).from(voters).where(eq(voters.id, voterId));
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = addVariationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const variation = await addVariation(db, voterId, parsed.data);
  return NextResponse.json({ variation }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api/admin/variations.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin add-variation API route"
```

### Task 10: `POST /api/admin/voters/[voterId]/close` and `DELETE /api/admin/voters/[voterId]`

**Files:**
- Create: `app/api/admin/voters/[voterId]/close/route.ts`, `app/api/admin/voters/[voterId]/route.ts`
- Test: `tests/api/admin/close-and-delete.test.ts`

**Interfaces:**
- Consumes: `db`, `isAuthorizedAdminRequest`, `closeVoter`, `deleteVoter`, `createVoter`.
- Produces: `POST .../close` returns `{ voter }` (200) or `{ error }` (401/404); `DELETE` returns `{ voter }` (200) or `{ error }` (401/404).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/admin/close-and-delete.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as closeVoterRoute } from "@/app/api/admin/voters/[voterId]/close/route";
import { DELETE as deleteVoterRoute } from "@/app/api/admin/voters/[voterId]/route";
import { db } from "@/db/client";
import { createVoter, getVoterDetail } from "@/db/queries";

beforeEach(() => {
  vi.stubEnv("ADMIN_TOKEN", "secret123");
});

function authed(url: string, method: string) {
  return new Request(url, { method, headers: { authorization: "Bearer secret123" } });
}

describe("POST /api/admin/voters/:voterId/close", () => {
  it("archives an existing voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await closeVoterRoute(authed(`http://localhost/x/${voter.id}/close`, "POST"), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voter.status).toBe("archived");
  });

  it("404s for a missing voter", async () => {
    const response = await closeVoterRoute(authed("http://localhost/x/nope/close", "POST"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/admin/voters/:voterId", () => {
  it("hard-deletes an existing voter", async () => {
    const voter = await createVoter(db, { title: "x" });
    const response = await deleteVoterRoute(authed(`http://localhost/x/${voter.id}`, "DELETE"), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    expect(await getVoterDetail(db, voter.id)).toBeNull();
  });

  it("404s for a missing voter", async () => {
    const response = await deleteVoterRoute(authed("http://localhost/x/nope", "DELETE"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/admin/close-and-delete.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement both routes**

```ts
// app/api/admin/voters/[voterId]/close/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { closeVoter } from "@/db/queries";

export async function POST(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;
  const voter = await closeVoter(db, voterId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
```

```ts
// app/api/admin/voters/[voterId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { isAuthorizedAdminRequest } from "@/lib/admin-auth";
import { deleteVoter } from "@/db/queries";

export async function DELETE(request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { voterId } = await params;
  const voter = await deleteVoter(db, voterId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api/admin/close-and-delete.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin close and delete voter API routes"
```

---

## Phase 3 — Public API (`/api/voters/*`)

### Task 11: `GET /api/voters/[voterId]` (public read)

**Files:**
- Create: `app/api/voters/[voterId]/route.ts`
- Test: `tests/api/public/voters.test.ts`

**Interfaces:**
- Consumes: `db`, `getVoterDetail`, `createVoter`, `addVariation`, `castVote` (test setup).
- Produces: `GET` returns `{ voter: VoterDetail }` (200) or `{ error }` (404). No auth required.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/public/voters.test.ts
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/voters/[voterId]/route";
import { db } from "@/db/client";
import { createVoter, addVariation, castVote } from "@/db/queries";

describe("GET /api/voters/:voterId", () => {
  it("404s for a missing voter", async () => {
    const response = await GET(new Request("http://localhost/api/voters/nope"), {
      params: Promise.resolve({ voterId: "nope" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns voter, variations, and aggregates with no auth", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await castVote(db, variation.id, { direction: "up" });

    const response = await GET(new Request(`http://localhost/api/voters/${voter.id}`), {
      params: Promise.resolve({ voterId: voter.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.voter.title).toBe("Nav refresh");
    expect(body.voter.variations[0].up).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/public/voters.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the route**

```ts
// app/api/voters/[voterId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ voterId: string }> }) {
  const { voterId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 });
  }
  return NextResponse.json({ voter });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/public/voters.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add public get-voter API route"
```

### Task 12: `POST` and `PATCH /api/voters/[voterId]/variations/[variationId]/votes` (cast vote, attach comment)

Per the spec: "Clicking a direction records a vote immediately... Submitting attaches the comment/name to **that vote**" — one vote per click, not two. So this endpoint supports both creating a vote (`POST`, no comment yet) and attaching a comment/name to that same vote afterward (`PATCH`). Task 16's UI calls `POST` on click and, only if the visitor fills in the optional comment form, `PATCH` with the vote id `POST` returned — never a second `POST`.

**Files:**
- Create: `app/api/voters/[voterId]/variations/[variationId]/votes/route.ts`
- Test: `tests/api/public/votes.test.ts`

**Interfaces:**
- Consumes: `db`, `castVoteSchema`, `updateVoteSchema`, `castVote`, `attachCommentToVote`, `createVoter`, `addVariation`, `closeVoter` (test setup), `variations`/`voters` tables.
- Produces: `POST` returns `{ vote }` (201) or `{ error }` (400 invalid body, 403 voter not active, 404 unknown variation). `PATCH` returns `{ vote }` (200) or `{ error }` (400 invalid body, 403 voter not active, 404 unknown variation or unknown/mismatched voteId).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/public/votes.test.ts
import { describe, expect, it } from "vitest";
import { POST, PATCH } from "@/app/api/voters/[voterId]/variations/[variationId]/votes/route";
import { db } from "@/db/client";
import { createVoter, addVariation, closeVoter } from "@/db/queries";

function voteRequest(method: string, body: unknown) {
  return new Request("http://localhost/votes", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voters/:voterId/variations/:variationId/votes", () => {
  it("404s when the variation doesn't belong to the voter", async () => {
    const voterA = await createVoter(db, { title: "A" });
    const voterB = await createVoter(db, { title: "B" });
    const variation = await addVariation(db, voterA.id, { title: "x", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voterB.id, variationId: variation.id }),
    });
    expect(response.status).toBe(404);
  });

  it("403s when the voter is archived", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    await closeVoter(db, voter.id);

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(403);
  });

  it("rejects an invalid body", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "sideways" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });

  it("records an anonymous vote with no comment yet", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.vote.direction).toBe("up");
    expect(body.vote.comment).toBeNull();
  });
});

describe("PATCH /api/voters/:voterId/variations/:variationId/votes", () => {
  it("attaches a comment to the vote created by an earlier POST", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });
    const postResponse = await POST(voteRequest("POST", { direction: "up" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    const { vote } = await postResponse.json();

    const patchResponse = await PATCH(
      voteRequest("PATCH", { voteId: vote.id, comment: "nice", voterName: "Kevin" }),
      { params: Promise.resolve({ voterId: voter.id, variationId: variation.id }) }
    );

    expect(patchResponse.status).toBe(200);
    const body = await patchResponse.json();
    expect(body.vote.id).toBe(vote.id);
    expect(body.vote.comment).toBe("nice");
  });

  it("404s for an unknown voteId", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", { voteId: "nope", comment: "x" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a body missing voteId", async () => {
    const voter = await createVoter(db, { title: "x" });
    const variation = await addVariation(db, voter.id, { title: "A", kind: "url", src: "https://a" });

    const response = await PATCH(voteRequest("PATCH", { comment: "x" }), {
      params: Promise.resolve({ voterId: voter.id, variationId: variation.id }),
    });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/public/votes.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the route**

```ts
// app/api/voters/[voterId]/variations/[variationId]/votes/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { castVoteSchema, updateVoteSchema } from "@/lib/validation";
import { castVote, attachCommentToVote } from "@/db/queries";
import { variations, voters } from "@/db/schema";

async function findActiveVariationError(voterId: string, variationId: string) {
  const [row] = await db
    .select({ voterId: variations.voterId, status: voters.status })
    .from(variations)
    .innerJoin(voters, eq(voters.id, variations.voterId))
    .where(eq(variations.id, variationId));

  if (!row || row.voterId !== voterId) {
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });
  }
  if (row.status !== "active") {
    return NextResponse.json({ error: "Voting is closed for this voter" }, { status: 403 });
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string }> }
) {
  const { voterId, variationId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = castVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const vote = await castVote(db, variationId, parsed.data);
  return NextResponse.json({ vote }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ voterId: string; variationId: string }> }
) {
  const { voterId, variationId } = await params;

  const activeError = await findActiveVariationError(voterId, variationId);
  if (activeError) return activeError;

  const body = await request.json().catch(() => null);
  const parsed = updateVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { voteId, ...update } = parsed.data;
  const vote = await attachCommentToVote(db, voteId, variationId, update);
  if (!vote) {
    return NextResponse.json({ error: "Vote not found" }, { status: 404 });
  }
  return NextResponse.json({ vote });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api/public/votes.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add public cast-vote (POST) and attach-comment (PATCH) API routes"
```

---

## Phase 4 — Public voter shell UI

### Task 13: Sort logic and the `VariationList` left nav

**Files:**
- Create: `app/v/[voterId]/variation-list.tsx`
- Test: `tests/ui/variation-list.test.tsx`

**Interfaces:**
- Consumes: `VariationWithAggregates` type (Task 6); `Button` and `Badge` components installed in Task 2 (use whatever exact names Task 2 Step 3 recorded).
- Produces: pure function `sortVariations(variations, mode): VariationWithAggregates[]` and component `VariationList`. Consumed by `VoterShell` (Task 15).

- [ ] **Step 1: Install component-testing dependency**

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 2: Write the failing tests**

```tsx
// tests/ui/variation-list.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VariationList, sortVariations, type SortMode } from "@/app/v/[voterId]/variation-list";
import type { VariationWithAggregates } from "@/db/queries";

function makeVariation(overrides: Partial<VariationWithAggregates>): VariationWithAggregates {
  return {
    id: "id",
    title: "Title",
    description: null,
    kind: "url",
    src: "https://example.com",
    position: 0,
    createdAt: new Date("2026-01-01"),
    up: 0,
    down: 0,
    score: 0,
    comments: [],
    ...overrides,
  };
}

describe("sortVariations", () => {
  const variations = [
    makeVariation({ id: "a", position: 1, createdAt: new Date("2026-01-01"), score: 1 }),
    makeVariation({ id: "b", position: 0, createdAt: new Date("2026-01-03"), score: 5 }),
    makeVariation({ id: "c", position: 2, createdAt: new Date("2026-01-02"), score: -1 }),
  ];

  it("sorts by position for 'all'", () => {
    expect(sortVariations(variations, "all").map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by createdAt descending for 'new'", () => {
    expect(sortVariations(variations, "new").map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by score descending for 'top'", () => {
    expect(sortVariations(variations, "top").map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
});

describe("VariationList", () => {
  it("calls onSelect with the clicked variation id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VariationList
        voterTitle="Nav refresh"
        variations={[makeVariation({ id: "a", title: "Option A" })]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={onSelect}
        onSortModeChange={() => {}}
      />
    );
    await user.click(screen.getByText("Option A"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("calls onSortModeChange when a sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortModeChange = vi.fn();
    render(
      <VariationList
        voterTitle="Nav refresh"
        variations={[]}
        selectedId={null}
        sortMode={"all" as SortMode}
        onSelect={() => {}}
        onSortModeChange={onSortModeChange}
      />
    );
    await user.click(screen.getByText("Top"));
    expect(onSortModeChange).toHaveBeenCalledWith("top");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/ui/variation-list.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement `VariationList`**

Adjust the `Button`/badge import names to whatever Task 2 Step 3 recorded if they differ.

```tsx
// app/v/[voterId]/variation-list.tsx
"use client";

import { Button } from "@/components/base/button/button";
import { Badge } from "@/components/base/badges/badges";
import type { VariationWithAggregates } from "@/db/queries";

export type SortMode = "all" | "new" | "top";

export function sortVariations(
  variations: VariationWithAggregates[],
  mode: SortMode
): VariationWithAggregates[] {
  const copy = [...variations];
  if (mode === "all") return copy.sort((a, b) => a.position - b.position);
  if (mode === "new") return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return copy.sort((a, b) => b.score - a.score);
}

const SORT_LABELS: Record<SortMode, string> = { all: "All", new: "New", top: "Top" };

export function VariationList({
  voterTitle,
  variations,
  selectedId,
  sortMode,
  onSelect,
  onSortModeChange,
}: {
  voterTitle: string;
  variations: VariationWithAggregates[];
  selectedId: string | null;
  sortMode: SortMode;
  onSelect: (id: string) => void;
  onSortModeChange: (mode: SortMode) => void;
}) {
  const sorted = sortVariations(variations, sortMode);

  return (
    <nav className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold">{voterTitle}</h1>
        <div className="mt-3 flex gap-1">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              color={sortMode === mode ? "primary" : "secondary"}
              onClick={() => onSortModeChange(mode)}
            >
              {SORT_LABELS[mode]}
            </Button>
          ))}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {sorted.map((variation) => (
          <li key={variation.id}>
            <button
              type="button"
              onClick={() => onSelect(variation.id)}
              aria-current={variation.id === selectedId}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 aria-[current=true]:bg-gray-100"
            >
              <span className="truncate">{variation.title}</span>
              <span className="flex gap-1 shrink-0">
                <Badge color="success">{variation.up}</Badge>
                <Badge color="error">{variation.down}</Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/ui/variation-list.test.tsx`
Expected: PASS (5 tests). If the installed `Button`/`Badge` props (e.g. `color`, `size`) don't match, adjust to the generated component's actual prop names — re-run until green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add VariationList left nav with All/New/Top sort"
```

### Task 14: `Stage` component (renders by kind, comment feed)

**Files:**
- Create: `app/v/[voterId]/stage.tsx`
- Test: `tests/ui/stage.test.tsx`

**Interfaces:**
- Consumes: `VariationWithAggregates`, `EmptyState` component (Task 2).
- Produces: component `Stage` with the **full, final** prop signature — `{ variation: VariationWithAggregates | null; voterId: string; voterStatus: "active" | "archived"; onVoteCast: (variationId: string, direction: "up" | "down") => void; onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void }` — declared now so `VoterShell` (Task 15) can pass all five props without a later signature change. This task's component body only destructures and uses `variation`; Task 16 destructures the rest and adds the voting panel that uses them.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/ui/stage.test.tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Stage } from "@/app/v/[voterId]/stage";
import type { VariationWithAggregates } from "@/db/queries";

const base: VariationWithAggregates = {
  id: "a",
  title: "Option A",
  description: "The current live version",
  kind: "url",
  src: "https://preview.example/a",
  position: 0,
  createdAt: new Date(),
  up: 2,
  down: 1,
  score: 1,
  comments: [{ id: "c1", comment: "too busy", voterName: "Kevin", createdAt: new Date() }],
};

// Task 16 wires these up; this task's Stage accepts but doesn't yet use them.
const stubStageProps = {
  voterId: "voter1",
  voterStatus: "active" as const,
  onVoteCast: () => {},
  onCommentSubmit: () => {},
};

describe("Stage", () => {
  it("shows an empty state when nothing is selected", () => {
    render(<Stage variation={null} {...stubStageProps} />);
    expect(screen.getByText(/no variation selected/i)).toBeInTheDocument();
  });

  it("renders a sandboxed iframe for kind 'url'", () => {
    render(<Stage variation={base} {...stubStageProps} />);
    const iframe = screen.getByTitle("Option A");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "https://preview.example/a");
    expect(iframe).toHaveAttribute("sandbox");
  });

  it("renders an img for kind 'image'", () => {
    render(
      <Stage
        variation={{ ...base, kind: "image", src: "https://example.com/b.png" }}
        {...stubStageProps}
      />
    );
    expect(screen.getByRole("img", { name: "Option A" })).toHaveAttribute(
      "src",
      "https://example.com/b.png"
    );
  });

  it("renders comments with the commenter's name", () => {
    render(<Stage variation={base} {...stubStageProps} />);
    expect(screen.getByText("too busy")).toBeInTheDocument();
    expect(screen.getByText("Kevin")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/stage.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Install a sanitizer for `embed` HTML**

```bash
npm install isomorphic-dompurify
```

- [ ] **Step 4: Implement `Stage`**

```tsx
// app/v/[voterId]/stage.tsx
"use client";

import DOMPurify from "isomorphic-dompurify";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import type { VariationWithAggregates } from "@/db/queries";

export function Stage({
  variation,
}: {
  variation: VariationWithAggregates | null;
  voterId: string;
  voterStatus: "active" | "archived";
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  if (!variation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState title="No variation selected" description="Pick a variation from the list." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-gray-600 mt-1">{variation.description}</p>}
      </div>
      <div className="flex-1 min-h-[400px] bg-gray-50">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-gray-200">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-gray-700">{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VariationMedia({ variation }: { variation: VariationWithAggregates }) {
  if (variation.kind === "url") {
    return (
      <iframe
        title={variation.title}
        src={variation.src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="w-full h-full min-h-[400px] border-0"
      />
    );
  }
  if (variation.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={variation.src} alt={variation.title} className="w-full h-auto" />;
  }
  return (
    <div
      className="p-4"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(variation.src) }}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/ui/stage.test.tsx`
Expected: PASS (4 tests). Adjust `EmptyState` prop names to whatever Task 2 Step 3 recorded if they differ.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Stage component rendering url/image/embed with sanitized HTML"
```

### Task 15: `VoterShell` — client state, optimistic voting, deep-link routing

**Files:**
- Create: `app/v/[voterId]/voter-shell.tsx`
- Test: `tests/ui/voter-shell.test.tsx`

**Interfaces:**
- Consumes: `VariationList` (Task 13), `Stage` (Task 14), `VoterDetail` type (Task 6).
- Produces: component `VoterShell({ voter, initialVariationId })`. Consumed by both page routes in Task 16.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/ui/voter-shell.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VoterShell } from "@/app/v/[voterId]/voter-shell";
import type { VoterDetail } from "@/db/queries";

const voter: VoterDetail = {
  id: "voter1",
  title: "Nav refresh",
  description: null,
  status: "active",
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
  archivedAt: null,
  variations: [
    {
      id: "a",
      title: "Option A",
      description: null,
      kind: "url",
      src: "https://preview.example/a",
      position: 0,
      createdAt: new Date(),
      up: 0,
      down: 0,
      score: 0,
      comments: [],
    },
    {
      id: "b",
      title: "Option B",
      description: null,
      kind: "url",
      src: "https://preview.example/b",
      position: 1,
      createdAt: new Date(),
      up: 0,
      down: 0,
      score: 0,
      comments: [],
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("VoterShell", () => {
  it("selects the first variation by default and shows its stage", () => {
    render(<VoterShell voter={voter} initialVariationId="a" />);
    expect(screen.getByTitle("Option A")).toBeInTheDocument();
  });

  it("switches the stage and updates the URL when a different variation is clicked", async () => {
    const user = userEvent.setup();
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    render(<VoterShell voter={voter} initialVariationId="a" />);

    await user.click(screen.getByText("Option B"));

    expect(screen.getByTitle("Option B")).toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/v/voter1/b");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/voter-shell.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `VoterShell`**

```tsx
// app/v/[voterId]/voter-shell.tsx
"use client";

import { useState } from "react";
import type { VoterDetail } from "@/db/queries";
import { VariationList, type SortMode } from "./variation-list";
import { Stage } from "./stage";

export function VoterShell({
  voter,
  initialVariationId,
}: {
  voter: VoterDetail;
  initialVariationId: string | null;
}) {
  const [selectedId, setSelectedId] = useState(initialVariationId);
  const [sortMode, setSortMode] = useState<SortMode>("all");
  const [variations, setVariations] = useState(voter.variations);

  const selected = variations.find((v) => v.id === selectedId) ?? null;

  function selectVariation(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, "", `/v/${voter.id}/${id}`);
  }

  function recordOptimisticVote(variationId: string, direction: "up" | "down") {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              up: direction === "up" ? v.up + 1 : v.up,
              down: direction === "down" ? v.down + 1 : v.down,
              score: direction === "up" ? v.score + 1 : v.score - 1,
            }
          : v
      )
    );
  }

  function recordComment(variationId: string, comment: string, voterName: string | null) {
    setVariations((prev) =>
      prev.map((v) =>
        v.id === variationId
          ? {
              ...v,
              comments: [
                { id: `optimistic-${v.comments.length}`, comment, voterName, createdAt: new Date() },
                ...v.comments,
              ],
            }
          : v
      )
    );
  }

  return (
    <div className="flex h-dvh">
      <VariationList
        voterTitle={voter.title}
        variations={variations}
        selectedId={selectedId}
        sortMode={sortMode}
        onSelect={selectVariation}
        onSortModeChange={setSortMode}
      />
      <Stage
        variation={selected}
        voterId={voter.id}
        voterStatus={voter.status}
        onVoteCast={recordOptimisticVote}
        onCommentSubmit={recordComment}
      />
    </div>
  );
}
```

Note: `Stage` already declares `voterId`/`voterStatus`/`onVoteCast`/`onCommentSubmit` in its prop type as of Task 14, so this type-checks cleanly — Task 16 only adds the JSX that *uses* those props (the thumbs up/down panel), it doesn't change the signature.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/voter-shell.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add VoterShell with selection state and deep-link routing"
```

### Task 16: Voting panel — thumbs up/down, optimistic update, comment form, archived read-only

**Files:**
- Modify: `app/v/[voterId]/stage.tsx`
- Test: `tests/ui/stage-voting.test.tsx`

**Interfaces:**
- Consumes: `ThumbsUp`/`ThumbsDown` icons (`@untitledui/icons`), `Button`/`Input`/`Textarea` components (Task 2), `castVoteSchema`-shaped body. `Stage`'s prop signature (including `voterId`, `voterStatus`, `onVoteCast`, `onCommentSubmit`) was already declared in Task 14 — this task destructures and uses them for the first time.
- Produces: `Stage` now renders a `VotingPanel` that `POST`s to `/api/voters/${voterId}/variations/${variation.id}/votes`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/ui/stage-voting.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Stage } from "@/app/v/[voterId]/stage";
import type { VariationWithAggregates } from "@/db/queries";

const variation: VariationWithAggregates = {
  id: "a",
  title: "Option A",
  description: null,
  kind: "url",
  src: "https://preview.example/a",
  position: 0,
  createdAt: new Date(),
  up: 0,
  down: 0,
  score: 0,
  comments: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ vote: { id: "vote1" } }), { status: 201 });
      }
      return new Response(JSON.stringify({ vote: { id: "vote1" } }), { status: 200 });
    })
  );
});
afterEach(() => vi.restoreAllMocks());

describe("Stage voting", () => {
  it("posts exactly one vote and fires onVoteCast when thumbs-up is clicked", async () => {
    const user = userEvent.setup();
    const onVoteCast = vi.fn();
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="active"
        onVoteCast={onVoteCast}
        onCommentSubmit={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /thumbs up/i }));

    expect(onVoteCast).toHaveBeenCalledWith("a", "up");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voters/voter1/variations/a/votes",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reveals the comment/name form after voting and PATCHes the same vote instead of posting a second one", async () => {
    const user = userEvent.setup();
    const onCommentSubmit = vi.fn();
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="active"
        onVoteCast={() => {}}
        onCommentSubmit={onCommentSubmit}
      />
    );

    await user.click(screen.getByRole("button", { name: /thumbs down/i }));
    await user.type(await screen.findByLabelText(/why/i), "too busy");
    await user.type(screen.getByLabelText(/name/i), "Kevin");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onCommentSubmit).toHaveBeenCalledWith("a", "too busy", "Kevin");
    // Exactly one POST (the click) and one PATCH (the comment) — never two POSTs,
    // which would double-count the vote.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/voters/voter1/variations/a/votes",
      expect.objectContaining({ method: "PATCH" })
    );
    const lastCallBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
    expect(lastCallBody).toEqual({ voteId: "vote1", comment: "too busy", voterName: "Kevin" });
  });

  it("hides voting controls and shows a read-only notice for archived voters", () => {
    render(
      <Stage
        variation={variation}
        voterId="voter1"
        voterStatus="archived"
        onVoteCast={() => {}}
        onCommentSubmit={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /thumbs up/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/stage-voting.test.tsx`
Expected: FAIL — `Stage` doesn't accept these props / render these controls yet.

- [ ] **Step 3: Extend `Stage` with the voting panel**

Replace the header block in `app/v/[voterId]/stage.tsx` (from Task 14) with the version below — same file, same `VariationMedia` and comment-feed sections stay as-is beneath it.

```tsx
// app/v/[voterId]/stage.tsx
"use client";

import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { ThumbsUp, ThumbsDown } from "@untitledui/icons";
import { Button } from "@/components/base/button/button";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import type { VariationWithAggregates } from "@/db/queries";

export function Stage({
  variation,
  voterId,
  voterStatus,
  onVoteCast,
  onCommentSubmit,
}: {
  variation: VariationWithAggregates | null;
  voterId: string;
  voterStatus: "active" | "archived";
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  if (!variation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState title="No variation selected" description="Pick a variation from the list." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-gray-600 mt-1">{variation.description}</p>}
        {voterStatus === "archived" ? (
          <p className="mt-3 text-sm text-gray-500">
            This voter is closed and read-only — voting is disabled.
          </p>
        ) : (
          <VotingPanel voterId={voterId} variation={variation} onVoteCast={onVoteCast} onCommentSubmit={onCommentSubmit} />
        )}
      </div>
      <div className="flex-1 min-h-[400px] bg-gray-50">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-gray-200">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-gray-700">{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VotingPanel({
  voterId,
  variation,
  onVoteCast,
  onCommentSubmit,
}: {
  voterId: string;
  variation: VariationWithAggregates;
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [voterName, setVoterName] = useState("");

  async function castVote(direction: "up" | "down") {
    onVoteCast(variation.id, direction);
    const response = await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    const { vote } = await response.json();
    setPendingVoteId(vote.id);
  }

  async function submitComment() {
    if (!pendingVoteId || !comment.trim()) return;
    onCommentSubmit(variation.id, comment.trim(), voterName.trim() || null);
    // PATCH the same vote the click already created — never a second POST,
    // which would double-count the vote (see Task 12).
    await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        voteId: pendingVoteId,
        comment: comment.trim(),
        voterName: voterName.trim() || undefined,
      }),
    });
    setComment("");
    setVoterName("");
    setPendingVoteId(null);
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <Button aria-label="Thumbs up" onClick={() => castVote("up")}>
          <ThumbsUp /> {variation.up}
        </Button>
        <Button aria-label="Thumbs down" onClick={() => castVote("down")}>
          <ThumbsDown /> {variation.down}
        </Button>
      </div>
      {pendingVoteId && (
        <div className="mt-3 flex flex-col gap-2 max-w-sm">
          <Textarea
            aria-label="Why? (optional)"
            placeholder="Why? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Input
            aria-label="Name (optional)"
            placeholder="Name (optional)"
            value={voterName}
            onChange={(e) => setVoterName(e.target.value)}
          />
          <Button onClick={submitComment}>Submit</Button>
        </div>
      )}
    </div>
  );
}

function VariationMedia({ variation }: { variation: VariationWithAggregates }) {
  if (variation.kind === "url") {
    return (
      <iframe
        title={variation.title}
        src={variation.src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="w-full h-full min-h-[400px] border-0"
      />
    );
  }
  if (variation.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={variation.src} alt={variation.title} className="w-full h-auto" />;
  }
  return <div className="p-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(variation.src) }} />;
}
```

- [ ] **Step 4: Re-run Task 14's tests, then the new ones**

Run: `npm test -- tests/ui/stage.test.tsx tests/ui/stage-voting.test.tsx tests/ui/voter-shell.test.tsx`
Expected: PASS on all three files. Adjust `Input`/`Textarea`/`Button` prop names to match the generated components (from Task 2 Step 3) if needed — e.g. some Untitled UI inputs take a `label` prop instead of relying on `aria-label`; if so, use `label="Why? (optional)"` and update the test's `getByLabelText` accordingly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add voting panel with optimistic votes, comment form, and archived read-only state"
```

### Task 17: Wire up the two page routes

**Files:**
- Create: `app/v/[voterId]/page.tsx`, `app/v/[voterId]/[variationId]/page.tsx`
- Test: `tests/ui/voter-page.test.tsx`

**Interfaces:**
- Consumes: `db`, `getVoterDetail`, `VoterShell`, `createVoter`/`addVariation` (test setup).
- Produces: the public routes described in the spec (`/v/<voterId>` and `/v/<voterId>/<variationId>`).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/voter-page.test.tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VoterPage from "@/app/v/[voterId]/page";
import VoterVariationPage from "@/app/v/[voterId]/[variationId]/page";
import { db } from "@/db/client";
import { createVoter, addVariation } from "@/db/queries";

describe("voter page routes", () => {
  it("renders the shell with the first variation selected by default", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    await addVariation(db, voter.id, { title: "Option A", kind: "url", src: "https://a" });

    const jsx = await VoterPage({ params: Promise.resolve({ voterId: voter.id }) });
    render(jsx);

    expect(screen.getByTitle("Option A")).toBeInTheDocument();
  });

  it("renders the shell with a deep-linked variation selected", async () => {
    const voter = await createVoter(db, { title: "Nav refresh" });
    await addVariation(db, voter.id, { title: "Option A", kind: "url", src: "https://a" });
    const b = await addVariation(db, voter.id, { title: "Option B", kind: "url", src: "https://b" });

    const jsx = await VoterVariationPage({
      params: Promise.resolve({ voterId: voter.id, variationId: b.id }),
    });
    render(jsx);

    expect(screen.getByTitle("Option B")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/voter-page.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement both pages**

```tsx
// app/v/[voterId]/page.tsx
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";
import { VoterShell } from "./voter-shell";

export default async function VoterPage({ params }: { params: Promise<{ voterId: string }> }) {
  const { voterId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) notFound();
  return <VoterShell voter={voter} initialVariationId={voter.variations[0]?.id ?? null} />;
}
```

```tsx
// app/v/[voterId]/[variationId]/page.tsx
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getVoterDetail } from "@/db/queries";
import { VoterShell } from "../voter-shell";

export default async function VoterVariationPage({
  params,
}: {
  params: Promise<{ voterId: string; variationId: string }>;
}) {
  const { voterId, variationId } = await params;
  const voter = await getVoterDetail(db, voterId);
  if (!voter) notFound();
  const exists = voter.variations.some((v) => v.id === variationId);
  return (
    <VoterShell
      voter={voter}
      initialVariationId={exists ? variationId : voter.variations[0]?.id ?? null}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/voter-page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Manual check in the browser**

```bash
npm run dev
```

Create a voter and variation directly via `psql`/Drizzle Studio or a temporary script, then visit `http://localhost:3000/v/<voterId>` and confirm the layout, sort control, iframe, and voting panel render as expected.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up /v/[voterId] and /v/[voterId]/[variationId] page routes"
```

---

## Phase 5 — Cleanup cron

### Task 18: `/api/cron/cleanup` route and Vercel Cron schedule

**Files:**
- Create: `app/api/cron/cleanup/route.ts`, `vercel.json`
- Test: `tests/api/cron/cleanup.test.ts`

**Interfaces:**
- Consumes: `db`, `purgeExpiredAndArchivedVoters`, `requireEnv`, `createVoter`/`closeVoter` (test setup).
- Produces: `GET /api/cron/cleanup` returns `{ deletedCount, deletedIds }` (200) when the `Authorization: Bearer <CRON_SECRET>` header matches, `{ error }` (401) otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api/cron/cleanup.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/cleanup/route";
import { db } from "@/db/client";
import { createVoter } from "@/db/queries";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
});

describe("GET /api/cron/cleanup", () => {
  it("rejects a request without the cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(response.status).toBe(401);
  });

  it("purges expired voters when authorized", async () => {
    const voter = await createVoter(db, { title: "x", expiresInDays: -1 });
    const response = await GET(
      new Request("http://localhost/api/cron/cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deletedIds).toContain(voter.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/cron/cleanup.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the route**

```ts
// app/api/cron/cleanup/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { purgeExpiredAndArchivedVoters } from "@/db/queries";
import { requireEnv } from "@/lib/env";

const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deletedIds = await purgeExpiredAndArchivedVoters(db, new Date(), ARCHIVE_GRACE_MS);
  return NextResponse.json({ deletedCount: deletedIds.length, deletedIds });
}
```

- [ ] **Step 4: Add the Vercel Cron schedule**

```json
// vercel.json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 6 * * *" }]
}
```

Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests once the `CRON_SECRET` env var is set in the Vercel project — no extra wiring needed in the route beyond reading it.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/api/cron/cleanup.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add daily cleanup cron route and Vercel Cron schedule"
```

---

## Phase 6 — Authoring CLI

### Task 19: CLI config and API client

**Files:**
- Create: `cli/config.ts`, `cli/api-client.ts`
- Test: `tests/cli/api-client.test.ts`

**Interfaces:**
- Produces: `getCliConfig(): { baseUrl: string; adminToken: string }`; `createVoterRequest`, `addVariationRequest`, `listVotersRequest`, `closeVoterRequest`, `deleteVoterRequest` — each a thin `fetch` wrapper against the admin API from Phase 2. Used by `cli/index.ts` (Task 20).

- [ ] **Step 1: Install CLI dependencies**

```bash
npm install commander
npm install -D tsx
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/cli/api-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoterRequest, addVariationRequest, listVotersRequest } from "@/cli/api-client";

beforeEach(() => {
  vi.stubEnv("VARIATION_VOTER_URL", "https://example.vercel.app/");
  vi.stubEnv("VARIATION_VOTER_ADMIN_TOKEN", "secret123");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }))
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cli/api-client", () => {
  it("sends an authenticated POST to create a voter, trimming a trailing slash from the base URL", async () => {
    await createVoterRequest({ title: "Nav refresh" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.vercel.app/api/admin/voters",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret123" }),
      })
    );
  });

  it("sends an authenticated POST to add a variation", async () => {
    await addVariationRequest("voter1", { title: "A", kind: "url", src: "https://a" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.vercel.app/api/admin/voters/voter1/variations",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with the response body on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 }))
    );
    await expect(listVotersRequest()).rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/cli/api-client.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement `cli/config.ts` and `cli/api-client.ts`**

```ts
// cli/config.ts
export function getCliConfig() {
  const baseUrl = process.env.VARIATION_VOTER_URL;
  const adminToken = process.env.VARIATION_VOTER_ADMIN_TOKEN;
  if (!baseUrl) throw new Error("Missing VARIATION_VOTER_URL env var");
  if (!adminToken) throw new Error("Missing VARIATION_VOTER_ADMIN_TOKEN env var");
  return { baseUrl: baseUrl.replace(/\/$/, ""), adminToken };
}
```

```ts
// cli/api-client.ts
import { getCliConfig } from "./config";

async function adminFetch(path: string, init: RequestInit = {}) {
  const { baseUrl, adminToken } = getCliConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }
  return response.json();
}

export function createVoterRequest(input: { title: string; description?: string; expiresInDays?: number }) {
  return adminFetch("/api/admin/voters", { method: "POST", body: JSON.stringify(input) });
}

export function addVariationRequest(
  voterId: string,
  input: { title: string; description?: string; kind: "url" | "image" | "embed"; src: string }
) {
  return adminFetch(`/api/admin/voters/${voterId}/variations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listVotersRequest() {
  return adminFetch("/api/admin/voters", { method: "GET" });
}

export function closeVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}/close`, { method: "POST" });
}

export function deleteVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}`, { method: "DELETE" });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/cli/api-client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add CLI config and admin-API client"
```

### Task 20: CLI commands (`create`, `add`, `list`, `link`, `close`, `delete`)

**Files:**
- Create: `cli/index.ts`, `cli/resolve-variation-input.ts`
- Test: `tests/cli/resolve-variation-input.test.ts`

**Interfaces:**
- Consumes: everything from Task 19, `getCliConfig`.
- Produces: `resolveVariationInput(options: { url?: string; image?: string; embed?: string }): ["url" | "image" | "embed", string]` (pure, tested); `cli/index.ts` as the `voter` command entry point (not unit-tested directly — it's a thin Commander wrapper — but exercised manually in Step 6).

- [ ] **Step 1: Write the failing test for the pure resolver**

```ts
// tests/cli/resolve-variation-input.test.ts
import { describe, expect, it } from "vitest";
import { resolveVariationInput } from "@/cli/resolve-variation-input";

describe("resolveVariationInput", () => {
  it("resolves --url to kind 'url'", () => {
    expect(resolveVariationInput({ url: "https://a" })).toEqual(["url", "https://a"]);
  });

  it("resolves --image to kind 'image'", () => {
    expect(resolveVariationInput({ image: "https://a.png" })).toEqual(["image", "https://a.png"]);
  });

  it("resolves --embed to kind 'embed'", () => {
    expect(resolveVariationInput({ embed: "<iframe></iframe>" })).toEqual(["embed", "<iframe></iframe>"]);
  });

  it("throws when none are provided", () => {
    expect(() => resolveVariationInput({})).toThrow(/one of --url, --image, or --embed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/resolve-variation-input.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the resolver**

```ts
// cli/resolve-variation-input.ts
export function resolveVariationInput(options: {
  url?: string;
  image?: string;
  embed?: string;
}): ["url" | "image" | "embed", string] {
  if (options.url) return ["url", options.url];
  if (options.image) return ["image", options.image];
  if (options.embed) return ["embed", options.embed];
  throw new Error("One of --url, --image, or --embed is required");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli/resolve-variation-input.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Implement the CLI entry point**

```ts
// cli/index.ts
#!/usr/bin/env node
import { Command } from "commander";
import {
  createVoterRequest,
  addVariationRequest,
  listVotersRequest,
  closeVoterRequest,
  deleteVoterRequest,
} from "./api-client";
import { getCliConfig } from "./config";
import { resolveVariationInput } from "./resolve-variation-input";

const program = new Command();
program.name("voter");

program
  .command("create <title>")
  .option("--description <description>")
  .option("--expires-in-days <days>", "override the default 7-day expiry", (v) => Number(v))
  .action(async (title, options) => {
    const result = await createVoterRequest({
      title,
      description: options.description,
      expiresInDays: options.expiresInDays,
    });
    console.log(`Created voter ${result.voter.id}`);
    console.log(result.shareUrl);
  });

program
  .command("add <voterId>")
  .requiredOption("--title <title>")
  .option("--description <description>")
  .option("--url <url>")
  .option("--image <url>")
  .option("--embed <html>")
  .action(async (voterId, options) => {
    const [kind, src] = resolveVariationInput(options);
    const result = await addVariationRequest(voterId, {
      title: options.title,
      description: options.description,
      kind,
      src,
    });
    console.log(`Added variation ${result.variation.id} (${kind})`);
  });

program.command("list").action(async () => {
  const result = await listVotersRequest();
  for (const voter of result.voters) {
    console.log(`${voter.id}  ${voter.title}  [${voter.status}]  expires ${voter.expiresAt}`);
  }
});

program.command("link <voterId>").action((voterId) => {
  const { baseUrl } = getCliConfig();
  console.log(`${baseUrl}/v/${voterId}`);
});

program.command("close <voterId>").action(async (voterId) => {
  await closeVoterRequest(voterId);
  console.log(`Archived voter ${voterId}`);
});

program.command("delete <voterId>").action(async (voterId) => {
  await deleteVoterRequest(voterId);
  console.log(`Deleted voter ${voterId}`);
});

program.parseAsync();
```

- [ ] **Step 6: Wire up an npm script and exercise it manually**

Add to `package.json` `scripts`: `"voter": "tsx cli/index.ts"`.

```bash
VARIATION_VOTER_URL=http://localhost:3000 VARIATION_VOTER_ADMIN_TOKEN=<your-dev-ADMIN_TOKEN> \
  npm run voter -- create "Manual CLI check" --expires-in-days 1
```

Against a running `npm run dev`, confirm it prints a voter id and share URL, then run `npm run voter -- list` and confirm it appears.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add voter CLI (create/add/list/link/close/delete)"
```

---

## Phase 7 — Self-host distribution

### Task 21: README with Deploy-to-Vercel button and env docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the README**

```markdown
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

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ADMIN_TOKEN, CRON_SECRET
npm run db:migrate
npm run dev
```

Run `npx create-variation-voter` instead of the manual `.env.local` setup for a guided walkthrough.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add README with deploy-to-Vercel instructions and CLI usage"
```

### Task 22: `npx create-variation-voter` setup script

**Files:**
- Create: `scripts/create.mjs`
- Modify: `package.json` (`bin` field)
- Test: `tests/scripts/create.test.ts`

**Interfaces:**
- Produces: a `bin` entry `create-variation-voter` → `scripts/create.mjs`. Run once per self-hosted instance (never per voter).

- [ ] **Step 1: Write the failing test**

This spawns the script as a child process in a temp directory and feeds it stdin, then asserts on the `.env.local` it writes.

```ts
// tests/scripts/create.test.ts
import { describe, expect, it, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function runCreateScript(input: string): Promise<{ code: number | null; stdout: string }> {
  tempDir = mkdtempSync(join(tmpdir(), "variation-voter-create-"));
  return new Promise((resolve) => {
    const child = spawn("node", [join(process.cwd(), "scripts/create.mjs")], {
      cwd: tempDir,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

describe("scripts/create.mjs", () => {
  it("writes a .env.local with the provided DATABASE_URL and generated secrets", async () => {
    const { code } = await runCreateScript("postgres://scratch\nhttps://my-app.vercel.app\n");
    expect(code).toBe(0);
    const contents = readFileSync(join(tempDir!, ".env.local"), "utf8");
    expect(contents).toContain("DATABASE_URL=postgres://scratch");
    expect(contents).toContain("PUBLIC_BASE_URL=https://my-app.vercel.app");
    expect(contents).toMatch(/ADMIN_TOKEN=[0-9a-f]{48}/);
    expect(contents).toMatch(/CRON_SECRET=[0-9a-f]{48}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/create.test.ts`
Expected: FAIL — `scripts/create.mjs` doesn't exist yet.

- [ ] **Step 3: Implement the script**

```js
#!/usr/bin/env node
// scripts/create.mjs
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

async function main() {
  if (existsSync(".env.local")) {
    console.error(".env.local already exists — remove it first if you want to re-run setup.");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const databaseUrl = await rl.question("Neon DATABASE_URL (postgres://...): ");
  const publicBaseUrl = await rl.question(
    "Public base URL (e.g. https://your-app.vercel.app) [http://localhost:3000]: "
  );
  rl.close();

  const adminToken = randomBytes(24).toString("hex");
  const cronSecret = randomBytes(24).toString("hex");

  const contents = [
    `DATABASE_URL=${databaseUrl.trim()}`,
    `ADMIN_TOKEN=${adminToken}`,
    `CRON_SECRET=${cronSecret}`,
    `PUBLIC_BASE_URL=${publicBaseUrl.trim() || "http://localhost:3000"}`,
    "",
  ].join("\n");

  writeFileSync(".env.local", contents);

  console.log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");
  console.log("Next steps:");
  console.log("  1. npm install");
  console.log("  2. npm run db:migrate");
  console.log("  3. npm run dev            # try it locally");
  console.log(
    "  4. vercel link && vercel env add DATABASE_URL && vercel env add ADMIN_TOKEN && vercel env add CRON_SECRET"
  );
  console.log("  5. vercel deploy --prod");
}

main();
```

Add to `package.json`: `"bin": { "create-variation-voter": "./scripts/create.mjs" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/create.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add npx create-variation-voter setup script"
```

---

## Phase 8 — End-to-end verification

### Task 23: Walk through the spec's success criteria

**Files:** none (verification only — run against a local `npm run dev` with a real/scratch Neon `DATABASE_URL`, or a deployed Vercel preview).

- [ ] **Step 1: "Author creates a voter, adds ≥2 variations (including one live-preview URL), and gets a working share link" in one turn**

```bash
export VARIATION_VOTER_URL=http://localhost:3000
export VARIATION_VOTER_ADMIN_TOKEN=<your ADMIN_TOKEN>

npm run voter -- create "Success criteria check"
# copy the printed voterId
npm run voter -- add <voterId> --title "Live default" --url http://localhost:3000
npm run voter -- add <voterId> --title "Option B" --url https://example.com
npm run voter -- link <voterId>
```

Open the printed link in a browser. Confirm both variations appear in the left nav and the first renders in the stage.

- [ ] **Step 2: "A second person, on a different machine, with no login, can vote, comment, and see it reflected"**

Open the same link in a private/incognito window (simulating a second person, no cookies shared). Click 👍 on a variation, confirm the count increments immediately (optimistic update) without a page reload, type a comment and name, submit, and confirm it appears in the comment feed. Reload the page and confirm the vote/comment persisted (proves it round-tripped through the DB, not just local state).

- [ ] **Step 3: "The list re-sorts correctly under All / New / Top"**

With the two variations from Step 1, cast a few more votes so their scores differ, then click **New** and confirm the most-recently-added variation moves to the top; click **Top** and confirm the highest-score variation moves to the top; click **All** and confirm it returns to insertion order.

- [ ] **Step 4: "A voter past its 7-day expiry is gone after the next cleanup run"**

```bash
npm run voter -- create "Expiry check" --expires-in-days 0
# copy the printed voterId, then wait a few seconds so `now` passes expiresAt
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/cleanup
```

Confirm the response's `deletedIds` includes that voter's id, and that `GET /api/voters/<voterId>` now 404s.

- [ ] **Step 5: "A second person can fork the repo and stand up their own working instance"**

Push the repo to GitHub, then in a scratch directory run `npx create-variation-voter`, follow its prompts with a second, unrelated Neon project's connection string, run `npm install && npm run db:migrate && npm run dev`, and confirm the app boots and `npm run voter -- create ...` works against that fresh database — proving no state leaks from the primary instance.

- [ ] **Step 6: Record the results**

If every check above passes, the implementation satisfies the spec's success criteria. If any step fails, treat it as a bug against the relevant task above (not a new scope item) and fix it before considering the plan complete.
