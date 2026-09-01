# Remove Practice Reflection Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the “弹唱感想” textarea from the practice form while preserving existing reflection data and its history display.

**Architecture:** Make a presentation-only change in `SongDetailPanel.tsx`. Keep the existing record schema, edit hydration, save compatibility, and `PracticeRecordDetails` rendering so old records remain intact.

**Tech Stack:** React 18, TypeScript, Node test runner

---

### Task 1: Remove the redundant form field

**Files:**
- Modify: `tests/songRequest.test.ts`
- Modify: `src/components/SongRequest/SongDetailPanel.tsx`

- [ ] Update the source-level UI test to require no practice-form `<Field label="弹唱感想">` while still requiring historical `<RecordText label="弹唱感想">` rendering.
- [ ] Run the focused test and confirm it fails because the textarea still exists.
- [ ] Delete only the practice-form reflection `<Field>` block.
- [ ] Run the focused test and TypeScript check; both must pass.
