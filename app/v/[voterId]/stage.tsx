"use client";

import DOMPurify from "isomorphic-dompurify";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import type { VariationWithAggregates } from "@/db/queries";

export function Stage({
  variation,
}: {
  variation: VariationWithAggregates | null;
  voterId: string;
  voterStatus: "active" | "archived";
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  if (!variation) {
    return (
      <div className="flex-1 flex items-center justify-center">
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
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-gray-600 mt-1">{variation.description}</p>}
      </div>
      <div className="flex-1 min-h-[400px] bg-gray-50">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-gray-200">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-gray-700">{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
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
  if (variation.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={variation.src} alt={variation.title} className="w-full h-auto" />;
  }
  return (
    <div
      className="p-4"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(variation.src) }}
    />
  );
}
