# Happiness Sky Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the happiness dialog with an immersive full-screen happiness sky that reuses the existing Three.js background.

**Architecture:** Keep `happinessPortrait.ts` as the pure analysis layer. Replace the dialog with `HappinessSkyPage.tsx`, and let `StarrySky` render it as an early-return child page so all ordinary sky controls disappear without duplicating the global canvas.

**Tech Stack:** React 18, TypeScript, CSS, Three.js background already mounted by App, Node test runner.

---

### Task 1: Lock the full-screen contract

**Files:**
- Modify: `tests/happinessPortrait.test.ts`

- [ ] Replace dialog assertions with failing assertions for `HappinessSkyPage.tsx`: `main`, back button, title, summary, circular keyword variables, frequency-proportional size/font, pointer perspective, optional representative panel, empty states and reduced-motion.
- [ ] Assert `StarrySky` imports the page and returns it before mounting the ordinary assistant/sidebar/star field UI.
- [ ] Run the focused test and confirm it fails because the new page is absent and old dialog integration remains.

### Task 2: Build the happiness sky page

**Files:**
- Create: `src/components/StarrySky/HappinessSkyPage.tsx`
- Delete: `src/components/StarrySky/HappinessPortraitDialog.tsx`
- Modify: `src/index.css`

- [ ] Render the analysis summary and empty states over the transparent full viewport.
- [ ] Render ranked keywords as equal-width/equal-height circles using one frequency ratio for diameter and font size; use stable positions ordered from center to outer rings.
- [ ] Add CSS perspective, pointer tilt, depth, glow, mobile no-overlap grid, reduced motion, and a click-open representative-message side panel.
- [ ] Run the focused test and fix until the component contract passes.

### Task 3: Integrate as an isolated child page

**Files:**
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `tests/happinessPortrait.test.ts`

- [ ] Replace the dialog import with `HappinessSkyPage`.
- [ ] Before the ordinary `StarrySky` return, early-return the happiness page only for the life theme and pass the complete `stars` list plus the existing close/focus-restoration handler as `onBack`.
- [ ] Remove the old bottom dialog mount.
- [ ] Run the happiness and star-layout focused tests.

### Task 4: Verify

**Files:**
- Verify only.

- [ ] Run `npm run check`.
- [ ] Run the scoped Node tests for happiness, seed stars, default display and layout.
- [ ] Run `npm run build` once; stop if the known sandbox `esbuild spawn EPERM` recurs.
- [ ] Run scoped `git diff --check` and inspect only happiness feature files.
