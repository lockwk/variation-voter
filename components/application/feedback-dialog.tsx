"use client";

import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export interface FeedbackDialogProps {
  /** Whether the dialog is open. Controlled — there's no internal open state. */
  isOpen: boolean;
  /** Fired on Cancel, Escape, backdrop click, or a successful submit. */
  onClose: () => void;
  /**
   * Submits the feedback message. Resolves/rejects rather than returning a
   * boolean so the dialog can distinguish "not configured" and other error
   * messages the caller wants surfaced via toast — the dialog itself doesn't
   * own the toast, callers do (see voter-shell.tsx), matching how
   * submitReply/mutateComment already keep network plumbing out of dialogs.
   */
  onSubmit: (message: string) => Promise<void>;
}

/**
 * KEV-207: lets a voter send product feedback about Variation Voter itself
 * (feature requests, bugs with the tool) straight to Kevin — separate from
 * commenting on the variations being voted on. Built on the same
 * ModalOverlay/Modal/Dialog stack as ConfirmDialog (focus trap, Esc-to-close,
 * backdrop-click-to-close all come for free from react-aria-components).
 */
export function FeedbackDialog({ isOpen, onClose, onSubmit }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = message.trim().length > 0 && !isSubmitting;

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(message.trim());
      setMessage("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className={({ isEntering, isExiting }) =>
        cx(
          "fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4",
          isEntering && "ease-out animate-in fade-in",
          isExiting && "ease-in animate-out fade-out"
        )
      }
    >
      <Modal
        className={({ isEntering, isExiting }) =>
          cx(
            "w-full max-w-lg rounded-lg border border-[#3F3F46] bg-[#2B2B2B] p-4 shadow-lg outline-none",
            isEntering && "ease-out animate-in fade-in zoom-in-95",
            isExiting && "ease-in animate-out fade-out zoom-out-95"
          )
        }
      >
        <Dialog className="flex flex-col gap-3 outline-none">
          <Heading slot="title" className="text-sm font-semibold text-[#E8E8E8]">
            VERVO Feedback
          </Heading>
          <textarea
            autoFocus
            maxLength={5000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="What's on your mind?"
            aria-label="Feedback"
            className="min-h-48 w-full resize-none rounded-[8px] border border-[#373737] bg-[#373737] p-3 font-mono text-sm leading-5 text-[#FFFFFFE6] outline-none placeholder:text-[#FFFFFF80] focus:-outline-offset-1 focus:outline-2 focus:outline-[color:var(--color-accent)] focus:outline-solid"
          />
          <div className="flex items-center justify-end">
            <Button size="sm" color="primary" isDisabled={!canSubmit} isLoading={isSubmitting} onPress={submit}>
              Send feedback
              <span aria-hidden="true" className="ml-1.5 text-xs font-normal opacity-70">
                ⌘↵
              </span>
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
