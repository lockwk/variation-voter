// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { computeOffsetFraction, computeSelector } from "@/app/v/[voterId]/annotation-layer";

describe("computeSelector", () => {
  it("prefers a unique #id and stops the walk there", () => {
    document.body.innerHTML = `
      <div class="wrapper">
        <button id="save-btn" class="btn primary">Save</button>
      </div>
    `;
    const el = document.getElementById("save-btn")!;
    expect(computeSelector(el)).toBe("#save-btn");
  });

  it("ignores a non-unique id and falls back to tag + stable classes", () => {
    document.body.innerHTML = `
      <div>
        <span id="dup" class="label">A</span>
        <span id="dup" class="label">B</span>
      </div>
    `;
    const [first] = document.querySelectorAll("#dup");
    // Two nodes share the id, so it isn't safe to use as a unique selector —
    // the walk should fall through to a tag/class/nth-of-type path instead.
    expect(computeSelector(first)).not.toBe("#dup");
    expect(computeSelector(first)).toContain("span");
  });

  it("adds :nth-of-type when siblings share a tag with no distinguishing class", () => {
    document.body.innerHTML = `
      <ul class="list">
        <li>One</li>
        <li>Two</li>
        <li>Three</li>
      </ul>
    `;
    const items = document.querySelectorAll("li");
    const selector = computeSelector(items[1]);
    expect(selector).toContain("li:nth-of-type(2)");
    // The computed selector should actually re-resolve to the same element.
    expect(document.querySelector(selector)).toBe(items[1]);
  });

  it("skips classes that would need CSS escaping (hashed/dynamic-looking classes)", () => {
    document.body.innerHTML = `<div class="css-1a2b3c hover:bg-red-500 stable">Content</div>`;
    const el = document.querySelector("div")!;
    const selector = computeSelector(el);
    expect(selector).not.toContain("hover:bg-red-500");
    expect(selector).toContain("stable");
  });

  it("produces a selector that resolves back to the original element via querySelector", () => {
    document.body.innerHTML = `
      <main>
        <section class="card">
          <p class="body">First</p>
        </section>
        <section class="card">
          <p class="body">Second</p>
        </section>
      </main>
    `;
    const target = document.querySelectorAll("p.body")[1];
    const selector = computeSelector(target);
    expect(document.querySelector(selector)).toBe(target);
  });
});

// KEV-172: embed variations render in this document (no iframe boundary), so
// their selectors are scoped to the embed's own container element via
// `computeSelector`'s optional `root` param — the walk stops at (and
// excludes) `root` rather than always walking up to <body>/<html>, and a
// unique-#id check is scoped to `root` too, so the produced selector resolves
// correctly via `root.querySelector(selector)` and never reaches outside the
// embed into the rest of the page.
describe("computeSelector with a scoping root (embed variations)", () => {
  it("stops the walk at the given root instead of walking up to <body>", () => {
    document.body.innerHTML = `
      <div class="page-chrome">
        <div id="embed-root">
          <section class="card">
            <button class="cta">Click me</button>
          </section>
        </div>
      </div>
    `;
    const root = document.getElementById("embed-root")!;
    const target = root.querySelector(".cta")!;
    const selector = computeSelector(target, root);
    expect(selector).not.toContain("page-chrome");
    expect(selector).not.toContain("embed-root");
    expect(root.querySelector(selector)).toBe(target);
  });

  it("scopes a unique-#id check to the root, not the whole document", () => {
    // "save-btn" is unique *within* the embed root but also happens to
    // collide with an id elsewhere on the page — root-scoped uniqueness
    // should still treat it as safe to use.
    document.body.innerHTML = `
      <div id="embed-root">
        <button id="save-btn">Save</button>
      </div>
      <div id="save-btn">Unrelated page element sharing the id</div>
    `;
    const root = document.getElementById("embed-root")!;
    const target = root.querySelector("#save-btn")!;
    const selector = computeSelector(target, root);
    expect(root.querySelector(selector)).toBe(target);
  });
});

describe("computeOffsetFraction", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it("computes the fractional position of a click within the box", () => {
    expect(computeOffsetFraction(rect, 200, 100)).toEqual({ offsetX: 0.5, offsetY: 0.5 });
  });

  it("clamps a click before the box's origin to 0", () => {
    expect(computeOffsetFraction(rect, 0, 0)).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("clamps a click past the box's far edge to 1", () => {
    expect(computeOffsetFraction(rect, 1000, 1000)).toEqual({ offsetX: 1, offsetY: 1 });
  });

  it("returns 0 for a degenerate (zero-size) box instead of NaN", () => {
    expect(computeOffsetFraction({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({
      offsetX: 0,
      offsetY: 0,
    });
  });
});
