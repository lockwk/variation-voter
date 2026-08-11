# Dark Mode Craft Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the app's broken light/dark theming at the root, commit the public voter page and landing page to a single dark-mode-only, Zinc-neutral Untitled UI theme, and upgrade two interaction points (sort control, comment identity) to purpose-built Untitled UI components.

**Architecture:** No structural change. This is a token-system and theming-wire-up pass over three existing hand-written files (`app/page.tsx`, `app/v/[voterId]/variation-list.tsx`, `app/v/[voterId]/stage.tsx`) plus `app/layout.tsx` and the two theme files (`app/globals.css`, `app/theme.css`). Untitled UI's own `.dark-mode` class-based dark mode (already defined via `@custom-variant dark (&:where(.dark-mode, .dark-mode *))` in `globals.css`) becomes permanently active; the app's semantic color tokens (`bg-primary`, `text-secondary`, `border-secondary`, etc.) are swapped from the default gray scale to Zinc and the purple brand palette is retired by aliasing it onto the same Zinc scale — so every token, brand or neutral, resolves to one consistent gray story. Two components (`button-group`, `avatar`) are added via the `untitledui` CLI, matching the pattern the original build already used for `button`/`badges`/`input`/`textarea`/`empty-state`.

**Tech Stack:** Next.js 15 (App Router) · Tailwind CSS v4 · Untitled UI (v8) component library via the `untitledui` CLI · Vitest + Testing Library (existing test suite, 89+ tests).

## Global Constraints

- **Dark-mode only, no toggle:** the app renders in dark mode unconditionally — no `prefers-color-scheme` dependency, nothing to keep in sync across two modes.
- **No new brand accent:** the purple `--color-brand-*` palette is retired, not replaced with a different accent — the shell is monochrome (Zinc) end to end.
- **Preserve semantic color:** the 👍/👎 vote count `Badge`s keep Untitled UI's `success`/`error` (green/red) colors untouched — that's information, not decoration, and is out of scope for every task in this plan.
- **Free-tier / public components only:** `button-group` and `avatar` must be installed from Untitled UI's public/free catalog (already confirmed at design time) — if the CLI reports PRO access required for either, stop and report back rather than hand-building a substitute.
- **No structural/layout redesign, no motion pass, no admin/CLI/API changes** — this plan touches only the public voter page (`app/v/[voterId]/**`) and the root landing page (`app/page.tsx`), plus the two shared theme files.
- **Full existing test suite (89+ tests) must stay green throughout.** `npm test` requires the test database configured in `.env.test.local` from the original build (Task 4 of the original implementation plan) — no new test-infrastructure setup is needed for this plan.
- **Verify component APIs against installed source, not assumption:** after installing `button-group`/`avatar`, read the generated files before wiring them up. The original build hit two real naming surprises this way (`Button`'s real path was `components/base/buttons/` plural; `Textarea`'s real export was `TextArea`) — treat the CLI's generated output as the source of truth over any code shown in this plan.

---

## Phase 0 — Root theming fix

### Task 1: Wire `.dark-mode` unconditionally and remove the legacy OS-driven background mechanism

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: Untitled UI's `.dark-mode` selector and `--color-bg-primary`/`--color-text-primary` tokens, already defined in `app/theme.css` (light values at lines 348/292; `.dark-mode`-scoped overrides at lines 708/655).
- Produces: `<html>` permanently carries the `dark-mode` class; `<body>` renders through Untitled UI's own primary background/text tokens instead of the old create-next-app `--background`/`--foreground` pair. No other task depends on new exports here — this is pure wiring, verified by build + visual check.

This is the actual bug fix: today `<body>` sets its background/color via a plain CSS rule (`background: var(--background)`) that only ever follows the visitor's OS `prefers-color-scheme`, completely independent of Untitled UI's `.dark-mode`-class mechanism that every component actually renders through. Deleting only the `@media` block (as a naive reading of the design might suggest) would leave the page background hardcoded to white — the fix has to also repoint `body` itself onto Untitled UI's tokens.

