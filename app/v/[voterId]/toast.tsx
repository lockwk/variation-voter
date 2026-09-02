import { AlertCircle, CheckCircle, MessageCircle01, ThumbsUp, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

// KEV-161/KEV-189: presentational cards rendered via sonner's `toast.custom`
// from voter-shell.tsx's applySnapshot diff. Sonner owns the toast queue,
// auto-dismiss timer, enter/exit animation, and the aria-live region — these
// two components only own the dark VARIVO bevel styling, matching the rail's
// card language. Per the final design (KEV-161 "Final toast design" /
// KEV-189 "single toast style"), CommentToast and VoteToast are structurally
// identical — same size, same bright text, both clickable — differing only
// by icon.
const cardStyle = { boxShadow: "inset 0 0.5px 0 #FFFFFF40, inset 0 -0.5px 0 #0000004D" };

// One per new comment from another viewer. Clickable — jumps to that
// variation and dismisses itself.
export function CommentToast({
  message,
  onClick,
  onDismiss,
}: {
  message: string;
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex w-80 items-center gap-2 rounded-lg bg-[#2B2B2B] py-3 pl-3 pr-2 outline-none"
      style={cardStyle}
    >
      <button
        type="button"
        onClick={onClick}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "cursor-pointer"
        )}
      >
        <MessageCircle01 aria-hidden="true" className="size-4 shrink-0" color="#E8E8E8" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[#E8E8E8]">{message}</span>
      </button>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className={cx("shrink-0 p-1 -m-1 text-tertiary hover:text-secondary", "cursor-pointer")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// One per new vote from another viewer. Clickable — jumps to that variation
// and dismisses itself. Same styling as CommentToast; only the icon differs.
export function VoteToast({
  message,
  onClick,
  onDismiss,
}: {
  message: string;
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex w-80 items-center gap-2 rounded-lg bg-[#2B2B2B] py-3 pl-3 pr-2 outline-none"
      style={cardStyle}
    >
      <button
        type="button"
        onClick={onClick}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "cursor-pointer"
        )}
      >
        <ThumbsUp aria-hidden="true" className="size-4 shrink-0" color="#E8E8E8" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[#E8E8E8]">{message}</span>
      </button>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className={cx("shrink-0 p-1 -m-1 text-tertiary hover:text-secondary", "cursor-pointer")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// KEV-207: result of a feedback submission (about Variation Voter itself, not
// a variation). Same card language as CommentToast/VoteToast, but there's
// nothing to navigate to — the icon + message sit in a plain container
// instead of a clickable button — and the icon depends on success vs error.
export function FeedbackToast({
  message,
  variant,
  onDismiss,
}: {
  message: string;
  variant: "success" | "error";
  onDismiss: () => void;
}) {
  const Icon = variant === "success" ? CheckCircle : AlertCircle;
  return (
    <div
      className="flex w-80 items-center gap-2 rounded-lg bg-[#2B2B2B] py-3 pl-3 pr-2 outline-none"
      style={cardStyle}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0" color="#E8E8E8" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[#E8E8E8]">{message}</span>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className={cx("shrink-0 p-1 -m-1 text-tertiary hover:text-secondary", "cursor-pointer")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
