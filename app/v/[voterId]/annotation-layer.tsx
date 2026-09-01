"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ArrowUp, CheckCircle, RefreshCcw01, Trash01, X } from "@untitledui/icons";
import { motion } from "motion/react";
import { Button } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import type { Comment, CommentAnchorInput, VariationComment } from "@/db/queries";

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function cssEscapeIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  // Fallback for environments without CSS.escape (older browsers, jsdom in
  // some configs) — escape anything that isn't a plain identifier char.
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function isUniqueId(el: Element, root?: Element | null): boolean {
  const scope: Element | Document = root ?? el.ownerDocument;
  try {
    return scope.querySelectorAll(`#${cssEscapeIdentifier(el.id)}`).length === 1;
  } catch {
    return false;
  }
}

/**
 * Builds a reasonably-stable, reasonably-unique CSS selector for `el` by
 * walking up its ancestors: a unique `#id` stops the walk immediately;
 * otherwise each ancestor contributes its tag name, up to two "stable"
 * class names (plain identifiers only — classes with characters that'd need
 * escaping tend to be hashed/dynamic utility classes, which are worse than
 * useless for re-resolving later), and an `:nth-of-type` index when it has
 * siblings sharing its tag.
 *
 * By default the walk stops at (and excludes) `<body>`/`<html>` — right for
 * the `app` case, where `el` lives in an iframe's own document and there's
 * nothing above `<body>` worth matching against. Pass `root` (KEV-172: the
 * embed container element, for the `embed` case, where `el` lives in *this*
 * document alongside the rest of the page) to scope both the walk's upper
 * bound and the `#id` uniqueness check to that root instead, so the produced
 * selector resolves correctly via `root.querySelector(selector)` and never
 * reaches outside the embed into the surrounding page.
 *
 * This is not a general "shortest unique selector" algorithm — it's good
 * enough to re-resolve a pin's element via `querySelector` in the common
 * case. When the DOM has changed enough that it no longer matches, the
 * caller (see AnnotationLayer's pin-position recompute) just hides that pin
 * rather than crashing.
 */
export function computeSelector(el: Element, root?: Element | null): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;

  while (node && depth < 8) {
    if (node.id && SAFE_IDENTIFIER.test(node.id) && isUniqueId(node, root)) {
      parts.unshift(`#${cssEscapeIdentifier(node.id)}`);
      break;
    }

    let part = node.tagName.toLowerCase();
    const stableClasses = Array.from(node.classList)
      .filter((c) => SAFE_IDENTIFIER.test(c))
      .slice(0, 2);
    if (stableClasses.length > 0) {
      part += stableClasses.map((c) => `.${cssEscapeIdentifier(c)}`).join("");
    }

    const parent: Element | null = node.parentElement;
    if (parent) {
      const siblingsOfSameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (siblingsOfSameTag.length > 1) {
        part += `:nth-of-type(${siblingsOfSameTag.indexOf(node) + 1})`;
      }
    }

    parts.unshift(part);

    if (!parent || parent === root || parent.tagName === "BODY" || parent.tagName === "HTML") break;
    node = parent;
    depth += 1;
  }

  return parts.join(" > ");
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Fraction of a click's position within `rect` (0–1 on each axis), clamped
 * so a click right at — or numerically just past, from subpixel rounding —
 * an element's edge still produces a valid offset the API will accept.
 */
export function computeOffsetFraction(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): { offsetX: number; offsetY: number } {
  const offsetX = rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0;
  const offsetY = rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0;
  return { offsetX, offsetY };
}

type HighlightBox = { x: number; y: number; width: number; height: number };
type DraftPin = { x: number; y: number; anchorType: "element" | "point"; selector: string | null; offsetX: number; offsetY: number };
type PinPos = { x: number; y: number };

function positionsEqual(a: Map<string, PinPos>, b: Map<string, PinPos>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, pos] of a) {
    const other = b.get(id);
    if (!other || Math.abs(other.x - pos.x) > 0.5 || Math.abs(other.y - pos.y) > 0.5) return false;
  }
  return true;
}

function pinAuthorLabel(comment: VariationComment): string {
  const trimmed = comment.voterName?.trim();
  if (comment.isOwn) return trimmed ? `${trimmed} (You)` : "You";
  return trimmed || "Anonymous";
}

/** Reads `iframe.contentWindow`/`contentDocument` behind a try/catch — same-origin
 * only for `kind === 'app'` bundles today; a future cross-origin bundle host
 * (KEV-79) would throw a SecurityError here, so every access site degrades to
 * "skip this pin / disable element anchoring" instead of crashing the stage. */
function tryGetIframeDocument(iframe: HTMLIFrameElement | null | undefined): Document | null {
  if (!iframe) return null;
  try {
    return iframe.contentDocument;
  } catch {
    return null;
  }
}

function tryGetIframeWindow(iframe: HTMLIFrameElement | null | undefined): Window | null {
  if (!iframe) return null;
  try {
    return iframe.contentWindow;
  } catch {
    return null;
  }
}

