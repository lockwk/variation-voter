"use client";

import { useId } from "react";

// Duotone thumbs for the *voted* state: the hand is filled solid (#212121) but
// the cuff is left hollow so the button's background shows through it — matching
// the design reference. The @untitledui/icons thumbs are a single line path
// (hand + cuff share one outline), so simply filling them fills the cuff too.
//
// Technique that keeps the silhouette identical to the unselected line icon:
//   1. a "fill" path (the outer outline, no divider) filled #212121, CLIPPED so
//      the cuff region is excluded — leaving only the hand filled;
//   2. the exact original Untitled path stroked on top, drawing the crisp
//      outline of the whole shape INCLUDING the divider line between hand+cuff.
// The clip is defined by the icon's own divider line (x=7 for up, x=17 for
// down), so the fill meets the divider exactly.

const FILL = "#212121";

// Up: cuff is bottom-left (x<7, y>11). Keep the hand: x>=7 OR y<=11.
const THUMB_UP_FULL =
  "M7 22V11m-5 2v7a2 2 0 0 0 2 2h13.426a3 3 0 0 0 2.965-2.544l1.077-7A3 3 0 0 0 18.503 9H15a1 1 0 0 1-1-1V4.466A2.466 2.466 0 0 0 11.534 2a.822.822 0 0 0-.75.488l-3.52 7.918A1 1 0 0 1 6.35 11H4a2 2 0 0 0-2 2Z";
const THUMB_UP_OUTLINE =
  "M2 13v7a2 2 0 0 0 2 2h13.426a3 3 0 0 0 2.965-2.544l1.077-7A3 3 0 0 0 18.503 9H15a1 1 0 0 1-1-1V4.466A2.466 2.466 0 0 0 11.534 2a.822.822 0 0 0-.75.488l-3.52 7.918A1 1 0 0 1 6.35 11H4a2 2 0 0 0-2 2Z";

// Down: cuff is top-right (x>17, y<13). Keep the hand: x<=17 OR y>=13.
const THUMB_DOWN_FULL =
  "M17 2v11m5-3.2V5.2c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C20.48 2 19.92 2 18.8 2H8.118c-1.461 0-2.192 0-2.782.267A3 3 0 0 0 4.06 3.361c-.354.542-.465 1.265-.687 2.71l-.523 3.4c-.293 1.904-.44 2.857-.157 3.598a3 3 0 0 0 1.32 1.539C4.704 15 5.667 15 7.595 15H8.4c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437c.11.214.11.494.11 1.054v2.934A2.466 2.466 0 0 0 12.465 22a.82.82 0 0 0 .751-.488l3.36-7.562c.154-.344.23-.516.35-.642a1 1 0 0 1 .384-.249c.164-.059.352-.059.729-.059h.76c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C22 11.48 22 10.92 22 9.8Z";
const THUMB_DOWN_OUTLINE =
  "M22 9.8V5.2c0-1.12 0-1.68-.218-2.108a2 2 0 0 0-.874-.874C20.48 2 19.92 2 18.8 2H8.118c-1.461 0-2.192 0-2.782.267A3 3 0 0 0 4.06 3.361c-.354.542-.465 1.265-.687 2.71l-.523 3.4c-.293 1.904-.44 2.857-.157 3.598a3 3 0 0 0 1.32 1.539C4.704 15 5.667 15 7.595 15H8.4c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437c.11.214.11.494.11 1.054v2.934A2.466 2.466 0 0 0 12.465 22a.82.82 0 0 0 .751-.488l3.36-7.562c.154-.344.23-.516.35-.642a1 1 0 0 1 .384-.249c.164-.059.352-.059.729-.059h.76c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C22 11.48 22 10.92 22 9.8Z";

function DuotoneThumb({
  className,
  strokeOutlinePath,
  fillPath,
  clipRects,
}: {
  className?: string;
  strokeOutlinePath: string;
  fillPath: string;
  clipRects: { x: number; y: number; width: number; height: number }[];
}) {
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      aria-hidden="true"
      className={className}
    >
      <clipPath id={clipId}>
        {clipRects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} />
        ))}
      </clipPath>
      <path d={fillPath} fill={FILL} clipPath={`url(#${clipId})`} />
      <path
        d={strokeOutlinePath}
        fill="none"
        stroke={FILL}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThumbUpVoted({ className }: { className?: string }) {
  return (
    <DuotoneThumb
      className={className}
      strokeOutlinePath={THUMB_UP_FULL}
      fillPath={THUMB_UP_OUTLINE}
      clipRects={[
        { x: 7, y: 0, width: 17, height: 24 },
        { x: 0, y: 0, width: 24, height: 11 },
      ]}
    />
  );
}

export function ThumbDownVoted({ className }: { className?: string }) {
  return (
    <DuotoneThumb
      className={className}
      strokeOutlinePath={THUMB_DOWN_FULL}
      fillPath={THUMB_DOWN_OUTLINE}
      clipRects={[
        { x: 0, y: 0, width: 17, height: 24 },
        { x: 0, y: 13, width: 24, height: 11 },
      ]}
    />
  );
}
