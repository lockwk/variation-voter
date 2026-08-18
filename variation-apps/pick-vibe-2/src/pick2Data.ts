/**
 * `vibe-pick-2`-local content maps, keyed by `VibeOption.id` from the shared
 * `vibeRounds` data (`../vibe-shared/data.ts`). Kept local (and independent of
 * `vibe-pick`'s own `pickData.ts`) rather than added to the shared data shape
 * — see CONTRACT.md ("don't mutate rounds/data.ts shape") and the brief for
 * this concept. Forked from `vibe-pick/pickData.ts` so future content tweaks
 * to either concept don't affect the other.
 *
 * Unlike `vibe-pick/pickData.ts`, this file drops `borderGradientsForRound`
 * (and its `TILE_BORDER_*` imports) — the Figma "Poll" redesign this concept
 * matches uses a plain white card + `--shadow-1`, not a gradient-ring border,
 * so that helper has no consumer here. See `VibePick2Playground.tsx`'s header
 * comment for the full list of visual deviations from `vibe-pick`.
 */

/** Photo for each option's tile. Reuses existing `apps/cruise-demo/public/images`
 *  assets (no glow-FX/background-only PNGs) — round 1 matches the Figma mock
 *  exactly (`sunrise-deck` / `sunset-cocktails`); the rest are assigned by
 *  theme. No literal food/market photography exists in the asset pool, so
 *  `tasting-menu` / `beach-grill` / `street-food` / `tablecloth-dinner` lean on
 *  the closest available mood shot (see the brief's "call out deviations"). */
export const imageForOption: Record<string, string> = {
  'sunrise-deck': new URL('./assets/images/for-you-hero.jpg', import.meta.url).href,
  'sunset-cocktails': new URL('./assets/images/for-you-thrill.jpg', import.meta.url).href,
  'buzzing-ports': new URL('./assets/images/for-you-destinations.jpg', import.meta.url).href,
  'quiet-coves': new URL('./assets/images/for-you-chill.jpg', import.meta.url).href,
  'dance-dawn': new URL('./assets/images/for-you-ships.jpg', import.meta.url).href,
  'spa-morning': new URL('./assets/images/room-category-balcony.jpg', import.meta.url).href,
  'snorkel-reef': new URL('./assets/images/for-you-itinerary-4.jpg', import.meta.url).href,
  'read-pool': new URL('./assets/images/for-you-itinerary-2.jpg', import.meta.url).href,
  'tasting-menu': new URL('./assets/images/balcony-subcategory-ocean-view-large.jpg', import.meta.url).href,
  'beach-grill': new URL('./assets/images/for-you-questions-bg.jpg', import.meta.url).href,
  'rum-live-music': new URL('./assets/images/balcony-subcategory-surfside.jpg', import.meta.url).href,
  'wine-stargazing': new URL('./assets/images/balcony-subcategory-central-park-view.jpg', import.meta.url).href,
  'adrenaline-trek': new URL('./assets/images/ship-hero-4.webp', import.meta.url).href,
  'scenic-drive': new URL('./assets/images/ship-hero-1.webp', import.meta.url).href,
  'rooftop-party': new URL('./assets/images/ship-wonder-of-the-seas.jpg', import.meta.url).href,
  'hot-spring': new URL('./assets/images/ship-hero-3.webp', import.meta.url).href,
  'old-world-harbors': new URL('./assets/images/ship-hero-2.webp', import.meta.url).href,
  'wild-coasts': new URL('./assets/images/for-you-itinerary-3.jpg', import.meta.url).href,
  'street-food': new URL('./assets/images/hero-port.jpg', import.meta.url).href,
  'tablecloth-dinner': new URL('./assets/images/room-category-suite.jpg', import.meta.url).href,
};

/** Natural "You're drawn to ___" phrase per option — distinct from the tile's
 *  own (uppercased) label, matching the mock's "You're drawn to dancing till
 *  dawn" phrasing. Falls back to `pick.chosen.label.toLowerCase()` in
 *  `Pick2Reflection` for any id not covered here. */
export const drawnToPhrase: Record<string, string> = {
  'sunrise-deck': 'a sunrise on the deck',
  'sunset-cocktails': 'sunset cocktails',
  'buzzing-ports': 'buzzing city ports',
  'quiet-coves': 'quiet island coves',
  'dance-dawn': 'dancing till dawn',
  'spa-morning': 'an early spa morning',
  'snorkel-reef': 'snorkeling the reef',
  'read-pool': 'reading by the pool',
  'tasting-menu': "the chef's tasting menu",
  'beach-grill': 'a casual beach grill',
  'rum-live-music': 'rum and live music',
  'wine-stargazing': 'wine and stargazing',
  'adrenaline-trek': 'an adrenaline shore trek',
  'scenic-drive': 'a slow scenic drive',
  'rooftop-party': 'a rooftop pool party',
  'hot-spring': 'a hidden hot spring',
  'old-world-harbors': 'old-world harbors',
  'wild-coasts': 'untouched wild coasts',
  'street-food': 'local street food',
  'tablecloth-dinner': 'a white-tablecloth dinner',
};