- [ ] **Step 1: Add the `dark-mode` class to `<html>`**

In `app/layout.tsx`, change:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

to:

```tsx
    <html
      lang="en"
      className={`dark-mode ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

- [ ] **Step 2: Remove the legacy `:root` background/foreground variables and OS-preference override**

In `app/globals.css`, delete this entire block:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

and replace it with just the font-variable mapping (the Geist font wiring is unrelated to this design's scope — `--color-background`/`--color-foreground` and their Tailwind utilities are not referenced anywhere in `app/` or `components/`, confirmed by grep, so nothing else depends on them):

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

- [ ] **Step 3: Repoint `body`'s background/color onto Untitled UI's tokens**

In the same file, change:

```css
body {
  background: var(--background);
  color: var(--foreground);
}
```

to:

```css
body {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}
```

`--color-bg-primary`/`--color-text-primary` are Untitled UI's own tokens (defined in `app/theme.css`); once `.dark-mode` is on `<html>`, the `.dark-mode`-scoped overrides at `app/theme.css:708` (`--color-bg-primary: var(--color-neutral-950)`) and `:655` (`--color-text-primary: var(--color-neutral-50)`) take effect via normal CSS custom-property inheritance — no Tailwind `dark:` utility needed on `body` itself.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, open `http://localhost:3000`. Expected: the root landing page now renders with a dark background and light text (colors will still look unrefined — page.tsx's literal `bg-gray-50`/`text-gray-900` classes haven't been touched yet, that's Task 3). The point of this check is confirming the *page shell* (the un-classed area around/behind that div, and the `<body>` itself) is dark, not that every pixel is fixed yet.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "fix: make dark-mode the unconditional theme, remove OS-preference background split"
```

### Task 2: Swap the neutral scale to Zinc and retire the brand palette

**Files:**
- Modify: `app/theme.css`

**Interfaces:**
- Consumes: Tailwind v4's built-in `--color-zinc-*` scale (available globally via `@import "tailwindcss"` in `globals.css`, no import needed in `theme.css`).
- Produces: every token that resolves through `--color-neutral-*` (the base gray-scale token set — `--color-utility-neutral-*`, `--color-text-primary`, `--color-bg-primary`, `--color-border-secondary`, etc., both in the light block and the `.dark-mode` override block) now resolves to Zinc values instead of Tailwind's default `neutral` values. Every token that resolves through `--color-brand-*` (`bg-brand-solid`, `text-brand-primary`, `border-brand`, `focus-ring`, etc.) now resolves to the *same* Zinc values, at the matching shade — so there is exactly one gray story, and nothing in the app renders purple. Tasks 3-8 consume the *semantic* tokens (`bg-primary`, `border-secondary`, ...) that sit on top of this, not these raw palettes directly.

The base gray-scale token in this codebase is named `--color-neutral-*`, not `--color-gray-*` — it currently isn't defined explicitly in `theme.css` at all, so it silently inherits Tailwind v4's built-in default `neutral` swatch. This task makes it explicit and repoints it to `zinc`.

- [ ] **Step 1: Add an explicit neutral → Zinc alias, and retire the brand palette onto the same scale**

In `app/theme.css`, the raw palette block currently reads:

```css
    --color-brand-50: rgb(249 245 255);
    --color-brand-100: rgb(244 235 255);
    --color-brand-200: rgb(233 215 254);
    --color-brand-300: rgb(214 187 251);
    --color-brand-400: rgb(182 146 246);
    --color-brand-500: rgb(158 119 237);
    --color-brand-600: rgb(127 86 217);
    --color-brand-700: rgb(105 65 198);
    --color-brand-800: rgb(83 56 158);
    --color-brand-900: rgb(66 48 125);
    --color-brand-950: rgb(44 28 95);
