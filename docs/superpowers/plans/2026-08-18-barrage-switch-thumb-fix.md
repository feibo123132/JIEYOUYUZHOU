# 弹幕开关白点定位修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复“弹幕模式”和“亲密模式”开关白点的水平锚点，使关闭在左、开启在右且始终位于轨道内。

**Architecture:** 保留现有原生按钮、状态逻辑和 translate 动画，只给两个绝对白点增加 `left-0`。在现有 Node 源码契约测试中按按钮标签分别提取开关代码，验证 class token、两个状态的几何边界和可访问性契约。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node.js test runner

---

### Task 1: 添加回归测试并修复白点锚点

**Files:**
- Modify: `tests/barrageIntimateIntegration.test.ts`
- Modify: `src/components/StarrySky/AssistantSidebar.tsx:206-230`

- [ ] **Step 1: Write the failing regression test**

在 `barrageIntimateIntegration.test.ts` 增加以下两个辅助函数：

```ts
const getSwitchSource = (source: string, label: string) => {
  const labelIndex = source.indexOf(`aria-label="${label}"`)
  assert.notEqual(labelIndex, -1, `missing ${label} switch`)
  const start = source.lastIndexOf('<button', labelIndex)
  const end = source.indexOf('</button>', labelIndex)
  assert.ok(start >= 0 && end > labelIndex, `incomplete ${label} switch`)
  const switchSource = source.slice(start, end + '</button>'.length)
  assert.equal((switchSource.match(/<button/g) ?? []).length, 1)
  return switchSource
}

const getClassTokens = (source: string, element: 'button' | 'span') => {
  const match = source.match(new RegExp(`<${element}[^>]*className=\\{\\\`([^\\\`]*)\\\`\\}`))
  assert.ok(match, `missing ${element} classes`)
  return match[1].split(/\\s+/)
}
```

辅助函数以标签位置为界，只截取包含该标签的单个 `<button>…</button>`，再只解析该按钮或其子白点 `<span>` 的 class template。随后分别验证：

```ts
for (const [label, state] of [['弹幕模式', 'barrageMode'], ['亲密模式', 'intimateMode']]) {
  const switchSource = getSwitchSource(sidebar, label)
  const trackClasses = getClassTokens(switchSource, 'button')
  const thumbClasses = getClassTokens(switchSource, 'span')

  for (const token of ['relative', 'h-7', 'w-12', 'border']) {
    assert.ok(trackClasses.includes(token), `${label} track missing ${token}`)
  }
  for (const token of ['absolute', 'left-0', 'top-1', 'h-5', 'w-5']) {
    assert.ok(thumbClasses.includes(token), `${label} thumb missing ${token}`)
  }
  assert.ok(
    switchSource.includes(`${state} ? 'translate-x-6' : 'translate-x-1'`),
    `${label} must move right only when enabled`,
  )
  assert.match(switchSource, /type="button"/)
  assert.match(switchSource, /role="switch"/)
  assert.match(switchSource, new RegExp(`aria-checked=\\{${state}\\}`))
}
```

同一测试在确认上述 Tailwind 几何 token 后，按 48px 外框、1px 边框、20px 白点、关闭/开启位移 4/24px 计算：`left = border + translation`。断言关闭边界为 `[5, 25]`、开启边界为 `[25, 45]`，均在 `[0, 48]` 内；两个中心 15/35 分别位于轨道中心 24 的左/右。

- [ ] **Step 2: Run test to verify RED**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Expected: FAIL，明确指出两个白点缺少 `left-0`。

- [ ] **Step 3: Apply the minimal fix**

将两个白点 class 从：

```tsx
absolute top-1 h-5 w-5
```

改为：

```tsx
absolute left-0 top-1 h-5 w-5
```

不修改其它 class、状态或事件处理。

- [ ] **Step 4: Run focused verification**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/barrageIntimateIntegration.test.ts`

Run: `npm run check`

Run: `git diff --check`

Expected: 测试与类型检查通过，差异无空白错误。

- [ ] **Step 5: Commit when repository permissions allow**

当前沙箱已确认无法写入 `.git/index.lock`，不重复尝试提交；用户可在管理员 PowerShell 中提交现有工作区改动。
