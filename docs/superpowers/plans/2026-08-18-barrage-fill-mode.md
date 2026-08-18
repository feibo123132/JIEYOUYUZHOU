# 弹幕填充模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在助手栏“弹幕”下增加独立“填充模式”，通过按实测宽度生成两个等宽循环单元，让每条非空弹幕轨道持续首尾衔接，避免整带离场产生大片空白。

**Architecture:** `barrageLayout.ts` 提供重复次数和动画时长的纯数学函数；`MessageBarrage.tsx` 继续负责轨道分组，并为填充轨道测量舞台与基础序列宽度、渲染两个相同循环单元。偏好状态沿用 `barragePreferences.ts`，由 `StarrySky.tsx` 单向传入侧栏和弹幕组件；普通动画、亲密模式和减少动态静态列表保持独立。

**Tech Stack:** React 18、TypeScript 5.8、CSS 动画、ResizeObserver、Node.js `node:test`

**Working-tree note:** 当前工作区包含用户的其他未提交改动且 `.git` 在沙箱中只读。实施时只修改本文列出的文件，不创建 worktree、不覆盖其他改动；每个任务中的提交步骤仅在 Git 可写时执行，否则记录跳过原因并继续验证。

---

## 文件职责

- `src/components/StarrySky/barrageLayout.ts`：填充重复次数与持续时间的纯计算边界。
- `src/components/StarrySky/barragePreferences.ts`：三个弹幕会话偏好的初始化与独立更新。
- `src/components/StarrySky/AssistantSidebar.tsx`：展示“填充模式”开关，不持有重复状态。
- `src/components/StarrySky/StarrySky.tsx`：持有偏好、处理切换与主题复位、传递 `fill` 属性。
- `src/components/StarrySky/MessageBarrage.tsx`：渲染普通或填充轨道，测量实际尺寸并清理观察器。
- `src/index.css`：填充循环单元布局与 `0 → -50%` 无缝动画。
- `tests/barrageLayout.test.ts`：纯函数边界和公式测试。
- `tests/barragePreferences.test.ts`：三项偏好独立性测试。
- `tests/barrageIntimateIntegration.test.ts`：扩展现有侧栏、组件接线、测量和 CSS 源码契约测试。

### Task 1: 建立填充数学边界

**Files:**
- Modify: `tests/barrageLayout.test.ts`
- Modify: `src/components/StarrySky/barrageLayout.ts`

- [ ] **Step 1: 写重复次数和持续时间失败测试**

在 `tests/barrageLayout.test.ts` 导入尚不存在的函数：

```ts
import {
  getBarrageFillDuration,
  getBarrageFillRepeatCount,
  getBarrageLayout,
  getSafeBarrageLaneCount,
} from '../src/components/StarrySky/barrageLayout.ts'
```

增加以下断言。`B` 不含尾部间距，循环单元宽度为 `n × (B + G)`：

```ts
test('fill repeat count minimally covers the stage width', () => {
  const repeatCount = (stageWidth: number, baseWidth: number, gap: number) =>
    getBarrageFillRepeatCount({ stageWidth, baseWidth, gap })

  assert.equal(repeatCount(1000, 300, 20), 4)
  assert.equal(repeatCount(960, 300, 20), 3)
  assert.equal(repeatCount(959, 300, 20), 3)
  assert.equal(repeatCount(961, 300, 20), 4)
  assert.equal(repeatCount(500, 600, 20), 1)

  const n = repeatCount(1000, 300, 20)
  const unitWidth = n * (300 + 20)
  assert.ok(unitWidth >= 1000)
  assert.ok((n - 1) * (300 + 20) < 1000)
})

test('fill repeat count falls back for invalid measurements', () => {
  for (const stageWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth, baseWidth: 300, gap: 20 }), 1)
  }
  for (const baseWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth, gap: 20 }), 1)
  }
  for (const gap of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth: 300, gap }), 1)
  }
  assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth: 300, gap: 0 }), 4)
})

test('fill duration uses 60px per second with 24s and 90s bounds', () => {
  assert.equal(getBarrageFillDuration(600), 24)
  assert.equal(getBarrageFillDuration(1440), 24)
  assert.equal(getBarrageFillDuration(1800), 30)
  assert.equal(getBarrageFillDuration(5400), 90)
  assert.equal(getBarrageFillDuration(6000), 90)
  assert.equal(getBarrageFillDuration(0), 24)
  assert.equal(getBarrageFillDuration(Number.NaN), 24)
  assert.equal(getBarrageFillDuration(Number.POSITIVE_INFINITY), 24)
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts
```

