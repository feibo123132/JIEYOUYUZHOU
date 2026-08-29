# My Messages Standalone Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“我的留言”独占页面前景，仅透出全局动态星辰，不再显示星空主界面的任何控件或用户星球。

**Architecture:** 保留 `App` 中现有的全局 `StarryCanvas`。在 `StarrySky` 内以互斥返回分支渲染 `MyMessagesPage`，关闭时再恢复原星空界面；留言数据继续复用已加载的 `stars`，不新增路由或请求。

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: 独立渲染“我的留言”

**Files:**
- Modify: `tests/myMessagesPage.test.ts`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `src/components/StarrySky/MyMessagesPage.tsx`

- [ ] **Step 1: Write the failing test**

断言 `StarrySky` 使用 `if (isMyMessagesOpen) return <MyMessagesPage />` 的互斥分支、移除叠加渲染，并让留言页根节点采用普通的 `min-h-screen` 页面布局。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/myMessagesPage.test.ts`
Expected: FAIL，提示尚未存在互斥渲染分支。

- [ ] **Step 3: Write minimal implementation**

在常规星空 JSX 之前返回 `MyMessagesPage`；从原 JSX 删除覆盖层；将页面根节点从 `fixed inset-0` 改为 `relative min-h-screen`；把 `isMyMessagesOpen` 加入布局测量 effect 依赖，确保返回星空后重新测量。

- [ ] **Step 4: Run focused tests**

Run: `node --experimental-strip-types --test --experimental-test-isolation=none tests/myMessagesPage.test.ts tests/happinessMeowIntegration.test.ts tests/adminStarDeletion.test.ts`
Expected: PASS

- [ ] **Step 5: Verify production build**

Run: `npm run build`
Expected: exit code 0