```

Replace that entire block with:

```css
    /* Swapped from Tailwind's default `neutral` scale to `zinc` — the app's base gray-scale token. */
    --color-neutral-50: var(--color-zinc-50);
    --color-neutral-100: var(--color-zinc-100);
    --color-neutral-200: var(--color-zinc-200);
    --color-neutral-300: var(--color-zinc-300);
    --color-neutral-400: var(--color-zinc-400);
    --color-neutral-500: var(--color-zinc-500);
    --color-neutral-600: var(--color-zinc-600);
    --color-neutral-700: var(--color-zinc-700);
    --color-neutral-800: var(--color-zinc-800);
    --color-neutral-900: var(--color-zinc-900);
    --color-neutral-950: var(--color-zinc-950);

    /* Retired: the purple brand palette. Every brand-* token now aliases the
       equivalent zinc stop, so brand/neutral tokens render identically and
       nothing in the app carries a separate accent color. */
    --color-brand-50: var(--color-neutral-50);
    --color-brand-100: var(--color-neutral-100);
    --color-brand-200: var(--color-neutral-200);
    --color-brand-300: var(--color-neutral-300);
    --color-brand-400: var(--color-neutral-400);
    --color-brand-500: var(--color-neutral-500);
    --color-brand-600: var(--color-neutral-600);
    --color-brand-700: var(--color-neutral-700);
    --color-brand-800: var(--color-neutral-800);
    --color-brand-900: var(--color-neutral-900);
    --color-brand-950: var(--color-neutral-950);
```

This is deliberately a palette-level alias rather than editing the ~80 individual `--color-*-brand-*`/`--color-bg-brand-*`/`--color-text-brand-*` semantic lines scattered through the light block and the `.dark-mode` block: every one of those already derives from `--color-brand-{shade}` (directly, or via `--color-utility-brand-*`), so repointing the 11-stop raw palette once is sufficient and far lower-risk than hand-editing dozens of lines individually.

Leave `--color-utility-blue-*` and the vote-badge `success`/`error` utility tokens untouched — confirmed by reading `components/base/badges/badges.tsx` that `success`/`error` colors derive from their own `utility-success`/`utility-error` token families, not `brand`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, same count as before this task (this is a pure CSS-variable change — no test asserts on color values today).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev` (if not already running), reload `http://localhost:3000`. Expected: no purple/brand-colored elements remain anywhere in the app.

- [ ] **Step 5: Commit**

```bash
git add app/theme.css
git commit -m "feat: swap base gray scale to Zinc, retire brand purple palette"
```

Note: if the Task 9 design-critique pass later finds that a specific primary/selected-state fill (e.g. `--color-bg-brand-solid` in the `.dark-mode` block, currently aliasing `--color-neutral-600`/zinc-600) reads too flat against the zinc-950 page background, the fix is a targeted override of that one `.dark-mode`-scoped line to a lighter neutral stop (e.g. `--color-neutral-50`) — not a reversal of this task's approach.

---

## Phase 1 — Token audit (literal grays → semantic tokens)

### Task 3: `app/page.tsx` — replace literal gray classes with semantic tokens

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `bg-primary`, `text-primary`, `text-tertiary` semantic tokens (defined in `app/theme.css`, wired to Zinc/dark mode by Tasks 1-2).
- Produces: no exports — this is a leaf page.

- [ ] **Step 1: Replace the literal classes**

In `app/page.tsx`, change:

```tsx
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Variation Voter</h1>
      <p className="max-w-md text-gray-600">
        This is a Variation Voter instance. Voters are created via the CLI or admin API and
        shared as direct links — there&apos;s nothing to do on this page.
      </p>
    </div>
  );
}
```

to:

```tsx
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-primary px-6 text-center">
      <h1 className="text-2xl font-semibold text-primary">Variation Voter</h1>
      <p className="max-w-md text-tertiary">
        This is a Variation Voter instance. Voters are created via the CLI or admin API and
        shared as direct links — there&apos;s nothing to do on this page.
      </p>
    </div>
  );
}
```

