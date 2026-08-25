# 吉他路演点歌台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, shared-device song request station with a curated “热门歌曲” section and a persistent cumulative “点歌榜”.

**Architecture:** Keep editable song metadata in one catalog file, and keep filtering, voting, ranking, and storage parsing in a pure helper module. A single React page owns UI state and persists counts to `localStorage`; existing Zustand navigation opens it from a new homepage card.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Node test runner

---

### Task 1: Song catalog and vote logic

**Files:**
- Create: `src/components/SongRequest/songCatalog.ts`
- Create: `src/components/SongRequest/songRequest.ts`
- Create: `tests/songRequest.test.ts`

- [ ] Write failing tests for title/artist search, category filtering, featured selection, cumulative increment, count-descending/config-order ranking, and persistence recovery from malformed JSON, wrong schema versions, unknown song IDs, negative/non-integer counts.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`; expect failure because modules do not exist.
- [ ] Add 12 clearly editable starter records of common Chinese guitar-cover songs with stable `id`, `title`, `artist`, `category`, and `featured` fields; include a file-top comment showing exactly where to edit.
- [ ] Implement `filterSongs`, `getFeaturedSongs`, `incrementSongVote`, `rankSongsByVotes`, and safe JSON read/write helpers using a narrow Storage-like interface.
- [ ] Re-run the targeted test; expect all cases to pass.

### Task 2: Navigation and homepage entry

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Theme/ThemeHub.tsx`
- Modify: `tests/appStore.test.ts`

- [ ] Inspect `git diff -- src/App.tsx src/components/Theme/ThemeHub.tsx tests/appStore.test.ts` and preserve the user's uncommitted keepsake deep-link/studio changes while extending the current three-card layout to four cards.
- [ ] Add failing source/state tests for a `song-request` view, `enterSongRequestStation`, the “点歌台” homepage card, and removal of any homepage keepsake contract.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/appStore.test.ts`; expect the new assertions to fail.
- [ ] Add the new Zustand view/action, pass `onOpenSongRequest` into `ThemeHub`, render the fourth red/amber card, and render the page from `App`.
- [ ] Re-run `node --experimental-strip-types --test --experimental-test-isolation=none tests/appStore.test.ts`; expect it to pass.

### Task 3: Responsive point-of-request page

**Files:**
- Create: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `src/index.css`
- Test: `tests/songRequest.test.ts`

- [ ] Add a failing source contract test for “热门歌曲”, “点歌榜”, search, categories, request buttons, and absence of audio/playback controls.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`; expect failure because the page does not exist.
- [ ] Build the stage-light UI with an explicit desktop `lg:grid-cols-[minmax(0,1fr)_22rem]` library/ranking split and mobile stacked flow: header/back action, search, category chips, unranked featured cards, full catalog, cumulative ranking, one-click request feedback, and empty states.
- [ ] Persist every successful request under one versioned `localStorage` key; do not add audio, queue, reset, network, or dependencies.
- [ ] Re-run `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`, then run `npm test` and `npm run build`; require exit code 0.
