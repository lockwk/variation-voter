"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUp, CheckCircle, RefreshCcw01, Trash01, X } from "@untitledui/icons";
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
   * gated — an archived voter is read-only even for the pin's own author. */
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
  // The expanded card (item 3) is rendered once, at the overlay root — not
  // nested inside a pin's own wrapper div below — so its x/y stay in the
  // same container-relative coordinate space as `positions`/PinComposer's
  // draft.x/draft.y, rather than being doubly offset by the pin wrapper's
  // own `left`/`top`.
  const selectedComment = selectedPinId ? openPinnedComments.find((c) => c.id === selectedPinId) : undefined;
  const selectedPos = selectedComment ? positions.get(selectedComment.id) : undefined;

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
          <div
            key={comment.id}
            ref={(el) => {
              // A row click in comments-panel.tsx (or a click on this pin
              // itself) sets selectedPinId; scroll this pin into view within
              // the stage's scrollable pane so a pin currently off-screen
              // (e.g. a tall app variation) is actually visible once selected.
              if (isSelected) el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
            }}
            className="pointer-events-none absolute"
            style={{ left: pos.x, top: pos.y }}
          >
            {/* The hover mini-card stays a lightweight preview; once this
                pin is selected, the expanded card below already shows its
                full text, so the hover tooltip is disabled to avoid the two
                overlapping. */}
            <Tooltip title={pinAuthorLabel(comment)} description={comment.comment} placement="top" isDisabled={isSelected}>
              <TooltipTrigger
                aria-label={`Comment by ${pinAuthorLabel(comment)}: ${comment.comment}`}
                aria-pressed={isSelected}
                onPress={() => onSelectPin?.(comment.id)}
                className={cx(
                  "pointer-events-auto flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#212121] bg-[#FACC15] text-[10px] font-semibold text-[#212121] shadow-md transition-[box-shadow,transform] duration-300",
                  isSelected && "scale-125 shadow-[0_0_0_4px_#FACC1580]"
                )}
              >
                {comment.seq}
              </TooltipTrigger>
            </Tooltip>
          </div>
        );
      })}

      {selectedComment && selectedPos && (
        <SelectedPinCard
          comment={selectedComment}
          pinX={selectedPos.x}
          pinY={selectedPos.y}
          containerRef={containerRef}
          canManage={selectedComment.isOwn && voterStatus !== "archived"}
          onClose={() => onSelectPin?.(selectedComment.id)}
          onToggleStatus={() =>
            onToggleCommentStatus?.(
              variationId,
              selectedComment.id,
              selectedComment.status === "open" ? "complete" : "open"
            )
          }
          onRequestDelete={() => onRequestDeleteComment?.(variationId, selectedComment.id)}
        />
      )}

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
  // SelectedPinCard does below, and keep it current across a stage resize.
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
  // stage's top edge. Reuses SelectedPinCard's own estimated-height/gap
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

const CARD_WIDTH = 288; // matches w-72 below (SelectedPinCard)
const COMPOSER_WIDTH = 256; // matches w-64 above (PinComposer)
const CARD_GUTTER = 8;
const CARD_ESTIMATED_HEIGHT = 180;
const CARD_GAP = 12;

/**
 * Keeps the expanded card's horizontal center within `containerWidth`
 * (falling back to the pin's own x when the container hasn't been measured
 * yet) rather than letting it run past the stage's left/right edges.
 */
function clampCardLeft(pinX: number, containerWidth: number | undefined): number {
  if (!containerWidth) return pinX;
  const half = CARD_WIDTH / 2;
  const min = half + CARD_GUTTER;
  const max = containerWidth - half - CARD_GUTTER;
  if (max < min) return containerWidth / 2; // container narrower than the card — just center it.
  return Math.min(Math.max(pinX, min), max);
}