`bg-gray-50` (a subtle light-mode page wash) becomes `bg-primary` because this `<div>` is the root surface of the page, not a nested panel — same role as `body`'s own background from Task 1. `text-gray-900` (heading) becomes `text-primary` (strongest text weight). `text-gray-600` (supporting paragraph) becomes `text-tertiary` (Untitled UI's token for supporting/secondary body copy).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (no test targets `app/page.tsx` today; this step confirms nothing else broke).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: replace literal gray classes with semantic tokens in app/page.tsx"
```

### Task 4: `variation-list.tsx` — replace literal gray classes with semantic tokens

**Files:**
- Modify: `app/v/[voterId]/variation-list.tsx`
- Test: `tests/ui/variation-list.test.tsx` (verify only — no new assertions expected)

**Interfaces:**
- Consumes: `border-secondary`, `bg-primary_hover`, `bg-active` semantic tokens.
- Produces: no new exports — `VariationList`'s signature is unchanged.

This task also directly fixes the design's original motivating bug: the selected nav row currently renders near-white text (inherited from the old OS-driven dark body foreground) on a hardcoded `bg-gray-100` — unreadable. `bg-active` is Untitled UI's own token for exactly this "currently selected row" state, and is already paired correctly with whatever text color the row inherits.

- [ ] **Step 1: Replace the literal classes**

In `app/v/[voterId]/variation-list.tsx`, change:

```tsx
    <nav className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
```

to:

```tsx
    <nav className="w-72 shrink-0 border-r border-secondary flex flex-col">
      <div className="p-4 border-b border-secondary">
