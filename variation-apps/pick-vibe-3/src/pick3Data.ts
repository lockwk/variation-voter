/**
 * `vibe-pick-3`-local content maps, keyed by `VibeOption.id` from the shared
 * `vibeRounds` data (`../vibe-shared/data.ts`). Forked from
 * `vibe-pick-2/pick2Data.ts` rather than shared, for the same reason that file
 * gives (see its own header comment / CONTRACT.md — don't mutate
 * `vibe-shared/data.ts`'s shape, keep concept-local content maps independent
 * so future tweaks to one concept don't ripple into siblings).
 *
 * Unlike `pick2Data.ts`, this file drops `drawnToPhrase` — vibe-pick-3's
 * results screen has no "You're drawn to ___" phrase, only the "YOUR VIBE IS"
 * badge row (see VibePick3Playground.tsx's `ResultsScreen`).
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
