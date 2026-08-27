# Practice Calendar Scroll Limits Design

## Goal

Prevent large practice histories from making the archive page excessively tall while preserving the existing month, week, and day disclosure hierarchy.

## Behaviour

1. Month, week, and day groups each evaluate their own aggregate song count.
2. A group with eight or fewer songs keeps its natural height and does not create an internal scrolling region.
3. A group with more than eight songs limits its expanded content to approximately eight song rows and enables vertical scrolling on that content.
4. Each group summary remains outside its scrolling region so the month, week, or day label and count stay visible while the user scrolls.
5. Scrolling remains keyboard-, mouse-wheel-, and touch-accessible. Only active scroll regions enter the tab order, expose a level-specific accessible label, and show a visible keyboard focus ring. The scrollbar uses the existing dark interface with a restrained orange thumb.
6. Existing disclosure defaults, record editing, counts, ordering, and cloud data behaviour remain unchanged.

## Implementation

- Add a small count-based helper that returns the scroll-limit class and keyboard-accessibility attributes only when a group contains more than eight records.
- Wrap the expanded children of month and week groups in dedicated content containers; reuse the existing day-record container for the day level.
- Apply one shared maximum-height/overflow rule to scroll-limited containers and level-specific class names where selectors need to avoid nested-container interference.
- Keep the change scoped to `DailyPracticePanel.tsx`, `src/index.css`, and a focused source-contract test.

## Verification

- A focused test proves the threshold is strictly greater than eight and is applied at month, week, and day levels.
- TypeScript checking and the production build confirm the markup and styles integrate with the existing application.
- Diff inspection confirms unrelated in-progress workspace changes are preserved.
