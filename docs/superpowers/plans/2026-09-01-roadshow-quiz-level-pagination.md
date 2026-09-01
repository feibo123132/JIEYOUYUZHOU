# Roadshow Quiz Level Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit each roadshow quiz level column to five visible songs and provide always-visible independent pagination without losing cross-page selections.

**Architecture:** Keep pagination state local to `RecognitionSongListEditor` as a page-number record keyed by `QuizLevel`. Derive page counts and visible slices from the existing grouped songs, clamp invalid pages when group sizes change, and render a compact pager only when a level has more than one page.

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: Add level pagination behavior contract

**Files:**
- Modify: `tests/songRequest.test.ts`
- Modify: `src/components/SongRequest/roadshow.ts`

- [ ] Add behavior-level tests for a small pagination helper: five-item slicing, independent pages for different levels, and clamping after list-size changes.
- [ ] Add a focused component contract assertion that pagination changes only per-level page state and that selection remains stored separately in `selectedSongIds`.
- [ ] Run only the new tests and confirm they fail before implementation.

### Task 2: Implement independent five-song pages

**Files:**
- Modify: `src/components/SongRequest/RoadshowPanel.tsx`
- Modify: `src/components/SongRequest/roadshow.ts`

- [ ] Add a pure `paginateRoadshowSongs` helper so page slicing and clamping are behavior-tested without introducing a browser test dependency.
- [ ] Add `QUIZ_SONGS_PER_PAGE = 5` and initialize page 1 for all four quiz levels.
- [ ] Clamp each stored page when grouped song counts change and reset pages when the roadshow record changes.
- [ ] Render only the current level's five-song slice.
- [ ] Always render compact previous/page/next controls at the bottom; use `1 / 1` with disabled arrows for a single page.
- [ ] Preserve selection state by continuing to store selected song IDs independently of pagination.

### Task 3: Verify

**Files:**
- Test: `tests/songRequest.test.ts`

- [ ] Run the targeted helper and component pagination tests and confirm they pass, including independent level pages and clamping.
- [ ] Run the existing targeted roadshow participation test to catch nearby regressions.
