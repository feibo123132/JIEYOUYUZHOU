# Happiness Sky Header and Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the happiness-sky title to the life-sky title treatment and move the analysis summary to the bottom center.

**Architecture:** This is a presentation-only change inside `HappinessSkyPage.tsx` and its scoped CSS. Keyword analysis, node layout, navigation, and representative messages remain unchanged.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner.

---

### Task 1: Lock and implement the title/summary layout

**Files:**
- Modify: `tests/happinessPortrait.test.ts`
- Modify: `src/components/StarrySky/HappinessSkyPage.tsx`
- Modify: `src/index.css`

- [ ] Add failing assertions that the English eyebrow is absent, the title contains exactly two decorative star icons, and the summary sits outside the header in a bottom-positioned class.
- [ ] Run the focused test and confirm it fails against the current header.
- [ ] Remove the eyebrow, wrap the title with two gold `Sparkles`, and move the summary into a dedicated bottom element.
- [ ] Restyle the title as white heavy sans-serif at life-title scale; reserve top and bottom safe zones for the node field.
- [ ] Run the focused happiness test and TypeScript check.
