import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import type { Transition } from 'motion/react';
import { useDialKit } from 'dialkit';
import type { EasingConfig, SpringConfig } from 'dialkit';
import { Badge, Button, SuggestionChips } from './ui';
import { vibeRounds } from './data';
import type { VibeOption, VibePick, VibeRound } from './types';
import { drawnToPhrase, imageForOption } from './pick2Data';
import styles from './VibePick2Playground.module.css';

/** DialKit's TransitionConfig ('spring' | 'easing') doesn't map 1:1 onto motion's
 *  `Transition` prop shape — translate it. Copied from VibeDuelHarness.tsx /
 *  VibePickPlayground.tsx (not exported there); same rationale. */
function toMotionTransition(t: { duration: number } | SpringConfig | EasingConfig): Transition {
  if ('type' in t && t.type === 'easing') {
    return { duration: t.duration, ease: t.ease };
  }
  return t;
}

/** First 3 rounds only — this concept is a self-contained 3-question flow, not
 *  the full 10-round set the shared harness (and sibling concepts) draws from. */
const rounds: VibeRound[] = vibeRounds.slice(0, 3);
const TOTAL_ROUNDS = rounds.length;

/** The two slots' geometry engine works in %-of-stage-height, so it stays
 *  resolution-independent across the 360px desktop / 300px mobile `.stage`
 *  heights (see the CSS) — same reason the old flexGrow ratios were
 *  resolution-independent. `SEAM_PCT` is the 8px inter-slot gap (--s-2)
 *  expressed as a % of the (desktop) 360px stage height. */
const STAGE_PCT = 100;
const SEAM_PCT = (8 / 360) * 100;

/** "PICK YOUR VIBE" headline — same role/sizing as before, now rendered
 *  directly by this component instead of being passed to the (now unused)
 *  harness's `header` prop. */
function Pick2Header() {
  return <h2 className={styles.pickHeader}>Pick your vibe</h2>;
}

/** Inline currentColor checkmark — the DS's `Icon` primitive renders baked-
 *  color raster-ish SVGs (see design-system.md's Assets section), so it can't
 *  pick up the white badge's own color context; a plain literal glyph (as the
 *  original tileCheck used) keeps this simple. */
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

/** Inline currentColor refresh glyph for the Results card's "Start over"
 *  Tertiary button. `Button`'s Tertiary icon slot is hardcoded to its own
 *  arrow glyph (see primitives/Button.tsx — leadingIcon/trailingIcon always
 *  render `ArrowGlyph`, not an arbitrary icon), so a refresh icon has to be
 *  passed as a plain child instead. The DS's `Icon` primitive (which would be
 *  the obvious choice — see CATALOG.md) renders `/icons/notification-refresh.svg`
 *  baked at a fixed navy fill (#021D49); Tertiary's text is blue (`--c-action`)
 *  via Button.module.css, and no token/filter exists to recolor a baked icon
 *  asset to that blue (see design-system.md's Assets section — baked icons
 *  aren't `currentColor`). Rather than guess a CSS `filter` chain (fragile,
 *  unverifiable without a reference render) this reuses Button.tsx's own
 *  established pattern for its Plus/Arrow glyphs: a small inline `currentColor`
 *  SVG that inherits whatever text color it's placed in — same path geometry
 *  as `notification-refresh.svg`, just not baked to a fixed hex.
 */
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
 *  `useDialKit('VibePick2', {...})` call, owned by the top-level component —
 *  see VibePick2Playground's header comment on why everything is driven from
 *  one place). */
type Pick2Dial = ReturnType<typeof useVibePick2Dial>;

