import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseDbTarget,
  resolveDbTargetUrl,
  resolveDbTarget,
  checkDbTargetGuard,
  confirmCommandFor,
  loadDbTargetEnv,
} from "@/lib/db-target";

// All connection strings below are fake/local placeholders — this suite must
// never connect to a real database (see KEV-186).

describe("parseDbTarget", () => {
  it("parses host and database from a connection string", () => {
    const target = parseDbTarget("postgresql://user:pass@example-host.neon.tech/mydb?sslmode=require");
    expect(target.host).toBe("example-host.neon.tech");
    expect(target.database).toBe("mydb");
    expect(target.isLocal).toBe(false);
    expect(target.url).toBe("postgresql://user:pass@example-host.neon.tech/mydb?sslmode=require");
  });

  it("treats localhost as local", () => {
    expect(parseDbTarget("postgresql://user:pass@localhost:5432/mydb").isLocal).toBe(true);
  });

  it("treats 127.0.0.1 as local", () => {
    expect(parseDbTarget("postgresql://user:pass@127.0.0.1:5432/mydb").isLocal).toBe(true);
  });

  it("treats ::1 as local", () => {
    expect(parseDbTarget("postgresql://user:pass@[::1]:5432/mydb").isLocal).toBe(true);
  });
});

describe("resolveDbTargetUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers DATABASE_URL_UNPOOLED over the other two", () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgresql://u@unpooled-host/db");
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "postgresql://u@non-pooling-host/db");
    vi.stubEnv("DATABASE_URL", "postgresql://u@pooled-host/db");

    expect(resolveDbTargetUrl()).toBe("postgresql://u@unpooled-host/db");
  });

  it("falls back to POSTGRES_URL_NON_POOLING when unpooled is unset", () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "postgresql://u@non-pooling-host/db");
    vi.stubEnv("DATABASE_URL", "postgresql://u@pooled-host/db");

    expect(resolveDbTargetUrl()).toBe("postgresql://u@non-pooling-host/db");
  });

  it("falls back to DATABASE_URL when neither unpooled var is set", () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
    vi.stubEnv("POSTGRES_URL_NON_POOLING", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://u@pooled-host/db");

    expect(resolveDbTargetUrl()).toBe("postgresql://u@pooled-host/db");
  });

  it("throws when nothing is set", () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
    vi.stubEnv("POSTGRES_URL_NON_POOLING", undefined);
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => resolveDbTargetUrl()).toThrow("Missing required env var: DATABASE_URL");
  });
});

describe("resolveDbTarget", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves and parses the effective target in one step", () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
    vi.stubEnv("POSTGRES_URL_NON_POOLING", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://u@some-host.neon.tech/somedb");

    const target = resolveDbTarget();
    expect(target.host).toBe("some-host.neon.tech");
    expect(target.database).toBe("somedb");
    expect(target.isLocal).toBe(false);
  });
});

describe("checkDbTargetGuard", () => {
  const localTarget = parseDbTarget("postgresql://u@localhost:5432/devdb");
  const remoteTarget = parseDbTarget("postgresql://u@remote-host.neon.tech/proddb");

  it("allows local targets unconditionally", () => {
    expect(checkDbTargetGuard(localTarget, undefined).allowed).toBe(true);
  });

  it("allows local targets even with no confirm token at all", () => {
    expect(checkDbTargetGuard(localTarget).allowed).toBe(true);
  });

  it("refuses remote targets when no confirm token is set", () => {
    expect(checkDbTargetGuard(remoteTarget, undefined).allowed).toBe(false);
  });

  it("refuses remote targets when the confirm token doesn't match the host", () => {
    expect(checkDbTargetGuard(remoteTarget, "some-other-host.neon.tech").allowed).toBe(false);
  });

  it("allows remote targets when the confirm token matches the resolved host exactly", () => {
    expect(checkDbTargetGuard(remoteTarget, "remote-host.neon.tech").allowed).toBe(true);
  });
});

describe("confirmCommandFor", () => {
  it("prints the exact confirm command including the resolved host", () => {
    const target = parseDbTarget("postgresql://u@remote-host.neon.tech/proddb");
    expect(confirmCommandFor(target, "db:migrate")).toBe(
      "DB_TARGET_CONFIRM_HOST=remote-host.neon.tech npm run db:migrate",
    );
  });
});

describe("loadDbTargetEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("makes envFile the sole source of truth, ignoring an ambient var it doesn't define", () => {
    // Reproduces the real bug found in db:migrate:test: .env.test.local only
    // defines DATABASE_URL (no DATABASE_URL_UNPOOLED). A plain
    // config({ override: true }) only overrides keys the file actually
    // contains, so an ambient DATABASE_URL_UNPOOLED left over from the shell
    // (pointing at a completely different database, host A) would survive
    // and win over the file's DATABASE_URL (host B) via resolution order.
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgresql://u@host-a-dev.example.com/dba");
    vi.stubEnv("POSTGRES_URL_NON_POOLING", undefined);
    vi.stubEnv("DATABASE_URL", undefined);

    const dir = mkdtempSync(path.join(tmpdir(), "db-target-test-"));
    const envFile = path.join(dir, ".env.fake-test-local");
    try {
      writeFileSync(envFile, "DATABASE_URL=postgresql://u@host-b-test.example.com/dbb\n");

      loadDbTargetEnv(envFile);
      const target = resolveDbTarget();

      expect(target.host).toBe("host-b-test.example.com");
      expect(target.database).toBe("dbb");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still lets the env file override an ambient var for a key it DOES define", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u@ambient-host.example.com/ambientdb");

    const dir = mkdtempSync(path.join(tmpdir(), "db-target-test-"));
    const envFile = path.join(dir, ".env.fake");
    try {
      writeFileSync(envFile, "DATABASE_URL=postgresql://u@file-host.example.com/filedb\n");

      loadDbTargetEnv(envFile);

      expect(process.env.DATABASE_URL).toBe("postgresql://u@file-host.example.com/filedb");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
