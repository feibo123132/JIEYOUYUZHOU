# 我的留言动态星空背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“我的留言”页面清晰透出全局动态星空。

**Architecture:** 复用应用根层的 `StarryCanvas`，仅调整 `MyMessagesPage` 的覆盖层样式。不创建新的渲染层。

**Tech Stack:** React、TypeScript、Tailwind CSS、Node test runner

---

### Task 1: 调整背景覆盖层

**Files:**
- Modify: `tests/myMessagesPage.test.ts`
- Modify: `src/components/StarrySky/MyMessagesPage.tsx`

- [ ] 先写样式契约测试并运行，确认因 90% 黑底与模糊而失败。
- [ ] 将根层改为 `bg-transparent`，删除 `backdrop-blur-md`，在装饰层加入轻暗线性渐变。
- [ ] 运行 `node --experimental-strip-types --test --experimental-test-isolation=none tests/myMessagesPage.test.ts`。
- [ ] 运行 `npm run build`。
