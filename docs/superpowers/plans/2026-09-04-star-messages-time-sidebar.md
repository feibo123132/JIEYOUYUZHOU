# 星语心愿时间助手栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为星语心愿页增加同款助手入口，并切换卡片时间详情。

**Architecture:** 用纯函数统一完整时间与年月格式；页面维护默认开启的时间详情状态和侧栏开关，复用现有助手栏的入口与玻璃样式。

**Tech Stack:** React、TypeScript、Tailwind CSS、Node.js test runner

---

### Task 1: 时间显示规则

**Files:**
- Create: `src/components/StarrySky/starMessageTime.ts`
- Create: `tests/starMessageTime.test.ts`

- [x] 编写完整时间与年月格式的失败测试。
- [x] 实现格式化纯函数。

### Task 2: 助手栏交互

**Files:**
- Modify: `src/components/StarrySky/StarMessagesPage.tsx`
- Modify: `tests/starMessagesLayout.test.ts`

- [x] 编写同款入口、默认显示和切换按钮的失败测试。
- [x] 接入右上角入口、侧栏和卡片时间切换。
- [x] 运行相关测试及 TypeScript 检查。
