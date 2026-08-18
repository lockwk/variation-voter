import type { ReactNode } from 'react';

/** One side of a "this or that" pair. `label` is a short (~3 word) phrase. */
export interface VibeOption {
  id: string;
  label: string;
  /** Optional token-based accent, e.g. `'var(--c-accent-blue)'`. Never a raw hex. */
  tint?: string;
}

/** One round of the duel. A/B concepts use exactly 2 `options`; card-fan may use more. */
export interface VibeRound {
  id: string;
  /** Optional short prompt shown above the options (e.g. "Pick your vibe"). */
  prompt?: string;
  options: VibeOption[];
}

/** A committed choice for one round. */
export interface VibePick {
  roundId: string;
  chosen: VibeOption;
  /** Index of `chosen` within that round's `options`. */
  index: number;
}

/** Args passed to a concept's `renderRound` for the round currently on stage. */
export interface RenderRoundArgs {
  round: VibeRound;
  /** 0-based index of `round` within the full `rounds` array. */
  roundIndex: number;
  totalRounds: number;
  /** Call once the user commits to an option. The harness owns what happens next. */
  onPick: (option: VibeOption) => void;
}

/** Args passed to a custom `reflection` renderer. */
export interface ReflectionArgs {
  round: VibeRound;
  pick: VibePick;
  /** All picks made so far, in round order, including this one. */
  picks: VibePick[];
  /** Call to advance to the next round (or the end screen after the last). */
  onContinue: () => void;
}

export interface VibeDuelHarnessProps {
  rounds: VibeRound[];
  /** Renders the current round's interaction. Must call `onPick` exactly once per round. */
  renderRound: (args: RenderRoundArgs) => ReactNode;
  /** Optional override for the default reflection screen shown after each pick. */
  reflection?: (args: ReflectionArgs) => ReactNode;
  /** Fired once, after the reflection for the final round is dismissed. */
  onComplete?: (picks: VibePick[]) => void;
  /** Optional header override; defaults to "Pick your vibe". */
  title?: string;
  /** Optional custom header content — replaces the default eyebrow + progress
   *  rail entirely when provided (e.g. a concept's own branded headline). */
  header?: ReactNode;
  /** Optional override for the reflection dwell's auto-advance. Defaults to
   *  the `VibeHarness` DialKit knob (`dial.autoAdvance`) when omitted, so
   *  existing concepts that don't pass this keep their current behavior. */
  autoAdvance?: boolean;
  /** Optional extra class merged onto the `.page` root, for a concept that
   *  needs to repaint the page background/shell (e.g. a branded gradient card). */
  className?: string;
}
