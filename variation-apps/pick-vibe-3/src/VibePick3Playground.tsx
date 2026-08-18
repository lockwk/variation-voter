import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';
import { useDialKit } from 'dialkit';
import type { EasingConfig, SpringConfig } from 'dialkit';
import { Badge, Button, SuggestionChips } from './ui';
import { vibeRounds } from './data';
import type { VibeOption, VibePick, VibeRound } from './types';
import { imageForOption } from './pick3Data';
import styles from './VibePick3Playground.module.css';

/** DialKit's TransitionConfig ('spring' | 'easing') doesn't map 1:1 onto motion's
 *  `Transition` prop shape — translate it. Copied from VibeDuelHarness.tsx /
 *  VibePick2Playground.tsx (not exported there); same rationale. */
function toMotionTransition(t: { duration: number } | SpringConfig | EasingConfig): Transition {
  if ('type' in t && t.type === 'easing') {
    return { duration: t.duration, ease: t.ease };
  }
  return t;
}

/** First 5 rounds — this concept is a self-contained 5-question flow (vs.
 *  vibe-pick-2's 3), drawn from the same shared `vibeRounds` pool. */
const rounds: VibeRound[] = vibeRounds.slice(0, 5);
const TOTAL_ROUNDS = rounds.length;

/** The two slots' geometry engine works in %-of-stage-height, so it stays
 *  resolution-independent across the 360px desktop / 300px mobile `.stage`
 *  heights (see the CSS) — forked verbatim from vibe-pick-2. `SEAM_PCT` is
 *  the 8px inter-slot gap (--s-2) expressed as a % of the (desktop) 360px
 *  stage height. */
const STAGE_PCT = 100;
const SEAM_PCT = (8 / 360) * 100;

/** "PICK YOUR VIBE" headline — same role/sizing as vibe-pick-2's own header.
 *  Also renders the top-right progress-dots counter (one dot per question,
 *  filled through the current round), hidden once `phase === 'results'`. */
