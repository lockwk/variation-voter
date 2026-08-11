"use client";

import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { ThumbsUp, ThumbsDown } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import type { VariationWithAggregates } from "@/db/queries";

export function Stage({
  variation,
  voterId,
  voterStatus,
  onVoteCast,
  onCommentSubmit,
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
        {voterStatus === "archived" ? (
          <p className="mt-3 text-sm text-gray-500">
            This voter is closed and read-only — voting is disabled.
          </p>
        ) : (
          <VotingPanel
            voterId={voterId}
            variation={variation}
            onVoteCast={onVoteCast}
            onCommentSubmit={onCommentSubmit}
          />
        )}
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

function VotingPanel({
  voterId,
  variation,
  onVoteCast,
  onCommentSubmit,
}: {
  voterId: string;
  variation: VariationWithAggregates;
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [voterName, setVoterName] = useState("");

  async function castVote(direction: "up" | "down") {
    onVoteCast(variation.id, direction);
    const response = await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    const { vote } = await response.json();
    setPendingVoteId(vote.id);
  }

  async function submitComment() {
    if (!pendingVoteId || !comment.trim()) return;
    onCommentSubmit(variation.id, comment.trim(), voterName.trim() || null);
    // PATCH the same vote the click already created — never a second POST,
    // which would double-count the vote (see Task 12).
    await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        voteId: pendingVoteId,
        comment: comment.trim(),
        voterName: voterName.trim() || undefined,
      }),
    });
    setComment("");
    setVoterName("");
    setPendingVoteId(null);
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <Button aria-label="Thumbs up" onClick={() => castVote("up")}>
          <ThumbsUp /> {variation.up}
        </Button>
        <Button aria-label="Thumbs down" onClick={() => castVote("down")}>
          <ThumbsDown /> {variation.down}
        </Button>
      </div>
      {pendingVoteId && (
        <div className="mt-3 flex flex-col gap-2 max-w-sm">
          <TextArea
            aria-label="Why? (optional)"
            placeholder="Why? (optional)"
            value={comment}
            onChange={(value) => setComment(value)}
          />
          <Input
            aria-label="Name (optional)"
            placeholder="Name (optional)"
            value={voterName}
            onChange={(value) => setVoterName(value)}
          />
          <Button onClick={submitComment}>Submit</Button>
        </div>
      )}
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
