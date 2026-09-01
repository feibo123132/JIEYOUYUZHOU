# Life Happiness Seed Stars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 100 clickable, immutable, uniquely worded happiness stars to the life theme without writing cloud data.

**Architecture:** A focused pure-data module generates and merges the seed stars. Existing welcome and sky components consume the merge helper, while small exported selection/deletion guards keep random display and immutability deterministic and testable.

**Tech Stack:** React 18, TypeScript, Node test runner.

---

### Task 1: Seed-star data and merge helper

**Files:**
- Create: `src/components/StarrySky/lifeSeedStars.ts`
- Create: `tests/lifeSeedStars.test.ts`

- [ ] Write failing tests for 100 records; unique `life-seed-` IDs/user IDs, nicknames, and messages; 45–55-code-point messages; 20–36 sizes; existing shape keys; approved warm colors; deterministic coordinates inside the 12–88 safe range; and theme-isolated idempotent merge.
- [ ] Run `node --experimental-strip-types --test tests/lifeSeedStars.test.ts` and confirm it fails because the module is missing.
- [ ] Implement the smallest deterministic generator and merge helper that satisfy the tests.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Integrate counts, display priority, and deletion guard

**Files:**
- Modify: `src/components/Welcome/WelcomeScreen.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `tests/lifeSeedStars.test.ts`

- [ ] Add failing source/behavior tests for merge usage; life welcome count gaining 100 while JIEYOU stays unchanged; live-star priority only in random star mode; full star mode and message mode retaining the complete merged set; merged-data search/click paths; and seed-star deletion rejection.
- [ ] Run the focused test and confirm the new assertions fail.
- [ ] Export small pure helpers from `lifeSeedStars.ts`, merge immediately after loading in both consumers, prioritize live stars when selecting 30, and guard both delete visibility and the delete handler.
- [ ] Run `node --experimental-strip-types --test tests/lifeSeedStars.test.ts tests/starrySkyDefaultDisplay.test.ts tests/themeConfig.test.ts` and confirm all pass.

### Task 3: Verification

**Files:**
- Verify only; no planned production changes.

- [ ] Run `node --experimental-strip-types --test tests/lifeSeedStars.test.ts tests/starrySkyDefaultDisplay.test.ts tests/starLayout.test.ts tests/themeConfig.test.ts`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and the scoped diff to ensure unrelated SongRequest changes remain untouched.