```

and change:

```tsx
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 aria-[current=true]:bg-gray-100"
```

to:

```tsx
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-primary_hover aria-[current=true]:bg-active"
```

- [ ] **Step 2: Run the existing test suite for this file**

Run: `npm test -- tests/ui/variation-list.test.tsx`
Expected: PASS, same tests as before (these assertions target click behavior, not class names).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Manual visual check**

Reload the running dev server on a page with a voter that has variations (create one via the CLI if none exists: `npm run voter -- create --title "Smoke test"` then add a variation per the CLI's `--help`). Confirm the selected row is now clearly readable, not near-white-on-light-gray.

- [ ] **Step 5: Commit**

```bash
git add app/v/\[voterId\]/variation-list.tsx
git commit -m "fix: replace literal gray classes with semantic tokens in variation-list, fixing unreadable selected row"
```

### Task 5: `stage.tsx` — replace literal gray classes with semantic tokens

**Files:**
- Modify: `app/v/[voterId]/stage.tsx`
- Test: `tests/ui/stage.test.tsx`, `tests/ui/stage-voting.test.tsx` (verify only)

**Interfaces:**
- Consumes: `border-secondary`, `text-tertiary`, `text-quaternary`, `bg-secondary`, `text-secondary` semantic tokens.
- Produces: no new exports — `Stage`'s signature is unchanged.

`text-red-600` (used for `voteError`/`commentError`) is intentionally left untouched — it's semantic error color, not a literal gray, and out of this plan's scope (same reasoning as the vote badges staying green/red).

- [ ] **Step 1: Replace the literal classes**

In `app/v/[voterId]/stage.tsx`, change:

```tsx
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-gray-600 mt-1">{variation.description}</p>}
        {voterStatus === "archived" ? (
          <p className="mt-3 text-sm text-gray-500">
```

to:

```tsx
      <div className="p-6 border-b border-secondary">
        <h2 className="text-xl font-semibold">{variation.title}</h2>
        {variation.description && <p className="text-tertiary mt-1">{variation.description}</p>}
        {voterStatus === "archived" ? (
          <p className="mt-3 text-sm text-quaternary">
```

and change:

```tsx
      <div className="flex-1 min-h-[400px] bg-gray-50">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-gray-200">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-gray-700">{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
```

to:

```tsx
      <div className="flex-1 min-h-[400px] bg-secondary">
        <VariationMedia variation={variation} />
      </div>
      <div className="p-6 border-t border-secondary">
        <h3 className="font-medium mb-3">Comments</h3>
        {variation.comments.length === 0 ? (
          <p className="text-quaternary text-sm">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-secondary">{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
```

`bg-gray-50` behind the variation media becomes `bg-secondary` — a subtle section surface distinct from the page's own `bg-primary`, letterboxing the embedded content. `text-gray-600` (description) becomes `text-tertiary`, matching Task 3's mapping. `text-gray-500` (the lower-emphasis "closed and read-only" notice and the "No comments yet" placeholder) becomes `text-quaternary` — one step lower-emphasis than `text-tertiary`. `text-gray-700` (comment body) becomes `text-secondary` — comment text is more prominent than the description copy.

- [ ] **Step 2: Run the existing test suites for this file**

Run: `npm test -- tests/ui/stage.test.tsx tests/ui/stage-voting.test.tsx`
Expected: PASS, same tests as before (these assertions target rendered text/attributes, not class names).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/v/\[voterId\]/stage.tsx
git commit -m "refactor: replace literal gray classes with semantic tokens in stage.tsx"
```

---

## Phase 2 — Component upgrades

### Task 6: Install Untitled UI's `button-group` and `avatar` components

**Files:**
- Modify: `package.json` (new deps, if the CLI adds any)
- Create (generated by CLI, verify exact paths/exports after running): `components/base/button-group/button-group.tsx`, `components/base/avatar/avatar.tsx` (or wherever the CLI actually places them — confirm with `ls`, do not assume)

**Interfaces:**
- Produces: importable components at whatever paths Step 2 confirms. Tasks 7 and 8 import from those exact paths and exact export/prop names — verified, not assumed, per this plan's Global Constraints.

- [ ] **Step 1: Install via the Untitled UI CLI**

```bash
npx untitledui@latest add button-group avatar --yes
```

If it reports PRO access required for either component, stop and report back — both were confirmed public/free in the Untitled UI catalog at design time; do not substitute a hand-built component.

- [ ] **Step 2: Verify generated files and note actual exports**

```bash
find components -iname "*button-group*" -o -iname "*avatar*"
```

Open each generated file. Note the exact exported component name(s), and every prop relevant to this plan's use case:
- For the sort control: how the group communicates a selection change (a single controlled `value`/`selectedKeys` + `onChange`/`onSelectionChange` prop on the group, vs. an `onClick`/`isSelected` prop on each item — Untitled UI's toggle-style components commonly use the former).
- For the avatar: the prop that accepts initials text (commonly `initials`), and its size prop's accepted values.

Write these down for Tasks 7 and 8 — the code shown in those tasks is this plan's best guess and must be corrected against what's actually installed.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no missing-module errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: install Untitled UI button-group and avatar components"
```

### Task 7: `variation-list.tsx` — replace the sort buttons with `ButtonGroup`

**Files:**
- Modify: `app/v/[voterId]/variation-list.tsx`
- Test: `tests/ui/variation-list.test.tsx`

**Interfaces:**
- Consumes: the `button-group` component installed and verified in Task 6 (exact import path/export name from that task's Step 2).
- Produces: no change to `VariationList`'s external props (`sortMode`, `onSortModeChange`) — only its internal rendering changes, so `voter-shell.tsx` (which renders `VariationList`) needs no changes.

- [ ] **Step 1: Confirm the existing test still targets behavior, not markup**

Open `tests/ui/variation-list.test.tsx` and re-read the "calls onSortModeChange when a sort button is clicked" test — it queries `screen.getByText("Top")` and asserts `onSortModeChange` was called with `"top"`. This query is resilient to the markup change in this task as long as the visible label text ("All"/"New"/"Top") stays on screen and clicking it still reaches a handler that calls `onSortModeChange` — no test edit is needed *unless* Step 3 reveals the installed `ButtonGroup` requires a different selection-change signature than per-item `onClick`.

- [ ] **Step 2: Run the test to confirm current baseline**

Run: `npm test -- tests/ui/variation-list.test.tsx`
Expected: PASS (this is the pre-change baseline — confirms the test file itself is healthy before touching the component under test).

- [ ] **Step 3: Replace the three `Button`s with `ButtonGroup`, using Task 6's verified API**

Current code:

```tsx
import { Button } from "@/components/base/buttons/button";
```
```tsx
        <div className="mt-3 flex gap-1">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              color={sortMode === mode ? "primary" : "secondary"}
              onClick={() => onSortModeChange(mode)}
            >
              {SORT_LABELS[mode]}
            </Button>
          ))}
        </div>
```

Replace the `Button` import with the `ButtonGroup` import from Task 6's verified path, and replace the `<div>` block with a `ButtonGroup` wired to `sortMode`/`onSortModeChange`. If Task 6 found a controlled `selectedKeys`/`onSelectionChange`-style API (the common pattern for this kind of component), the wiring looks like:

```tsx
        <ButtonGroup
          className="mt-3"
          selectedKeys={[sortMode]}
          onSelectionChange={(keys) => onSortModeChange(Array.from(keys)[0] as SortMode)}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <ButtonGroupItem key={mode} id={mode}>
              {SORT_LABELS[mode]}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
```

Use Task 6's actual export names (`ButtonGroupItem` may be named differently, e.g. `ButtonGroup.Item`) and actual prop names in place of this sketch — this is exactly the kind of naming detail the original build got wrong on the first guess for `Button`/`Textarea`, so treat this block as a starting point, not final code.

- [ ] **Step 4: Run the test, adapt if needed**

Run: `npm test -- tests/ui/variation-list.test.tsx`
Expected: PASS. If it fails because the installed `ButtonGroup`'s selection semantics don't match a simple text-click (e.g. it renders the label inside an element that doesn't propagate the click the way a plain `<button>` does), update the test's interaction to match — e.g. `await user.click(screen.getByRole("button", { name: "Top" }))` or `screen.getByRole("tab", { name: "Top" })`, whichever role the installed component actually renders — while keeping the assertion (`onSortModeChange` called with `"top"`) unchanged, since that's the behavior contract that matters.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Manual visual check**

Reload the dev server on a voter page. Confirm All/New/Top now reads as one segmented control, not three separate boxes, and clicking each option still re-sorts the list.

- [ ] **Step 7: Commit**

```bash
git add app/v/\[voterId\]/variation-list.tsx tests/ui/variation-list.test.tsx
git commit -m "feat: replace sort buttons with Untitled UI ButtonGroup"
```

### Task 8: `stage.tsx` — add commenter avatars to the comment feed

**Files:**
- Create: `lib/initials.ts`
- Test: `tests/lib/initials.test.ts`
- Modify: `app/v/[voterId]/stage.tsx`
- Test: `tests/ui/stage.test.tsx`

**Interfaces:**
- Consumes: the `avatar` component installed and verified in Task 6.
- Produces: `initialsFor(name: string | null): string` from `lib/initials.ts` — pure, no other task depends on it, but it decouples the (fully specifiable now) initials logic from the (only knowable after Task 6) exact `Avatar` prop wiring.

- [ ] **Step 1: Write the failing tests for `initialsFor`**

```ts
// tests/lib/initials.test.ts
import { describe, expect, it } from "vitest";
import { initialsFor } from "@/lib/initials";

describe("initialsFor", () => {
  it("returns the first letter of a single-word name", () => {
    expect(initialsFor("Kevin")).toBe("K");
  });

  it("returns first+last initials for a multi-word name", () => {
    expect(initialsFor("Kevin Lockwood")).toBe("KL");
  });

  it("falls back to '?' for null", () => {
    expect(initialsFor(null)).toBe("?");
  });

  it("falls back to '?' for an empty or whitespace-only name", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/lib/initials.test.ts`
Expected: FAIL with "Cannot find module '@/lib/initials'"

- [ ] **Step 3: Implement `lib/initials.ts`**

```ts
// lib/initials.ts
export function initialsFor(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/lib/initials.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for the avatar rendering in `Stage`**

Add to `tests/ui/stage.test.tsx` (inside the existing `describe("Stage", ...)` block, alongside the existing "renders comments with the commenter's name" test):

```tsx
  it("renders an avatar with initials next to a named commenter", () => {
    render(<Stage variation={base} {...stubStageProps} />);
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("renders a fallback avatar for an anonymous commenter", () => {
    render(
      <Stage
        variation={{
          ...base,
          comments: [{ id: "c2", comment: "no name given", voterName: null, createdAt: new Date() }],
        }}
        {...stubStageProps}
      />
    );
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test -- tests/ui/stage.test.tsx`
Expected: FAIL — no avatar/initials rendered yet.

- [ ] **Step 7: Wire the `Avatar` into the comment list, using Task 6's verified API**

Import `initialsFor` and the `Avatar` component (from Task 6's verified path) at the top of `app/v/[voterId]/stage.tsx`. Replace:

```tsx
            {variation.comments.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                <p className="text-secondary">{comment.comment}</p>
              </li>
            ))}
```

with:

```tsx
            {variation.comments.map((comment) => (
              <li key={comment.id} className="flex gap-2 text-sm">
                <Avatar initials={initialsFor(comment.voterName)} size="xs" />
                <div>
                  <span className="font-medium">{comment.voterName ?? "Anonymous"}</span>
                  <p className="text-secondary">{comment.comment}</p>
                </div>
              </li>
            ))}
```

Use Task 6's actual `Avatar` export name and actual prop names (`initials` and `size` are this plan's best guess) in place of this sketch.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- tests/ui/stage.test.tsx`
Expected: PASS, including the two new tests and all pre-existing ones.

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 10: Manual visual check**

Reload the dev server on a voter page with at least one comment. Confirm an initials avatar renders next to each commenter's name, with a sensible fallback for anonymous comments.

- [ ] **Step 11: Commit**

```bash
git add lib/initials.ts tests/lib/initials.test.ts app/v/\[voterId\]/stage.tsx tests/ui/stage.test.tsx
git commit -m "feat: add commenter avatars to the comment feed"
```

---

## Phase 3 — Verification & craft pass

### Task 9: Full-suite verification, token audit, and Design Critique pass

**Files:** none (verification-only task; may produce small follow-up fixes to files already touched in Tasks 1-8 if the audit or critique finds gaps)

**Interfaces:** none — this task consumes everything built in Tasks 1-8 and checks it against the design spec's success criteria.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, full suite (89+ tests from the original build, plus the `initials.test.ts` and stage-avatar tests added in Task 8).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Grep audit for remaining literal color classes**

Run:

```bash
grep -rnE "\b(bg|text|border)-(gray-[0-9]+|white|black)\b" app --include="*.tsx"
```

Expected: no output. (Vendored `components/` is intentionally excluded — the design spec scopes this audit to hand-written `app/**/*.tsx` only.) If this returns any matches, fix them using the same token-mapping approach as Tasks 3-5 before proceeding.

- [ ] **Step 4: Manual visual pass**

Run `npm run dev`. Walk through: the root landing page, the voter nav (including clicking through All/New/Top and selecting different variations), the stage (voting panel, all three content-kind renderers if you have test variations of each kind, comment feed with and without a name), and the archived/read-only state (`npm run voter -- close <voterId>` on a test voter, then reload its page). Confirm no mixed light/dark rendering anywhere, and that the originally-reported bugs (unreadable selected nav row, white sort buttons on a black page) are gone.

- [ ] **Step 5: Run a Design Critique pass**

Invoke the `interface-craft` skill's Design Critique mode against the running app (the voter page with a populated voter is the most representative surface — nav, stage, voting panel, and comment feed all visible). For each finding: either fix it directly (if it's a small, low-risk token/spacing adjustment consistent with this plan's approach) or explicitly note it as deferred, with the reasoning why, in this task's commit message or PR description.

- [ ] **Step 6: Final full-suite re-run**

Run: `npm test && npm run build`
Expected: both PASS after any Step 5 fixes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: dark-mode craft pass verification and design-critique fixes"
```