Expected: FAIL，提示两个导出不存在。

- [ ] **Step 3: 实现最小纯函数**

在 `barrageLayout.ts` 增加：

```ts
export interface BarrageFillRepeatOptions {
  readonly stageWidth: number
  readonly baseWidth: number
  readonly gap: number
}

export const getBarrageFillRepeatCount = ({
  stageWidth,
  baseWidth,
  gap,
}: BarrageFillRepeatOptions) => {
  const valid = Number.isFinite(stageWidth)
    && Number.isFinite(baseWidth)
    && Number.isFinite(gap)
    && stageWidth > 0
    && baseWidth > 0
    && gap >= 0
  if (!valid) return 1
  return Math.max(1, Math.ceil(stageWidth / (baseWidth + gap)))
}

export const getBarrageFillDuration = (unitWidth: number) => {
  if (!Number.isFinite(unitWidth) || unitWidth <= 0) return 24
  return Math.min(90, Math.max(24, unitWidth / 60))
}
```

- [ ] **Step 4: 运行纯函数测试并确认绿灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts`

Expected: PASS。

- [ ] **Step 5: 在 Git 可写时提交**

```powershell
git add -- src/components/StarrySky/barrageLayout.ts tests/barrageLayout.test.ts
git commit -m "feat: add barrage fill layout calculations"
```

### Task 2: 增加独立填充偏好

**Files:**
- Modify: `tests/barragePreferences.test.ts`
- Modify: `src/components/StarrySky/barragePreferences.ts`

- [ ] **Step 1: 把偏好测试扩展为三项独立状态**

将期望对象改为包含 `fill: false`，并增加：

```ts
const filled = setBarragePreference(initial, 'fill', true)
assert.deepEqual(filled, { immersive: false, intimate: false, fill: true })

const combined = setBarragePreference(
  setBarragePreference(filled, 'intimate', true),
  'immersive',
  true,
)
assert.deepEqual(combined, { immersive: true, intimate: true, fill: true })

assert.deepEqual(
  setBarragePreference(combined, 'fill', false),
  { immersive: true, intimate: true, fill: false },
)
```

同时断言再次调用 `createInitialBarragePreferences()` 仍返回三项全关。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts`

Expected: FAIL，初始偏好缺少 `fill`。

- [ ] **Step 3: 实现偏好字段**

```ts
export interface BarragePreferences {
  readonly immersive: boolean
  readonly intimate: boolean
  readonly fill: boolean
}

export const createInitialBarragePreferences = (): BarragePreferences => ({
  immersive: false,
  intimate: false,
  fill: false,
})
```

保留现有通用 `setBarragePreference`，无需增加分支。

- [ ] **Step 4: 运行偏好测试并确认绿灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts`

Expected: PASS。

- [ ] **Step 5: 在 Git 可写时提交**

```powershell
git add -- src/components/StarrySky/barragePreferences.ts tests/barragePreferences.test.ts
git commit -m "feat: add barrage fill preference"
```

### Task 3: 接通侧栏与页面状态

**Files:**
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/AssistantSidebar.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: 写第三个开关和属性传递失败测试**

在集成测试中增加源码契约：

```ts
assert.match(sidebar, /fillMode: boolean/)
assert.match(sidebar, /onChangeFillMode: \(enabled: boolean\) => void/)
assert.match(sidebar, /aria-label="填充模式"/)
assert.match(sidebar, /循环补齐弹幕，减少屏幕空白/)
assert.match(sidebar, /onClick=\{\(\) => onChangeFillMode\(!fillMode\)\}/)

assert.match(starrySky, /const fillMode = barragePreferences\.fill/)
assert.match(starrySky, /setBarragePreference\(current, 'fill', enabled\)/)
assert.match(starrySky, /fillMode=\{fillMode\}/)
assert.match(starrySky, /onChangeFillMode=\{handleFillModeChange\}/)
assert.match(starrySky, /fill=\{fillMode\}/)
```

将开关回归测试的数组扩展为：

```ts
const switches = [
  ['弹幕模式', 'barrageMode'],
  ['亲密模式', 'intimateMode'],
  ['填充模式', 'fillMode'],
] as const
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，缺少填充模式属性和开关。

