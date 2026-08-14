"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Bottom scroll-fade overlay (E4/H3), shared by the variation list and
// comments panel — shown only when the list actually overflows (see
// useScrollFade below).
export const SCROLL_FADE_STYLE = { background: "linear-gradient(180deg, transparent, rgba(33,33,33,0.35))" };

/**
 * Tracks whether a scrollable element currently overflows its box, so a
 * bottom scroll-fade (E4/H3) can be shown only when there's actually more
 * content to reveal — rather than unconditionally, which would show a fade
 * over a list that isn't scrollable.
 *
 * `deps` should include anything that can change whether the content
 * overflows (e.g. item count) so the check re-runs after a render; a
 * ResizeObserver on the element itself catches size changes (window resize,
 * font load, etc.) that aren't tied to a re-render.
 */
export function useScrollFade<T extends HTMLElement>(deps: unknown[] = []): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function check() {
      if (!el) return;
      setIsOverflowing(el.scrollHeight - el.clientHeight > 1);
    }

    check();

    // jsdom (unit tests) has no ResizeObserver — fall back to the deps-driven
    // check above plus a window resize listener rather than crashing.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }

    const observer = new ResizeObserver(check);
    observer.observe(el);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return [ref, isOverflowing];
}
