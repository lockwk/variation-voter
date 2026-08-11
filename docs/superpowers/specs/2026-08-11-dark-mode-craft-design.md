# Dark Mode Craft Pass — Design

- **Date:** 2026-08-11
- **Status:** Approved (design); implementation deferred to a follow-on branch/PR
- **Author:** Kevin Lockwood (with Claude)

## Problem & motivation

Live testing of the built app (Tasks 1–23 of the original implementation plan) surfaced a real theming bug: the public voter page mixes light and dark styling in a way that's genuinely broken, not just unpolished. The selected row in the left nav is nearly unreadable (near-white text on a light-gray background), and the All/New/Top sort buttons render as solid white boxes against a black page background.

Root cause, confirmed by reading the code: two independent dark-mode mechanisms coexist and never talk to each other. A leftover `create-next-app` block in `app/globals.css` flips the page's `--background`/`--foreground` based on the visitor's **OS** color-scheme preference. Untitled UI's own dark mode is a **separate, class-based** mechanism (`.dark-mode` on an ancestor element) that nothing in the app ever applies. So the page background follows the OS, while every Untitled UI component always renders its light-mode styling — producing exactly the clash observed.

A further audit (grepping hand-written app code for Untitled UI's semantic color tokens vs. literal Tailwind classes) found the problem is broader than the toggle: only two files (`variation-list.tsx`, `stage.tsx`) import any real Untitled UI components at all, and **zero** hand-written files use Untitled UI's semantic tokens (`bg-primary`, `text-secondary`, `border-secondary`, etc.). Instead, structural/layout code throughout uses literal, non-theme-aware Tailwind grays (`bg-gray-50`, `text-gray-600`, `border-gray-200`, `bg-gray-100`). The app was only ever partially wired into Untitled UI's design system — its component library, but not its token system.

Given this, the user wants the UI to have "a strong element of craft": aesthetically pleasing, consistent, clean, well laid out — and has decided the app should commit to **dark mode only** (no light/dark toggle) rather than try to support both.

## Goals

- Fix the light/dark contrast bug at the root — not a patch, a real fix.
- Bring every hand-written UI file onto Untitled UI's design token system consistently, so the whole app renders through one theme.
- Dark-mode only. No toggle, no `prefers-color-scheme` dependency, nothing to keep in sync across two modes.
- A quiet, monochrome shell (Zinc neutral palette, no separate brand accent color) that recedes behind the variation content being judged — the container should not compete with the content for attention.
- Preserve the one place color carries real information: the 👍/👎 vote badges stay semantic green/red. That's functional signal, not decoration.
- Elevate two specific interaction points with purpose-built Untitled UI components instead of ad-hoc markup: the All/New/Top sort control, and commenter identity in the comment feed.

## Non-goals

- No light-mode support and no theme toggle.
- No structural/layout redesign — the left-nav + stage layout is unchanged.
- No animation/motion pass.
- No changes to the admin CLI or API (they have no UI surface — this only touches the public voter page and the root landing page).
- No responsive/mobile-specific work beyond what already exists.

## Current state (audit findings)

- `app/globals.css`:
  - A leftover `@media (prefers-color-scheme: dark)` block overrides `:root`'s `--background`/`--foreground` based on OS preference, affecting the plain `<body>`.
  - Untitled UI's own dark-mode selector, `@custom-variant dark (&:where(.dark-mode, .dark-mode *));`, is defined but the `.dark-mode` class is never applied anywhere in the app — so Untitled UI components always render light-mode styling.
- Hand-written files using literal, non-theme-aware Tailwind classes instead of Untitled UI's semantic tokens:
  - `app/page.tsx` — `bg-gray-50`, `text-gray-900`, `text-gray-600`.
  - `app/v/[voterId]/variation-list.tsx` — `border-gray-200`, `bg-gray-50`, `bg-gray-100`.
  - `app/v/[voterId]/stage.tsx` — `border-gray-200`, `text-gray-600`, `text-gray-500`, `bg-gray-50`, `text-gray-700`.
- Only `variation-list.tsx` and `stage.tsx` import any real Untitled UI components (`Button`, `Badge`, `Input`, `TextArea`, `EmptyState`). `app/page.tsx`, `app/layout.tsx`, and `app/v/[voterId]/voter-shell.tsx` use none.
- Net effect observed live: the selected-variation nav row renders near-white text (inherited from the OS-driven dark body foreground) on a hardcoded light-gray background (unreadable); the sort buttons render Untitled UI's light-mode white styling regardless of the dark body background around them.

## Design

### Theming: dark-mode-only, Zinc-based, no brand accent

- The app renders in dark mode unconditionally. `<html>` (in `app/layout.tsx`) gets a permanent `dark-mode` class, matching Untitled UI's `@custom-variant dark (&:where(.dark-mode, .dark-mode *))` selector in `app/globals.css`. No toggle, no OS-preference dependency.
- The leftover `@media (prefers-color-scheme: dark)` block in `app/globals.css` (the `:root` override for `--background`/`--foreground`) is deleted — it's a relic of the original `create-next-app` scaffold, fully superseded by Untitled UI's own theme tokens.
- Untitled UI's neutral/base palette (the gray-scale token set in `app/theme.css` that all the semantic `bg-*`/`text-*`/`border-*` tokens reference) is swapped from the default gray scale to **Zinc**.
- The purple **brand** palette (`--color-brand-*`, backing `bg-brand-solid` and similar "primary" semantic tokens) is retired. Primary/selected-state tokens get remapped to zinc-toned values instead (e.g. a solid near-white or near-black fill for primary buttons and selected states), so there's exactly one neutral color story — nothing reads as "branded" or competes with the variation content for attention.
- **Deliberate exception:** the 👍/👎 vote count `Badge`s keep Untitled UI's semantic `success`/`error` colors (green/red). This is information being scanned at a glance, not brand decoration, and desaturating it would hurt usability.

### Component upgrades

- **Sort control** (`app/v/[voterId]/variation-list.tsx`): install Untitled UI's `button-group` component (`npx untitledui@latest add button-group` — public/free, confirmed via the Untitled UI catalog) and replace the current row of three independent `Button`s (All/New/Top) with it, so the control reads as one intentional segmented control rather than three loose buttons.
- **Comment feed** (`app/v/[voterId]/stage.tsx`): install Untitled UI's `avatar` component (`npx untitledui@latest add avatar` — public/free, confirmed via the Untitled UI catalog) and render an initials-avatar next to each commenter's name, with a sensible fallback treatment when `voterName` is null (consistent with the existing "Anonymous" text fallback).
- Both installs follow the same process established in the original build: after installing, **read the actually-generated component source to confirm real prop names before wiring it up** — the original build hit two real naming surprises this way (`Button`'s real path turned out to be `components/base/buttons/` plural, and `Textarea`'s real export was `TextArea`), so this plan should not assume prop/export names without verifying against the installed source.

### Token audit — bring every hand-written file onto the design system

Every literal `gray-*`/`white`/`black` Tailwind utility class in hand-written app code gets replaced with the equivalent Untitled UI semantic token, so the whole app renders through one consistent theme. In scope:

- `app/page.tsx` — the root landing page.
- `app/v/[voterId]/variation-list.tsx` — nav wrapper, header, dividers, row backgrounds.
- `app/v/[voterId]/stage.tsx` — dividers, stage background, description/comment text.
- `app/layout.tsx` — add the `dark-mode` class to `<html>`; no other literal colors present there today.

The exact semantic token each literal class maps to (e.g. `border-gray-200` → `border-secondary`, `bg-gray-50` → `bg-primary` or `bg-secondary` depending on context, `text-gray-600` → `text-tertiary`) is a per-usage judgment call — the implementer should cross-reference how the vendored components under `components/` (which already use these tokens consistently) apply them in similar contexts, rather than guessing token names from scratch.

## Testing

- No new automated test coverage is expected purely for color/token changes (visual appearance isn't meaningfully unit-testable).
- Where the `button-group`/`avatar` component swaps change DOM structure that existing tests assert on (e.g. `tests/ui/variation-list.test.tsx`'s sort-button click assertions, `tests/ui/stage.test.tsx`'s comment-rendering assertions), those tests must be updated to match and continue passing.
- The full existing test suite must stay green throughout (89 tests as of the branch this design follows on from).
- Manual verification: run the dev server, visually confirm contrast/readability across the nav, stage, voting panel, and comment feed. Run a Design Critique pass using the `interface-craft` skill against the rendered UI as a quality gate before considering the work done.

## Success criteria

- No mixed light/dark rendering anywhere in the app — every surface is consistently dark.
- The previously-broken selected-nav-row contrast and white-sort-buttons-on-black-background issues are gone.
- Grepping hand-written `app/**/*.tsx` for literal `gray-*`/`white`/`black` Tailwind color classes returns zero results (vendored `components/` excluded).
- The All/New/Top sort control uses Untitled UI's `button-group` component; the comment feed shows avatars.
- Full test suite passes.
- A Design Critique pass (via `interface-craft`) has been run, with findings either addressed or explicitly deferred with reasoning.

## Open questions / future phases

- None identified — this is a well-scoped follow-on pass to the original implementation. If broader visual/motion polish is wanted later, that would be a separate design.
- This work is intentionally deferred to a new branch/PR (per the author's plan: review and merge the current implementation branch first, then start fresh for this pass). The implementation plan for this design should be written via `superpowers:writing-plans` at the start of that new branch, not as part of the current one.
