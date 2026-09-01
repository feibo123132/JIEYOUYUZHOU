# 留影底部句子“不选” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为留影编辑器增加“不选”底部句子选项，并在选中时取消画布与导出图片中的底部句子。

**Architecture:** 沿用 `KeepsakeSentence` 已有的 `'不选'` 哨兵值。编辑器负责提供选项，画布渲染器负责在该值下跳过底部文字绘制，不改变其他留影状态与布局。

**Tech Stack:** React、TypeScript、Canvas 2D、Node test runner

---

### Task 1: 用测试固定“不选”行为

**Files:**
- Modify: `tests/keepsakeCanvas.test.ts`
- Modify: `tests/keepsakeFile.test.ts`

- [x] 在画布测试中加入 `sentence: '不选'` 的渲染用例，断言底部坐标没有 `fillText`。
- [x] 在组件源码测试中断言存在 `<option value="不选">不选</option>`。
- [x] 运行定向测试，确认两项因功能尚未完成而失败。

### Task 2: 实现最小行为

**Files:**
- Modify: `src/components/Keepsake/KeepsakeStudio.tsx`
- Modify: `src/components/Keepsake/keepsakeCanvas.ts`

- [x] 在句子下拉框首项加入“不选”。
- [x] 将底部 `fillText` 改为仅在句子不是“不选”时执行。
- [x] 重跑定向测试并确认通过。
- [x] 运行 `npm run check` 完成类型检查。
