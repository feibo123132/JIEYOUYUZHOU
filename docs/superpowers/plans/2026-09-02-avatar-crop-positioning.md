# Avatar Crop Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让竖图在缩放 1 时可上下移动、横图可左右移动，同时保留现有头像设置数据。

**Architecture:** 用纯函数把图片自然尺寸和现有调整值转换为覆盖正方形框的宽高及偏移，再由一个共用 React 图片组件应用到头像卡片和调整预览。数据同步结构保持不变。

**Tech Stack:** TypeScript、React、Tailwind CSS、Node test runner

---

### Task 1: 裁切布局计算

**Files:**
- Create: `src/components/SongRequest/avatarCrop.ts`
- Test: `tests/songRequest.test.ts`

- [ ] **Step 1: 写失败测试**

精确测试 1080×1619 竖图在 scale=1 时，`y=0/50/100` 的 `top` 分别为 `0`、溢出量的一半和全部；为横图测试对应 `left`；另测正方形、放大、极端宽高比和端点均返回有限数值。旋转维持现有渲染行为，不纳入本次防露白承诺。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --test-name-pattern="头像裁切" tests/songRequest.test.ts`

Expected: FAIL，因为 `avatarCrop.ts` 尚不存在。

- [ ] **Step 3: 实现最小纯函数**

以 `cover` 规则计算基础宽高，乘以缩放值，并把 `x/y` 的 0–100 映射到对应轴的可移动溢出范围。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --test-name-pattern="头像裁切" tests/songRequest.test.ts`

Expected: PASS。

### Task 2: 共用头像渲染

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Test: `tests/songRequest.test.ts`

- [ ] **Step 1: 写失败集成检查**

要求卡片和调整预览均调用共用 `ArtistAvatarImage`，图片 `src` 改变时重新读取自然宽高，不再直接把 `objectPosition` 与缩放旋转写在同一个 `<img>` 上。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --test-name-pattern="头像裁切" tests/songRequest.test.ts`

- [ ] **Step 3: 实现共用组件**

组件在图片加载时读取 `naturalWidth/naturalHeight`，调用裁切纯函数，并以绝对定位尺寸及偏移渲染；`src` 改变时先清除旧尺寸，首次加载及加载失败时使用现有 `object-cover` 作为安全回退。

- [ ] **Step 4: 验证**

Run: `node --experimental-strip-types --test-name-pattern="头像裁切|歌手头像" tests/songRequest.test.ts`

Run: `node --experimental-strip-types tests/songRequest.test.ts`

Run: `npx tsc -b --pretty false`

Expected: 定向测试、完整 `songRequest` 测试和类型检查均通过；现有设置数据与同步测试无回归。
