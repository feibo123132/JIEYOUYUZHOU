# Quiz Username Nickname Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the latest quiz participant username and prefill both welcome-page nickname actions with it.

**Architecture:** A focused storage helper owns normalization and failure handling. The quiz start action writes the latest value, while `NicknameInput` reads it once at initialization and falls back to the existing user nickname.

**Tech Stack:** React, TypeScript, Zustand-adjacent component state, browser localStorage, Node test runner.

---

### Task 1: Shared nickname storage

**Files:**
- Create: `src/components/Welcome/nicknameSync.ts`
- Create: `tests/nicknameSync.test.ts`

- [ ] Write failing unit tests for empty reads, trimming, punctuation/emoji preservation, overwrite, and storage exceptions.
- [ ] Run `node --experimental-strip-types --test tests/nicknameSync.test.ts` and confirm the missing module failure.
- [ ] Implement `readSyncedNickname(storage)` and `saveSyncedNickname(storage, nickname)` with key `jieyou:quiz-participant-nickname`.
- [ ] Re-run the test and confirm all cases pass.

### Task 2: Wire quiz start and welcome input

**Files:**
- Modify: `src/components/SongRequest/RoadshowPanel.tsx:1-32,401-408`
- Modify: `src/components/Welcome/NicknameInput.tsx:1-14`
- Modify: `tests/nicknameSync.test.ts`

- [ ] Add failing source-wiring assertions requiring `startParticipation` to call `saveSyncedNickname(window.localStorage, name)` and `NicknameInput` to initialize from `readSyncedNickname(window.localStorage) || initialNickname`.
- [ ] Run the targeted test and confirm both assertions fail for missing wiring.
- [ ] Import and call the helper after a non-empty username starts participation.
- [ ] Initialize the welcome nickname from synced storage when available, with SSR-safe fallback to `initialNickname`.
- [ ] Run `node --experimental-strip-types --test tests/nicknameSync.test.ts` and confirm it passes.

### Task 3: Verification

**Files:**
- Verify only; do not modify unrelated dirty files.

- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run check` and confirm TypeScript succeeds.
- [ ] Inspect `git diff -- src/components/Welcome/nicknameSync.ts src/components/Welcome/NicknameInput.tsx src/components/SongRequest/RoadshowPanel.tsx tests/nicknameSync.test.ts`.
- [ ] Leave existing unrelated changes in `src/components/SongRequest/SongRequestStation.tsx` and `.workbuddy/memory/2026-09-02.md` untouched.
