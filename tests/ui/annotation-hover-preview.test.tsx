// @vitest-environment jsdom
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    parentCommentId: null,
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
        replies={[]}
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
    // KEV-183: preview mode never renders the reply composer either.
    expect(screen.queryByLabelText(/^reply$/i)).not.toBeInTheDocument();
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

// KEV-183: the expanded PinCard's always-present reply composer. Rendered
// directly (not through AnnotationLayer) the same way the "PinCard (mode:
// preview)" describe block above does — these assertions are about the
// composer's own behavior, independent of pin placement/selection wiring.
describe("PinCard (mode: expanded) reply composer", () => {
  function renderExpanded(
    overrides: { replies?: VariationComment[]; onReplySubmit?: (text: string) => Promise<boolean>; canManage?: boolean } = {}
  ) {
    const containerRef = { current: null };
    return render(
      <PinCard
        comment={makeComment()}
        replies={overrides.replies ?? []}
        pinX={100}
        pinY={100}
        containerRef={containerRef}
        mode="expanded"
        canManage={overrides.canManage ?? true}
        onClose={() => {}}
        onToggleStatus={() => {}}
        onRequestDelete={() => {}}
        onReplySubmit={overrides.onReplySubmit ?? (async () => true)}
      />
    );
  }

  // KEV-183: an archived voter is read-only for every viewer, so the reply
  // composer is gated on `canManage` — same lockout as new-pin creation and
  // the Complete/Delete actions. Pins stay openable when archived, but the
  // Reply box must not appear (every submit would 403 server-side).
  it("does not render the reply composer when the voter is archived (canManage false)", () => {
    renderExpanded({ canManage: false });
    expect(screen.queryByLabelText(/^reply$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^send reply$/i)).not.toBeInTheDocument();
  });

  // KEV-183 core requirement: the reply box autofocuses as soon as the card
  // opens, with no extra click needed.
  it("autofocuses the reply textarea when the card opens", async () => {
    renderExpanded();
    const textarea = await screen.findByLabelText(/^reply$/i);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it("renders the reply thread beneath the root entry, oldest first", () => {
    renderExpanded({
      replies: [
        makeComment({ id: "r1", comment: "first reply", voterName: "Sam", parentCommentId: "c1" }),
        makeComment({ id: "r2", comment: "second reply", voterName: "Robin", parentCommentId: "c1" }),
      ],
    });
    expect(screen.getByText("Looks great here")).toBeInTheDocument();
    expect(screen.getByText("first reply")).toBeInTheDocument();
    expect(screen.getByText("second reply")).toBeInTheDocument();
  });

  it("disables Send while the reply textarea is empty", () => {
    renderExpanded();
    expect(screen.getByLabelText(/^send reply$/i)).toBeDisabled();
  });

  // KEV-183 follow-up: the textarea used to snap from the browser's default
  // empty `rows={1}` height down to its settled `scrollHeight` on the FIRST
  // keystroke's `onChange` → `resize()`, visibly collapsing the card by that
  // ~1px difference right as someone started typing. The fix runs `resize()`
  // once on mount (alongside the existing autofocus effect) so the height is
  // already settled before any keystroke. jsdom can't measure real pixel
  // heights (`scrollHeight` is always 0 there), so this can't assert an
  // actual pixel value — it instead asserts the mechanism: `resize()` (via
  // its `el.style.height` side effect) has already run by the time the
  // textarea mounts, with zero keystrokes typed.
  it("settles the reply textarea's height on mount, before any keystroke", async () => {
    renderExpanded();
    const textarea = await screen.findByLabelText(/^reply$/i);
    // Before the fix, `style.height` is never touched until the first
    // `onChange` fires — it would still be "" here. After the fix,
    // `resize()` has already run once on mount, setting it (jsdom's
    // scrollHeight is 0, so the settled value is "0px").
    expect(textarea).toHaveStyle({ height: "0px" });
  });

  // Part of the same 1px-collapse fix: the placeholder used to render at a
  // smaller `text-xs` (12px) than typed text (`text-[13px]`), so the two
  // states weren't pixel-identical. The placeholder now inherits the
  // textarea's own 13px so nothing shifts vertically when typing replaces it.
  it("renders the reply placeholder at the same size as typed text (no separate text-xs override)", async () => {
    renderExpanded();
    const textarea = await screen.findByLabelText(/^reply$/i);
    expect(textarea.className).not.toMatch(/placeholder:text-xs\b/);
    expect(textarea.className).toContain("text-[13px]");
  });

  it("submits the trimmed reply text on Send and clears the textarea once it resolves", async () => {
    const user = userEvent.setup();
    const onReplySubmit = vi.fn().mockResolvedValue(true);
    renderExpanded({ onReplySubmit });

    const textarea = screen.getByLabelText(/^reply$/i);
    await user.type(textarea, "  a new reply  ");
    await user.click(screen.getByLabelText(/^send reply$/i));

    expect(onReplySubmit).toHaveBeenCalledWith("a new reply");
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("submits on Enter (not Shift+Enter, which inserts a newline instead)", async () => {
    const user = userEvent.setup();
    const onReplySubmit = vi.fn().mockResolvedValue(true);
    renderExpanded({ onReplySubmit });

    const textarea = screen.getByLabelText(/^reply$/i);
    await user.type(textarea, "shift{Shift>}{Enter}{/Shift}line two");
    expect(onReplySubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("shift\nline two");

    await user.type(textarea, "{Enter}");
    expect(onReplySubmit).toHaveBeenCalledWith("shift\nline two");
  });

  it("keeps the typed text in place when the reply POST fails", async () => {
    const user = userEvent.setup();
    const onReplySubmit = vi.fn().mockResolvedValue(false);
    renderExpanded({ onReplySubmit });

    const textarea = screen.getByLabelText(/^reply$/i);
    await user.type(textarea, "will fail");
    await user.click(screen.getByLabelText(/^send reply$/i));

    expect(onReplySubmit).toHaveBeenCalledWith("will fail");
    await waitFor(() => expect(screen.getByLabelText(/^send reply$/i)).not.toBeDisabled());
    expect(textarea).toHaveValue("will fail");
  });
});

// KEV-183 follow-up: Delete moved out of the ••• overflow menu (which is
// gone entirely) and back to a direct icon button, alongside Complete/Reopen
// and Close.
describe("PinCard (mode: expanded) header actions", () => {
  it("requests delete confirmation via the direct Delete button (no menu needed)", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    const containerRef = { current: null };
    render(
      <PinCard
        comment={makeComment()}
        replies={[]}
        pinX={100}
        pinY={100}
        containerRef={containerRef}
        mode="expanded"
        canManage={true}
        onClose={() => {}}
        onToggleStatus={() => {}}
        onRequestDelete={onRequestDelete}
        onReplySubmit={async () => true}
      />
    );

    // The ••• overflow menu is gone entirely.
    expect(screen.queryByLabelText(/^more actions$/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^delete comment$/i));

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it("marks the comment complete via the direct Complete button (no menu needed)", async () => {
    const user = userEvent.setup();
    const onToggleStatus = vi.fn();
    const containerRef = { current: null };
    render(
      <PinCard
        comment={makeComment({ status: "open" })}
        replies={[]}
        pinX={100}
        pinY={100}
        containerRef={containerRef}
        mode="expanded"
        canManage={true}
        onClose={() => {}}
        onToggleStatus={onToggleStatus}
        onRequestDelete={() => {}}
        onReplySubmit={async () => true}
      />
    );

    await user.click(screen.getByLabelText(/mark comment complete/i));
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
  });
});
