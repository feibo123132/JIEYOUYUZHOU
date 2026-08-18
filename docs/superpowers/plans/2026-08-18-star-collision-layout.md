# 星空星星防重叠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改任何持久化坐标的前提下，让星空版内可见星星以确定性的显示坐标避开彼此和页面控件。

**Architecture:** 新增一个无 DOM、无随机数的纯布局工具，把百分比原始坐标转换为像素位置并进行有限轮次的两两疏散、边界约束和禁入矩形避让，再输出新的百分比显示坐标。`StarrySky` 只负责测量星空容器与带标记控件的真实矩形，并把计算后的坐标传给 `UserStar`；原始星星对象继续用于详情、删除、创建和云端数据操作。

**Tech Stack:** React 18、TypeScript、ResizeObserver、Node.js 内置 test runner、Vite

---

## File Structure

- Create `src/utils/starLayout.ts`: 定义布局输入、禁入矩形、确定性疏散与百分比坐标输出。
- Create `tests/starLayout.test.ts`: 覆盖重叠疏散、确定性、边界与禁入区。
- Modify `src/components/StarrySky/StarrySky.tsx`: 测量容器/安全区、计算显示坐标并接入星星渲染。
- Modify `src/components/StarrySky/AssistantSidebar.tsx`: 给关闭状态的助手入口添加安全区 DOM 标记。
- Keep `src/components/StarrySky/UserStar.tsx` unchanged: 继续只渲染传入的百分比坐标。

### Task 1: 用测试定义纯布局算法

**Files:**
- Create: `tests/starLayout.test.ts`
- Create: `src/utils/starLayout.ts`

- [ ] **Step 1: Write the failing tests**

为 `resolveStarLayout` 编写四个独立行为测试：

```ts
test('separates coincident stars when space is available', () => {
  const result = resolveStarLayout([
    { id: 'a', x: 50, y: 50, size: 36 },
    { id: 'b', x: 50, y: 50, size: 36 },
    { id: 'c', x: 50, y: 50, size: 36 },
  ], { width: 800, height: 600, blockedZones: [] });
  assertEveryPairHasDistance(result, 36 + 16);
});

test('returns the same layout for identical inputs', () => {
  assert.deepEqual(resolveStarLayout(stars, options), resolveStarLayout(stars, options));
});

test('keeps stars inside the field and outside blocked zones', () => {
  const starInsideControlButNotColliding = [{ id: 'solo', x: 50, y: 50, size: 36 }];
  const result = resolveStarLayout(starInsideControlButNotColliding, optionsWithBlockedZone);
  assertStarsRespectBoundsAndRadiusExpandedBlockedZone(result);
});

test('does not mutate input stars or blocked rectangles', () => {
  const snapshot = structuredClone({ stars, options });
  resolveStarLayout(stars, options);
  assert.deepEqual({ stars, options }, snapshot);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/starLayout.test.ts
```

Expected: FAIL because `src/utils/starLayout.ts` does not exist.

- [ ] **Step 3: Implement the minimal deterministic resolver**

Implement:

```ts
export interface LayoutStarInput { id: string; x: number; y: number; size?: number }
export interface LayoutRect { left: number; top: number; right: number; bottom: number }
export interface LayoutOptions { width: number; height: number; blockedZones?: LayoutRect[] }
export interface LayoutPosition { id: string; x: number; y: number }
export function resolveStarLayout(stars: LayoutStarInput[], options: LayoutOptions): LayoutPosition[]
```

Algorithm requirements:

- Convert original percent coordinates to pixels without mutating inputs.
- Clamp icon sizes to the same `20..36` range used by `UserStar`.
- Run finite phases with extra glow gaps `[8, 4, 0]`; in each phase use bounded pairwise relaxation iterations.
- For coincident centers, derive a stable direction from the two star IDs instead of `Math.random()`.
- Before collision relaxation and after every iteration, process every star (including isolated stars) by clamping its center by its icon radius and pushing it out of blocked rectangles expanded by that radius.
- Preserve input order and return percentage coordinates.
- If the field is too dense after gap `0`, return the lowest-overlap bounded result without hiding, resizing, or persisting stars.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused command. Expected: all new tests PASS.

### Task 2: 接入星空容器测量和真实控件安全区

**Files:**
- Modify: `src/components/StarrySky/StarrySky.tsx:3-470`
- Modify: `src/components/StarrySky/AssistantSidebar.tsx:58-66`

- [ ] **Step 1: Add measurement state and refs**

In `StarrySky.tsx`:

- Import `useLayoutEffect`, `useRef`, `resolveStarLayout`, and its rectangle type.
- Add refs for the page root and star field.
- Add layout measurement state containing `width`, `height`, and `blockedZones`.
- In `useLayoutEffect`, read the field rectangle and all visible descendants marked `[data-star-safe-zone]`, clip them to the field rectangle, and convert them to field-relative pixel rectangles.
- Observe the star field with `ResizeObserver`; fall back to `window.resize` when unavailable. Re-measure when star/message view, barrage mode, sidebar state, or load state changes.

- [ ] **Step 2: Mark the actual controls as safe zones**

Add `data-star-safe-zone` to:

- the title wrapper;
- the back/navigation button;
- the stars-to-barrage arrow;
- the bottom CTA/hint wrapper;
- the closed assistant entry button in `AssistantSidebar.tsx`.

Only visible marked elements become blocked rectangles, so controls hidden by current mode do not reserve space.

- [ ] **Step 3: Derive display-only positions and render them**

Use `useMemo` to call `resolveStarLayout` for `visibleStars` and build an `id -> position` map. Pass only the mapped `x/y` values to `UserStar`; keep callbacks and `selectedStar` bound to the original object.

Expected behavior:

- random/full/search/new-star sets all use the same resolver;
- resizing recomputes display positions only;
- message barrage view is unchanged;
- no call writes adjusted coordinates to any service.

- [ ] **Step 4: Run focused layout tests**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/starLayout.test.ts
```

Expected: PASS.

### Task 3: Verify the integrated change

**Files:**
- Verify: `src/utils/starLayout.ts`
- Verify: `src/components/StarrySky/StarrySky.tsx`
- Verify: `src/components/StarrySky/AssistantSidebar.tsx`
- Verify: `tests/starLayout.test.ts`

- [ ] **Step 1: Run TypeScript checks**

Run:

```powershell
pnpm run check
```

Expected: exit code 0.

- [ ] **Step 2: Run the complete fast test suite**

Run:

```powershell
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run the production build**

Run:

```powershell
pnpm build
```

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Review the diff for persistence isolation**

Confirm that layout output is only passed into `UserStar.x/y`, and that `starService.createStar`, delete, details, filtering, barrage messages, and source `StarData.x/y` are unchanged.

- [ ] **Step 5: Commit outside Codex if desired**

The current environment exposes `.git` read-only. Do not block delivery on a Codex commit; leave the verified working-tree changes for the user to commit.
