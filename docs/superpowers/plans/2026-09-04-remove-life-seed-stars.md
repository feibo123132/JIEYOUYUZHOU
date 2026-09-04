# 删除 100 颗内置星星 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除生命主题中此前生成的 100 颗内置种子星，同时保留真实用户星星与现有展示功能。

**Architecture:** 移除种子数据模块和所有消费方合并逻辑；把通用的随机展示选择函数迁到独立模块。用源码约束测试防止种子星再次被意外引入。

**Tech Stack:** React、TypeScript、Node.js test runner

---

### Task 1: 锁定删除行为

**Files:**
- Create: `tests/removeLifeSeedStars.test.ts`
- Modify: `tests/adminStarDeletion.test.ts`

- [x] 写出要求种子文件消失、组件不再引用种子逻辑的失败测试。
- [x] 运行定向测试并确认因现有种子实现而失败。

### Task 2: 删除种子星并保留通用展示

**Files:**
- Delete: `src/components/StarrySky/lifeSeedStars.ts`
- Delete: `tests/lifeSeedStars.test.ts`
- Create: `src/components/StarrySky/starDisplay.ts`
- Create: `tests/starDisplay.test.ts`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `src/components/Welcome/WelcomeScreen.tsx`

- [x] 将通用随机选择逻辑迁移到 `starDisplay.ts`。
- [x] 移除加载、计数和删除中的所有种子星特例。
- [x] 删除 100 颗种子数据和旧测试。
- [x] 运行相关测试并确认通过。

### Task 3: 验证

**Files:**
- Verify: `src/components/StarrySky/StarrySky.tsx`
- Verify: `src/components/Welcome/WelcomeScreen.tsx`

- [x] 搜索确认源码不再含种子星标识。
- [x] 运行相关测试与 TypeScript 检查。
