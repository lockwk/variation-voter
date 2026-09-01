import { describe, expect, it } from "vitest";
import { placeCardLeft } from "@/app/v/[voterId]/annotation-layer";

// KEV-172 follow-up: PinCard (mode: "expanded") now sits BESIDE its pin (left-anchored)
// instead of horizontally centered above/below it. `placeCardLeft` is the
// pure placement helper — CARD_WIDTH=304 (widened for the KEV-185 card
// redesign), PIN_RADIUS=16, CARD_GAP=12, CARD_GUTTER=8 are baked into these
// expected numbers; see the constants next to the function in
// annotation-layer.tsx if they ever change.
describe("placeCardLeft", () => {
  it("places the card to the right of a pin in the left half of the stage", () => {
    // pinX=100, containerWidth=1000 → left half, so card goes right of the
    // pin: 100 + 16 (PIN_RADIUS) + 12 (CARD_GAP) = 128.
    expect(placeCardLeft(100, 1000)).toBe(128);
  });

  it("places the card to the left of a pin in the right half of the stage", () => {
    // pinX=900, containerWidth=1000 → right half, so card goes left of the
    // pin: 900 - 16 - 12 - 304 (CARD_WIDTH) = 568.
    expect(placeCardLeft(900, 1000)).toBe(568);
  });

  it("falls back within the stage bounds when the preferred side would overflow", () => {
    // pinX=100 is in the left half of a 350px-wide stage, so the preferred
    // side is right — but 100 + 16 + 12 + 304 = 432 runs well past the
    // stage's right gutter (350 - 8 = 342). The (equally cramped) left side
    // doesn't fit either, so the result is pulled back to the widest
    // in-bounds position instead of hanging the card off the stage's edge.
    const result = placeCardLeft(100, 350);
    expect(result).toBe(350 - 304 - 8); // 38 — clamped to the right-hand gutter
    expect(result + 304).toBeLessThanOrEqual(350 - 8);
  });

  it("clamps into the stage bounds when the container is narrower than the card itself", () => {
    // A 200px-wide stage can't fit a 304px card with gutters on either side
    // at all (containerWidth - CARD_WIDTH - CARD_GUTTER goes negative), so
    // the function gives up on centering/preferring a side and just
    // left-aligns to the gutter instead of returning a negative/off-stage edge.
    expect(placeCardLeft(100, 200)).toBe(8);
  });

  it("places the card off the pin's raw x when the container hasn't been measured yet", () => {
    // containerWidth is undefined before the first measurement effect runs —
    // fall back to a right-side placement off pinX alone.
    expect(placeCardLeft(500, undefined)).toBe(500 + 16 + 12);
  });

  // PinCard's preview mode shares this exact helper — via
  // `usePinCardPlacement` — so it lands in the same spot as the expanded
  // mode. It passes its own width explicitly rather than relying on the
  // default, so these cases exercise the `cardWidth` param directly.
  describe("with an explicit cardWidth", () => {
    it("matches the default-width result when passed the same value explicitly", () => {
      expect(placeCardLeft(100, 1000, 304)).toBe(placeCardLeft(100, 1000));
    });

    it("uses a narrower card's width instead of the default when computing the left-side fallback", () => {
      // pinX=900, containerWidth=1000 → right half, left of the pin:
      // 900 - 16 - 12 - 160 (custom cardWidth) = 712, distinct from the
      // 288-wide default's 584.
      expect(placeCardLeft(900, 1000, 160)).toBe(712);
    });
  });
});
