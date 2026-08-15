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
    // Same sandbox posture as the `url` kind: `allow-scripts allow-same-origin`
    // renders reliably (a stricter opaque-origin sandbox breaks the bundle's
    // ES module loading — blank render). App bundles are admin/agent-built and
    // served from our own origin, so this is an acceptable interim posture;
    // stronger isolation via a dedicated bundle origin is tracked in KEV-79.
    return (
      <iframe
        title={variation.title}
        src={variation.src}
        sandbox="allow-scripts allow-same-origin"
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
