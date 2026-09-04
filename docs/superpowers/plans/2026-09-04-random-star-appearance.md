# 点亮星星随机外观 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次打开创建星星弹窗时自动随机选择颜色、大小和非星座形状。

**Architecture:** 在独立纯函数中区分完整形状池与非星座随机池，并支持可注入随机源；创建弹窗打开时调用一次并更新三个状态。星座保留手动选择，编辑模式不调用随机函数。

**Tech Stack:** React、TypeScript、Node.js test runner

---

### Task 1: 随机外观规则

**Files:**
- Create: `src/components/StarrySky/starAppearance.ts`
- Create: `tests/starAppearance.test.ts`

- [x] 编写随机结果合法且可预测的失败测试。
- [x] 运行测试，确认因随机外观函数尚不存在而失败。
- [x] 实现颜色、形状和 20–36px 大小的随机选择。

### Task 2: 弹窗接入

**Files:**
- Modify: `src/components/StarrySky/CreateStarModal.tsx`

- [x] 在创建弹窗每次打开时更新随机外观。
- [x] 确保编辑模式不随机覆盖已有外观。
- [x] 运行定向测试和 TypeScript 检查。
