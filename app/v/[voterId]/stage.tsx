"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { MessageCircle01 } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import type { Comment, VariationWithAggregates } from "@/db/queries";
import { AnnotationLayer } from "./annotation-layer";

// B3/B4/I1: the stage is now a pure media pane — no title/description, no
// vote buttons, no comments (all of that moved into the rail, see rail.tsx).
//
// KEV-172 chunk 3: it also hosts the pin-placement annotation layer for
// `app`/`image`/`embed` variations — the comment-mode toggle below, plus
// AnnotationLayer's hover-highlight/pins/composer overlay.
export function Stage({
  variation,
  voterId,
  voterStatus,
  voterName,
  onVoterNameChange,
  onCommentSubmit,
  selectedPinId,
  onSelectPin,
  onDeselectPin,
  onToggleCommentStatus,
  onRequestDeleteComment,
}: {
  variation: VariationWithAggregates | null;
  voterId?: string;
  voterStatus?: "active" | "archived";
  voterName?: string;
  onVoterNameChange?: (name: string) => void;
  onCommentSubmit?: (variationId: string, comment: Comment) => void;
  /** The comment id most recently selected — by a comments-panel.tsx row
   * click or a pin click here on the stage (KEV-172 polish pass, item 1) —
   * forwarded down to AnnotationLayer to emphasize/scroll to the matching
   * pin and show its expanded card (item 3). A sticky selection. */
  selectedPinId?: string | null;
  onSelectPin?: (commentId: string) => void;
  /** Clears the selection outright — wired to a click on the stage's own
   * background ("empty canvas"), below, separately from onSelectPin's
   * per-pin toggle. */
  onDeselectPin?: () => void;
  /** Reused, not duplicated, from voter-shell.tsx's mutateComment-backed
   * handlers — the same ones comments-panel.tsx's row actions call, now
   * also wired to the expanded pin card's actions (item 3). */
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  /** Opens the shared delete-confirmation modal (voter-shell.tsx), scoped to
   * this comment — forwarded to AnnotationLayer's selected pin card. */
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  const [commentMode, setCommentMode] = useState(false);

  // Pin placement applies to any media we can safely anchor against — `app`
  // (same-origin iframe), `image` (X/Y point), and `embed` (sanitized HTML
  // injected straight into this document, so its DOM is directly reachable —
  // see EmbedHtml below). `url` stays excluded: it's an arbitrary
  // cross-origin iframe with no same-document DOM to hit-test, and is no
  // longer creatable at all (KEV-172) — existing rows just render read-only.
  const supportsAnnotation = variation?.kind === "app" || variation?.kind === "image" || variation?.kind === "embed";
  const canAnnotate = Boolean(supportsAnnotation && voterStatus !== "archived" && voterId && onCommentSubmit);

  // Force comment mode off when it's no longer available (voter archived
  // mid-session, or the viewer switches to a variation kind that doesn't
  // support annotation) rather than leaving the toggle in a stuck-on state
  // with no visible control to turn it off. Adjusted during render (React's
  // "adjusting state when a prop changes" pattern — see comments-panel.tsx's
  // trackedVariationId) rather than in an effect, to avoid an extra
  // post-mount render pass and the setState-in-effect lint rule.
  const [trackedCanAnnotate, setTrackedCanAnnotate] = useState(canAnnotate);
  if (canAnnotate !== trackedCanAnnotate) {
    setTrackedCanAnnotate(canAnnotate);
    if (!canAnnotate) setCommentMode(false);
  }

  if (!variation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-secondary">
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.FeaturedIcon color="gray" />
          </EmptyState.Header>
          <EmptyState.Content>
            <EmptyState.Title>No variation selected</EmptyState.Title>
            <EmptyState.Description>Pick a variation from the list.</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex items-center justify-center overflow-auto bg-secondary p-6">
      {/* Any click that bubbles up to this wrapper (i.e. one that isn't
          stopped by a pin, the expanded card, or the comment-mode toggle
          below) landed on "empty canvas" — deselect (KEV-172 polish pass,
          item 1's "clicking empty canvas" rule). AriaButton-based controls
          (TooltipTrigger, used throughout annotation-layer.tsx) stop native
          event propagation by default on press, so a pin/card click never
          reaches this handler. */}
      <div
        className="relative flex h-full w-full min-h-[400px] items-center justify-center"
        onClick={() => onDeselectPin?.()}
      >
        <VariationMedia
          variation={variation}
          commentMode={commentMode && canAnnotate}
          voterId={voterId}
          voterStatus={voterStatus}
          voterName={voterName ?? ""}
          onVoterNameChange={onVoterNameChange ?? noop}
          onCommentSubmit={onCommentSubmit}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          onToggleCommentStatus={onToggleCommentStatus}
          onRequestDeleteComment={onRequestDeleteComment}
        />
        {canAnnotate && (
          <Tooltip title={commentMode ? "Exit comment mode" : "Add a comment"} placement="left">
            <TooltipTrigger
              aria-pressed={commentMode}
              aria-label={commentMode ? "Exit comment mode" : "Add a comment"}
              onPress={() => setCommentMode((v) => !v)}
              className={cx(
                "absolute top-3 right-3 z-30 flex size-9 items-center justify-center rounded-full border shadow-md transition-colors",
                commentMode
                  ? "border-transparent bg-[#E8E8E8] text-[#212121]"
                  : "border-[#3F3F46] bg-[#2B2B2B] text-[#E8E8E8] hover:bg-[#3F3F46]"
              )}
            >
              <MessageCircle01 aria-hidden="true" className="size-4" />
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function noop() {}

function VariationMedia({
  variation,
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
  variation: VariationWithAggregates;
  commentMode: boolean;
  voterId?: string;
  voterStatus?: "active" | "archived";
  voterName: string;
  onVoterNameChange: (name: string) => void;
  onCommentSubmit?: (variationId: string, comment: Comment) => void;
  selectedPinId?: string | null;
  onSelectPin?: (commentId: string) => void;
  onToggleCommentStatus?: (variationId: string, commentId: string, status: "open" | "complete") => void;
  onRequestDeleteComment?: (variationId: string, commentId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const embedRef = useRef<HTMLDivElement>(null);
  // EmbedHtml sanitizes asynchronously (see its own comment below) — the
  // embed's content div doesn't exist in the DOM until this flips true, so
  // AnnotationLayer's hover/click listeners (attached to embedRef.current)
  // need to know when it's safe to (re)attach rather than finding a still-null
  // ref on their first render.
  const [embedReady, setEmbedReady] = useState(false);

  if (variation.kind === "url") {
    return (
      <iframe
        title={variation.title}
        src={variation.src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="w-full h-full min-h-[400px] border-0"
      />
    );
  }
  if (variation.kind === "app") {
    // Same sandbox posture as the `url` kind: `allow-scripts allow-same-origin`
    // renders reliably (a stricter opaque-origin sandbox breaks the bundle's
    // ES module loading — blank render). App bundles are admin/agent-built and
    // served from our own origin, so this is an acceptable interim posture;
    // stronger isolation via a dedicated bundle origin is tracked in KEV-79.
    // That same same-origin posture is what lets AnnotationLayer read
    // `iframe.contentDocument` for element-anchored pins below.
    return (
      <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
        <iframe
          ref={iframeRef}
          title={variation.title}
          src={variation.src}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full min-h-[400px] border-0"
        />
        {voterId && onCommentSubmit && (
          <AnnotationLayer
            variationId={variation.id}
            comments={variation.comments}
            mediaKind="app"
            containerRef={containerRef}
            iframeRef={iframeRef}
            commentMode={commentMode}
            voterId={voterId}
            voterStatus={voterStatus}
            voterName={voterName}
            onVoterNameChange={onVoterNameChange}
            onCommentSubmit={onCommentSubmit}
            selectedPinId={selectedPinId}
            onSelectPin={onSelectPin}
            onToggleCommentStatus={onToggleCommentStatus}
            onRequestDeleteComment={onRequestDeleteComment}
          />
        )}
      </div>
    );
  }
  if (variation.kind === "image") {
    return (
      <div ref={containerRef} className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={variation.src} alt={variation.title} className="w-full h-auto" />
        {voterId && onCommentSubmit && (
          <AnnotationLayer
            variationId={variation.id}
            comments={variation.comments}
            mediaKind="image"
            containerRef={containerRef}
            imgRef={imgRef}
            commentMode={commentMode}
            voterId={voterId}
            voterStatus={voterStatus}
            voterName={voterName}
            onVoterNameChange={onVoterNameChange}
            onCommentSubmit={onCommentSubmit}
            selectedPinId={selectedPinId}
            onSelectPin={onSelectPin}
            onToggleCommentStatus={onToggleCommentStatus}
            onRequestDeleteComment={onRequestDeleteComment}
          />
        )}
      </div>
    );
  }
  // KEV-172: embed variations render in this document (no iframe boundary),
  // so — unlike `url` — their DOM is directly reachable for element-anchored
  // pins. Wrapped the same way as the `app`/`image` cases: containerRef gives
  // AnnotationLayer's overlay a positioning root, embedRef is the actual
  // hoverable/clickable content element (scoped selector resolution, hit
  // testing). The container fills the stage (`w-full h-full min-h-[400px]`,
  // matching the `app` case) and centers the embed content inside it, so
  // `usePinCardPlacement`/`placeCardLeft` in annotation-layer.tsx measure the
  // full stage width via `containerRef` — not just the embed content's own
  // width — and can place the expanded comment card BESIDE an anchored pin.
  // A plain `relative` wrapper that shrink-wraps to content was narrower than
  // `CARD_WIDTH` (288px) for small embeds, which forced the card to clamp
  // and render on top of a center-anchored pin instead of beside it. Pin
  // coordinates are unaffected by this: the embed recompute branch measures
  // the anchored element's rect relative to `containerRect`, so a wider
  // (but same-origin) container keeps pins in the same on-screen spot — only
  // the placement math for the card gets more room to work with.
  return (
    <div ref={containerRef} className="relative flex h-full w-full min-h-[400px] items-center justify-center">
      <EmbedHtml html={variation.src} embedRef={embedRef} onReady={() => setEmbedReady(true)} />
      {voterId && onCommentSubmit && (
        <AnnotationLayer
          variationId={variation.id}
          comments={variation.comments}
          mediaKind="embed"
          containerRef={containerRef}
          embedRef={embedRef}
          embedReady={embedReady}
          commentMode={commentMode}
          voterId={voterId}
          voterStatus={voterStatus}
          voterName={voterName}
          onVoterNameChange={onVoterNameChange}
          onCommentSubmit={onCommentSubmit}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          onToggleCommentStatus={onToggleCommentStatus}
          onRequestDeleteComment={onRequestDeleteComment}
        />
      )}
    </div>
  );
}

// DOMPurify (and its server-side jsdom fallback) must never be pulled into
// the server render path — jsdom's dep chain includes ESM-only packages that
// crash under `require()` in Next's serverless bundle. Effects don't run
// during SSR, so sanitizing here (behind a dynamic import) keeps jsdom out
// of the server module graph entirely; the browser build of DOMPurify runs
// natively in the client without touching jsdom.
function EmbedHtml({
  html,
  embedRef,
  onReady,
}: {
  html: string;
  /** The actual content root AnnotationLayer hit-tests/listens on (KEV-172) —
   * forwarded to both the loading placeholder and the sanitized-content div
   * below so the ref is never dangling while comment mode is toggled on
   * before sanitization finishes. */
  embedRef?: RefObject<HTMLDivElement | null>;
  /** Fires once sanitized content actually lands in the DOM — lets
   * AnnotationLayer's hover/click effect know to (re)attach to the real
   * content div rather than the placeholder it started with. */
  onReady?: () => void;
}) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const DOMPurify = (await import("isomorphic-dompurify")).default;
      const clean = DOMPurify.sanitize(html, {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading", "referrerpolicy"],
      });
      if (!cancelled) setSanitizedHtml(clean);
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  useEffect(() => {
    if (sanitizedHtml !== null) onReady?.();
  }, [sanitizedHtml, onReady]);

  if (sanitizedHtml === null) {
    return <div ref={embedRef} className="p-4" />;
  }

  return <div ref={embedRef} className="p-4" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}
