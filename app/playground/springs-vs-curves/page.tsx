"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { cx } from "@/utils/cx";
import { PinCard } from "@/app/v/[voterId]/annotation-layer";
import type { VariationComment } from "@/db/queries";

/**
 * Side-by-side A/B of the pinned-comment card's minimized (hover preview) →
 * expanded (clicked) morph, reusing the REAL `PinCard` component from
 * annotation-layer.tsx — not a replica. That transition is a CSS transition,
 * not a Motion spring: both hardcoded `ease-[cubic-bezier(0.19,1,0.22,1)]`
 * occurrences (the expanded container + the header action bar) now go
 * through `PinCard`'s optional `expandEaseClass` prop. The left panel omits
 * it (so `PinCard` uses its default, `--ease-out-expo` — exactly what the
 * real voter UI renders today); the right panel passes
 * `expandEaseClass="ease-out-quad"` to swap only that one curve. Every other
 * class, duration, and delay is untouched.
 */

const COMMENT_TEXT = "Can we tighten the spacing between the price and the CTA? Feels a little loose right now.";

function makeComment(overrides: Partial<VariationComment>): VariationComment {
  return {
    id: "demo",
    comment: COMMENT_TEXT,
    voterName: "Priya",
    createdAt: new Date(),
    direction: null,
    isOwn: true,
    anchorType: "point",
    selector: null,
    offsetX: 0.5,
    offsetY: 0.5,
    status: "open",
    seq: 1,
    ...overrides,
  };
}

export default function SpringsVsCurvesPage() {
  // Bumping this remounts both panels (via their `key` below), which resets
  // every panel's local state back to its initial minimized (pin-only, no
  // card) starting point — simpler and more certainly complete than manually
  // resetting each of preview/expanded/dismissed one at a time.
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-secondary px-6 py-4">
        <div>
          <h1 className="text-sm font-semibold text-primary">Pin card morph: ease-out-expo vs ease-out-quad</h1>
          <p className="text-xs text-tertiary">
            The real PinCard component (annotation-layer.tsx) — hover a pin for the minimized preview, click it to
            expand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReplayKey((key) => key + 1)}
          className="ml-auto rounded-full border border-secondary bg-primary px-3 py-1 text-xs font-medium text-secondary hover:text-primary"
        >
          Replay
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <Panel key={`left-${replayKey}`} label="As today — ease-out-expo" pinSeed={{ id: "left-c1", seq: 1 }} />
        <div className="w-px shrink-0 bg-secondary" />
        <Panel
          key={`right-${replayKey}`}
          label="Swapped — ease-out-quad"
          pinSeed={{ id: "right-c1", seq: 2 }}
          expandEaseClass="ease-out-quad"
        />
      </div>
    </div>
  );
}

function Panel({
  label,
  pinSeed,
  expandEaseClass,
}: {
  label: string;
  pinSeed: Partial<VariationComment>;
  /** Forwarded straight through to `PinCard` — left omits this so `PinCard`
   * falls back to its own default (`--ease-out-expo`); right passes
   * `"ease-out-quad"`. */
  expandEaseClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [comment, setComment] = useState<VariationComment>(() => makeComment(pinSeed));
  // Mirrors AnnotationLayer's own two pieces of state driving a pin's card:
  // `selected` (sticky, click-driven — PinCard's `mode: "expanded"`) and
  // `hovered` (transient, hover/focus-driven — `mode: "preview"`), suppressed
  // while selected so the two never both try to render at once. `dismissed`
  // stands in for AnnotationLayer's onRequestDeleteComment→delete flow (KEV-172
  // routes that through a shared confirm modal that doesn't exist on this
  // page), scoped locally to just this panel's demo pin.
  const [selected, setSelected] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Same hover-open-delay pattern as AnnotationLayer's startHoverPreview/
  // cancelHoverPreview (300ms, matching the old Tooltip's `delay={300}`) —
  // keyboard focus below bypasses it, since arriving via Tab is always an
  // intentional stop.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  function startHoverPreview() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setHovered(true);
    }, 300);
  }
  function cancelHoverPreview() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(false);
  }

  const mode: "preview" | "expanded" | null = dismissed ? null : selected ? "expanded" : hovered ? "preview" : null;
  const pinX = 160;
  const pinY = 140;

  return (
    <div className="relative flex flex-1 flex-col gap-4 overflow-auto bg-secondary p-10">
      <span className="text-xs font-medium text-tertiary">{label}</span>
      {/* The positioned, sized container PinCard's placement hook measures
          against — same role containerRef plays for the real stage in
          voter-shell.tsx. */}
      <div ref={containerRef} className="relative h-96 w-full max-w-md rounded-lg border border-dashed border-secondary">
        {!dismissed && (
          // Same marker visual as AnnotationLayer's real pin Button (~line
          // 687): size-6 rounded-full border/bg/text/shadow, plus its
          // selected-state scale + ring. Hover/focus drive the preview,
          // press toggles the sticky expanded selection — same wiring as the
          // real marker.
          <Button
            aria-label={selected ? "Collapse comment" : `Comment by ${comment.voterName}: ${comment.comment}`}
            aria-pressed={selected}
            onPress={() => setSelected((value) => !value)}
            onHoverStart={startHoverPreview}
            onHoverEnd={cancelHoverPreview}
            onFocus={() => {
              if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
              }
              setHovered(true);
            }}
            onBlur={cancelHoverPreview}
            style={{ left: pinX, top: pinY }}
            className={cx(
              "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#212121] bg-[#FACC15] text-[10px] font-semibold text-[#212121] shadow-md transition-[box-shadow,transform] duration-300",
              selected && "scale-125 shadow-[0_0_0_4px_#FACC1580]"
            )}
          >
            {comment.seq}
          </Button>
        )}

        {mode && (
          <PinCard
            comment={comment}
            pinX={pinX}
            pinY={pinY}
            containerRef={containerRef}
            mode={mode}
            canManage={true}
            onClose={() => setSelected(false)}
            onToggleStatus={() => setComment((c) => ({ ...c, status: c.status === "open" ? "complete" : "open" }))}
            onRequestDelete={() => setDismissed(true)}
            expandEaseClass={expandEaseClass}
          />
        )}
      </div>
    </div>
  );
}
