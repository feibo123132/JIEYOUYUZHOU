# Welcome Equal Star Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 两个主题欢迎页删除旧入口按钮，并提供等宽的“点亮星星”和“我的星星”操作。

**Architecture:** 共用 `NicknameInput` 渲染双按钮并向 `App` 传递进入目标；`App` 复用用户创建流程，把目标传给 `StarrySky`；`StarrySky` 用初始状态直接打开现有“我的留言”页面。

**Tech Stack:** React, TypeScript, Tailwind CSS, Node test runner

---

### Task 1: 欢迎页双入口

**Files:**
- Create: `tests/welcomeStarActions.test.ts`
- Modify: `src/components/Welcome/WelcomeScreen.tsx`
- Modify: `src/components/Welcome/NicknameInput.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `src/themes/themeConfig.ts`

- [ ] 写入失败测试，覆盖旧 CTA 移除、等宽双按钮及“我的星星”直达状态。
- [ ] 运行定向测试并确认因功能尚未实现而失败。
- [ ] 实现最小共用入口与初始页面状态传递。
- [ ] 运行相关测试和生产构建，预期全部通过。
