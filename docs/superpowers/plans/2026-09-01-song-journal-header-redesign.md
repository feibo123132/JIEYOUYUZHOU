# Song Journal Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the song-detail journal header so sync status sits beside the description and the quiz-level control becomes the leftmost statistic card.

**Architecture:** Modify only `SongDetailPanel` header markup. Preserve the existing quiz state, permissions, callbacks, and popover while changing its trigger styling and position; update focused source-contract tests to prevent regressions elsewhere.

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: Lock the new header contract

**Files:**
- Modify: `tests/songRequest.test.ts`

- [ ] Assert the eyebrow text is absent, sync status follows the song description, and the quiz trigger precedes the two normal statistics.
- [ ] Assert the quiz trigger is a rectangular statistic card and remains connected to its existing menu and callback.
- [ ] Run the focused test and confirm it fails.

### Task 2: Recompose the header

**Files:**
- Modify: `src/components/SongRequest/SongDetailPanel.tsx`

- [ ] Remove the eyebrow block and place sync status beside the description.
- [ ] Expand the right-side statistic grid to three columns.
- [ ] Move the existing quiz trigger and popover into the first statistic slot, using the current level symbol/name as value/label.
- [ ] Keep the journal toolbar to record-type buttons only.

### Task 3: Verify

- [ ] Run the focused journal-header tests.
- [ ] Run `npm run check`.
