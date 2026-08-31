# My Messages Layout Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为留言页提供简洁两列与宽大四列切换，并让返回键始终可见。

**Architecture:** 在 `MyMessagesPage` 内维护并本地保存布局模式；简洁版沿用 `max-w-5xl` 两列，宽大版使用更宽容器和桌面四列。返回按钮改为固定定位。

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: 留言布局切换

**Files:**
- Modify: `src/components/StarrySky/MyMessagesPage.tsx`
- Modify: `tests/myMessagesPage.test.ts`

- [ ] 写入失败测试并确认失败。
- [ ] 实现胶囊切换、响应式网格、选择记忆和固定返回键。
- [ ] 运行相关测试与生产构建。