- [ ] **Step 3: 增加侧栏契约和开关**

在 `AssistantSidebarProps`、组件参数中增加：

```ts
fillMode: boolean
onChangeFillMode: (enabled: boolean) => void
```

在亲密模式下方按现有结构增加：

```tsx
<div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
  <div>
    <div className="text-sm text-white/90">填充模式</div>
    <div className="mt-1 text-xs text-white/55">循环补齐弹幕，减少屏幕空白</div>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={fillMode}
    aria-label="填充模式"
    onClick={() => onChangeFillMode(!fillMode)}
    className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${fillMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}
  >
    <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${fillMode ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
</div>
```

- [ ] **Step 4: 在 StarrySky 中派生并传递状态**

在另外两个派生值旁增加：

```ts
const fillMode = barragePreferences.fill
```

增加独立回调：

```ts
const handleFillModeChange = (enabled: boolean) => {
  setBarragePreferences((current) => setBarragePreference(current, 'fill', enabled))
}
```

向 `AssistantSidebar` 传递 `fillMode` 与 `onChangeFillMode`，向 `MessageBarrage` 传递 `fill={fillMode}`。现有主题切换调用 `createInitialBarragePreferences()`，无需另加复位分支。

- [ ] **Step 5: 运行接线与偏好测试**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts
```

Expected: PASS。

- [ ] **Step 6: 在 Git 可写时提交**

```powershell
git add -- src/components/StarrySky/AssistantSidebar.tsx src/components/StarrySky/StarrySky.tsx tests/barrageIntimateIntegration.test.ts
git commit -m "feat: add barrage fill mode toggle"
```

### Task 4: 渲染可测量的双循环单元

**Files:**
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/MessageBarrage.tsx`

- [ ] **Step 1: 写填充渲染和测量失败测试**

扩展源码契约，覆盖：

```ts
assert.match(component, /fill\?: boolean/)
assert.match(component, /getBarrageFillRepeatCount/)
assert.match(component, /getBarrageFillDuration/)
assert.match(component, /className="barrage-fill-probe"/)
assert.match(component, /className="barrage-fill-unit"/)
assert.match(component, /Array\.from\(\{ length: 2 \}/)
assert.match(component, /unitIndex.*repeatIndex.*item\.id.*messageIndex/s)
assert.match(component, /getComputedStyle\(probe\)\.columnGap/)
assert.match(component, /probe\.getBoundingClientRect\(\)\.width/)
assert.match(component, /stage\.getBoundingClientRect\(\)\.width/)
assert.match(component, /new ResizeObserver\(scheduleMeasure\)/)
assert.match(component, /observer\?\.observe\(probe\)/)
assert.match(component, /fill\s*\?\s*\(\s*<FilledBarrageLane/)
assert.match(component, /className="barrage-lane barrage-lane--fill"/)
```

补充断言：主测量 effect 的启用条件包含 `intimate || fill`，依赖包含 `fill`；普通分支仍只渲染每条留言一次，不创建循环单元。保留现有无障碍和观察器清理断言。

- [ ] **Step 2: 运行集成测试并确认红灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，缺少填充属性、探针与循环单元。

- [ ] **Step 3: 扩展属性、舞台宽度测量和样式变量类型**

`MessageBarrageProps` 增加 `fill?: boolean`。为普通与填充轨道分别保留准确的 CSS 变量类型，避免强制填充轨道伪造普通动画时长：

```ts
type FilledLaneStyle = CSSProperties & {
  '--lane-top': string
  '--lane-delay': string
  '--fill-duration': string
}
```

测量状态扩展为：

```ts
const [measurement, setMeasurement] = useState({
  stageWidth: 0,
  stageHeight: 0,
  itemHeight: 0,
})
```

主测量读取同一个舞台矩形的 `width` 与 `height`。effect 仅在 `!intimate && !fill` 时跳过，并把 `fill` 加入依赖；状态相等保护同时比较三项。舞台 style 增加填充模式所需但不改变普通模式的变量。

- [ ] **Step 4: 提取稳定的填充轨道组件**

在同文件增加 `FilledBarrageLane`。它接收单条轨道、主题、轨道序号、轨道数、`stageWidth` 和当前 `horizontalGap` 配置，并保持自身基础宽度、像素间距测量：

```ts
const repeatCount = getBarrageFillRepeatCount({ stageWidth, baseWidth, gap })
const unitWidth = repeatCount * (baseWidth + gap)
const duration = getBarrageFillDuration(unitWidth)
```

