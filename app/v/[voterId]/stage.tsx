"use client";

import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { ThumbsUp, ThumbsDown } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Avatar } from "@/components/base/avatar/avatar";
import { initialsFor } from "@/lib/initials";
import type { VariationWithAggregates } from "@/db/queries";

export function Stage({
  variation,
  voterId,
  voterStatus,
  onVoteCast,
  onVoteCastFailed,
  onCommentSubmit,
}: {
  variation: VariationWithAggregates | null;
  voterId: string;
  voterStatus: "active" | "archived";
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onVoteCastFailed: (variationId: string, direction: "up" | "down") => void;
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
      <div className="p-6 border-b border-secondary">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-tertiary mt-1">{variation.description}</p>}
        {voterStatus === "archived" ? (
          <p className="mt-3 text-sm text-quaternary">
            This voter is closed and read-only — voting is disabled.
          </p>
        ) : (
          <VotingPanel
            key={variation.id}
            voterId={voterId}
            variation={variation}
            onVoteCast={onVoteCast}
            onVoteCastFailed={onVoteCastFailed}
            onCommentSubmit={onCommentSubmit}
          />
        )}
      </div>
      <div className="flex-1 min-h-[400px] bg-secondary">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-secondary">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-quaternary text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="flex gap-2 text-sm">
                <Avatar initials={initialsFor(comment.voterName)} size="xs" />
                <div>
                  <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                  <p className="text-secondary">{comment.comment}</p>
                </div>
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
  onVoteCastFailed,
  onCommentSubmit,
}: {
  voterId: string;
  variation: VariationWithAggregates;
  onVoteCast: (variationId: string, direction: "up" | "down") => void;
  onVoteCastFailed: (variationId: string, direction: "up" | "down") => void;
  onCommentSubmit: (variationId: string, comment: string, voterName: string | null) => void;
}) {
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [voterName, setVoterName] = useState("");
  // Guards against rapid double-clicks firing two independent in-flight requests
  // for the same action (two POSTs double-counting a vote, or two PATCHes racing
  // on the same vote's comment).
  const [isVoting, setIsVoting] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function castVote(direction: "up" | "down") {
    if (isVoting) return;
    setIsVoting(true);
    setVoteError(null);
    onVoteCast(variation.id, direction);
    try {
      const response = await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        // Roll back the optimistic bump above — a failed vote must never leave a
        // permanently-wrong local count.
        onVoteCastFailed(variation.id, direction);
        setVoteError("Couldn't record your vote. Please try again.");
        return;
      }
      const { vote } = await response.json();
      setPendingVoteId(vote.id);
    } catch {
      onVoteCastFailed(variation.id, direction);
      setVoteError("Couldn't record your vote. Please try again.");
    } finally {
      setIsVoting(false);
    }
  }

  async function submitComment() {
    if (!pendingVoteId || !comment.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      // PATCH the same vote the click already created — never a second POST,
      // which would double-count the vote (see Task 12).
      const response = await fetch(`/api/voters/${voterId}/variations/${variation.id}/votes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: pendingVoteId,
          comment: comment.trim(),
          voterName: voterName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setCommentError("Couldn't save your comment. Please try again.");
        return;
      }
      onCommentSubmit(variation.id, comment.trim(), voterName.trim() || null);
      setComment("");
      setVoterName("");
      setPendingVoteId(null);
    } catch {
      setCommentError("Couldn't save your comment. Please try again.");
    } finally {
      setIsSubmittingComment(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <Button aria-label="Thumbs up" isLoading={isVoting} onClick={() => castVote("up")}>
          <ThumbsUp /> {variation.up}
        </Button>
        <Button aria-label="Thumbs down" isLoading={isVoting} onClick={() => castVote("down")}>
          <ThumbsDown /> {variation.down}
        </Button>
      </div>
      {voteError && <p className="mt-2 text-sm text-red-600">{voteError}</p>}
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
          <Button isLoading={isSubmittingComment} onClick={submitComment}>
            Submit
          </Button>
          {commentError && <p className="text-sm text-red-600">{commentError}</p>}
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
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(variation.src, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading", "referrerpolicy"],
        }),
      }}
    />
  );
}
