# “我的留言”页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在幸福星详情中增加“我的”入口，并展示当前用户在当前主题下的全部留言。

**Architecture:** 新建聚焦的 `MyMessagesPage` 组件及纯数据筛选函数；`StarrySky` 只负责打开、关闭并传入已加载数据。复用现有 `stars`，不新增路由或网络请求。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node test runner

---

### Task 1: 我的留言页面

**Files:**
- Create: `src/components/StarrySky/MyMessagesPage.tsx`
- Create: `tests/myMessagesPage.test.ts`
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: Write the failing test**

  测试 `getMyMessages(stars, userId)` 仅保留当前用户的非空留言并按时间倒序；源码契约同时检查“我的”按钮、页面组件、返回回调和空状态。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --experimental-strip-types --test tests/myMessagesPage.test.ts`
  Expected: FAIL，因为 `MyMessagesPage.tsx` 尚不存在。

- [ ] **Step 3: Write minimal implementation**

  在 `MyMessagesPage.tsx` 导出纯函数和组件。组件显示返回按钮、当前昵称、留言数量、按时间倒序的留言卡片，以及无留言空状态。`StarrySky.tsx` 增加布尔状态，在“找杰宝”旁增加“我的”按钮，点击后关闭详情与侧栏并显示全屏页面。

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --experimental-strip-types --test tests/myMessagesPage.test.ts`
  Expected: PASS。

- [ ] **Step 5: Run focused regression and build**

  Run: `node --experimental-strip-types --test tests/myMessagesPage.test.ts tests/adminStarDeletion.test.ts`
  Run: `npm run build`
  Expected: tests 与生产构建均通过。