function Pick3Header({ total, current, showProgress }: { total: number; current: number; showProgress: boolean }) {
  return (
    <div className={styles.pickHeaderRow}>
      <h2 className={styles.pickHeader}>Pick your vibe</h2>
      {showProgress && (
        <div
          className={styles.progressDots}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current}
          aria-label={`Question ${current} of ${total}`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={styles.progressDot} data-active={i < current || undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline currentColor checkmark — see VibePick2Playground.tsx's identical
 *  helper for why this stays a plain literal glyph rather than the DS `Icon`
 *  primitive (baked-color raster-ish SVGs can't pick up the white badge's
 *  own color context). Static — renders fully formed; the check-badge
 *  entrance animation is applied to the badge container as a single unit
 *  (see the `showCheck` block in `TileLayer` below), matching interfaces.dev's
 *  icon-swap animation where the whole icon animates together with no
 *  separate stroke draw. */
function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.3 4.3a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L6.6 9.6l5.3-5.3a1 1 0 0 1 1.4 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Inline currentColor refresh glyph for "Start Over" — see
 *  VibePick2Playground.tsx's identical helper for why this can't just be the
 *  DS `Icon` primitive (Tertiary's icon slot is hardcoded to an arrow glyph,
 *  and the baked `notification-refresh.svg` asset isn't `currentColor`). */
function RefreshGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.7725 9.36328C14.1054 9.45257 14.3035 9.79482 14.2148 10.1279C13.9222 11.2226 13.3469 12.2218 12.5469 13.0234C11.7468 13.825 10.7495 14.4017 9.65625 14.6953C8.56291 14.9888 7.41078 14.9886 6.31738 14.6953C5.22416 14.4019 4.22695 13.8257 3.42676 13.0244V13.0234L2.25 11.8428V13.8613C2.24987 14.2062 1.96976 14.4859 1.625 14.4863C1.2799 14.4863 1.00013 14.2064 1 13.8613V10.332C1.00026 9.98708 1.27999 9.70703 1.625 9.70703H5.14844C5.49303 9.70753 5.77317 9.98738 5.77344 10.332C5.77344 10.6769 5.49319 10.9565 5.14844 10.957H3.13086L4.31152 12.1406L4.56055 12.375C5.15863 12.9 5.87066 13.2814 6.6416 13.4883C7.52273 13.7246 8.45095 13.7248 9.33203 13.4883C10.213 13.2517 11.0171 12.7868 11.6621 12.1406C12.3071 11.4943 12.7708 10.6885 13.0068 9.80566C13.0961 9.47235 13.4391 9.27416 13.7725 9.36328ZM6.31836 2.2207C7.41156 1.92735 8.56302 1.92642 9.65625 2.21973C10.7496 2.51315 11.7467 3.09017 12.5469 3.8916L13.7246 5.07129V3.05469C13.7247 2.7097 14.0047 2.42989 14.3496 2.42969C14.6945 2.42994 14.9745 2.70974 14.9746 3.05469V6.58203C14.9746 6.58656 14.9728 6.5912 14.9727 6.5957C14.972 6.62864 14.9688 6.66156 14.9629 6.69434C14.9618 6.70044 14.9612 6.70685 14.96 6.71289C14.9521 6.74964 14.9424 6.78671 14.9277 6.82227C14.9123 6.85949 14.8908 6.89396 14.8691 6.92676C14.868 6.92846 14.8673 6.93088 14.8662 6.93262C14.8452 6.96367 14.8208 6.99208 14.7949 7.01855C14.7928 7.02075 14.7903 7.02323 14.7881 7.02539C14.7041 7.10856 14.5984 7.16706 14.4814 7.19238C14.478 7.19311 14.4741 7.19368 14.4707 7.19434C14.4315 7.20208 14.3906 7.20796 14.3496 7.20801H10.8271C10.482 7.20801 10.2021 6.92819 10.2021 6.58301C10.2023 6.23794 10.482 5.95801 10.8271 5.95801H12.8428L11.6621 4.77441C11.017 4.12843 10.213 3.66417 9.33203 3.42773C8.451 3.19138 7.52261 3.1913 6.6416 3.42773C5.76078 3.6643 4.95748 4.12937 4.3125 4.77539C3.66738 5.42171 3.20288 6.22734 2.9668 7.11035C2.87754 7.44346 2.53439 7.64157 2.20117 7.55273C1.86789 7.46348 1.66972 7.12047 1.75879 6.78711C2.05146 5.69241 2.62759 4.69421 3.42773 3.89258C4.22789 3.09104 5.22504 2.51423 6.31836 2.2207Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** DialKit knob shape shared by every piece below (all knobs live in one
 *  `useDialKit('VibePick3', {...})` call, owned by the top-level component). */
type Pick3Dial = ReturnType<typeof useVibePick3Dial>;

function useVibePick3Dial() {
  return useDialKit('VibePick3', {
    // ---- Idle/hover ratio-shift (picking phase only) ----
    tilePressScale: [0.97, 0.85, 1, 0.01],
    hoverExpandGrow: [1.1, 1, 2, 0.05],
    hoverCollapseGrow: [0.9, 0.2, 1, 0.05],
    hoverSpring: { type: 'spring', stiffness: 300, damping: 30, mass: 1 } as SpringConfig,
    // ---- Selected state: loser dims + shrinks but stays visible (picking -> selected) ----
    dimOpacity: [0.65, 0, 1, 0.01],
    selectedLoserGrow: [0.4, 0.05, 1, 0.05],
    collapseExpandSpring: { type: 'spring', stiffness: 260, damping: 30, mass: 1 } as SpringConfig,
    // The confirmed "take a beat" selection dwell — chosen card checked, other
    // dimmed — before the pair exits and the next round's pair enters.
    selectionDwellMs: [700, 200, 2000, 50],
    // ---- Round transition: the pair (both slots + OR badge) slides up and
    // fades out on exit, the next pair slides up from below and fades in on
    // enter (or the results screen fades in on the last pick) — see the
    // `AnimatePresence` block in the render below. ----
    roundTransition: { type: 'spring', stiffness: 300, damping: 30, mass: 1 } as SpringConfig,
    slideUpPx: [16, 4, 48, 1],
    // ---- Results screen: purple vibe badges stagger in one-by-one once the
    // surface fades in. ----
    resultsBadgeDelayMs: [150, 0, 800, 10],
    resultsBadgeStaggerMs: [70, 0, 300, 5],
  });
}

/**
 * One slot's tile content layer — the split white tile (gradient-clip label +
 * photo + scrim + optional check badge). Forked verbatim from
 * VibePick2Playground.tsx's `TileLayer` — this concept has no playback/
 * results content layer to cross-fade against inside a slot (see this file's
 * header comment), so `opacity`/`transition` are now always the same
 * (constant 1 / `collapseExpandSpring`, computed inline in `renderSlot`
 * below) rather than driven by a `tileLayerAnim` helper.
 */
function TileLayer({
  option,
  isChosen,
  isLoser,
  showCheck,
  disabled,
  opacity,
  transition,
  prefersReducedMotion,
  onActivate,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
}: {
  option: VibeOption;
  isChosen: boolean;
  isLoser: boolean;
  showCheck: boolean;
  disabled: boolean;
  opacity: number;
  transition: Transition;
  prefersReducedMotion: boolean;
  onActivate: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <motion.button
      type="button"
      className={styles.tile}
      data-chosen={isChosen || undefined}
      data-loser={isLoser || undefined}
      onClick={onActivate}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={disabled}
      aria-pressed={isChosen}
      initial={false}
      animate={{ opacity }}
      transition={transition}
    >
      <div className={styles.tileText}>
        <span className={styles.tileLabel}>{option.label}</span>
      </div>

      <div className={styles.tilePhoto}>
        <img className={styles.tileImage} src={imageForOption[option.id]} alt="" />
        <div className={styles.tileScrim} aria-hidden />
        {showCheck && (
          <motion.span
            className={styles.checkBadge}
            aria-hidden="true"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
          >
            <CheckGlyph />
          </motion.span>
        )}
      </div>
    </motion.button>
  );
}

/**
 * The results screen's content — "YOUR VIBE IS" + one purple `Badge` per
 * pick + the inert "Compare cruises..." CTA + "Start Over". Pure content (no
 * layout/surface styling of its own) — the surface chrome (`.resultsScreen`:
 * white background, radius, shadow, centered flex column) lives on the
 * `AnimatePresence` motion.div that wraps this in the render below, the same
 * "parent owns layout, child owns content" split `TileLayer`/`.tile` uses.
 */
function ResultsScreen({
  picks,
  onStartOver,
  onCompare,
  dial,
  prefersReducedMotion,
}: {
  picks: VibePick[];
  onStartOver: () => void;
  onCompare: () => void;
  dial: Pick3Dial;
  prefersReducedMotion: boolean;
}) {
  // Purple vibe badges pop in one-by-one (opacity + rise + slight scale) once
  // the results surface has faded in — `delayChildren`/`staggerChildren`
  // timings are tunable via the `resultsBadgeDelayMs`/`resultsBadgeStaggerMs`
  // dial knobs. Reduced motion collapses both to 0 so every badge appears at
  // once alongside the surface.
  const badgesContainerVariants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: prefersReducedMotion ? 0 : dial.resultsBadgeDelayMs / 1000,
        staggerChildren: prefersReducedMotion ? 0 : dial.resultsBadgeStaggerMs / 1000,
      },
    },
  };
  const badgeItemVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.92 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: prefersReducedMotion ? { duration: 0 } : toMotionTransition(dial.collapseExpandSpring),
    },
  };

  return (
    <>
      <div className={styles.resultsTop}>
        <span className={styles.resultsLabel}>Your vibe is</span>
        <motion.div
          className={styles.resultsBadges}
          variants={badgesContainerVariants}
          initial={prefersReducedMotion ? false : 'hidden'}
          animate="visible"
        >
          {picks.map((p) => (
            <motion.span key={p.roundId} className={styles.badgeItem} variants={badgeItemVariants}>
              <Badge variant="brand">{p.chosen.label}</Badge>
            </motion.span>
          ))}
        </motion.div>
      </div>

      <div className={styles.resultsBottom}>
        <SuggestionChips
          chips={['Compare cruises that match your vibe']}
          icon
          onSelect={() => onCompare()}
        />
        <div className={styles.resultsActions}>
          <Button variant="Tertiary" onClick={onStartOver}>
            <RefreshGlyph />
            Start Over
          </Button>
        </div>
      </div>
    </>
  );
}

type Phase = 'picking' | 'selected' | 'results';

/**
 * "Pick your vibe (3)" — self-contained 5-question flow (Initial -> Hover ->
 * Selection -> next round, x5 -> Results). Forked from vibe-pick-2, which
 * this deliberately simplifies:
 *
 * vibe-pick-2 kept one persistent 2-slot stack mounted for the whole flow and
 * morphed the winner slot to grow OVER the fading loser into a full playback/
 * results card (see that file's header comment for the full rationale). This
 * concept drops that "playback" state entirely — no countdown bar, no
 * between-round recap, no winner-grows morph. Instead each round's pair
 * (`.pairStage`, holding both `.slot`s + the OR badge) is a single
 * `AnimatePresence mode="wait"` child keyed on `roundIndex`: picking a card
 * holds a brief ~0.6s "selection dwell" beat (chosen card checked, other
 * dimmed — the confirmed "take a beat" decision), then the WHOLE pair slides
 * up and fades out together, and the next round's pair slides up from below
 * and fades in. On the 5th pick, the pair exits the same way but the results
 * screen (a pure fade-in, no slide, per the Figma reference) mounts in its
 * place instead of another round. `mode="wait"` sequences exit-then-enter,
 * and because the exiting pair's last render is captured (with the check/dim
 * state still showing) before its key disappears, the exit animation plays
 * out showing the pick that was just made — see `commitPick` below.
 *
 * Inside a still-live pair, the two `.slot`s keep vibe-pick-2's per-slot
 * `top`/`height` geometry engine (`stackGeom`/`geomFor`) for the hover
 * ratio-shift and the selected dim/shrink — that part is unchanged. What's
 * gone is everything past `selected`: there's no "the winner grows to fill
 * the whole stage" phase, because there's no playback/results content for it
 * to grow into anymore — the whole pair just exits.
 */
export default function VibePick3Playground() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const dial = useVibePick3Dial();

  const [phase, setPhase] = useState<Phase>('picking');
  const [roundIndex, setRoundIndex] = useState(0);
  const [picks, setPicks] = useState<VibePick[]>([]);
  const [winnerSlot, setWinnerSlot] = useState<0 | 1 | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<0 | 1 | null>(null);

  const round = rounds[roundIndex];

  const selectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef(false);
  // Last pointer type seen on a tile (set on pointerdown, read in
  // handleActivate) — touch has no hover, so a touch tap needs a different
  // first-tap-previews/second-tap-selects path than mouse/keyboard.
  const lastPointerTypeRef = useRef<string>('mouse');

  useEffect(
    () => () => {
      if (selectTimer.current) clearTimeout(selectTimer.current);
    },
    [],
  );

  // Bug 3b (vibe-pick-2): without this, a slot's <img> keeps showing the
  // PREVIOUS round's already-decoded image until the new `src` finishes
  // loading. Preloading every option's image up front means every later
  // `src` swap resolves instantly from cache.
  useEffect(() => {
    rounds.forEach((r) => r.options.forEach((o) => {
      const src = imageForOption[o.id];
      if (src) { const img = new Image(); img.src = src; }
    }));
  }, []);

  // Round advancement now lives on the selection-dwell timer (there's no
  // playback timer to hand off to anymore — see this file's header comment).
  function commitPick(slot: 0 | 1) {
    if (committedRef.current) return;
    committedRef.current = true;
    const option = round.options[slot];
    setPicks((prev) => [...prev, { roundId: round.id, chosen: option, index: slot }]);

    if (roundIndex === TOTAL_ROUNDS - 1) {
      // Leave `winnerSlot` set — the exiting pair's last render (captured
      // just before this state update) still shows the check/dim, and
      // `AnimatePresence` plays that frozen render out on its way off screen.
      setPhase('results');
    } else {
      setRoundIndex((i) => i + 1);
      setWinnerSlot(null);
      setPhase('picking');
    }
  }

  function handleChoose(slot: 0 | 1) {
    if (phase !== 'picking') return;
    committedRef.current = false;
    setWinnerSlot(slot);
    setHoveredSlot(null);
    setPhase('selected');

    const delay = prefersReducedMotion ? 0 : dial.selectionDwellMs;
    selectTimer.current = setTimeout(() => commitPick(slot), delay);
  }

  // Click/keyboard entry point for a tile. Mouse/keyboard already have the
  // tile hover/focus-previewed by the time a click/Enter fires, so they
  // select immediately. Touch has no hover: the first tap on a tile previews
  // it (same ratio-shift as hover, via setHoveredSlot) instead of selecting;
  // only a second tap on that already-previewed tile commits the pick.
  function handleActivate(slot: 0 | 1) {
    if (phase !== 'picking') return;
    const isTouch = lastPointerTypeRef.current === 'touch' || lastPointerTypeRef.current === 'pen';
    if (isTouch && hoveredSlot !== slot) {
      setHoveredSlot(slot);
      return;
    }
    handleChoose(slot);
  }

  // Number-key shortcuts (1 / 2) while a round is still open for picking.
  useEffect(() => {
    if (phase !== 'picking') return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '1' && round.options[0]) handleChoose(0);
      else if (e.key === '2' && round.options[1]) handleChoose(1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  function startOver() {
    setPicks([]);
    setRoundIndex(0);
    setWinnerSlot(null);
    setPhase('picking');
  }

  // Inert per the brief — "Compare cruises that match your vibe" doesn't
  // need to be wired to a real comparison flow for this look-and-feel
  // prototype (matches vibe-pick-2's own `startChatting` stub convention).
  function onCompare() {
    // eslint-disable-next-line no-console
    console.log('[vibe-pick-3] compare cruises (stub, not wired up)');
  }

  // ---- grow ratio: a pure function of (phase, winnerSlot, hoveredSlot) —
  // only ever consulted while a pair is mounted (picking/selected); the
  // results screen doesn't render slots at all. ----
  function growRatioFor(index: 0 | 1): number {
    if (phase === 'picking') {
      if (prefersReducedMotion || hoveredSlot === null) return 1;
      return hoveredSlot === index ? dial.hoverExpandGrow : dial.hoverCollapseGrow;
    }
    // selected
    return winnerSlot === index ? 1 : dial.selectedLoserGrow;
  }

  const g0 = growRatioFor(0);
  const g1 = growRatioFor(1);
  // OR badge tracks the live seam only while `picking` (see the badge JSX
  // below) — this stays the plain ratio split.
  const seamTopPct = (g0 / (g0 + g1)) * 100;

  // ---- slot geometry engine: `top`/`height` in % of the stage. Forked
  // verbatim from vibe-pick-2 (see `.pairStage`'s CSS comment) minus the
  // playing/results branch — there's no "winner fills the whole stage"
  // phase in this concept, so this is just the picking/selected split. ----
  function stackGeom(
    gA: number,
    gB: number,
  ): { 0: { top: number; height: number }; 1: { top: number; height: number } } {
    const avail = STAGE_PCT - SEAM_PCT;
    const hA = (avail * gA) / (gA + gB);
    const hB = (avail * gB) / (gA + gB);
    return { 0: { top: 0, height: hA }, 1: { top: hA + SEAM_PCT, height: hB } };
  }

  function geomFor(index: 0 | 1): { top: number; height: number } {
    return stackGeom(growRatioFor(0), growRatioFor(1))[index];
  }

  // One shared spring for both slots' top/height each render. Only two
  // phases ever render slots now (picking/selected), so this collapses to:
  // actively hovering during picking gets the snappier hover spring,
  // everything else (picking at rest, selected) settles with
  // collapseExpandSpring.
  const growTransition: Transition = prefersReducedMotion
    ? { duration: 0 }
    : phase === 'picking' && hoveredSlot !== null
      ? toMotionTransition(dial.hoverSpring)
      : toMotionTransition(dial.collapseExpandSpring);

  // The tile layer's own opacity is now always 1 — there's no playback/
  // results content for a chosen tile to fade out for anymore (see this
  // file's header comment); the whole SLOT (not just its tile) is what dims,
  // via `slotOpacityAnim` below. A constant transition (rather than a
  // `tileLayerAnim` helper, deleted from vibe-pick-2) is enough since the
  // value it's applied to never actually changes.
  const tileTransition: Transition = prefersReducedMotion
    ? { duration: 0 }
    : toMotionTransition(dial.collapseExpandSpring);

  // ---- slot opacity: full through `picking`; in `selected` the winner
  // stays full while the loser dims to `dial.dimOpacity`. No playing/results
  // branch, no reveal-delay bookkeeping — each round is a fresh mount (via
  // `AnimatePresence`'s key change), not a persistent slot being re-targeted,
  // so there's nothing to stagger a "reveal" for. ----
  function slotOpacityAnim(index: 0 | 1): { opacity: number; transition: Transition } {
    const isWinner = winnerSlot === index;
    let opacity = 1;
    if (phase === 'selected') opacity = isWinner ? 1 : dial.dimOpacity;

    if (prefersReducedMotion) return { opacity, transition: { duration: 0 } };
    return { opacity, transition: toMotionTransition(dial.collapseExpandSpring) };
  }

  function renderSlot(index: 0 | 1) {
    const option = round.options[index];
    const geom = geomFor(index);

    const isChosen = winnerSlot === index && phase !== 'picking';
    const isLoser = phase === 'selected' && winnerSlot !== null && winnerSlot !== index;
    const showCheck = phase === 'selected' && winnerSlot === index;
    const disabled = phase !== 'picking';

    const slotOpacity = slotOpacityAnim(index);

    return (
      <motion.div
        className={styles.slot}
        initial={false}
        animate={{ top: `${geom.top}%`, height: `${geom.height}%`, opacity: slotOpacity.opacity }}
        transition={{ ...growTransition, opacity: slotOpacity.transition }}
      >
        <TileLayer
          option={option}
          isChosen={isChosen}
          isLoser={isLoser}
          showCheck={showCheck}
          disabled={disabled}
          opacity={1}
          transition={tileTransition}
          prefersReducedMotion={prefersReducedMotion}
          onActivate={() => handleActivate(index)}
          onPointerDown={(e) => { lastPointerTypeRef.current = e.pointerType; }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse' && phase === 'picking') setHoveredSlot(index); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoveredSlot((cur) => (cur === index ? null : cur)); }}
          onFocus={() => { if (phase === 'picking') setHoveredSlot(index); }}
          onBlur={() => setHoveredSlot((cur) => (cur === index ? null : cur))}
        />
      </motion.div>
    );
  }

  // Opacity is 1 only while `picking` — fades out fast (~0.15s) the moment a
  // pick is made instead of staying visible through `selected`. `top` is
  // only included in the animate object while `picking`: once a key drops
  // out of an `animate` target, motion just holds it at its last resolved
  // value, so the badge stops riding the seam and simply fades in place
  // instead of traveling with the collapsing loser.
  const orBadgeOpacity = phase === 'picking' ? 1 : 0;
  const orBadgeOpacityTransition: Transition = prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' };
  const orBadgeAnimate =
    phase === 'picking' ? { top: `${seamTopPct}%`, opacity: orBadgeOpacity } : { opacity: orBadgeOpacity };

  const roundTransition = toMotionTransition(prefersReducedMotion ? { duration: 0 } : dial.roundTransition);

  return (
    <div className={styles.branded}>
      <Pick3Header total={TOTAL_ROUNDS} current={roundIndex + 1} showProgress={phase !== 'results'} />
      {/* `aria-label` alone (no `role="group"` override) — this is a `<main>`
          landmark; labeling it is useful, but overriding its implicit role
          would remove the page's main landmark. */}
      <main className={styles.stage} aria-label="Pick your vibe">
        <AnimatePresence mode="wait" initial={false}>
          {phase !== 'results' ? (
            <motion.div
              key={`round-${roundIndex}`}
              className={styles.pairStage}
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : dial.slideUpPx }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -dial.slideUpPx }}
              transition={roundTransition}
            >
              {renderSlot(0)}
              {renderSlot(1)}

              <motion.span
                className={styles.orBadge}
                aria-hidden="true"
                initial={false}
                animate={orBadgeAnimate}
                transition={{ ...growTransition, opacity: orBadgeOpacityTransition }}
              >
                OR
              </motion.span>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              className={styles.resultsScreen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={roundTransition}
            >
              <ResultsScreen
                picks={picks}
                onStartOver={startOver}
                onCompare={onCompare}
                dial={dial}
                prefersReducedMotion={prefersReducedMotion}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
