# 星空留言弹幕版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有星空页中增加可切换的留言弹幕版，让当前主题的留言从右向左分轨循环展示。

**Architecture:** 新建一个只负责留言展示的 `MessageBarrage` 组件，输入为已经按昵称/日期筛选的星星数据和当前主题。`StarrySky` 保留数据加载、搜索、创建与删除职责，只新增本地版面状态并在星星视图与弹幕视图之间切换；动画完全由 CSS 完成。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、原生 CSS keyframes、Lucide React

---

### Task 1: 建立独立弹幕展示组件

**Files:**
- Create: `src/components/StarrySky/MessageBarrage.tsx`

- [ ] **Step 1: 定义明确的输入边界**

导出 `BarrageMessage` 接口，包含 `id`、`message`、`nickname`、`createdAt`、可选 `color`。组件接收 `messages` 和 `theme`，不在组件内访问服务或全局状态。

- [ ] **Step 2: 实现稳定的分轨参数**

为每条留言根据索引计算轨道、持续时间、负延迟和轻微字号差异。参数只能来自稳定输入，避免 React 重新渲染时随机跳位。桌面使用 8 条轨道，窄屏使用 6 条轨道；轨道区域避开顶部标题与底部 CTA。

- [ ] **Step 3: 渲染留言与空状态**

主文本显示完整留言，末尾使用较小字号显示 `昵称 · YYYY年M月D日`。每条使用半透明深色胶囊、细边框和当前主题色的轻微发光，并设置 `tabIndex={0}` 和可读的 `aria-label`；没有留言时显示“这片星空还在等待第一句话”。

### Task 2: 接入星空页双版面切换

**Files:**
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: 增加本地版面状态**

增加 `skyView: 'stars' | 'messages'`，主题重新加载时复位为 `stars`。这个状态不写入 Zustand，不改变主题、用户或已加载星星。

- [ ] **Step 2: 提取完整筛选结果**

将昵称和日期过滤结果提取为 `filteredStars`；现有 `visibleStars` 再基于它应用“随机 30 颗/全部”规则。弹幕数据从 `filteredStars` 使用 `message?.trim()` 排除空值和纯空白，再显式映射为 `BarrageMessage`（将裁剪后的留言写入必填 `message` 字段），因此既满足 TypeScript 类型边界，也不会受 30 颗限制。

- [ ] **Step 3: 切换展示内容**

`skyView === 'stars'` 时渲染现有 `UserStar`；`messages` 时渲染 `MessageBarrage`。加载和错误覆盖层继续优先显示。

- [ ] **Step 4: 添加方向按钮**

星星版右侧垂直居中显示圆形 `ArrowRight`；弹幕版左侧垂直居中显示 `ArrowLeft`。按钮带 `aria-label`、点击音效、玻璃拟态样式和悬停位移动效，不遮挡侧栏入口。

- [ ] **Step 5: 保持原有操作可用**

确认左上角返回、标题、侧栏、底部点亮按钮、星星详情和创建弹窗仍由原结构渲染，不因版面切换而卸载数据状态。

### Task 3: 添加弹幕动画与可访问性降级

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 添加横移动画**

新增 `@keyframes barrage-travel`，从 `translate3d(calc(100vw + 100%), 0, 0)` 移动到 `translate3d(calc(-100vw - 100%), 0, 0)`；使用 `will-change: transform`，避免动画触发布局抖动。

- [ ] **Step 2: 添加悬停暂停与静态模式**

`.barrage-item:hover` 和 `.barrage-item:focus-visible` 暂停当前动画。`@media (prefers-reduced-motion: reduce)` 下取消动画，将容器改为可滚动静态列表，保证内容可读。

### Task 4: 扩展弹幕轨道可用空间

**Files:**
- Modify: `src/components/StarrySky/MessageBarrage.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: 增加沉浸样式入口**

为 `MessageBarrage` 增加 `immersive` 布尔属性，并在根节点输出 `barrage-stage--immersive` 修饰类。组件继续只负责展示，不直接控制模式状态。

- [ ] **Step 2: 调整普通轨道安全区**

将普通弹幕区域上边界从 `11%` 调整到标题下方约 `7%`，下边界保持避开 CTA。第一条轨道应进入原空白区域，但不会穿过标题。

- [ ] **Step 3: 扩展沉浸轨道下边界**

`barrage-stage--immersive` 保持顶部安全带，下边界缩小到约 `3%`，利用隐藏 CTA 后释放的空间。移动端提供对应值。

### Task 5: 新增助手栏弹幕模式

**Files:**
- Modify: `src/components/StarrySky/AssistantSidebar.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`

- [ ] **Step 1: 扩展助手栏接口**

新增必填 `barrageMode: boolean` 和 `onChangeBarrageMode(value: boolean)`。新增 `barrageFoldOpen`，并在“星星展示”和“小工具”之间渲染同级 `💬 弹幕` 折叠项。

- [ ] **Step 2: 实现可访问开关**

折叠内容显示“弹幕模式”和 `role="switch"` 按钮，使用 `aria-checked` 表达状态。关闭与开启均调用传入回调，不在侧栏内部维护第二份模式状态。

- [ ] **Step 3: 实现模式状态转换**

`StarrySky` 增加 `barrageMode`。开启时先检查 `loadState === 'ready'`，再设置 `skyView='messages'`、清除星星详情、关闭助手栏并开启模式；关闭时保持消息版、关闭侧栏并恢复普通元素。主题重新加载时复位为关闭。

- [ ] **Step 4: 实现沉浸显隐**

模式开启时不渲染顶部标题、左上角返回、底部 CTA/提示和左右版面切换箭头。`AssistantSidebar` 始终渲染，因此右上角助手图标仍可打开；侧栏打开后内部文字正常显示。加载与错误覆盖层不受模式影响。

- [ ] **Step 5: 将模式传给弹幕组件**

传递 `immersive={barrageMode}`，让 CSS 扩展底部轨道空间。不开启时保持现有布局。

### Task 6: 最小验证

**Files:**
- Verify: `src/components/StarrySky/MessageBarrage.tsx`
- Verify: `src/components/StarrySky/StarrySky.tsx`
- Verify: `src/index.css`

- [ ] **Step 1: 检查残留与调用边界**

Run: `rg -n "MessageBarrage|skyView|barrage-travel" src`

Expected: 新组件只在 `StarrySky` 中接入，动画类存在且没有后端改动。

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `pnpm run check`

Expected: exit code 0。

- [ ] **Step 3: 运行生产构建**

Run: `pnpm build`

Expected: Vite 构建成功。若沙盒内出现已知的 `esbuild spawn EPERM`，只在沙盒外重试一次。

> 说明：按用户明确要求，本次不新增额外测试套件。当前工作区 `.git` 对 Codex 只读，因此不包含自动提交步骤，由用户在验收后自行提交。
