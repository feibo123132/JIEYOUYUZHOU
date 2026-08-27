# Practice Calendar Scroll Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit expanded practice-calendar month, week, and day content to approximately eight song rows and enable vertical scrolling only when that group contains more than eight songs.

**Architecture:** Keep record grouping and disclosure behavior unchanged. Add a local count-to-scroll-props helper in `DailyPracticePanel.tsx`, wrap month and week children in level-specific containers, and reuse the day record container; a shared CSS class supplies the height, overflow, focus, and scrollbar behavior.

**Tech Stack:** React 18, TypeScript, CSS, Node.js test runner, Vite

---

### Task 1: Add a failing source-contract test

**Files:**
- Modify: `tests/songRequest.test.ts`
- Inspect: `src/components/SongRequest/DailyPracticePanel.tsx`
- Inspect: `src/index.css`

- [ ] **Step 1: Add the stylesheet fixture and focused test**

Add beside the existing source URLs:

```ts
const indexCssUrl = new URL('../src/index.css', import.meta.url)
```

Add this test after the existing daily-practice archive test:

```ts
test('练习日历月周日超过八首时分别启用限高滚动', () => {
  const panel = readFileSync(dailyPracticePanelUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(panel, /const PRACTICE_SCROLL_THRESHOLD = 8/)
  assert.match(panel, /recordCount > PRACTICE_SCROLL_THRESHOLD/)
  assert.match(panel, /tabIndex:\s*0/)
  assert.match(panel, /'aria-label': label/)
  assert.match(panel, /scrollRegionProps\('practice-month-content', monthRecords\.length,/)
  assert.match(panel, /scrollRegionProps\('practice-week-content', weekRecords\.length,/)
  assert.match(panel, /scrollRegionProps\('practice-day-records', day\.records\.length,/)
  assert.match(css, /\.practice-scroll-region\s*\{[^}]*max-height:[^;}]+;[^}]*overflow-y:auto;/s)
  assert.match(css, /scrollbar-color:\s*rgba\(251,146,60,[^)]+\)/)
  assert.match(css, /\.practice-scroll-region:focus-visible/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test --test-name-pattern="练习日历月周日超过八首" tests/songRequest.test.ts
```

Expected: FAIL because `PRACTICE_SCROLL_THRESHOLD` and the scroll-region markup/styles do not exist.

### Task 2: Implement count-gated scrolling at all three levels

**Files:**
- Modify: `src/components/SongRequest/DailyPracticePanel.tsx`
- Modify: `src/index.css`
- Test: `tests/songRequest.test.ts`

- [ ] **Step 1: Add the threshold and scroll-props helper**

Add near the existing top-level helpers in `DailyPracticePanel.tsx`:

```ts
const PRACTICE_SCROLL_THRESHOLD = 8;

const scrollRegionProps = (baseClass: string, recordCount: number, label: string) => {
  const scrollable = recordCount > PRACTICE_SCROLL_THRESHOLD;
  return {
    className: `${baseClass}${scrollable ? ' practice-scroll-region' : ''}`,
    ...(scrollable ? { tabIndex: 0, 'aria-label': label } : {}),
  };
};
```

This makes the boundary explicit: exactly eight records do not scroll; nine or more do.

- [ ] **Step 2: Add month, week, and day scroll containers**

Immediately after each month summary, wrap the mapped weeks:

```tsx
<div {...scrollRegionProps('practice-month-content', monthRecords.length, `${monthLabel(month.key)}练习记录`)}>
  {month.weeks.map(/* existing week markup */)}
</div>
```

Immediately after each week summary, wrap the mapped days:

```tsx
<div {...scrollRegionProps('practice-week-content', weekRecords.length, `${containsToday ? '本周' : '该周'}练习记录`)}>
  {weekDays.map(/* existing day markup */)}
</div>
```

Change the existing day record list to:

```tsx
<div {...scrollRegionProps('practice-day-records', day.records.length, `${dayLabel(day.key)}练习歌曲`)}>
```

Do not change summaries, default `open` conditions, record ordering, or edit handlers.

- [ ] **Step 3: Add the shared height and scrollbar styles**

Add near the existing `.practice-month`, `.practice-week`, and `.practice-day-records` rules in `src/index.css`:

```css
.practice-month-content,.practice-week-content { min-height:0; }
.practice-scroll-region { max-height:30.55rem; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:rgba(251,146,60,.52) rgba(255,255,255,.04); }
.practice-scroll-region::-webkit-scrollbar { width:.36rem; }
.practice-scroll-region::-webkit-scrollbar-track { border-radius:999px; background:rgba(255,255,255,.04); }
.practice-scroll-region::-webkit-scrollbar-thumb { border-radius:999px; background:rgba(251,146,60,.52); }
.practice-scroll-region:focus-visible { outline:1px solid rgba(253,186,116,.72); outline-offset:2px; }
.practice-month-content.practice-scroll-region,.practice-week-content.practice-scroll-region { padding-right:.2rem; }
.practice-day-records.practice-scroll-region { margin-right:.2rem; padding-right:.25rem; }
```

`30.55rem` corresponds to eight current song rows plus their seven gaps and bottom padding. Nested headings consume part of that viewport at month/week level, while their own summaries stay outside the scrolling container.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --experimental-strip-types --test --test-name-pattern="练习日历月周日超过八首" tests/songRequest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the complete song-request tests**

Run:

```powershell
node --experimental-strip-types --test tests/songRequest.test.ts
```

Expected: all song-request tests pass.

### Task 3: Verify integration and presentation

**Files:**
- Verify: `src/components/SongRequest/DailyPracticePanel.tsx`
- Verify: `src/index.css`
- Verify: `tests/songRequest.test.ts`

- [ ] **Step 1: Run TypeScript and production build checks**

Run:

```powershell
npm run check
npm run build
```

Expected: both commands exit successfully.

- [ ] **Step 2: Inspect the resulting diff**

Run:

```powershell
git diff --check
git diff -- src/components/SongRequest/DailyPracticePanel.tsx src/index.css tests/songRequest.test.ts
```

Expected: no whitespace errors; diff contains only the threshold helper, the three scroll-region applications, focused CSS, and the regression test, alongside any pre-existing user changes already present in those files.

- [ ] **Step 3: Perform a bounded browser check if the local preview starts successfully**

Use existing data with more than eight records at month, week, and day levels. Confirm summaries stay visible, each applicable level scrolls, eight-or-fewer groups do not show a scrollbar, Tab focuses only active scroll regions, arrow/Page keys scroll a focused region, and clicking a record still opens editing. If the preview is blocked by the Windows sandbox or local environment after at most two attempts, report that limitation and rely on the passing test/build evidence.

- [ ] **Step 4: Commit if repository permissions allow**

```powershell
git add src/components/SongRequest/DailyPracticePanel.tsx src/index.css tests/songRequest.test.ts docs/superpowers/specs/2026-08-26-practice-calendar-scroll-limits-design.md docs/superpowers/plans/2026-08-26-practice-calendar-scroll-limits.md
git commit -m "feat: constrain practice calendar history"
```

If `.git/index.lock` cannot be created, do not retry; provide the exact administrator PowerShell command to the user because implementation and verification are independent of the commit.
