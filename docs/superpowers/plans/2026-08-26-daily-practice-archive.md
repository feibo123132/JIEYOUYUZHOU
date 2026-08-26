# Daily Practice Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private daily guitar-practice workflow with compact month-week-day history while preserving song-centric records and roadshow planning.

**Architecture:** Keep one `SongRecord` per practiced song so song detail and personal ranking stay correct. Add pure grouping helpers, a focused `DailyPracticePanel`, one authenticated batch-save cloud action, and paginated cloud reads. Reframe the existing private roadshow area as “我的档案” with daily-practice and roadshow tabs.

**Tech Stack:** React, TypeScript, Tailwind CSS, Tencent CloudBase, Node.js test runner.

---

### Task 1: Daily grouping model

**Files:**
- Modify: `src/components/SongRequest/songRecords.ts`
- Test: `tests/songRequest.test.ts`

- [ ] Write failing tests for local date grouping, Monday week grouping, month ordering, daily count and average score.
- [ ] Implement pure month-week-day grouping helpers.
- [ ] Run the targeted tests.

### Task 2: Batch cloud synchronization and pagination

**Files:**
- Modify: `cloudfunctions/songRequestSync/validation.js`
- Modify: `cloudfunctions/songRequestSync/index.js`
- Modify: `src/components/SongRequest/songRequestCloud.ts`
- Test: `tests/songRequestSyncFunction.test.cjs`
- Test: `tests/songRequest.test.ts`

- [ ] Write failing tests for a maximum-50 practice batch and one-call adapter routing.
- [ ] Add `songRecords:saveBatch`, authenticate once, preserve record IDs, and return saved records.
- [ ] Page through all cloud records instead of stopping at 1000.
- [ ] Run backend and adapter tests.

### Task 3: Daily practice interface

**Files:**
- Create: `src/components/SongRequest/DailyPracticePanel.tsx`
- Modify: `src/components/SongRequest/RoadshowPanel.tsx`
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Test: `tests/songRequest.test.ts`

- [ ] Write failing source-contract tests for “我的档案”, archive tabs, batch entry and month-week-day disclosure controls.
- [ ] Build compact song selection, optional notes, automatic quality, batch save and editable history.
- [ ] Put daily practice and roadshow records behind the existing private credentials.
- [ ] Preserve all existing roadshow and song-detail behavior.

### Task 4: Verification and deployment

- [ ] Run frontend tests, cloud-function tests, TypeScript checks and diff checks.
- [ ] Deploy `songRequestSync` with ZIP mode; if local identity is unavailable, provide the exact administrator PowerShell command once.
