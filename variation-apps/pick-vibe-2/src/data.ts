import type { VibeRound } from './types';

/**
 * Placeholder "this or that" content for the vibe-duel concepts. Ten cruise-travel
 * pairs; each option carries a token-based `tint` (a `--c-*` CSS var name from
 * `@cocaptain/ui`'s design system, see `packages/ui/src/styles/tokens.ts`) so a
 * concept can color its cards without inventing new hexes. Tokens are reused
 * across rounds deliberately — this is placeholder data, not a promise that
 * every round needs a unique color.
 */
export const vibeRounds: VibeRound[] = [
  {
    id: 'deck-time',
    options: [
      { id: 'sunrise-deck', label: 'Sunrise on deck', tint: 'var(--c-accent-yellow)' },
      { id: 'sunset-cocktails', label: 'Sunset cocktails', tint: 'var(--c-accent-pink)' },
    ],
  },
  {
    id: 'port-energy',
    options: [
      { id: 'buzzing-ports', label: 'Buzzing city ports', tint: 'var(--c-accent-orange)' },
      { id: 'quiet-coves', label: 'Quiet island coves', tint: 'var(--c-accent-bright)' },
    ],
  },
  {
    id: 'night-vs-morning',
    options: [
      { id: 'dance-dawn', label: 'Dance til dawn', tint: 'var(--c-accent)' },
      { id: 'spa-morning', label: 'Early spa morning', tint: 'var(--c-success)' },
    ],
  },
  {
    id: 'reef-vs-pool',
    options: [
      { id: 'snorkel-reef', label: 'Snorkel the reef', tint: 'var(--c-accent-blue)' },
      { id: 'read-pool', label: 'Read by the pool', tint: 'var(--c-booking)' },
    ],
  },
  {
    id: 'dining-style',
    options: [
      { id: 'tasting-menu', label: "Chef's tasting menu", tint: 'var(--c-accent-violet)' },
      { id: 'beach-grill', label: 'Casual beach grill', tint: 'var(--c-accent-orange)' },
    ],
  },
  {
    id: 'evening-mood',
    options: [
      { id: 'rum-live-music', label: 'Rum & live music', tint: 'var(--c-accent-pink)' },
      { id: 'wine-stargazing', label: 'Wine & stargazing', tint: 'var(--c-accent)' },
    ],
  },
  {
    id: 'shore-pace',
    options: [
      { id: 'adrenaline-trek', label: 'Adrenaline shore trek', tint: 'var(--c-accent-orange)' },
      { id: 'scenic-drive', label: 'Slow scenic drive', tint: 'var(--c-accent-bright)' },
    ],
  },
  {
    id: 'pool-vs-spring',
    options: [
      { id: 'rooftop-party', label: 'Rooftop pool party', tint: 'var(--c-accent-blue)' },
      { id: 'hot-spring', label: 'Hidden hot spring', tint: 'var(--c-success)' },
    ],
  },
  {
    id: 'harbor-style',
    options: [
      { id: 'old-world-harbors', label: 'Old-world harbors', tint: 'var(--c-booking)' },
      { id: 'wild-coasts', label: 'Untouched wild coasts', tint: 'var(--c-accent-bright)' },
    ],
  },
  {
    id: 'food-vs-fine-dining',
    options: [
      { id: 'street-food', label: 'Local street food', tint: 'var(--c-accent-orange)' },
      { id: 'tablecloth-dinner', label: 'White-tablecloth dinner', tint: 'var(--c-accent-violet)' },
    ],
  },
];
