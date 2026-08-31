// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ConfirmDialog } from "@/components/application/confirm-dialog";

afterEach(() => {
  cleanup();
});

// KEV-172: this modal replaces the old per-component inline "Delete?" confirm
// swap (comments-panel.tsx's row, annotation-layer.tsx's selected pin card),
// whose own Cancel/X used to render right next to that card's unrelated
// Close/X — two X's side by side. These tests cover the a11y contract the
// task calls out explicitly: safe initial focus, Esc-to-close, backdrop
// click-to-close, and that Confirm/Cancel each fire exactly the callback
// they should.
describe("ConfirmDialog", () => {
  it("renders the title and message, and does nothing when closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete comment"
        message="Are you sure you want to delete this comment? This cannot be undone."
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the title, message, and labeled actions when open", () => {
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure you want to delete this comment? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog", { name: /delete comment/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete this comment\? this cannot be undone\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  // Initial focus must land on Cancel, not the destructive Delete action, so
  // a stray Enter keypress right after opening can't confirm it.
  it("puts initial focus on Cancel, not the destructive confirm action", async () => {
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /^cancel$/i })).toHaveFocus());
  });

  it("calls onConfirm (and not onClose) when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose (and not onConfirm) when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onClose (not onConfirm) when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure?"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // A click on the dimmed backdrop (outside the modal panel) is the same as
  // Cancel — it must not confirm the destructive action.
  it("calls onClose (not onConfirm) on a backdrop click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Delete comment"
        message="Are you sure?"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    const dialog = await screen.findByRole("dialog");
    // The overlay backdrop is the dialog's own offset ancestor rendered by
    // ModalOverlay — clicking it (outside the Modal panel) should dismiss.
    const overlay = dialog.closest('[class*="fixed"]') as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