组件使用 `useLayoutEffect` 同步测量 `.barrage-fill-probe`，从 `getBoundingClientRect().width` 取得 `B`，从 `getComputedStyle(probe).columnGap` 解析 `G`。使用单个待执行 `requestAnimationFrame` 合并 ResizeObserver 回调；初次直接 `measure()`，状态相同返回原对象；清理待执行帧并 `disconnect()`。effect 依赖必须至少包含 `[stageWidth, lane, horizontalGap]`：`lane` 覆盖留言文字、昵称、日期或顺序变化，`horizontalGap` 保证普通/亲密间距切换时即使单个胶囊宽度不变也会立即重新读取 `G`。

渲染结构必须等价于：

```tsx
<div className="barrage-lane barrage-lane--fill" style={style}>
  <div ref={probeRef} className="barrage-fill-probe">
    {lane.map((item, messageIndex) => (
      <BarragePill key={`probe-${item.id}-${messageIndex}`} item={item} theme={theme} />
    ))}
  </div>
  {Array.from({ length: 2 }, (_, unitIndex) => (
    <div key={unitIndex} className="barrage-fill-unit">
      {Array.from({ length: repeatCount }, (_, repeatIndex) => (
        <div key={repeatIndex} className="barrage-fill-sequence">
          {lane.map((item, messageIndex) => (
            <BarragePill
              key={`${unitIndex}-${repeatIndex}-${item.id}-${messageIndex}`}
              item={item}
              theme={theme}
            />
          ))}
        </div>
      ))}
    </div>
  ))}
</div>
```

`style` 使用 `FilledLaneStyle`，保留 `--lane-top` 与 `--lane-delay`，并提供 `--fill-duration: `${duration}s``。探针 key 也要包含 `messageIndex`，防御同一轨道内意外重复 ID。

- [ ] **Step 5: 让 BarrageLanes 在两种策略间明确分支**

向 `BarrageLanes` 传入 `fill`、`stageWidth` 和 `layout.horizontalGap`。每条非空轨道在 `fill` 为真时渲染 `FilledBarrageLane`，否则执行现有 `contentLength`、时长和 `barrage-lane` 分支。桌面与移动两套轨道都使用相同策略；隐藏套装的 0 宽探针回退为一次，变为可见时由 ResizeObserver 重新测量。

- [ ] **Step 6: 运行定向测试**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts
```

Expected: PASS。

- [ ] **Step 7: 在 Git 可写时提交**

```powershell
git add -- src/components/StarrySky/MessageBarrage.tsx tests/barrageIntimateIntegration.test.ts
git commit -m "feat: render seamless barrage fill lanes"
```

### Task 5: 添加无缝动画和减少动态降级

**Files:**
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/index.css`

- [ ] **Step 1: 写 CSS 失败断言**

增加以下语义断言，正则允许格式变化但必须锁定核心端点：

```ts
assert.match(styles, /@keyframes barrage-fill-travel[\s\S]*translate3d\(0,\s*-50%,\s*0\)[\s\S]*translate3d\(-50%,\s*-50%,\s*0\)/)
assert.match(styles, /\.barrage-lane--fill[\s\S]*gap:\s*0[\s\S]*animation:\s*barrage-fill-travel var\(--fill-duration\) linear var\(--lane-delay\) infinite/)
assert.match(styles, /\.barrage-fill-unit[\s\S]*display:\s*flex[\s\S]*flex:\s*none/)
assert.match(styles, /\.barrage-fill-sequence[\s\S]*gap:\s*var\(--barrage-horizontal-gap\)[\s\S]*padding-right:\s*var\(--barrage-horizontal-gap\)/)
assert.match(styles, /\.barrage-fill-probe[\s\S]*visibility:\s*hidden[\s\S]*position:\s*absolute/)
assert.doesNotMatch(
  styles.match(/@keyframes barrage-fill-travel[\s\S]*?\n\}/)?.[0] ?? '',
  /100vw/,
)
```

继续断言减少动态媒体查询隐藏 `.barrage-lanes`、显示静态列表，且不复制 `.barrage-static-item`。

- [ ] **Step 2: 运行集成测试并确认红灯**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，缺少填充关键帧和结构样式。

- [ ] **Step 3: 实现填充 CSS**

在普通关键帧旁增加：

