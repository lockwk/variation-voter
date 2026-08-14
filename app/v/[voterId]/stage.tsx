"use client";

import DOMPurify from "isomorphic-dompurify";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import type { VariationWithAggregates } from "@/db/queries";

// B3/B4/I1: the stage is now a pure media pane — no title/description, no
// vote buttons, no comments (all of that moved into the rail, see rail.tsx).
export function Stage({ variation }: { variation: VariationWithAggregates | null }) {
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
      <VariationMedia variation={variation} />
    </div>
  );
}

function VariationMedia({ variation }: { variation: VariationWithAggregates }) {
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
    // Isolation for app bundles comes from the RESPONSE HEADER
    // `Content-Security-Policy: sandbox allow-scripts;` set on every file the
    // bundle-serving route returns (see app/apps/[variationId]/[[...path]]/route.ts).
    // That CSP forces the served document into its own unique opaque origin —
    // both when framed here AND on direct navigation — so it can't reach the
    // host origin's cookies, DOM, or /api routes, and (allow-scripts only) it
    // also can't top-navigate, submit forms, or open popups.
    //
    // We deliberately do NOT set a restrictive iframe `sandbox` attribute: an
    // iframe-level sandbox without allow-same-origin puts the frame in a nested
    // opaque context where the bundle's `crossorigin` ES module script never
    // loads (blank render), and it would add nothing the CSP header doesn't
    // already enforce. The CSP header is the single source of isolation.
    return (
      <iframe
        title={variation.title}
        src={variation.src}
        className="w-full h-full min-h-[400px] border-0"
      />
    );
  }
  if (variation.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={variation.src} alt={variation.title} className="w-full h-auto" />;
  }
  return (
    <div
      className="p-4"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(variation.src, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading", "referrerpolicy"],
        }),
      }}
    />
  );
}
