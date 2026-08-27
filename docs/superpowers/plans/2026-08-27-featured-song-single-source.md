# Featured Song Single Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the duplicated popular-title list and make each song's `featured` field the only source of truth without disrupting existing browser catalogs.

**Architecture:** Store the featured flag directly on every built-in song. Upgrade the editable catalog schema to version 5 and merge built-in song fields over cached built-in records while retaining custom songs and artists.

**Tech Stack:** TypeScript, React, Node test runner.

---

### Task 1: Lock the migration behavior with tests

**Files:**
- Modify: `tests/songRequest.test.ts`

- [ ] Assert the catalog no longer exports or derives from `POPULAR_SONG_TITLES`.
- [ ] Assert the same 37 songs remain featured from their own records.
- [ ] Assert a version-4 browser cache migrates to version 5, receives default featured flags, and keeps custom songs.
- [ ] Run the focused test and confirm it fails for the missing migration.

### Task 2: Migrate the catalog to one source of truth

**Files:**
- Modify: `src/components/SongRequest/songCatalog.ts`
- Modify: `src/components/SongRequest/songRequest.ts`

- [ ] Mark the 37 built-in songs directly with `featured: true`.
- [ ] Remove the popular-title array, set, and final featured override.
- [ ] Upgrade editable catalogs to version 5.
- [ ] Migrate versions 1-4 by refreshing built-in records from defaults and retaining custom records.
- [ ] Run focused tests until green.

### Task 3: Verify the project

**Files:**
- Verify: all changed source and test files.

- [ ] Run the complete test suite.
- [ ] Run TypeScript checking.
- [ ] Run the production build.
- [ ] Run `git diff --check` on changed files.
