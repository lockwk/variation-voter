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
