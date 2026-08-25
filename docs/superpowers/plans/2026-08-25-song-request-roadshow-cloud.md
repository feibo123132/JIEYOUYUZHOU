# 点歌台分层导航与私有路演云同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a spacious four-direction song-request hub plus private, multi-device roadshow records backed by Tencent CloudBase.

**Architecture:** Keep catalog/grouping/duplicate detection in pure TypeScript helpers. Use one CloudBase function as the only gateway for public vote increments and password-protected private roadshow documents, while React keeps an optimistic local cache.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Tencent CloudBase Web/Node SDK, Node test runner

---

### Task 1: Domain logic

**Files:** `src/components/SongRequest/songRequest.ts`, `src/components/SongRequest/roadshow.ts`, `tests/songRequest.test.ts`

- [ ] Add failing tests for singer grouping, detail filtering, manual/catalog roadshow songs, duplicate detection, and safe cached roadshow parsing.
- [ ] Run the targeted test and confirm expected failures.
- [ ] Implement minimal pure helpers and rerun until green.

### Task 2: Cloud function

**Files:** `cloudfunctions/songRequestSync/index.js`, `validation.js`, `package.json`, `tests/songRequestSyncFunction.test.cjs`

- [ ] Add failing tests for validation, salted password registration/login, private pull/save/soft-delete, and public atomic vote operations.
- [ ] Run the Cloud Function test and confirm expected failure.
- [ ] Implement a dependency-injected handler and CloudBase adapter; rerun until green.

### Task 3: Browser cloud adapter

**Files:** `src/components/SongRequest/songRequestCloud.ts`, `tests/songRequest.test.ts`

- [ ] Add failing adapter/source contract tests.
- [ ] Implement Cloud Function calls through existing `tcbApp`/`ensureSignIn`, typed public/private methods, and concise error mapping.
- [ ] Keep local fallback when CloudBase is absent or unreachable.

### Task 4: Two-level UI and roadshow editor

**Files:** `src/components/SongRequest/SongRequestStation.tsx`, `src/components/SongRequest/RoadshowPanel.tsx`, `src/components/SongRequest/songCatalog.ts`, `src/App.tsx`

- [ ] Add failing source contracts for exactly four homepage directions and detail-only content.
- [ ] Implement directory/detail navigation, singer drill-down, playlists, cloud ranking, private login/register, roadshow CRUD, both song groups, manual songs, duplicate warnings, and lock action.
- [ ] Preserve the existing homepage card, keepsake deep link, and unrelated dirty changes.

### Task 5: Setup and verification

**Files:** `docs/cloudbase-song-request-sync.md`

- [ ] Document function deployment, required collections, deny-direct-access rules, and first-use flow.
- [ ] Run targeted tests, `npm test`, the Cloud Function test, and `npm run check`.
- [ ] Attempt one production build; if the known sandbox `esbuild spawn EPERM` recurs, do not retry.
