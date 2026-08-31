// @vitest-environment jsdom
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AnnotationLayer, PinCard } from "@/app/v/[voterId]/annotation-layer";
import type { VariationComment } from "@/db/queries";

// This project's vitest config sets `globals: false`, so @testing-library/react's
// implicit auto-cleanup (which detects a global `afterEach`) never registers.
// Clean up mounted components explicitly between tests to keep them isolated.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrollIntoView — annotation-layer.tsx's own pin
// wrapper ref calls it whenever a pin is selected (unrelated to this hover
// preview, but the "already selected" case below exercises that same ref
// callback), so stub it the same way any test touching a selected pin needs
// to.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

function makeComment(overrides: Partial<VariationComment> = {}): VariationComment {
  return {
    id: "c1",
    comment: "Looks great here",
    voterName: "Alex",
    createdAt: new Date(),
    direction: null,
    isOwn: false,
    anchorType: "point",
    selector: null,
    offsetX: 0.5,
    offsetY: 0.5,
    status: "open",
    seq: 1,
    ...overrides,
  };
}

// Direct-render coverage for `PinCard` in `mode: "preview"`: jsdom +
// react-aria pointer hover (`onHoverStart`/`onHoverEnd`) is unreliable to
// drive end-to-end in tests, so this asserts the preview's own rendering —
// the same `PinCardBody` markup `mode: "expanded"` uses — independent of the
// hover/focus wiring that decides *when* it mounts (covered below via focus,
// which jsdom handles reliably unlike synthetic pointer hover). The
// `canManage`/`onClose`/`onToggleStatus`/`onRequestDelete` props are required
// by `PinCard`'s signature but are no-ops here: `mode: "preview"` never
// renders the header bar that would use them.
describe("PinCard (mode: preview)", () => {
  it("renders the author label and full comment text, non-interactively, with no header actions", () => {
    const containerRef = { current: null };
    const { container } = render(
      <PinCard
        comment={makeComment()}
        pinX={100}
        pinY={100}
        containerRef={containerRef}
        mode="preview"
        canManage={true}
        onClose={() => {}}
        onToggleStatus={() => {}}
        onRequestDelete={() => {}}
      />
    );
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Looks great here")).toBeInTheDocument();
    // Must never intercept the click that opens the real (expanded) card, and
    // is aria-hidden since the pin's own aria-label already carries this text.
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("pointer-events-none");
    expect(root).toHaveAttribute("aria-hidden", "true");
    // Locks in the mode split: preview never renders the header action bar
    // (Close/Complete/Delete), even when `canManage` is true — only
    // `mode: "expanded"` does.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close comment" })).not.toBeInTheDocument();
  });
});

// A minimal host that gives AnnotationLayer a real containerRef/imgRef pair —
// `mediaKind: "image"` pins are positioned purely off `imgRef`'s (jsdom-
// stubbed-to-zero, but present) getBoundingClientRect, so no layout mocking
// is needed for the position-recompute rAF loop to place `c1` on the stage.
function Harness({ comments, selectedPinId }: { comments: VariationComment[]; selectedPinId?: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- test harness needs a plain DOM <img> ref for AnnotationLayer's imgRef prop, not an optimized page image. */}
      <img ref={imgRef} alt="" />
      <AnnotationLayer
        variationId="v1"
        comments={comments}
        mediaKind="image"
        containerRef={containerRef}
        imgRef={imgRef}
        commentMode={false}
        voterId="voter1"
        voterName=""
        onVoterNameChange={() => {}}
        onCommentSubmit={() => {}}
        selectedPinId={selectedPinId}
        onSelectPin={() => {}}
      />
    </div>
  );
}

// Layer-level coverage of the hover/focus wiring: keyboard focus (unlike
// pointer hover) is reliable to simulate in jsdom via a plain `focus` event,
// and per the KEV-172 follow-up spec, focus shows the preview immediately
// (no 300ms open-delay) — so no fake timers/waiting on a timeout are needed
// here either.
describe("AnnotationLayer hover/focus preview", () => {
  // `PinCard`'s (`mode: "expanded"`) header icons (e.g. the Close button's
  // `<X>`) are themselves `aria-hidden="true"`, so a bare
  // `[aria-hidden="true"]` query would false-positive once that card is on
  // screen. A `mode: "preview"` `PinCard`'s own root div is the only element
  // combining `aria-hidden="true"` with its `pointer-events-none` preview
  // styling — target that combination specifically so these assertions can't
  // be fooled by the expanded card's unrelated aria-hidden icons.
  const hoverCardSelector = 'div.pointer-events-none[aria-hidden="true"]';

  it("shows the hover preview card when a pin receives keyboard focus", async () => {
    // React's onFocus is implemented via native `focusin` bubbling (not
    // `focus`, which doesn't bubble) — calling the real `.focus()` (which
    // jsdom fires both events for) reaches it reliably, unlike
    // `fireEvent.focus`, which only dispatches the non-bubbling `focus`
    // event and never triggers React's handler.
    const { container } = render(<Harness comments={[makeComment()]} />);
    const pin = await screen.findByRole("button", { name: /Comment by Alex: Looks great here/ });
    pin.focus();
    await waitFor(() => {
      expect(container.querySelector(hoverCardSelector)).toBeTruthy();
    });
  });

  it("does not show the hover preview for the pin that is already selected", async () => {
    // Mirrors the old Tooltip's `isDisabled={isSelected}` suppression: when
    // the focused/hovered pin is also the selected one, the expanded
    // `PinCard` (`mode: "expanded"`) is already showing this exact content
    // in this exact spot, so the (aria-hidden, non-interactive) preview must
    // not also mount on top of it. The selected pin's card is the expanded
    // one (dialog + header actions), never a preview.
    const { container } = render(<Harness comments={[makeComment()]} selectedPinId="c1" />);
    const pin = await screen.findByRole("button", { name: /Comment by Alex: Looks great here/ });
    pin.focus();
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(container.querySelector(hoverCardSelector)).toBeNull();
    // Locks in the mode split at the layer level too: the selected pin's
    // card renders the header action bar (Close is always present).
    expect(screen.getByRole("button", { name: "Close comment" })).toBeInTheDocument();
  });
});
