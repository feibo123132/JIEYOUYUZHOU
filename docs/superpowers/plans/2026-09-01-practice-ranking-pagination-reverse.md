# Practice Ranking Pagination and Reverse Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit the guitar-practice ranking to 50 songs per page and add a true-rank-preserving reverse display mode.

**Architecture:** Extend the ranking derivation in `SongRequestStation.tsx` with an explicit order state, then paginate the fully ordered visible ranking. Keep random and reverse mutually exclusive and reuse the compact pagination treatment from the artist list.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Node test runner.

---

### Task 1: Add ranking pagination and order regression coverage

**Files:**
- Modify: `tests/songRequest.test.ts`

- [x] Add a focused source regression test asserting the 50-song page size, 49/50/51 boundaries, order state, paginated list, navigation controls, real-rank medal rendering, page reset, and random/reverse mutual exclusion.
- [x] Run the focused test and confirm it fails because the feature is absent.

### Task 2: Implement ranking pagination and reverse order

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`

- [x] Add `PERSONAL_RANKING_PAGE_SIZE = 50`, page state, and `normal | reverse` order state.
- [x] Derive stable ordered results first and slice the requested page afterward; keep page state out of random-sequence memo dependencies.
- [x] Reset/clamp the page when the artist filter, order, or result count changes.
- [x] Add the compact order toggle and bottom pagination controls with accessible labels.
- [x] Make reverse and random controls mutually exclusive with the exact transitions and page resets defined in the spec.
- [x] Derive medal styling from `originalRank`, never from the page-local render index.

### Task 3: Verify

**Files:**
- Test: `tests/songRequest.test.ts`

- [x] Run the focused ranking and pagination tests and confirm they pass.
- [x] Run `npm run check` and confirm TypeScript succeeds.
- [x] Run `git diff --check` and inspect the scoped diff.