function useVibePick2Dial() {
  return useDialKit('VibePick2', {
    // ---- Idle/hover ratio-shift (picking phase only) ----
    tilePressScale: [0.97, 0.85, 1, 0.01],
    hoverExpandGrow: [1.1, 1, 2, 0.05],
    hoverCollapseGrow: [0.9, 0.2, 1, 0.05],
    hoverSpring: { type: 'spring', stiffness: 300, damping: 30, mass: 1 } as SpringConfig,
    // ---- Selected state: loser dims + shrinks but stays visible (picking -> selected) ----
    dimOpacity: [0.65, 0, 1, 0.01],
    selectedLoserGrow: [0.4, 0.05, 1, 0.05],
    collapseExpandSpring: { type: 'spring', stiffness: 260, damping: 30, mass: 1 } as SpringConfig,
    selectionDwellMs: [700, 200, 2000, 50],
    // ---- The "big" persistent-slot top/height spring — selected <-> playing/
    // results <-> picking. This is the single mechanism that replaces the old
    // layoutId surface-morph: driving both slots' `top`/`height` each frame
    // is what makes the winner grow smoothly over the fading loser with zero
    // pop (see this file's header comment). ----
    growSpring: { type: 'spring', stiffness: 260, damping: 30, mass: 1 } as SpringConfig,
    // ---- Content-layer cross-fade timing (the two pop fixes) ----
    // Fix #1 (selected -> playing/results): the surface grows FIRST, then the
    // playback/results content fades in after this delay — so the content
    // never has to travel with the box.
    contentFadeInDelayMs: [280, 0, 600, 10],
    // Fix #2 (playing/results -> next picking): the other slot's tile grows
    // back in first; its content fades in after this delay so it lands once
    // the grow has mostly settled instead of racing it.
    otherRevealDelayMs: [280, 0, 600, 10],
    // ---- Playback countdown ----
    timerMs: [3000, 1000, 8000, 250],
    // Hold the countdown bar full until roughly the midpoint of the playback
    // card's grow/fade-in transition, then start depleting — starting at the
    // very end (v2's old 700 default) read as a noticeable pause before the
    // bar moved; starting at 0 (v1) moved before the card was readable. See
    // Bug 2.
    timerStartDelayMs: [350, 0, 2000, 50],
  });
}

/** The recurring "quoted vibe title / You're drawn to.../ your vibe so far"
 *  block shared by the Playback and Results content layers. */
