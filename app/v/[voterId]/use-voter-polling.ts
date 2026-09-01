"use client";

import { useEffect, useRef } from "react";
import type { VoterDetail } from "@/db/queries";

export const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Quietly re-fetches the full voter snapshot on an interval so new comments
 * and updated vote counts show up without a page refresh (KEV-90). Plain
 * setInterval + fetch — no SWR/react-query. Control flags live in refs, not
 * state, so a tick never triggers a re-render on its own; only the caller's
 * onSnapshot (via setState) does that.
 */
export function useVoterPolling({
  voterId,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  onSnapshot,
}: {
  voterId: string;
  intervalMs?: number;
  onSnapshot: (voter: VoterDetail, silent?: boolean) => void;
}) {
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSnapshotRef = useRef(onSnapshot);

  // Keep the interval closure calling the latest callback without resetting
  // the timer (which would otherwise restart the 5s cadence on every render).
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    const controller = new AbortController();

    // `silent` suppresses toasts for the fetched snapshot — used by the
    // visibility/focus catch-up polls, which would otherwise replay every
    // event missed while the tab was hidden as a burst of toasts.
    async function poll(silent = false) {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const response = await fetch(`/api/voters/${voterId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { voter } = await response.json();
        onSnapshotRef.current(voter, silent);
      } catch {
        // Swallow silently (including AbortError on unmount) — keep the last
        // good state rather than surfacing a polling error to the viewer.
      } finally {
        inFlightRef.current = false;
      }
    }

    timerRef.current = setInterval(poll, intervalMs);

    // Pause polling while the tab is hidden, and catch up immediately (rather
    // than waiting up to intervalMs) when it becomes visible or focused again.
    function onVisibilityChange() {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        poll(true);
        timerRef.current = setInterval(poll, intervalMs);
      }
    }
    function onFocus() {
      poll(true);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      controller.abort();
    };
  }, [voterId, intervalMs]);
}
