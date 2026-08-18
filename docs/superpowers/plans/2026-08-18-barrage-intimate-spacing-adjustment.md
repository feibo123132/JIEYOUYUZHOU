# 弹幕亲密模式间距调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让亲密模式根据留言数量、舞台高度和胶囊实测高度自适应轨道数，消除纵向重叠，并把当前亲密横向间距再缩小一半。

**Architecture:** `barrageLayout.ts` 提供纯安全轨道数函数，负责所有边界与间距数学；`MessageBarrage.tsx` 只负责收集 DOM 尺寸、监听变化和把纯函数结果传给现有轨道组件。普通模式和减少动态静态列表不改变。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、ResizeObserver、Node.js test runner、Vite

---

### Task 1: 安全轨道算法与横向间距

**Files:**
- Modify: `tests/barrageLayout.test.ts`
- Modify: `src/components/StarrySky/barrageLayout.ts`

- [ ] **Step 1: Write failing layout tests**

先扩展 `barrageLayout.test.ts`：

- 普通配置增加 `minimumVerticalGap: 0`，其余数值保持不变。
- 亲密配置增加 `minimumVerticalGap: 10`，横向间距预期改为 `clamp(1.25rem, 3vw, 3.5rem)`。
- 替换现有“亲密 clamp 等于普通 clamp 的 50%”断言：新 clamp 的三个数值应等于旧亲密 clamp `2.5/6/7` 的 50%，同时等于普通 clamp `5/12/14` 的 25%。
- 导入尚不存在的 `getSafeBarrageLaneCount`，覆盖：无留言返回 0；高度充足时按留言数；留言多且高度充足时受 16/12 上限；短舞台按 `floor(H/(P+10))` 下调；容量小于 1 且有留言时返回 1；无效的 0、负数、`NaN`、`Infinity` 测量回退到 `min(上限, 留言数)`。
- 临界值使用 `pill=40`、`gap=10`、`k=4`：`H=200` 返回最多 4 轨，`H=199` 返回最多 3 轨，`H=201` 仍为 4 轨；两轨以上时断言 `H / lanes >= pill + gap`。

- [ ] **Step 2: Run test to verify RED**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts`

Expected: FAIL，因为横向间距仍为旧值、配置缺少 `minimumVerticalGap` 且安全轨道函数不存在。

- [ ] **Step 3: Implement minimal pure logic**

扩展 `BarrageLayout` 并实现：

```ts
export const getSafeBarrageLaneCount = ({
  maxLaneCount,
  messageCount,
  stageHeight,
  itemHeight,
  minimumGap,
}: SafeBarrageLaneCountOptions) => {
  const maxLanes = Math.max(0, Math.floor(maxLaneCount))
  const messages = Math.max(0, Math.floor(messageCount))
  if (maxLanes === 0 || messages === 0) return 0

  const fallback = Math.min(maxLanes, messages)
  const validMeasurement = [stageHeight, itemHeight, minimumGap]
    .every((value) => Number.isFinite(value))
    && stageHeight > 0
    && itemHeight > 0
    && minimumGap >= 0
  if (!validMeasurement) return fallback

  const capacity = Math.floor(stageHeight / (itemHeight + minimumGap))
  return Math.max(1, Math.min(fallback, capacity))
}
```

- [ ] **Step 4: Run layout test to verify GREEN**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts`

Expected: PASS。

### Task 2: 测量可见胶囊并自适应轨道