export function AnnotationLayer({
  variationId,
  comments,
  mediaKind,
  containerRef,
  iframeRef,
  imgRef,
  embedRef,
  embedReady,
  commentMode,
  voterId,
  voterStatus,
  voterName,
  onVoterNameChange,
  onCommentSubmit,
  selectedPinId,
  onSelectPin,
  onToggleCommentStatus,
  onRequestDeleteComment,
}: {
  variationId: string;
  comments: VariationComment[];
  mediaKind: "app" | "image" | "embed";
  containerRef: RefObject<HTMLDivElement | null>;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  imgRef?: RefObject<HTMLImageElement | null>;
  /** The embed's actual content root (KEV-172) — same-document, so unlike
   * `iframeRef` this is hit-tested/listened-on directly rather than through
   * `contentDocument`. Only used when `mediaKind === "embed"`. */
  embedRef?: RefObject<HTMLDivElement | null>;
  /** True once the embed's sanitized HTML has actually landed in the DOM
   * (see stage.tsx's EmbedHtml) — included in the hover/click effect's deps
   * below so it reattaches to the real content div instead of staying
   * attached to the loading placeholder it started with. */
  embedReady?: boolean;
  commentMode: boolean;
  voterId: string;
  /** Gates the expanded pin card's Complete/Reopen/Delete actions (KEV-172
   * polish pass, item 3) the same way comments-panel.tsx's own actions are
   * gated — an archived voter is read-only for every viewer, regardless of
   * who authored a given pin. */
  voterStatus?: "active" | "archived";
  voterName: string;
  onVoterNameChange: (name: string) => void;
  /** Called with the server-confirmed comment row once a new pin's POST
   * succeeds (KEV-172 chunk 4) — never a client-guessed one, so the pin's
   * frozen `seq` number is always the real one the server assigned. */
  onCommentSubmit: (variationId: string, comment: Comment) => void;
  /** The comment id most recently selected — by a click on its panel row
   * (comments-panel.tsx) or on this pin itself — so this pin can render
   * emphasized, scroll into view, and show its expanded card (KEV-172
   * polish pass, items 1 and 3). A sticky selection: it doesn't auto-clear. */
  selectedPinId?: string | null;
  /** Selects (or, if already selected, deselects) a pin — the same toggle
   * voter-shell.tsx's selectPin uses for panel row clicks, so a pin click
   * here and a row click there can never disagree about what's selected. */
  onSelectPin?: (commentId: string) => void;
  /** Reused, not duplicated, from voter-shell.tsx's mutateComment-backed
   * handlers — the same ones comments-panel.tsx's row actions call. */
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  /** Opens the shared delete-confirmation modal (voter-shell.tsx), scoped to
   * this comment — the pin card no longer confirms/deletes inline (see
   * components/application/confirm-dialog.tsx). */
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  const [highlight, setHighlight] = useState<HighlightBox | null>(null);
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, PinPos>>(new Map());
  // The pin currently showing its hover preview (`PinCard` below, in
  // `mode: "preview"`) — a separate, transient state from `selectedPinId`, which is sticky and
  // driven by clicks/panel-row selection. Only one pin previews at a time.
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  // Pointer hover opens the preview after a short delay (matching the old
  // Tooltip's `delay={300}`) so a cursor merely passing over a pin doesn't
  // flash it; keyboard focus (see the marker Button below) shows it
  // immediately instead, since focus is always an intentional stop. This ref
  // holds the pending open-timer so hover-end / unmount can cancel it before
  // it fires — a leaked timer here would otherwise pop a preview open after
  // the pointer has already moved on.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);
  function startHoverPreview(commentId: string) {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setHoveredPinId(commentId);
    }, 300);
  }
  function cancelHoverPreview(commentId: string) {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredPinId((current) => (current === commentId ? null : current));
  }
  const crossOriginWarnedRef = useRef(false);

  function warnCrossOriginOnce() {
    if (crossOriginWarnedRef.current) return;
    crossOriginWarnedRef.current = true;
    console.warn(
      "[KEV-172] Couldn't access this app variation's iframe document (likely a cross-origin bundle host — see KEV-79). Element pin placement is disabled for this variation."
    );
  }

  // Hover-highlight + click-to-place-a-pin for `app`/`embed` variations —
  // both are element-anchored (unlike `image`'s raw X/Y point), so they share
  // this one effect, branching only on where their DOM actually lives:
  //   - `app`: a same-origin iframe's own document (see tryGetIframeDocument's
  //     KEV-79 note) — listeners attach to that document, and target rects
  //     come back in the iframe's own viewport space, so `overlayOrigin()`
  //     translates them into containerRef-relative coordinates via the
  //     iframe element's own position.
  //   - `embed` (KEV-172): sanitized HTML injected straight into *this*
  //     document (see stage.tsx's EmbedHtml/`dangerouslySetInnerHTML`) — no
  //     iframe boundary, so listeners attach directly to the embed's content
  //     root (`embedRef`) and target rects are already in this document's
  //     viewport space, needing no translation beyond containerRef's own
  //     offset.
  // Attached only while comment mode is on and torn down otherwise — this
  // never touches the overlay's pointer-events, so normal interaction with
  // the app bundle / embed content is unaffected when comment mode is off.
  useEffect(() => {
    if ((mediaKind !== "app" && mediaKind !== "embed") || !commentMode) {
      setHighlight(null);
      return;
    }

    if (mediaKind === "app") {
      const iframe = iframeRef?.current;
      if (!iframe) return;

      let attachedDoc: Document | null = null;

      function overlayOrigin() {
        const iframeRect = iframe!.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        return { x: iframeRect.left - (containerRect?.left ?? 0), y: iframeRect.top - (containerRect?.top ?? 0) };
      }

      function handleMouseMove(event: MouseEvent) {
        const target = event.target as Element | null;
        if (!target || target.tagName === "HTML" || target.tagName === "BODY") {
          setHighlight(null);
          return;
        }
        const rect = target.getBoundingClientRect();
        const origin = overlayOrigin();
        setHighlight({ x: origin.x + rect.left, y: origin.y + rect.top, width: rect.width, height: rect.height });
      }

      function handleClick(event: MouseEvent) {
        const target = event.target as Element | null;
        if (!target || target.tagName === "HTML" || target.tagName === "BODY") return;
        event.preventDefault();
        event.stopPropagation();
        const rect = target.getBoundingClientRect();
        const { offsetX, offsetY } = computeOffsetFraction(rect, event.clientX, event.clientY);
        const origin = overlayOrigin();
        setDraft({
          x: origin.x + event.clientX,
          y: origin.y + event.clientY,
          anchorType: "element",
          selector: computeSelector(target),
          offsetX,
          offsetY,
        });
        setSubmitError(null);
      }

      function attach() {
        const doc = tryGetIframeDocument(iframe);
        if (!doc) {
          warnCrossOriginOnce();
          return;
        }
        attachedDoc = doc;
        doc.addEventListener("mousemove", handleMouseMove);
        doc.addEventListener("click", handleClick, true);
      }

      attach();
      // The app bundle may still be loading when comment mode is toggled on
      // (or the iframe re-navigates) — re-attach once it's ready.
      iframe.addEventListener("load", attach);

      return () => {
        iframe.removeEventListener("load", attach);
        attachedDoc?.removeEventListener("mousemove", handleMouseMove);
        attachedDoc?.removeEventListener("click", handleClick, true);
        setHighlight(null);
      };
    }

    // mediaKind === "embed"
    const container = embedRef?.current;
    if (!container) return;

    function handleMouseMove(event: MouseEvent) {
      const target = event.target as Element | null;
      // Hovering the embed root itself (its own padding, not any actual
      // content) isn't a valid pin target — computeSelector scoped to
      // `container` would produce an empty selector for it.
      if (!target || target === container) {
        setHighlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      setHighlight({
        x: rect.left - (containerRect?.left ?? 0),
        y: rect.top - (containerRect?.top ?? 0),
        width: rect.width,
        height: rect.height,
      });
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target || target === container) return;
      // Stops the embed's own links/buttons from firing while placing a
      // comment (KEV-172) — capture-phase + stopPropagation below pre-empts
      // any handler a descendant of `container` would otherwise run.
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      const { offsetX, offsetY } = computeOffsetFraction(rect, event.clientX, event.clientY);
      const containerRect = containerRef.current?.getBoundingClientRect();
      setDraft({
        x: event.clientX - (containerRect?.left ?? 0),
        y: event.clientY - (containerRect?.top ?? 0),
        anchorType: "element",
        // Scoped to the embed container, not the whole document — resolves
        // via `container.querySelector(selector)` (see the recompute effect
        // below), so it can never accidentally match something outside this
        // embed elsewhere on the page.
        selector: computeSelector(target, container),
        offsetX,
        offsetY,
      });
      setSubmitError(null);
    }

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("click", handleClick, true);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("click", handleClick, true);
      setHighlight(null);
    };
  }, [mediaKind, commentMode, iframeRef, containerRef, embedRef, embedReady]);

  // Reposition every rendered (open, anchored) pin: a rAF loop is the
  // correctness net for SPA re-renders/layout shifts the app bundle causes
  // without ever telling us, coalesced to one recompute per frame; the
  // scroll/resize listeners just make it visually instant for those
  // specific, common triggers.
  useEffect(() => {
    const hasRenderablePins = comments.some(
      (c) =>
        c.status === "open" &&
        ((c.anchorType === "element" && !!c.selector) ||
          (c.anchorType === "point" && c.offsetX != null && c.offsetY != null))
    );
    if (!hasRenderablePins) {
      setPositions(new Map());
      return;
    }

    function recompute() {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const next = new Map<string, PinPos>();

      for (const c of comments) {
        if (c.status !== "open") continue;

        if (c.anchorType === "element") {
          if (!c.selector) continue;

          if (mediaKind === "app") {
            const doc = tryGetIframeDocument(iframeRef?.current);
            if (!doc) continue;
            let el: Element | null = null;
            try {
              el = doc.querySelector(c.selector);
            } catch {
              el = null; // malformed selector — hide gracefully.
            }
            if (!el) continue; // stale selector (DOM changed since the pin was placed).
            const iframeRect = iframeRef!.current!.getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            const ox = c.offsetX ?? 0;
            const oy = c.offsetY ?? 0;
            next.set(c.id, {
              x: iframeRect.left - containerRect.left + rect.left + ox * rect.width,
              y: iframeRect.top - containerRect.top + rect.top + oy * rect.height,
            });
          } else if (mediaKind === "embed") {
            const embedContainer = embedRef?.current;
            if (!embedContainer) continue;
            let el: Element | null = null;
            try {
              el = embedContainer.querySelector(c.selector);
            } catch {
              el = null; // malformed selector — hide gracefully.
            }
            if (!el) continue; // stale selector (DOM changed since the pin was placed).
            const rect = el.getBoundingClientRect();
            const ox = c.offsetX ?? 0;
            const oy = c.offsetY ?? 0;
            // No iframe boundary to translate through (KEV-172) — `rect` is
            // already in this document's viewport space, same as
            // `containerRect`.
            next.set(c.id, {
              x: rect.left - containerRect.left + ox * rect.width,
              y: rect.top - containerRect.top + oy * rect.height,
            });
          }
          // `image` never produces element-anchored pins — nothing to do here.
        } else {
          if (c.offsetX == null || c.offsetY == null) continue;
          const mediaEl = mediaKind === "image" ? imgRef?.current : iframeRef?.current;
          if (!mediaEl) continue;
          const rect = mediaEl.getBoundingClientRect();
          next.set(c.id, {
            x: rect.left - containerRect.left + c.offsetX * rect.width,
            y: rect.top - containerRect.top + c.offsetY * rect.height,
          });
        }
      }

      setPositions((prev) => (positionsEqual(prev, next) ? prev : next));
    }

    let rafId = requestAnimationFrame(function loop() {
      recompute();
      rafId = requestAnimationFrame(loop);
    });

    window.addEventListener("resize", recompute);
    const iframeWindow = mediaKind === "app" ? tryGetIframeWindow(iframeRef?.current) : null;
    iframeWindow?.addEventListener("scroll", recompute);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    if (resizeObserver) {
      if (containerRef.current) resizeObserver.observe(containerRef.current);
      if (mediaKind === "app" && iframeRef?.current) resizeObserver.observe(iframeRef.current);
      if (mediaKind === "image" && imgRef?.current) resizeObserver.observe(imgRef.current);
      // Embed content is static HTML (no internal scroll/navigation the way
      // an app bundle or iframe can have) — a ResizeObserver on its content
      // root, plus the rAF loop's per-frame recompute, is enough to stay
      // correct without a scroll listener's added complexity (KEV-172).
      if (mediaKind === "embed" && embedRef?.current) resizeObserver.observe(embedRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", recompute);
      iframeWindow?.removeEventListener("scroll", recompute);
      resizeObserver?.disconnect();
    };
  }, [comments, mediaKind, containerRef, iframeRef, imgRef, embedRef]);

  function handleImageClick(event: React.MouseEvent<HTMLDivElement>) {
    const img = imgRef?.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const rect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const { offsetX, offsetY } = computeOffsetFraction(rect, event.clientX, event.clientY);
    setDraft({
      x: event.clientX - containerRect.left,
      y: event.clientY - containerRect.top,
      anchorType: "point",
      selector: null,
      offsetX,
      offsetY,
    });
    setSubmitError(null);
  }

  async function submitDraft(commentText: string) {
    if (!draft) return;
    const anchor: CommentAnchorInput = {
      anchorType: draft.anchorType,
      selector: draft.selector,
      offsetX: draft.offsetX,
      offsetY: draft.offsetY,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/voters/${voterId}/variations/${variationId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          comment: commentText,
          voterName: voterName.trim() || undefined,
          anchorType: anchor.anchorType,
          selector: anchor.selector ?? undefined,
          offsetX: anchor.offsetX,
          offsetY: anchor.offsetY,
        }),
      });
      if (!response.ok) {
        setSubmitError("Couldn't save your comment. Please try again.");
        return;
      }
      const { comment: created } = (await response.json()) as { comment: Comment };
      // The server, not this draft, is authoritative for the new pin's `seq`
      // — pass its confirmed row through rather than reconstructing one from
      // `commentText`/`anchor` (KEV-172 chunk 4: never guess a pin number).
      onCommentSubmit(variationId, { ...created, createdAt: new Date(created.createdAt) });
      setDraft(null);
    } catch {
      setSubmitError("Couldn't save your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const openPinnedComments = comments.filter((c) => c.status === "open" && positions.has(c.id));
  // `PinCard` (below) is rendered once per active pin, at the overlay root —
  // not nested inside a pin's own wrapper div below — so its x/y stay in the
  // same container-relative coordinate space as `positions`/PinComposer's
  // draft.x/draft.y, rather than being doubly offset by the pin wrapper's
  // own `left`/`top`.
  const selectedComment = selectedPinId ? openPinnedComments.find((c) => c.id === selectedPinId) : undefined;
  const selectedPos = selectedComment ? positions.get(selectedComment.id) : undefined;
  // Same resolution as `selectedComment`/`selectedPos` above, for whichever
  // pin is currently showing its hover preview. Suppressed when it's the
  // selected pin — mirroring the old Tooltip's `isDisabled={isSelected}` —
  // so the preview and the expanded card, which share the same placement,
  // never both try to render in the same spot at once.
  const hoveredComment =
    hoveredPinId && hoveredPinId !== selectedPinId ? openPinnedComments.find((c) => c.id === hoveredPinId) : undefined;
  const hoveredPos = hoveredComment ? positions.get(hoveredComment.id) : undefined;

  // A single keyed list, not two separate conditional blocks — this is what
  // makes a click-after-hover a true in-place DOM morph rather than an
  // unmount+remount: React reconciles by `key` (the comment id), so when the
  // same pin goes from "hovered" to "selected" the entry at that key just
  // changes `mode` (preview → expanded) instead of the preview's node being
  // torn down and the expanded card's node being mounted fresh. It's also
  // what lets two different pins show at once (one expanded, one previewing)
  // — see the worked examples on the PinCard doc comment below.
  const activeCards = [
    selectedComment && selectedPos ? { comment: selectedComment, pos: selectedPos, mode: "expanded" as const } : null,
    hoveredComment && hoveredPos ? { comment: hoveredComment, pos: hoveredPos, mode: "preview" as const } : null,
  ].filter((c): c is { comment: VariationComment; pos: PinPos; mode: "preview" | "expanded" } => c !== null);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {highlight && (
        <div
          aria-hidden="true"
          className="absolute rounded-[2px] border-2 border-[#60A5FA] bg-[#60A5FA1A]"
          style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }}
        />
      )}

      {mediaKind === "image" && commentMode && (
        <div
          aria-label="Click to add a pinned comment"
          role="button"
          tabIndex={-1}
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onClick={handleImageClick}
        />
      )}

      {openPinnedComments.map((comment) => {
        const pos = positions.get(comment.id)!;
        const isSelected = selectedPinId === comment.id;
        return (
          // A spring scale-in entrance on mount (a pin "dropping" onto the
          // stage) — `x`/`y: "-50%"` do the centering that used to live on
          // the Button below, moved up here so the SAME element carries both
          // the centering translate and the entrance scale (composing into
          // one `transform`, correctly originating at the pin's anchor
          // point). The Button's own `scale-125` selection styling stays on
          // a separate element/transform, so the two scales never fight over
          // the same property — see this file's own notes on KEV-172. The
          // transition is inherited from voter-shell.tsx's <MotionConfig>
          // house spring.
          <motion.div
            key={comment.id}
            ref={(el) => {
              // A row click in comments-panel.tsx (or a click on this pin
              // itself) sets selectedPinId; scroll this pin into view within
              // the stage's scrollable pane so a pin currently off-screen
              // (e.g. a tall app variation) is actually visible once selected.
              if (isSelected) el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="pointer-events-none absolute"
            style={{ left: pos.x, top: pos.y, x: "-50%", y: "-50%" }}
          >
            {/* The hover preview (`PinCard` in `mode: "preview"`, rendered
                once at the overlay root below via `activeCards`) deliberately
                shares the expanded card's exact placement, so hovering a pin
                and then clicking it never shifts the author line. This used
                to be a react-aria `Tooltip` floating above
                the pin — a different spot than the click-opened card beside
                it — which is exactly the jarring hover→click jump this
                replaces. A plain react-aria-components `Button` (rather than
                the `Tooltip`/`TooltipTrigger` pair) keeps `onPress`,
                keyboard activation, and focus handling while giving us
                `onHoverStart`/`onHoverEnd`/`onFocus`/`onBlur` to drive
                `hoveredPinId` ourselves. */}
            <Button
              aria-label={`Comment by ${pinAuthorLabel(comment)}: ${comment.comment}`}
              aria-pressed={isSelected}
              onPress={() => onSelectPin?.(comment.id)}
              onHoverStart={() => startHoverPreview(comment.id)}
              onHoverEnd={() => cancelHoverPreview(comment.id)}
              onFocus={() => {
                // Keyboard focus shows the preview immediately — no delay —
                // since arriving via Tab is always an intentional stop,
                // unlike a pointer merely passing over the pin.
                if (hoverTimerRef.current) {
                  clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = null;
                }
                setHoveredPinId(comment.id);
              }}
              onBlur={() => cancelHoverPreview(comment.id)}
              className={cx(
                "pointer-events-auto flex size-6 items-center justify-center rounded-full border border-[#212121] bg-[#FACC15] text-[10px] font-semibold text-[#212121] shadow-md transition-[box-shadow,transform] duration-300",
                isSelected && "scale-125 shadow-[0_0_0_4px_#FACC1580]"
              )}
            >
              {comment.seq}
            </Button>
          </motion.div>
        );
      })}

      {activeCards.map((c) => (
        <PinCard
          key={c.comment.id}
          comment={c.comment}
          pinX={c.pos.x}
          pinY={c.pos.y}
          mode={c.mode}
          containerRef={containerRef}
          canManage={voterStatus !== "archived"}
          onClose={() => onSelectPin?.(c.comment.id)}
          onToggleStatus={() =>
            onToggleCommentStatus?.(variationId, c.comment.id, c.comment.status === "open" ? "complete" : "open")
          }
          onRequestDelete={() => onRequestDeleteComment?.(variationId, c.comment.id)}
        />
      ))}

      {draft && (
        <PinComposer
          x={draft.x}
          y={draft.y}
          containerRef={containerRef}
          voterName={voterName}
          onVoterNameChange={onVoterNameChange}
          submitting={submitting}
          error={submitError}
          onSubmit={(text) => void submitDraft(text)}
          onCancel={() => {
            setDraft(null);
            setSubmitError(null);
          }}
        />
      )}
    </div>
  );
}