```css
@keyframes barrage-fill-travel {
  from { transform: translate3d(0, -50%, 0); }
  to { transform: translate3d(-50%, -50%, 0); }
}

.barrage-lane--fill {
  gap: 0;
  animation: barrage-fill-travel var(--fill-duration) linear var(--lane-delay) infinite;
}

.barrage-fill-unit,
.barrage-fill-sequence,
.barrage-fill-probe {
  display: flex;
  width: max-content;
  flex: none;
  align-items: center;
}

.barrage-fill-sequence,
.barrage-fill-probe {
  gap: var(--barrage-horizontal-gap);
}

.barrage-fill-sequence {
  padding-right: var(--barrage-horizontal-gap);
}

.barrage-fill-probe {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}
```

普通 `.barrage-lane` 继续使用 `barrage-travel`；通过更具体的 `.barrage-lane--fill` 覆盖动画和 gap。现有 `.barrage-lane:hover`、舞台 focus/focus-within 暂停规则继续作用于填充轨道。减少动态规则无需复制内容，因为 `.barrage-lanes` 整体隐藏、静态列表保持单份。

- [ ] **Step 4: 运行所有弹幕测试并确认绿灯**

Run:

```powershell
node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts
```

Expected: PASS。

- [ ] **Step 5: 在 Git 可写时提交**

```powershell
git add -- src/index.css tests/barrageIntimateIntegration.test.ts
git commit -m "feat: animate seamless barrage fill loops"
```

### Task 6: 完整验证与范围审计

**Files:**
- Verify: `src/components/StarrySky/barrageLayout.ts`
- Verify: `src/components/StarrySky/barragePreferences.ts`
- Verify: `src/components/StarrySky/AssistantSidebar.tsx`
- Verify: `src/components/StarrySky/StarrySky.tsx`
- Verify: `src/components/StarrySky/MessageBarrage.tsx`
- Verify: `src/index.css`
- Verify: `tests/barrageLayout.test.ts`
- Verify: `tests/barragePreferences.test.ts`
- Verify: `tests/barrageIntimateIntegration.test.ts`

- [ ] **Step 1: 运行完整测试**

Run: `npm test`

Expected: 所有测试 PASS。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npm run check`

Expected: exit code 0。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: exit code 0；允许现有 browserslist 或 bundle size 警告，不允许类型或构建错误。若沙箱出现已知 `esbuild spawn EPERM`，按项目规则最多重试一次已批准的沙箱外构建，不把预览服务作为交付条件。

- [ ] **Step 4: 检查差异格式和范围**

Run:

```powershell
git diff --check
git status --short
git diff -- src/components/StarrySky/barrageLayout.ts src/components/StarrySky/barragePreferences.ts src/components/StarrySky/AssistantSidebar.tsx src/components/StarrySky/StarrySky.tsx src/components/StarrySky/MessageBarrage.tsx src/index.css tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts docs/superpowers/specs/2026-08-18-barrage-fill-mode-design.md docs/superpowers/plans/2026-08-18-barrage-fill-mode.md
```

Expected: 没有空白错误；仅包含填充模式所需改动，并保留这些文件中已有的亲密模式、开关定位和星星布局相关改动。

- [ ] **Step 5: 在可交互浏览器可用时做一次视觉冒烟检查**

检查桌面宽屏下少量留言、单条留言、亲密 + 填充、弹幕 + 填充、开关关闭恢复普通入场，以及窗口跨 640px 缩放。观察至少一个完整填充循环，确认轨道尾部与下一单元首部之间只有配置间距，没有大片空窗或可见跳帧。

如果预览服务受沙箱或本机环境限制未启动，而测试和生产构建已经通过，则记录“代码测试/构建已通过，预览服务受当前沙箱或本机环境限制未启动”，不重复消耗时间。

- [ ] **Step 6: 在 Git 可写时提交最终验证修正**

```powershell
git add -- src/components/StarrySky/barrageLayout.ts src/components/StarrySky/barragePreferences.ts src/components/StarrySky/AssistantSidebar.tsx src/components/StarrySky/StarrySky.tsx src/components/StarrySky/MessageBarrage.tsx src/index.css tests/barrageLayout.test.ts tests/barragePreferences.test.ts tests/barrageIntimateIntegration.test.ts docs/superpowers/specs/2026-08-18-barrage-fill-mode-design.md docs/superpowers/plans/2026-08-18-barrage-fill-mode.md
git commit -m "feat: add barrage fill mode"
```
