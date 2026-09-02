# Song Score Cloud Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute each task inline because subagent delegation is disabled for this task.

**Goal:** Move song-score images from Base64 cloud-function payloads to CloudBase Storage while preserving existing local scores and enabling cross-device loading.

**Architecture:** Keep `SongScore.pages` as canonical references and add optional resolved display URLs plus a pending flag. The CloudBase adapter uploads local data URLs, resolves cloud file IDs, and deletes retired files; the station owns optimistic cache and retry behavior.

**Tech Stack:** React 18, TypeScript, `@cloudbase/js-sdk`, Node test runner, CloudBase event function and NoSQL database.

---

### Task 1: Score reference model

**Files:** `src/components/SongRequest/songScores.ts`, `tests/songScoreStorage.test.ts`

- [ ] Write failing tests for cloud file IDs, legacy Base64 migration, display URL selection, append, reorder, remove, and pending detection.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the minimal helpers and rerun to GREEN.

### Task 2: Cloud storage adapter

**Files:** `src/components/SongRequest/songRequestCloud.ts`, `tests/songRequest.test.ts`

- [ ] Add failing source-contract tests for `uploadFile`, `getTempFileURL`, `deleteFile`, hashed/random paths, and metadata-only saves.
- [ ] Run the focused test and confirm RED.
- [ ] Implement upload, resolution, cleanup, and error mapping; rerun to GREEN.

### Task 3: UI synchronization and migration

**Files:** `src/components/SongRequest/SongRequestStation.tsx`, `src/components/SongRequest/SongDetailPanel.tsx`, `tests/songRequest.test.ts`

- [ ] Add failing tests for pending status, success acknowledgement, pull-error visibility, and automatic migration of cached Base64 pages.
- [ ] Run the focused tests and confirm RED.
- [ ] Implement optimistic local cache, retry/migration, canonical/display page operations, and accurate status text.
- [ ] Rerun focused tests to GREEN.

### Task 4: Backend validation and deployment guidance

**Files:** `cloudfunctions/songRequestSync/validation.js`, `tests/songRequestSyncFunction.test.cjs`, `docs/cloudbase-song-request-sync.md`

- [ ] Add failing tests that reject Base64 database payloads and accept constrained cloud file IDs.
- [ ] Run the focused backend tests and confirm RED.
- [ ] Tighten validation and document storage permissions/deployment.
- [ ] Rerun backend tests to GREEN.

### Task 5: Verification

- [ ] Run focused score tests.
- [ ] Run `npm run check`.
- [ ] Run `npm run build` once, retry outside the sandbox only for `esbuild spawn EPERM`.
- [ ] Run `git diff --check` and review only task-owned changes.
