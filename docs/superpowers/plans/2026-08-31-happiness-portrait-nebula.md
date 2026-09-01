# Happiness Portrait Nebula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an all-user “幸福的模样” tool that turns life-theme star messages into a local, interactive happiness-keyword nebula.

**Architecture:** A pure analysis module owns the dictionary, normalization, matching, stable ranking, and representative-message selection. A focused dialog component renders the derived model, while `StarrySky` owns open state and `AssistantSidebar` only exposes the life-theme entry callback.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Node test runner; no new dependencies or external APIs.

---

### Task 1: Pure happiness analysis

**Files:**
- Create: `src/components/StarrySky/happinessPortrait.ts`
- Create: `tests/happinessPortrait.test.ts`

- [ ] Write failing tests importing `analyzeHappinessPortrait(stars)` and asserting: NFKC/lowercase/whitespace/punctuation normalization; the 12 specified alias groups; one count per star per keyword; multi-keyword matches; count-desc/dictionary-order sorting; `min(12, hits)` output; latest-valid-date then ID representative ordering; invalid dates last; empty-message and no-match states.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/happinessPortrait.test.ts`; expect `ERR_MODULE_NOT_FOUND`.
- [ ] Implement exported `HAPPINESS_KEYWORDS`, `normalizeHappinessText`, and `analyzeHappinessPortrait` returning `{ messageCount, keywords }`, where each keyword contains `{ label, count, starIds, representatives }`; keep colors in the display component and fix the result cap at 12.
- [ ] Re-run the focused test; expect all assertions to pass.

### Task 2: Happiness nebula dialog

**Files:**
- Create: `src/components/StarrySky/HappinessPortrait.tsx`
- Modify: `src/index.css`
- Modify: `tests/happinessPortrait.test.ts`

- [ ] Add failing executable tests for `resolveSelectedHappinessKeyword(current, keywords)` and `isHappinessPortraitCloseKey(key)` exported from the JSX-free `happinessPortrait.ts` module. Because Node strip-types cannot import TSX and the project has no DOM test dependency, use focused source assertions only for dialog/ARIA structure, summary copy, both empty states, keyword controls, three-card slicing, `useMemo`, backdrop wiring, and autofocus; rely on TypeScript/build verification for component compilation.
- [ ] Run the focused test; expect the component assertions to fail because the file is missing.
- [ ] Build `HappinessPortrait({ stars, onClose })` with a stable 12-position layout, 18–36px frequency-scaled labels, black/amber/rose glass styling, responsive scroll layout, and reduced-motion CSS.
- [ ] Use the tested selection helper in an effect: retain the selected label while present, otherwise select the new first result, otherwise clear selection; use the tested key helper for Escape.
- [ ] Re-run the focused test; expect all assertions to pass.

### Task 3: Sidebar and starry-sky integration

**Files:**
- Modify: `src/components/StarrySky/AssistantSidebar.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `tests/happinessPortrait.test.ts`

- [ ] Add failing assertions that `AssistantSidebar` accepts `showHappinessPortrait`, `onOpenHappinessPortrait`, and `happinessPortraitTriggerRef`, renders “幸福的模样” after the administrator row only when enabled, attaches the forwarded ref, and exposes a “查看” button; assert `StarrySky` enables it only for `theme.id === 'life'`, passes the complete `stars` list to the dialog, keeps the sidebar mounted behind the dialog, mounts the dialog, and calls a tested `restoreHappinessPortraitFocus(ref)` helper after closing.
- [ ] Run the focused test; expect the new integration assertions to fail.
- [ ] Add `isHappinessPortraitOpen` and an entry-button ref in `StarrySky`; pass the ref through `AssistantSidebar` to the actual “查看” button, keep the sidebar open, wire open/close handlers, and mount `<HappinessPortrait stars={stars} onClose={...} />` above it.
- [ ] Re-run `tests/happinessPortrait.test.ts`, `tests/lifeSeedStars.test.ts`, and `tests/starrySkyDefaultDisplay.test.ts`; expect all to pass.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/happinessPortrait.test.ts tests/lifeSeedStars.test.ts tests/starrySkyDefaultDisplay.test.ts tests/starLayout.test.ts`.
- [ ] Run `npm run check`.
- [ ] Run `npm run build` once; if the known Vite `esbuild spawn EPERM` recurs, record it and do not retry.
- [ ] Run scoped `git diff --check` and inspect only the happiness feature files, preserving unrelated SongRequest changes.
