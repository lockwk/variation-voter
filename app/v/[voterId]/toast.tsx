import { MessageCircle01, ThumbsUp, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

// KEV-189: presentational cards rendered via sonner's `toast.custom` from
// voter-shell.tsx's applySnapshot diff (KEV-161's detection logic, untouched
// by this migration). Sonner now owns the toast queue, auto-dismiss timer,
// enter/exit animation, and the aria-live region — these two components only
// own the dark VARIVO bevel styling, matching the rail's card language.
const cardStyle = { boxShadow: "inset 0 0.5px 0 #FFFFFF40, inset 0 -0.5px 0 #0000004D" };

// Loud: one per new comment from another viewer. Clickable — jumps to that
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

// Quiet: one per new vote from another viewer. Clickable when onClick is
// given — jumps to that variation — but keeps the dimmer, smaller footprint
// so it never competes visually with the louder CommentToast.
export function VoteToast({
  message,
  onClick,
  onDismiss,
}: {
  message: string;
  onClick?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex w-64 items-center gap-2 rounded-lg bg-[#2B2B2B] py-2 pl-3 pr-2 outline-none"
      style={cardStyle}
    >
      {onClick ? (
        <button
          type="button"
          onClick={() => {
            onClick();
            onDismiss();
          }}
          className={cx(
            "flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "cursor-pointer"
          )}
        >
          <ThumbsUp aria-hidden="true" className="size-3.5 shrink-0" color="#A1A1AA" />
          <span className="min-w-0 flex-1 truncate text-left text-xs text-[#A1A1AA]">{message}</span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ThumbsUp aria-hidden="true" className="size-3.5 shrink-0" color="#A1A1AA" />
          <span className="min-w-0 flex-1 truncate text-left text-xs text-[#A1A1AA]">{message}</span>
        </div>
      )}
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
