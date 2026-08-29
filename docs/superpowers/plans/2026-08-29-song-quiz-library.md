# 听歌识曲歌库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加四档听歌识曲歌库、歌手页分级采购控件与跨设备同步。

**Architecture:** 新建独立纯函数模块管理等级映射；`SongRequestStation` 只负责加载、保存和呈现。CloudBase 沿用热门歌曲的公开读、管理员写模式，避免新增账户体系。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Tencent CloudBase、Node test runner

---

### Task 1: 等级模型与测试

**Files:**
- Create: `src/components/SongRequest/songQuizLibrary.ts`
- Modify: `tests/songRequest.test.ts`

- [ ] 先写失败测试，覆盖四档配置、解析、切换取消、分组和计数。
- [ ] 运行 `npm test -- --test-name-pattern="识曲歌库"` 确认因模块缺失而失败。
- [ ] 实现最小纯函数并重跑定向测试。

### Task 2: 云端公开读取与管理员写入

**Files:**
- Modify: `src/components/SongRequest/songRequestCloud.ts`
- Modify: `cloudfunctions/songRequestSync/validation.js`
- Modify: `cloudfunctions/songRequestSync/index.js`
- Modify: `tests/songRequestSyncFunction.test.cjs`

- [ ] 先写失败测试，覆盖公开读取、仅固定管理员邮箱可写、重复 songId 后值覆盖、最多 500 首、非法等级拒绝；载荷为 `{ assignments: Record<songId, level> }`。
- [ ] 运行 `node --test tests/songRequestSyncFunction.test.cjs` 确认失败。
- [ ] 按现有热门歌曲模式实现 `quizLibrary:pull/set`；映射保存在管理员 workspace 的 `quizLibraryAssignments` 字段并重跑测试。

### Task 3: 状态加载与乐观保存

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `src/components/SongRequest/songRequestCloud.ts`
- Modify: `tests/songRequest.test.ts`

- [ ] 先写失败测试，要求公开拉取、管理员保存、同档再选取消。
- [ ] 运行定向测试确认失败。
- [ ] 实现状态加载；保存失败时保留乐观 UI 状态并显示“识曲歌库尚未同步”，不回滚。
- [ ] 重跑定向测试并修正可访问性问题。

### Task 4: 歌曲行分级采购控件

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `tests/songRequest.test.ts`

- [ ] 先写失败源码契约测试，要求分级控件位于 `🔥` 左侧；管理员看到四档菜单，访客只看到已分级歌曲的彩色徽标。
- [ ] 实现互斥的歌曲级菜单、四档选择、当前档再次点击取消，并重跑测试。

### Task 5: 总部入口与四档面板

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `tests/songRequest.test.ts`

- [ ] 先写失败源码契约测试，要求四宫格下方横向总部卡、总数与四档计数、四个档次区域、空档引导以及管理员移除按钮。
- [ ] 实现响应式总部卡和四档面板；访客可浏览，管理员可移除，并重跑测试。

### Task 6: 完整验证

- [ ] 运行 `npm test`。
- [ ] 运行 `node --test tests/songRequestSyncFunction.test.cjs`。
- [ ] 运行 `npm run check`。
- [ ] 运行 `npm run build`；若遇到已知 `esbuild spawn EPERM`，按仓库规则止损并如实报告。
