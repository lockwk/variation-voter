"use client";

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export interface ConfirmDialogProps {
  /** Whether the dialog is open. Controlled — there's no internal open state. */
  isOpen: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action with destructive (red) emphasis — used for
   * "this cannot be undone" actions like deleting a comment. */
  isDestructive?: boolean;
  onConfirm: () => void;
  /** Fired on Cancel, Escape, or a backdrop click — anything that dismisses
   * the dialog without confirming. */
  onClose: () => void;
}

/**
 * A small, reusable, accessible confirmation modal — replaces ad hoc inline
 * "Are you sure?" confirm steps (KEV-172's original inline delete-confirm
 * caused a real bug: its own Cancel/X button rendered right next to an
 * unrelated Close/X button on the same card, two X's side by side).
 *
 * Built on react-aria-components' ModalOverlay/Modal/Dialog, which supplies
 * for free: a focus-trapped, `role="dialog"`/`aria-modal` overlay; Esc-to-close
 * and backdrop-click-to-close (both call `onClose`, same as Cancel); and
 * focus restored to whatever triggered the dialog once it closes. The first
 * tabbable descendant (Cancel, since it's rendered before Delete) receives
 * initial focus — deliberately not the destructive action, so a stray Enter
 * keypress right after opening can't confirm it.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
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
            "w-full max-w-sm rounded-lg border border-[#3F3F46] bg-[#2B2B2B] p-4 shadow-lg outline-none",
            isEntering && "ease-out animate-in fade-in zoom-in-95",
            isExiting && "ease-in animate-out fade-out zoom-out-95"
          )
        }
      >
        <Dialog className="flex flex-col gap-4 outline-none">
          <div className="flex flex-col gap-1">
            <Heading slot="title" className="text-sm font-semibold text-[#E8E8E8]">
              {title}
            </Heading>
            <p className="text-sm text-[#A1A1AA]">{message}</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Explicit initial focus on Cancel (react-aria's Dialog would
                otherwise focus the dialog container itself, per WAI-ARIA
                practice) — deliberately not Delete, so a stray Enter
                keypress right after opening can't confirm the destructive
                action. */}
            <Button autoFocus size="sm" color="secondary" onPress={onClose}>
              {cancelLabel}
            </Button>
            <Button size="sm" color={isDestructive ? "primary-destructive" : "primary"} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
