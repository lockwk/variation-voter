import { describe, expect, it } from "vitest";
import { contentTypeFor } from "@/lib/storage/mime";

describe("contentTypeFor", () => {
  it("returns application/wasm for .wasm", () => {
    expect(contentTypeFor("assets/module.wasm")).toBe("application/wasm");
  });

  it("returns font/otf for .otf", () => {
    expect(contentTypeFor("assets/font.otf")).toBe("font/otf");
  });

  it("is case-insensitive for extensions", () => {
    expect(contentTypeFor("assets/MODULE.WASM")).toBe("application/wasm");
    expect(contentTypeFor("assets/FONT.OTF")).toBe("font/otf");
    expect(contentTypeFor("index.HTML")).toBe("text/html; charset=utf-8");
  });

  it("returns a known type for common extensions", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("assets/app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("assets/logo.png")).toBe("image/png");
  });

  it("falls back to application/octet-stream for an unknown extension", () => {
    expect(contentTypeFor("assets/data.xyz")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream when there is no extension", () => {
    expect(contentTypeFor("LICENSE")).toBe("application/octet-stream");
  });
});