function PinComposer({
  x,
  y,
  containerRef,
  voterName,
  onVoterNameChange,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  containerRef: RefObject<HTMLDivElement | null>;
  voterName: string;
  onVoterNameChange: (name: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reading a ref's `.current` during render is disallowed (react-hooks/refs)
  // — measure the container's width in an effect instead, same as
  // PinCard does below, and keep it current across a stage resize.
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    function measure() {
      setContainerWidth(containerRef.current?.getBoundingClientRect().width);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [containerRef]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function submit() {
    const trimmed = comment.trim();
    if (!trimmed || submitting) return;
    onSubmit(trimmed);
  }

  const canSubmit = comment.trim().length > 0 && !submitting;

  const left = clampComposerLeft(x, containerWidth);
  // Prefer floating above the click point (same as below); flip below it
  // when there isn't enough room above so the composer never clips off the
  // stage's top edge. Reuses PinCard's own estimated-height/gap
  // constants below — this popover is roughly the same size, so a second,
  // near-duplicate estimate wouldn't buy anything.
  const showBelow = y < CARD_ESTIMATED_HEIGHT + CARD_GAP;

  return (
    <div
      role="dialog"
      aria-label="Add a comment"
      style={{ left, top: y }}
      className={cx(
        "pointer-events-auto absolute z-30 flex w-64 flex-col gap-2 rounded-lg border border-[#3F3F46] bg-[#2B2B2B] p-3 shadow-lg",
        showBelow ? "translate-y-[12px]" : "-translate-y-[calc(100%+12px)]"
      )}
    >
      <input
        aria-label="Your name (optional)"
        placeholder="Your name (optional)"
        value={voterName}
        onChange={(event) => onVoterNameChange(event.target.value)}
        className="w-full bg-transparent text-sm text-[#E8E8E8] outline-none placeholder:text-[#A1A1AA]"
      />
      <textarea
        ref={textareaRef}
        rows={1}
        aria-label="Comment"
        placeholder="Leave a comment…"
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
          resize();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className="max-h-40 w-full resize-none bg-transparent text-sm text-[#E8E8E8] outline-none placeholder:text-[#A1A1AA]"
      />
      {error && <p className="text-xs text-error-primary">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Cancel comment"
          onClick={onCancel}
          className="flex size-7 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:text-[#E8E8E8]"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Post comment"
          disabled={!canSubmit}
          onClick={submit}
          style={{ boxShadow: "inset 0 0.5px 0 #FFFFFF40, inset 0 -0.5px 0 #0000004D" }}
          className={cx(
            "flex size-7 shrink-0 items-center justify-center rounded-[4px] outline-none transition-colors disabled:cursor-not-allowed",
            canSubmit ? "bg-[#E8E8E8]" : "bg-[#52525B]"
          )}
        >
          <ArrowUp aria-hidden="true" className="size-4" color="#2B2B2B" />
        </button>
      </div>
    </div>
  );
}

const CARD_WIDTH = 288; // matches w-72 below (PinCard)
const COMPOSER_WIDTH = 256; // matches w-64 above (PinComposer)
const CARD_GUTTER = 8;
// Still used by PinComposer's own above/below flip below — PinCard no
// longer needs it now that it's top-aligned beside the pin instead of
// floating above/below it, but PinComposer's placement is out of scope here.
const CARD_ESTIMATED_HEIGHT = 180;
const CARD_GAP = 12;
// Half the selected pin marker's footprint (size-6 scaled to 1.25 ≈ 30px,
// plus its 4px focus ring), rounded up — used to clear the marker itself
// when placing the card beside it instead of centered over it.
const PIN_RADIUS = 16;

/**
 * Places the expanded card BESIDE the pin (left-anchored, not centered over
 * it) rather than floating above it — see KEV-172 follow-up. Prefers the
 * side with more room: right of the pin when it's in the left half of the
 * stage, left of the pin otherwise. Falls back to the other side if the
 * preferred one would run past the stage's gutter, and as a last resort
 * clamps into the stage bounds outright (narrower-than-card container).
 * Returns the card's LEFT EDGE — pure function so it's unit-testable.
 *
 * `cardWidth` defaults to the expanded card's own width (`CARD_WIDTH`), but
 * is parameterized so the hover preview card — same visual width today, but
 * kept independent on purpose — can share this exact algorithm via
 * `usePinCardPlacement` below rather than a second, drift-prone copy.
 */
export function placeCardLeft(pinX: number, containerWidth: number | undefined, cardWidth: number = CARD_WIDTH): number {
  if (!containerWidth) return pinX + PIN_RADIUS + CARD_GAP;

  const preferRight = pinX < containerWidth / 2;
  const rightLeft = pinX + PIN_RADIUS + CARD_GAP;
  const leftLeft = pinX - PIN_RADIUS - CARD_GAP - cardWidth;

  const rightFits = rightLeft + cardWidth <= containerWidth - CARD_GUTTER;
  const leftFits = leftLeft >= CARD_GUTTER;

  let left: number;
  if (preferRight) {
    left = rightFits ? rightLeft : leftFits ? leftLeft : rightLeft;
  } else {
    left = leftFits ? leftLeft : rightFits ? rightLeft : leftLeft;
  }

  const min = CARD_GUTTER;
  const max = containerWidth - cardWidth - CARD_GUTTER;
  if (max < min) return min; // container narrower than the card — just left-align it.
  return Math.min(Math.max(left, min), max);
}

/**
 * Shared placement logic for `PinCard` in both its `preview` and `expanded`
 * modes — the single source of truth that guarantees they land in the EXACT
 * same spot (same side of the pin, same top-aligned row) so hovering a pin
 * and then clicking it never shifts the author line. Both modes pass the
 * same `cardWidth` (they're the same visual width), so this is really just
 * factoring out "measure the stage + the card's own first row, then run
 * `placeCardLeft`" into one hook instead of two near-identical effects.
 */
function usePinCardPlacement({
  pinX,
  pinY,
  containerRef,
  cardWidth,
  mode,
}: {
  pinX: number;
  pinY: number;
  containerRef: RefObject<HTMLDivElement | null>;
  cardWidth: number;
  /** Because `PinCard` is now a single persistent node across preview →
   * expanded (see `PinCard`'s own doc comment), the header bar appearing on
   * expand changes the first message row's `offsetTop` mid-lifetime, not
   * just on mount. Included in the measuring effect's deps below purely to
   * force a re-measure when it flips — its value is never read directly. */
  mode: "preview" | "expanded";
}): {
  left: number;
  top: number;
  messageRowRef: RefObject<HTMLDivElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
} {
  // Reading a ref's `.current` during render is disallowed (react-hooks/refs)
  // — measure the container's width in an effect instead, same as the
  // `positions` recompute effect above does for pin coordinates, and keep it
  // current across a stage resize. While we're in here, also measure the
  // first message row's offset from the card's own top edge (see `top`
  // below) — both are stage-layout-dependent, so one resize-aware effect
  // covers both.
  //
  // `useLayoutEffect`, not `useEffect`: the header bar mounting/unmounting on
  // a preview↔expanded mode change (`mode` is in the deps below) shifts
  // `messageRowRef.current.offsetTop` — with a plain `useEffect` that shift
  // would only be measured (and `top` recomputed) AFTER the browser had
  // already painted a frame with the stale offset, i.e. the card's body would
  // visibly jump down by the header's height for one frame when a preview
  // expands. Measuring synchronously before paint, via `useLayoutEffect`,
  // means `top` is already correct by the time the mode-change render
  // commits, so the body never jumps — only the header bar's own entrance
  // animation is visible. This component only ever renders client-side
  // (inside the interactive stage overlay, never during SSR), so there's no
  // `useLayoutEffect` SSR warning to guard against here.
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  const [messageOffsetTop, setMessageOffsetTop] = useState<number | undefined>(undefined);
  const [cardHeight, setCardHeight] = useState<number | undefined>(undefined);
  const messageRowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function measure() {
      const containerRect = containerRef.current?.getBoundingClientRect();
      setContainerWidth(containerRect?.width);
      setContainerHeight(containerRect?.height);
      setMessageOffsetTop(messageRowRef.current?.offsetTop);
      setCardHeight(cardRef.current?.getBoundingClientRect().height);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [containerRef, mode]);

  // Beside, not centered-above: the card anchors its LEFT edge next to the
  // pin (see `placeCardLeft`) instead of horizontally centering over it.
  const left = placeCardLeft(pinX, containerWidth, cardWidth);
  // Top-aligned to the pin: line the first message row (author name, ref'd
  // by the caller) up with the pin's own top edge, rather than floating the
  // whole card above/below it. `pinY` is the pin's CENTER, so its top edge is
  // `pinY - PIN_RADIUS`; subtracting the row's measured offset within the
  // card gives the card's own top edge. Falls back to `44` (an estimate of
  // the header-bar-plus-padding height above that row) until the first
  // effect pass has measured it — a preview card has no header bar, so its
  // real offset settles closer to its own padding, but the pre-measurement
  // fallback only matters for one frame either way.
  let top = pinY - PIN_RADIUS - (messageOffsetTop ?? 44);
  // Keep the card's BOTTOM edge inside the stage the same way its left/right
  // edges are kept in bounds by `placeCardLeft`: once the card's own height
  // has been measured, pull `top` up so `top + cardHeight` clears the bottom
  // gutter. Without this a pin low on a tall stage would grow its card (which
  // extends downward from the pin's top) past the stage's bottom edge, where
  // the `overflow-auto` stage wrapper clips it. Only applied when the card
  // actually fits between the top and bottom gutters; if it's taller than the
  // stage there's no non-clipping position, so we fall through to the top
  // clamp below and let the bottom overflow (unavoidable) rather than hiding
  // the author row off the top.
  if (containerHeight !== undefined && cardHeight !== undefined) {
    const maxTop = containerHeight - cardHeight - CARD_GUTTER;
    if (maxTop >= CARD_GUTTER) top = Math.min(top, maxTop);
  }
  // Clamped to `CARD_GUTTER` so the card never clips off the stage's TOP edge
  // for a pin placed near it (or after the bottom clamp above pulled it up).
  top = Math.max(top, CARD_GUTTER);

  return { left, top, messageRowRef, cardRef };
}

/**
 * The author row + comment body shared, byte-for-byte, between `PinCard`'s
 * `preview` and `expanded` modes — the actual guarantee behind "hovering →
 * clicking never shifts the author line". If the two modes each rendered
 * their own copy of this markup, a future edit to one (padding, font size,
 * wrapping) could silently drift it out of alignment with the other; sharing
 * one component makes that impossible. (It's also, post-merge, literally the
 * same DOM subtree across a preview→expanded morph, not just visually
 * identical markup — see `PinCard`'s own doc comment.)
 */
function PinCardBody({
  comment,
  messageRowRef,
}: {
  comment: VariationComment;
  messageRowRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div ref={messageRowRef} className="flex min-w-0 items-center">
        <span className="truncate text-sm font-medium text-[#E8E8E8]">{pinAuthorLabel(comment)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-[#E8E8E8]">{comment.comment}</p>
    </>
  );
}

/**
 * The pinned-comment card, in either of two modes — a single component
 * because AnnotationLayer's `activeCards` keys its render by comment id (see
 * above), so React reuses THE SAME DOM NODE when a pin's card goes from
 * `mode: "preview"` (hover) to `mode: "expanded"` (click) instead of
 * unmounting one component and mounting a different one in its place. That's
 * what makes hover→click a true in-place morph rather than a swap that merely
 * looks similar: the container div persists, `PinCardBody` (author row +
 * comment text) never re-mounts and so never re-animates, and the only thing
 * that visibly enters is the header action bar — because it's the only piece
 * of markup that's actually new between the two modes.
 *
 * - **preview** (hover/focus, not yet clicked): `aria-hidden`,
 *   `pointer-events-none`, no `role`, no header bar, no click handler — a
 *   lightweight read-only stand-in. `aria-hidden` because the pin itself
 *   already carries the equivalent text in its `aria-label` (see the marker
 *   `Button` in AnnotationLayer); `pointer-events-none` so it never
 *   intercepts the click that would open the real (expanded) card.
 * - **expanded** (selected/clicked): `role="dialog"`, `aria-label`,
 *   `pointer-events-auto`, `onClick` stopPropagation (so a click on the
 *   card's own padding doesn't bubble up to stage.tsx's "click empty canvas"
 *   deselect handler — this card being open is itself evidence the click
 *   landed on non-empty canvas), and the header action bar (Complete/Reopen +
 *   Delete when `canManage`, Close always).
 *
 * Both modes share `usePinCardPlacement` (same `cardWidth`) and
 * `PinCardBody`, so the author row lands in the EXACT same spot in both — no
 * visual jump when a hover turns into a click. The container's own entrance
 * transition differs slightly by mode (preview gets a small translate +
 * opacity settle since it has no other motion of its own; expanded is
 * opacity-only, deliberately with NO transform, so it never re-shifts a body
 * that a preview may already be showing in the same spot) — only the header
 * bar gets its own, slightly delayed fade+slide-down entrance, since it's the
 * one thing that's actually new on click. `z-40` for expanded vs `z-30` for
 * preview so an open card sits above any concurrent preview of another pin
 * (see AnnotationLayer's `activeCards`, which can render both a pin's
 * expanded card and a different pin's preview card at once).
 */
export function PinCard({
  comment,
  pinX,
  pinY,
  containerRef,
  mode,
  canManage,
  onClose,
  onToggleStatus,
  onRequestDelete,
  expandEaseClass = "ease-[cubic-bezier(0.19,1,0.22,1)]",
}: {
  comment: VariationComment;
  pinX: number;
  pinY: number;
  containerRef: RefObject<HTMLDivElement | null>;
  mode: "preview" | "expanded";
  /** Any viewer may manage any pin, own or not — gated only on the voter
   * being active, mirroring comments-panel.tsx's own archived-lockout rule.
   * Unused in `preview` mode (no header bar is rendered at all). */
  canManage: boolean;
  onClose: () => void;
  onToggleStatus: () => void;
  /** Opens the shared delete-confirmation modal — see the
   * onRequestDeleteComment doc on AnnotationLayer's own props above. Unused
   * in `preview` mode. */
  onRequestDelete: () => void;
  /** The easing utility class driving the minimized→expanded morph — the
   * expanded container's opacity transition and the header action bar's
   * fade+slide-down (below). Defaults to `--ease-out-expo`, matching the real
   * voter UI exactly, so every existing caller is unaffected. Exists purely
   * so the playground's springs-vs-curves exhibit can A/B this curve against
   * the real `PinCard` without forking it — not intended to vary in
   * production. */
  expandEaseClass?: string;
}) {
  // Beside, not centered-above: the card anchors its LEFT edge next to the
  // pin (see `placeCardLeft`) instead of horizontally centering over it, so
  // there's no `-translate-x-1/2` here. Top-aligned to the pin:
  // `usePinCardPlacement` lines the first message row (ref'd below, via
  // `PinCardBody`) up with the pin's own top edge, re-measuring synchronously
  // whenever `mode` changes so the header bar appearing/disappearing never
  // makes the body jump for a frame (see that hook's own doc comment).
  const { left, top, messageRowRef, cardRef } = usePinCardPlacement({
    pinX,
    pinY,
    containerRef,
    cardWidth: CARD_WIDTH,
    mode,
  });
  const expanded = mode === "expanded";

  return (
    <div
      ref={cardRef}
      role={expanded ? "dialog" : undefined}
      aria-label={expanded ? `Pin ${comment.seq} comment` : undefined}
      aria-hidden={expanded ? undefined : "true"}
      onClick={expanded ? (event) => event.stopPropagation() : undefined}
      style={{ left, top }}
      className={cx(
        "absolute flex w-72 flex-col gap-2 rounded-lg border border-[#3F3F46] bg-[#2B2B2B] p-3",
        expanded
          ? // Opacity-only entrance, deliberately with NO transform: a
            // preview card may already be showing this exact body in this
            // exact spot (see `usePinCardPlacement`), so a transform here
            // would shift it and break the continuity a click is supposed to
            // preserve. Only the header bar below (the one thing that's
            // actually new on click) gets to move; the body just fades in
            // place alongside it.
            cx("pointer-events-auto z-40 opacity-100 shadow-lg transition-opacity duration-150 starting:opacity-0", expandEaseClass)
          : // Softens today's hard pop (this mounts ~300ms into a hover, with
            // no animation of its own) with a quick fade + gentle downward
            // settle — `@starting-style` (via Tailwind's `starting:` variant)
            // supplies the "before mount" state a `transition` needs to
            // animate from. The translate is `motion-safe:`-gated (movement
            // only), while the opacity fade plays for everyone, including
            // reduced-motion users.
            "pointer-events-none z-30 translate-y-0 opacity-100 shadow-lg transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.19,1,0.22,1)] starting:opacity-0 motion-safe:starting:translate-y-[3px]"
      )}
    >
      {expanded && (
        <>
          {/* Header bar: right-aligned action icon-buttons, visually
              separated from the author + body below by a divider — Close is
              always present (even for non-authors / an archived voter),
              while Complete/Reopen and Delete only join it when `canManage`
              is true. This is the one part of the card that's actually NEW
              when a pin goes from previewed to expanded (the body below is
              identical to the preview), so it gets its own, slightly delayed
              fade+slide-down entrance — the translate is `motion-safe:`-gated
              so reduced-motion users still get the fade without any
              movement. */}
          <div
            className={cx(
              "flex translate-y-0 items-center justify-end gap-1 border-b border-[#3F3F46] pb-2 opacity-100 transition-[opacity,transform] duration-[190ms] delay-[50ms] starting:opacity-0 motion-safe:starting:-translate-y-1.5",
              expandEaseClass
            )}
          >
            {canManage && (
              <>
                <Tooltip title={comment.status === "open" ? "Complete" : "Reopen"} placement="top">
                  <TooltipTrigger
                    aria-label={comment.status === "open" ? "Mark comment complete" : "Reopen comment"}
                    onPress={onToggleStatus}
                    className="flex size-6 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#E8E8E8]"
                  >
                    {comment.status === "open" ? (
                      <CheckCircle aria-hidden="true" className="size-4" />
                    ) : (
                      <RefreshCcw01 aria-hidden="true" className="size-4" />
                    )}
                  </TooltipTrigger>
                </Tooltip>
                <Tooltip title="Delete" placement="top">
                  <TooltipTrigger
                    aria-label="Delete comment"
                    onPress={onRequestDelete}
                    className="flex size-6 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-error-primary"
                  >
                    <Trash01 aria-hidden="true" className="size-4" />
                  </TooltipTrigger>
                </Tooltip>
              </>
            )}
            <Tooltip title="Close" placement="top">
              <TooltipTrigger
                aria-label="Close comment"
                onPress={onClose}
                className="flex size-6 shrink-0 items-center justify-center rounded-[4px] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#E8E8E8]"
              >
                <X aria-hidden="true" className="size-4" />
              </TooltipTrigger>
            </Tooltip>
          </div>
        </>
      )}

      {/* Author row + comment body — the same `PinCardBody` node across a
          preview→expanded morph (see this component's own doc comment), so
          it's never re-mounted and never re-animates when the header bar
          above it appears. Its measured `offsetTop` is what `top` aligns to
          the pin's own top edge, so this row (not the card's outer padding)
          reads as level with the pin. */}
      <PinCardBody comment={comment} messageRowRef={messageRowRef} />
    </div>
  );
}

/**
 * Keeps the composer's left edge within `containerWidth` (falling back to
 * the click's raw x when the container hasn't been measured yet) rather than
 * letting its right edge run past the stage's right edge. Unlike
 * `placeCardLeft` above, PinComposer isn't placed beside a pin — it anchors
 * its own left edge at the click's x — so this clamps the left edge directly
 * instead of choosing a preferred side.
 */
function clampComposerLeft(pinX: number, containerWidth: number | undefined): number {
  if (!containerWidth) return pinX;
  const min = CARD_GUTTER;
  const max = containerWidth - COMPOSER_WIDTH - CARD_GUTTER;
  if (max < min) return min; // container narrower than the composer — just left-align it.
  return Math.min(Math.max(pinX, min), max);
}

