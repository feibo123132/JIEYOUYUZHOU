# 弹幕亲密模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在助手栏“弹幕”层级增加独立的“亲密模式”开关，并在开启时把弹幕横向边缘间距和纵向轨道中心距都缩短为普通模式的一半。

**Architecture:** 新建纯 TypeScript 布局配置与偏好状态模块，使关键比例和两个开关的独立性可直接测试。`StarrySky` 持有偏好状态，`AssistantSidebar` 只渲染开关，`MessageBarrage` 读取布局配置并用 CSS 变量应用间距。由于项目没有 TSX/DOM 测试运行器，额外使用只读源码契约测试验证这些纯逻辑确实接入组件与样式，再以 TypeScript 检查和生产构建覆盖编译集成。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node.js test runner、Vite

---

### Task 1: 建立可测试的弹幕布局配置

**Files:**
- Create: `src/components/StarrySky/barrageLayout.ts`
- Create: `tests/barrageLayout.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `tests/barrageLayout.test.ts`，在实现文件不存在时先导入 `getBarrageLayout` 并一次性写完以下断言：

- 普通模式：桌面 8 轨、移动端 6 轨、横向 `clamp(5rem, 12vw, 14rem)`、静态纵向 `.75rem`。
- 亲密模式：桌面 16 轨、移动端 12 轨、横向 `clamp(2.5rem, 6vw, 7rem)`、静态纵向 `.375rem`。
- 两端亲密轨道数均为普通模式的 2 倍，因此同一舞台中的轨道中心距为 50%。
- 横向 clamp 的最小值、流动值和最大值及静态列表间距分别为普通模式的 50%。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts`

Expected: FAIL，因为 `barrageLayout.ts` 尚不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `barrageLayout.ts`，导出只读 `BarrageLayout` 接口、普通与亲密配置，以及：

```ts
export const getBarrageLayout = (intimate: boolean): BarrageLayout => (
  intimate ? INTIMATE_BARRAGE_LAYOUT : DEFAULT_BARRAGE_LAYOUT
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts`

Expected: PASS。

### Task 2: 将布局配置接入弹幕组件和 CSS

**Files:**
- Create: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/MessageBarrage.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write the failing integration contract test**

创建 Node 源码契约测试，读取 `MessageBarrage.tsx` 与 `index.css` 并断言：

- 组件接收 `intimate`，调用 `getBarrageLayout(intimate)`。
- 桌面/移动端分别使用配置中的轨道数。
- 舞台写入 `--barrage-horizontal-gap`、`--barrage-static-gap` 并输出亲密模式修饰类。
- 动态轨道和减少动态的静态列表分别消费两个 CSS 变量。

该测试只验证接线，不重复断言纯配置数值。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，因为组件和 CSS 尚未接入亲密配置。

- [ ] **Step 3: Implement the minimal integration**

- 为 `MessageBarrageProps` 增加可选 `intimate?: boolean`。
- 调用 `getBarrageLayout(intimate)`，把配置轨道数传给两个 `BarrageLanes`。
- 舞台输出 `barrage-stage--intimate` 修饰类。
- 通过类型安全的 CSS 自定义属性写入两个 gap 变量。
- CSS 使用变量替换现有两个固定 gap。
- 不改变胶囊规则、舞台边界和动画时长公式。

- [ ] **Step 4: Run targeted tests and typecheck**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts tests/barrageIntimateIntegration.test.ts`

Run: `npm run check`

Expected: 全部 PASS。

### Task 3: 增加独立偏好状态和助手栏开关

**Files:**
- Create: `src/components/StarrySky/barragePreferences.ts`
- Create: `tests/barragePreferences.test.ts`
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/AssistantSidebar.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: Write failing preference tests**

测试初始偏好为 `{ immersive: false, intimate: false }`；开启/关闭 `intimate` 不改变 `immersive`，开启/关闭 `immersive` 不改变 `intimate`；重新创建初始偏好时两者恢复关闭。

- [ ] **Step 2: Run preference test to verify it fails**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts`

Expected: FAIL，因为偏好模块尚不存在。

- [ ] **Step 3: Implement the pure preference helper**

导出 `createInitialBarragePreferences()` 和 `setBarragePreference(state, key, enabled)`，后者只覆盖指定字段并保留另一个字段。

- [ ] **Step 4: Run preference test to verify it passes**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts`

Expected: PASS。

- [ ] **Step 5: Extend integration contract test and verify RED**

增加源码契约断言：侧栏具有 `intimateMode`/`onChangeIntimateMode` 契约，亲密开关只调用 `onChangeIntimateMode(!intimateMode)`；`StarrySky` 使用纯偏好 helper、向侧栏传递两个独立值/回调、向 `MessageBarrage` 传递 `intimate`，主题加载时重建初始偏好。

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，因为组件接线尚未完成。

- [ ] **Step 6: Implement sidebar and page wiring**

- `StarrySky` 用单一 `barragePreferences` 本地状态替换独立 `barrageMode`，保留 `barrageMode` 局部派生变量以最小化现有条件渲染改动。
- 主题加载/切换时调用 `createInitialBarragePreferences()` 复位。
- 两个回调通过 `setBarragePreference` 只改各自字段。
- 向侧栏传递 `intimateMode` 和回调，向弹幕组件传递 `intimate`。
- 在“弹幕”折叠项内现有开关下方增加同款“亲密模式”开关与“弹幕横纵间距减半”说明。

- [ ] **Step 7: Run focused verification**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts`

Run: `npm run check`

Expected: 全部 PASS。

### Task 4: 完整验证

**Files:**
- Verify: `src/components/StarrySky/barrageLayout.ts`
- Verify: `src/components/StarrySky/barragePreferences.ts`
- Verify: `src/components/StarrySky/MessageBarrage.tsx`
- Verify: `src/components/StarrySky/AssistantSidebar.tsx`
- Verify: `src/components/StarrySky/StarrySky.tsx`
- Verify: `src/index.css`
- Verify: `tests/barrageLayout.test.ts`
- Verify: `tests/barragePreferences.test.ts`
- Verify: `tests/barrageIntimateIntegration.test.ts`

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: 0 failures。

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript 与 Vite 构建成功，退出码为 0。

- [ ] **Step 3: Inspect final diff**

Run: `git diff --check`

Run: `git diff -- src/components/StarrySky/barrageLayout.ts src/components/StarrySky/barragePreferences.ts src/components/StarrySky/MessageBarrage.tsx src/components/StarrySky/AssistantSidebar.tsx src/components/StarrySky/StarrySky.tsx src/index.css tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts`

Expected: 无空白错误；改动只覆盖亲密模式及测试。

- [ ] **Step 4: Commit when repository permissions allow**

当前沙箱已确认无法写入 `.git/index.lock`，执行阶段不重复尝试提交。用户可在管理员 PowerShell 中提交设计、计划、实现和测试文件。
