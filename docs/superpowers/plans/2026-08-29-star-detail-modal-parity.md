# 星星详情弹窗统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 JIEYOU 与幸福主题的星星详情使用相同的关闭、“找杰宝”和“我的”操作。

**Architecture:** 删除 `StarrySky.tsx` 中仅幸福主题可见的详情操作分支，复用现有处理函数和主题视觉配置。保持现有数据流、删除权限和我的留言页不变。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node test runner

---

### Task 1: 统一星星详情操作

**Files:**
- Modify: `tests/happinessMeowIntegration.test.ts`
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: Write the failing test**

  更新测试，要求关闭按钮、“找杰宝”和“我的”不再位于 `theme.id === 'life'` 条件分支内，并要求 `handleFindJiebao` 不再拒绝 JIEYOU 主题。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/happinessMeowIntegration.test.ts`
  Expected: FAIL，因为当前仍有主题条件分支。

- [ ] **Step 3: Write minimal implementation**

  让右上角 `X` 始终渲染；让“找杰宝”“我的”始终渲染；移除旧“关闭”分支；`handleFindJiebao` 只检查是否选中星星。

- [ ] **Step 4: Run focused verification**

  Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/happinessMeowIntegration.test.ts tests/myMessagesPage.test.ts tests/adminStarDeletion.test.ts`
  Expected: PASS。

- [ ] **Step 5: Build**

  Run: `npm run build`
  Expected: production build succeeds。