**Files:**
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/MessageBarrage.tsx`

- [ ] **Step 1: Write failing component contract test**

扩展现有源码契约测试，断言组件：

- 使用 `useRef`、`useState`、`useLayoutEffect` 和 `getSafeBarrageLaneCount`。
- 舞台 `<section>` 绑定 `ref={stageRef}`。
- 读取舞台 `getBoundingClientRect().height`，查询全部 `.barrage-item`，只保留有限正数高度并取最大值。
- 亲密模式分别以配置的 16/12 上限、留言数、实测舞台/胶囊高度和 `minimumVerticalGap` 调用纯函数；普通模式继续直接使用 8/6。
- 替换现有 `laneCount={layout.desktopLaneCount/mobileLaneCount}` 断言：实际 `desktopLaneCount`、`mobileLaneCount` 传给两个 `BarrageLanes`。
- `ResizeObserver` 观察舞台和全部胶囊；同时监听 `resize`、`(max-width: 640px)` 与 `(prefers-reduced-motion: reduce)` 变化。
- `useLayoutEffect` 在注册异步观察器前直接调用一次 `measure()`；初次测量不得只经由 `requestAnimationFrame` 调度。
- `scheduleMeasure()` 在已有待执行帧时先取消旧帧，保证最多一个待执行测量；测量状态更新函数在舞台高度和胶囊高度均未变化时返回原对象，避免无条件 setState 导致观察/渲染循环。
- effect 依赖包含 `messages`、`intimate`、`immersive` 和两个实际轨道数；清理时取消动画帧、移除监听器并 `disconnect()`。
- 动画轨道仍为 `aria-hidden="true"`，静态列表的可访问名称、舞台 `tabIndex={0}` 与可访问名称保持存在。

- [ ] **Step 2: Run contract test to verify RED**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，因为组件尚未测量或自适应轨道。

- [ ] **Step 3: Implement measurement lifecycle**

- 将 React 类型导入扩展为 `useLayoutEffect`、`useRef`、`useState`。
- 在组件顶层（任何空状态 return 之前）建立 `stageRef` 和 `{ stageHeight: 0, itemHeight: 0 }` 测量状态，保证 hooks 顺序稳定。
- 根据布局配置、测量状态和留言数计算 `desktopLaneCount`、`mobileLaneCount`；仅亲密模式调用安全轨道函数。
- `useLayoutEffect` 只在亲密模式且舞台存在时绑定测量。`measure()` 排除 0/非有限胶囊高度，并仅在数值变化时更新状态。
- `scheduleMeasure()` 使用单个 `requestAnimationFrame` 合并观察器、窗口和媒体查询事件：每次调度先取消非空的旧 frame id，再保存新 id；回调执行时清空 id。
- 在绑定 `ResizeObserver`、窗口与媒体查询监听之前同步调用 `measure()`。测量更新使用函数式 `setMeasurement`，两个数值相同则返回 `current`，不同才创建新对象。
- 观察舞台及当前全部胶囊；监听窗口 resize 与两个媒体查询 change；按依赖变化完整清理后重新绑定。
- 舞台绑定 ref，轨道组件改用实际轨道数；不修改胶囊、动画公式、静态列表或现有可访问属性。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts tests/barrageIntimateIntegration.test.ts`

Run: `npm run check`

Expected: 全部 PASS。

### Task 3: 完整验证

**Files:**
- Verify: `src/components/StarrySky/barrageLayout.ts`
- Verify: `src/components/StarrySky/MessageBarrage.tsx`
- Verify: `tests/barrageLayout.test.ts`
- Verify: `tests/barrageIntimateIntegration.test.ts`

- [ ] **Step 1: Run relevant tests**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/appStore.test.ts tests/barrageIntimateIntegration.test.ts tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/mockDatabase.test.ts tests/themeConfig.test.ts`

Expected: 0 failures。

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript 与 Vite 构建成功；若沙箱内出现已知 `esbuild spawn EPERM`，只在沙箱外重试一次。

- [ ] **Step 3: Inspect diff**

Run: `git diff --check`

Expected: 无空白错误，未覆盖并行中的 `starLayout` 改动。

- [ ] **Step 4: Commit when repository permissions allow**

当前沙箱已确认无法写入 `.git/index.lock`，不重复尝试提交；用户可在管理员 PowerShell 中提交现有工作区改动。
