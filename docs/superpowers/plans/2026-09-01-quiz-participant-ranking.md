# Quiz Participant Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a required participant name for roadshow quiz answers and expose user-score and song-accuracy rankings in the existing quiz ranking page.

**Architecture:** Extend each recognition attempt with an optional participant name for backward compatibility. Extend the existing public quiz-ranking cloud response with a separately aggregated participant ranking, then add local parsers/state and a two-button view switch without changing the existing song ranking contract.

**Tech Stack:** React, TypeScript, Tencent CloudBase function, Node test runner

---

### Task 1: Recognition attempt participant data

**Files:** `src/components/SongRequest/roadshow.ts`, `cloudfunctions/songRequestSync/validation.js`, `tests/songRequest.test.ts`, `tests/songRequestSyncFunction.test.cjs`

- [ ] Add failing tests for participant-name creation, parsing, legacy compatibility, validation and sanitization.
- [ ] Add optional `participantName` to attempts and require it for newly created attempts.
- [ ] Run focused tests.

### Task 2: Cloud participant aggregation

**Files:** `cloudfunctions/songRequestSync/index.js`, `tests/songRequestSyncFunction.test.cjs`

- [ ] Add failing tests for the complete score → accuracy → answer count → username ordering, case-insensitive merging, stable display name, legacy exclusion and the 500-item cap.
- [ ] Return `participantRanking` beside the existing `ranking` field.
- [ ] Run the cloud-function ranking test.

### Task 3: Username participation flow

**Files:** `src/components/SongRequest/RoadshowPanel.tsx`, `tests/songRequest.test.ts`

- [ ] Add failing source-contract tests for required username input, participant-bound attempts, and username reset on “下一位玩家”, explicit exit and roadshow changes.
- [ ] Implement the compact join form and preserve existing four-song round behavior.
- [ ] Run focused UI-contract tests.

### Task 4: User/song quiz ranking switch

**Files:** `src/components/SongRequest/songRequestCloud.ts`, `src/components/SongRequest/SongRequestStation.tsx`, `src/components/SongRequest/roadshow.ts`, `tests/songRequest.test.ts`

- [ ] Add failing parser and UI-contract tests for user ranking fields and “用户榜 / 歌曲榜” buttons, including a mixed-version response with only the legacy `{ ranking }` field.
- [ ] Load both rankings from the existing action and default the quiz page to user ranking.
- [ ] Render user score/accuracy or the existing song accuracy list according to the selected button.
- [ ] Run focused tests and `npm run check`.