function VibeRecap({ pick, picks }: { pick: VibePick; picks: VibePick[] }) {
  const phrase = drawnToPhrase[pick.chosen.id] ?? pick.chosen.label.toLowerCase();
  return (
    <>
      <div className={styles.cardHeadline}>
        <p className={styles.cardTitle}>“{pick.chosen.label.toUpperCase()}”</p>
        <p className={styles.cardSubtitle}>You&apos;re drawn to {phrase}</p>
      </div>

      <div className={styles.vibeSoFar}>
        <span className={styles.vibeSoFarLabel}>Your vibe so far</span>
        <div className={styles.vibeChips}>
          {picks.map((p) => (
            <Badge key={p.roundId} variant="brand">
              {p.chosen.label}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * One slot's tile content layer — the split white tile (gradient-clip label +
 * photo + scrim + optional check badge), absolutely filling its slot. Always
 * mounted (see VibePick2Playground's header comment); `opacity`/`transition`
 * are computed by the parent per-render from (phase, winnerSlot) and simply
 * applied here, so this component owns markup/interaction only, not timing.
 */
function TileLayer({
  option,
  isChosen,
  isLoser,
  showCheck,
  disabled,
  opacity,
  transition,
  dial,
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
  dial: Pick2Dial;
  prefersReducedMotion: boolean;
  onActivate: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const checkTransition = prefersReducedMotion ? { duration: 0 } : toMotionTransition(dial.collapseExpandSpring);

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
      whileTap={!disabled && !prefersReducedMotion ? { scale: dial.tilePressScale } : undefined}
      initial={false}
      animate={{ opacity }}
      transition={transition}
    >
      <div className={styles.tileText}>
        <span className={styles.tileLabel}>{option.label}</span>
      </div>

      <div
        className={styles.tilePhoto}
        style={{ backgroundImage: `url("${imageForOption[option.id]}")` }}
      >
        <div className={styles.tileScrim} aria-hidden />
        {showCheck && (
          <motion.span
            className={styles.checkBadge}
            aria-hidden="true"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={checkTransition}
          >
            <CheckGlyph />
          </motion.span>
        )}
      </div>
    </motion.button>
  );
}

/**
 * The winner slot's Playback content layer — question count + purple
 * countdown bar (depletes over `dial.timerMs`) + `VibeRecap`. Always mounted
 * (opacity-only cross-fade, per VibePick2Playground's header comment); its
 * timer only actually runs while `active` is true, so being permanently in
 * the DOM doesn't mean it's permanently ticking. Reduced motion keeps the
 * same `timerMs` wait (so the pacing of the flow doesn't change) but skips
 * animating the bar's width travel — it just doesn't move.
 */
function PlaybackLayer({
  pick,
  picks,
  roundIndex,
  dial,
  prefersReducedMotion,
  active,
  opacity,
  transition,
  onExpire,
}: {
  pick: VibePick | undefined;
  picks: VibePick[];
  roundIndex: number;
  dial: Pick2Dial;
  prefersReducedMotion: boolean;
  active: boolean;
  opacity: number;
  transition: Transition;
  onExpire: () => void;
}) {
  const fill = useMotionValue(100);
  const fillWidth = useTransform(fill, (v) => `${v}%`);
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !pick) return undefined;
    // Bug 2: the bar used to start depleting the instant this effect ran,
    // but the card is still growing + fading in at that point (roughly
    // contentFadeInDelayMs + fade + grow-spring settle, ~1s) — so it was
    // already ~1/3 down by the time it was readable. Keep the bar full
    // (`fill.set(100)` below) through `timerStartDelayMs`, then start both
    // the depletion animation and the expire timer together.
    fill.set(100);
    const startDelay = prefersReducedMotion ? 0 : dial.timerStartDelayMs;
    let controls: ReturnType<typeof animate> | undefined;
    const startTimer = setTimeout(() => {
      controls = prefersReducedMotion ? undefined : animate(fill, 0, { duration: dial.timerMs / 1000, ease: 'linear' });
      expireTimer.current = setTimeout(onExpire, dial.timerMs);
    }, startDelay);
    return () => {
      clearTimeout(startTimer);
      controls?.stop();
      if (expireTimer.current) clearTimeout(expireTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pick?.roundId]);

  return (
    <motion.div
      className={styles.playbackLayer}
      aria-hidden={!active}
      inert={!active}
      initial={false}
      animate={{ opacity }}
      transition={transition}
    >
      <div className={styles.timerBar}>
        <motion.div className={styles.timerFill} style={{ width: fillWidth }} />
      </div>

      <span className={styles.questionCount}>
        Question {roundIndex + 1} / {TOTAL_ROUNDS}
      </span>

      <div className={styles.playbackBody}>{pick && <VibeRecap pick={pick} picks={picks} />}</div>
    </motion.div>
  );
}

/**
 * The winner slot's Results content layer — "Start over" up top, `VibeRecap`
 * centered, a DS `SuggestionChips` "Start chatting" chip at the bottom. Same
 * always-mounted/opacity-cross-fade treatment as `PlaybackLayer`.
 */
function ResultsLayer({
  picks,
  active,
  opacity,
  transition,
  onStartOver,
  onStartChatting,
}: {
  picks: VibePick[];
  active: boolean;
  opacity: number;
  transition: Transition;
  onStartOver: () => void;
  onStartChatting: () => void;
}) {
  const lastPick = picks[picks.length - 1];

  return (
    <motion.div
      className={styles.resultsLayer}
      aria-hidden={!active}
      inert={!active}
      initial={false}
      animate={{ opacity }}
      transition={transition}
    >
      <div className={styles.resultsTop}>
        <Button variant="Tertiary" onClick={onStartOver}>
          <RefreshGlyph />
          Start over
        </Button>
      </div>

      <div className={styles.resultsBody}>{lastPick && <VibeRecap pick={lastPick} picks={picks} />}</div>

      <div className={styles.resultsFooter}>
        <SuggestionChips chips={['Start chatting']} icon onSelect={() => onStartChatting()} />
      </div>
    </motion.div>
  );
}

type Phase = 'picking' | 'selected' | 'playing' | 'results';

/**
 * "Pick your vibe (2)" — self-contained 3-question flow (Initial -> Hover ->
 * Selection -> Playback -> Results).
 *
 * ARCHITECTURE — one persistent 2-slot ABSOLUTE-POSITIONED stack, never
 * remounted:
 * The old version swapped three components (Picker/Playback/Results) inside
 * `AnimatePresence mode="wait"` with a shared `layoutId`. That unmounted the
 * surface and mounted a differently-sized one, which produced two visible
 * POPS: picking a card popped it straight to the full playback-card size,
 * and playback ending popped straight into the two next tiles.
 *
 * This version instead renders ONE stage containing exactly two persistent
 * `.slot` elements, never unmounted for the lifetime of the flow. An earlier
 * iteration of THIS version shared a fixed-height flex column and animated
 * each slot's `flexGrow` — but flex-sharing means the winner filling the
 * column forces the loser's flexGrow to 0, which shrinks it to a thin line
 * and loses its rounded corners right as it should be fading out (the bug
 * this rewrite fixes). Instead the two slots are `position: absolute` inside
 * a `position: relative` stage, each animating its own `top`/`height`
 * (percentages of the stage, so it's resolution-independent like flexGrow
 * was — see `stackGeom`/`geomFor` below). In `picking`/`selected` the two
 * slots still stack edge-to-edge (no shared box to fight over). In
 * `playing`/`results` the winner slot grows to fill the WHOLE stage
 * (`{ top: 0, height: 100 }`) while the loser/other slot HOLDS the exact
 * geometry it had in `selected` — it doesn't move or shrink further, it just
 * fades out (slot opacity -> 0) underneath the winner, which is stacked
 * above it via `z-index`. That's the storyboard: winner grows OVER a
 * same-size fading loser, not the loser shrinking to nothing.
 *
 * Inside each slot, three content layers (tile / playback / results) are
 * stacked absolutely and cross-faded by opacity — never remounted either, so
 * "which one is showing" is a pure opacity animation, not a mount/unmount.
 * `phase` + `winnerSlot` (which slot the user picked this round) together
 * decide each slot's top/height (via `geomFor`) and opacity (via
 * `slotOpacityAnim`), and separately decide each content layer's opacity —
 * see `geomFor`/`slotOpacityAnim`/`growTransition`/`tileLayerAnim`/
 * `playbackAnim`/`resultsAnim` below. The two "pop" fixes are still just
 * deliberate delays in that opacity timing: growing the surface before its
 * new content fades in (`contentFadeInDelayMs`), and growing the OTHER slot
 * back before ITS tile fades in (`otherRevealDelayMs`) — see the dial knob
 * comments above.
 */
export default function VibePick2Playground() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const dial = useVibePick2Dial();

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
  // Purely an animation-timing hint, NOT part of the state model above: which
  // slot just finished holding the winner content, captured right before
  // `winnerSlot` is cleared on the way back to 'picking' (see
  // handlePlaybackExpire/startOver). Read once by `tileLayerAnim` to decide
  // which slot's tile fades back in immediately vs. delayed (Fix #2) — safe
  // to leave stale between rounds because it's only ever consulted at the
  // exact moment a tile's opacity target is actually changing back to 1;
  // outside that instant a stale value changes nothing.
  const justReturnedFromSlotRef = useRef<0 | 1 | null>(null);

  useEffect(
    () => () => {
      if (selectTimer.current) clearTimeout(selectTimer.current);
    },
    [],
  );

  // Bug 3b: without this, the winner slot's <img> keeps showing the
  // PREVIOUS round's already-decoded image until the new `src` finishes
  // loading on return to the picker — the old image flashes/lingers, or the
  // new one pops in over a gray background. Preloading every option's image
  // up front means every later `src` swap resolves instantly from cache.
  useEffect(() => {
    rounds.forEach((r) => r.options.forEach((o) => {
      const src = imageForOption[o.id];
      if (src) { const img = new Image(); img.src = src; }
    }));
  }, []);

  function commitPick(slot: 0 | 1) {
    if (committedRef.current) return;
    committedRef.current = true;
    const option = round.options[slot];
    setPicks((prev) => [...prev, { roundId: round.id, chosen: option, index: slot }]);
    // The 3rd pick goes straight to Results — no timed playback for the last
    // round (confirmed with Kevin, see the plan doc).
    setPhase(roundIndex === TOTAL_ROUNDS - 1 ? 'results' : 'playing');
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

  function handlePlaybackExpire() {
    justReturnedFromSlotRef.current = winnerSlot;
    setRoundIndex((i) => i + 1);
    setWinnerSlot(null);
    setPhase('picking');
  }

  function startOver() {
    justReturnedFromSlotRef.current = winnerSlot;
    setPicks([]);
    setRoundIndex(0);
    setWinnerSlot(null);
    setPhase('picking');
  }

  // Inert per the brief — "Start chatting" doesn't need to be wired to a real
  // chat for this look-and-feel prototype.
  function startChatting() {
    // eslint-disable-next-line no-console
    console.log('[vibe-pick-2] start chatting (stub, not wired up)');
  }

  const currentPick = picks[roundIndex];

  // ---- grow ratio: a pure function of (phase, winnerSlot, hoveredSlot) —
  // same ratio logic as the old flexGrow-driven version (renamed since it no
  // longer feeds a CSS flexGrow; see `stackGeom`/`geomFor` below for how it
  // now becomes actual top/height percentages). ----
  function growRatioFor(index: 0 | 1): number {
    if (phase === 'picking') {
      if (prefersReducedMotion || hoveredSlot === null) return 1;
      return hoveredSlot === index ? dial.hoverExpandGrow : dial.hoverCollapseGrow;
    }
    if (phase === 'selected') {
      return winnerSlot === index ? 1 : dial.selectedLoserGrow;
    }
    // playing / results — unused by geomFor (which branches before reaching
    // here for these phases), kept so this stays the single source of ratio
    // truth for picking/selected.
    return winnerSlot === index ? 1 : 0;
  }

  const g0 = growRatioFor(0);
  const g1 = growRatioFor(1);
  // OR badge tracks the live seam only while `picking` (see the badge JSX
  // below) — this stays the plain ratio split, distinct from `stackGeom`'s
  // seam-aware split below (the badge sits ON the seam, it doesn't need the
  // seam subtracted from its own math).
  const seamTopPct = (g0 / (g0 + g1)) * 100;

  // ---- slot geometry engine: `top`/`height` in % of the stage, replacing
  // the old flexGrow-in-a-flex-column trick (see this file's header comment
  // for why that couldn't do "winner grows OVER a same-size fading loser").
  // `STAGE_PCT`/`SEAM_PCT` are both % of `.stage`'s fixed height (360px
  // desktop / 300px mobile — see the CSS), so 8px of seam is always the same
  // fraction of the stage regardless of which breakpoint is active. ----
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
    if (phase === 'picking' || phase === 'selected') {
      return stackGeom(growRatioFor(0), growRatioFor(1))[index];
    }
    // playing / results — winner fills the whole stage; the loser/other slot
    // HOLDS exactly the geometry it had in `selected` (does not move or
    // shrink further — only its opacity changes, see `slotOpacityAnim`).
    if (winnerSlot === index) return { top: 0, height: 100 };
    const gSelected0 = winnerSlot === 0 ? 1 : dial.selectedLoserGrow;
    const gSelected1 = winnerSlot === 1 ? 1 : dial.selectedLoserGrow;
    return stackGeom(gSelected0, gSelected1)[index];
  }

  // One shared spring for both slots' top/height/borderRadius each render,
  // so the two slots always animate in lockstep. Hover ratio-shift and the
  // selected-state dim+shrink keep their own (snappier/smaller-motion)
  // springs; every bigger surface change (settling into picking, growing
  // into playback/results, and growing back) uses `growSpring`.
  const growTransition: Transition = prefersReducedMotion
    ? { duration: 0 }
    : phase === 'picking' && hoveredSlot !== null
      ? toMotionTransition(dial.hoverSpring)
      : phase === 'selected'
        ? toMotionTransition(dial.collapseExpandSpring)
        : toMotionTransition(dial.growSpring);

  // ---- tile layer opacity — simplified: the SLOT's own opacity now owns the
  // loser's dim (selected) and fade (playing/results), including Fix #2's
  // reveal delay (see `slotOpacityAnim` below) — the tile layer itself only
  // still needs to get out of the way (Fix #1) once the winner's playback/
  // results content takes over. ----
  function tileLayerAnim(index: 0 | 1): { opacity: number; transition: Transition } {
    const isWinner = winnerSlot === index;
    const opacity = isWinner && (phase === 'playing' || phase === 'results') ? 0 : 1;

    if (prefersReducedMotion) return { opacity, transition: { duration: 0 } };

    // Fix #1: the winner's tile fades out fast once playback/results content
    // takes over — no delay, it just gets out of the way.
    if (phase === 'playing' || phase === 'results') {
      return { opacity, transition: { duration: 0.15, ease: 'easeOut' } };
    }
    return { opacity, transition: toMotionTransition(dial.collapseExpandSpring) };
  }

  // ---- slot opacity — the whole white tile fades (per the storyboard's
  // "fade out the unselected tile"): full through `picking`, dimmed through
  // `selected`, gone in `playing`/`results`. The winner slot is always
  // opaque once it's not `picking` (its own content cross-fades internally,
  // via `tileLayerAnim`/`playbackAnim`/`resultsAnim`). Fix #2 lives here too:
  // on the way back to `picking`, the slot that just held the winner is
  // already visible (no change needed); the OTHER slot fades 0 -> 1 with
  // `otherRevealDelayMs` so it lands once that slot's grow-back has mostly
  // settled instead of racing it. ----
  function slotOpacityAnim(index: 0 | 1): { opacity: number; transition: Transition } {
    const isWinner = winnerSlot === index;
    if (isWinner && phase !== 'picking') {
      return {
        opacity: 1,
        transition: prefersReducedMotion ? { duration: 0 } : toMotionTransition(dial.collapseExpandSpring),
      };
    }

    let opacity = 1;
    if (phase === 'selected') opacity = dial.dimOpacity;
    else if (phase === 'playing' || phase === 'results') opacity = 0;

    if (prefersReducedMotion) return { opacity, transition: { duration: 0 } };

    if (phase === 'playing' || phase === 'results') {
      return { opacity, transition: { duration: 0.15, ease: 'easeOut' } };
    }
    if (phase === 'picking' && justReturnedFromSlotRef.current !== null) {
      const cameFromSlot = justReturnedFromSlotRef.current;
      return {
        opacity,
        transition:
          index === cameFromSlot
            ? { duration: 0.2, ease: 'easeOut' }
            : { duration: 0.2, ease: 'easeOut', delay: dial.otherRevealDelayMs / 1000 },
      };
    }
    return { opacity, transition: toMotionTransition(dial.collapseExpandSpring) };
  }

  function playbackAnim(index: 0 | 1): { opacity: number; transition: Transition; active: boolean } {
    const active = phase === 'playing' && winnerSlot === index;
    const opacity = active ? 1 : 0;
    if (prefersReducedMotion) return { opacity, transition: { duration: 0 }, active };
    const transition: Transition = active
      ? { duration: 0.2, ease: 'easeOut', delay: dial.contentFadeInDelayMs / 1000 }
      : { duration: 0.15, ease: 'easeOut' };
    return { opacity, transition, active };
  }

  function resultsAnim(index: 0 | 1): { opacity: number; transition: Transition; active: boolean } {
    const active = phase === 'results' && winnerSlot === index;
    const opacity = active ? 1 : 0;
    if (prefersReducedMotion) return { opacity, transition: { duration: 0 }, active };
    const transition: Transition = active
      ? { duration: 0.2, ease: 'easeOut', delay: dial.contentFadeInDelayMs / 1000 }
      : { duration: 0.15, ease: 'easeOut' };
    return { opacity, transition, active };
  }

  function renderSlot(index: 0 | 1) {
    const option = round.options[index];
    const geom = geomFor(index);
    // Figma: rounded-[12px] on the tiles (--r-l) -> rounded-[24px] on the
    // full playback/results card (--r-xl). Only the winner slot ever grows to
    // the card size, so only it ever takes the larger radius.
    const borderRadius = (phase === 'playing' || phase === 'results') && winnerSlot === index ? 24 : 12;
    // The winner needs to sit ABOVE the loser once it grows over it (the
    // storyboard's "winner grows OVER a same-size fading loser") — discrete,
    // so plain style rather than an animated value.
    const zIndex = winnerSlot === index && phase !== 'picking' ? 2 : 1;

    const isChosen = winnerSlot === index && phase !== 'picking';
    const isLoser = phase === 'selected' && winnerSlot !== null && winnerSlot !== index;
    const showCheck = phase === 'selected' && winnerSlot === index;
    const disabled = phase !== 'picking';

    const tileAnim = tileLayerAnim(index);
    const slotOpacity = slotOpacityAnim(index);
    const playback = playbackAnim(index);
    const results = resultsAnim(index);

    return (
      <motion.div
        className={styles.slot}
        style={{ zIndex }}
        initial={false}
        animate={{ top: `${geom.top}%`, height: `${geom.height}%`, opacity: slotOpacity.opacity, borderRadius }}
        transition={{ ...growTransition, opacity: slotOpacity.transition }}
      >
        <TileLayer
          option={option}
          isChosen={isChosen}
          isLoser={isLoser}
          showCheck={showCheck}
          disabled={disabled}
          opacity={tileAnim.opacity}
          transition={tileAnim.transition}
          dial={dial}
          prefersReducedMotion={prefersReducedMotion}
          onActivate={() => handleActivate(index)}
          onPointerDown={(e) => { lastPointerTypeRef.current = e.pointerType; }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse' && phase === 'picking') setHoveredSlot(index); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoveredSlot((cur) => (cur === index ? null : cur)); }}
          onFocus={() => { if (phase === 'picking') setHoveredSlot(index); }}
          onBlur={() => setHoveredSlot((cur) => (cur === index ? null : cur))}
        />

        <PlaybackLayer
          pick={currentPick}
          picks={picks}
          roundIndex={roundIndex}
          dial={dial}
          prefersReducedMotion={prefersReducedMotion}
          active={playback.active}
          opacity={playback.opacity}
          transition={playback.transition}
          onExpire={handlePlaybackExpire}
        />

        <ResultsLayer
          picks={picks}
          active={results.active}
          opacity={results.opacity}
          transition={results.transition}
          onStartOver={startOver}
          onStartChatting={startChatting}
        />
      </motion.div>
    );
  }

  // Opacity is 1 only while `picking` — fades out fast (~0.15s) the moment a
  // pick is made instead of staying visible through `selected`. `top` is
  // only included in the animate object while `picking`: once a key drops
  // out of an `animate` target, motion just holds it at its last resolved
  // value, so the badge stops riding the seam and simply fades in place
  // instead of traveling with the growing winner.
  const orBadgeOpacity = phase === 'picking' ? 1 : 0;
  const orBadgeOpacityTransition: Transition = prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' };
  const orBadgeAnimate =
    phase === 'picking' ? { top: `${seamTopPct}%`, opacity: orBadgeOpacity } : { opacity: orBadgeOpacity };

  return (
    <div className={styles.branded}>
      <Pick2Header />
      {/* `aria-label` alone (no `role="group"` override) — this is a `<main>`
          landmark; labeling it is useful, but overriding its implicit role
          would remove the page's main landmark, which the old .tiles-scoped
          role="group" didn't have to worry about (it wrapped a plain div, not
          the top-level <main>). */}
      <main className={styles.stage} aria-label="Pick your vibe">
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
      </main>
    </div>
  );
}