/**
 * Keeps the composer's left edge within `containerWidth` (falling back to
 * the click's raw x when the container hasn't been measured yet) rather than
 * letting its right edge run past the stage's right edge. Unlike
 * `clampCardLeft` above, PinComposer isn't center-anchored (no
 * `-translate-x`) — it anchors its own left edge at the click's x — so this
 * clamps the left edge directly instead of a center point.
 */
function clampComposerLeft(pinX: number, containerWidth: number | undefined): number {
  if (!containerWidth) return pinX;
  const min = CARD_GUTTER;
  const max = containerWidth - COMPOSER_WIDTH - CARD_GUTTER;
  if (max < min) return min; // container narrower than the composer — just left-align it.
  return Math.min(Math.max(pinX, min), max);
}

// KEV-172 polish pass, item 3: replaces the hover-only mini card with a
// larger, persistent, actionable one once a pin is selected (see the
// AnnotationLayer render above — this only mounts when `isSelected`).
function SelectedPinCard({
  comment,
  pinX,
  pinY,
  containerRef,
  canManage,
  onClose,
  onToggleStatus,
  onRequestDelete,
}: {
  comment: VariationComment;
  pinX: number;
  pinY: number;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Author-only, and only while the voter is active — mirrors
   * comments-panel.tsx's own `comment.isOwn` + archived-lockout rule. */
  canManage: boolean;
  onClose: () => void;
  onToggleStatus: () => void;
  /** Opens the shared delete-confirmation modal — see the
   * onRequestDeleteComment doc on AnnotationLayer's own props above. */
  onRequestDelete: () => void;
}) {
  // Reading a ref's `.current` during render is disallowed (react-hooks/refs)
  // — measure the container's width in an effect instead, same as the
  // `positions` recompute effect above does for pin coordinates, and keep it
  // current across a stage resize.
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    function measure() {
      setContainerWidth(containerRef.current?.getBoundingClientRect().width);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [containerRef]);

  const left = clampCardLeft(pinX, containerWidth);
  // Prefer floating above the pin (matches PinComposer's own placement);
  // flip below it when there isn't enough room above so the card never
  // clips off the stage's top edge. `left`/`top` here are in the same
  // container-relative coordinate space as `positions`/PinComposer's
  // draft.x/draft.y — this card is a root-level sibling of the per-pin
  // wrapper divs above, not nested inside one, so it isn't doubly offset by
  // a pin wrapper's own `left`/`top`.
  const showBelow = pinY < CARD_ESTIMATED_HEIGHT + CARD_GAP;

  return (
    <div
      role="dialog"
      aria-label={`Pin ${comment.seq} comment`}
      // Stops a click inside the card (e.g. on its padding, not one of its
      // buttons) from bubbling up to stage.tsx's "click empty canvas"
      // deselect handler — this card being open is itself evidence the
      // click landed on non-empty canvas.
      onClick={(event) => event.stopPropagation()}
      style={{ left, top: pinY }}
      className={cx(
        "pointer-events-auto absolute z-30 flex w-72 -translate-x-1/2 flex-col gap-2 rounded-lg border border-[#3F3F46] bg-[#2B2B2B] p-3 shadow-lg",
        showBelow ? "translate-y-[12px]" : "-translate-y-[calc(100%+12px)]"
      )}
    >
      {/* Header bar: right-aligned action icon-buttons, visually separated
          from the author + body below by a divider — Close is always
          present (even for non-authors / an archived voter), while
          Complete/Reopen and Delete only join it when `canManage` is true. */}
      <div className="flex items-center justify-end gap-1 border-b border-[#3F3F46] pb-2">
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

      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[#212121] bg-[#FACC15] text-[10px] font-semibold text-[#212121]"
        >
          {comment.seq}
        </span>
        <span className="truncate text-sm font-medium text-[#E8E8E8]">{pinAuthorLabel(comment)}</span>
      </div>

      <p className="whitespace-pre-wrap text-sm text-[#E8E8E8]">{comment.comment}</p>
    </div>
  );
}
