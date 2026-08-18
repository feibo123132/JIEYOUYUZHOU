# 幸福星找杰宝联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生命万岁企划的每颗幸福星把自己的留言带入猫猫生成器，并持续显示在猫猫气泡和纪念卡中。

**Architecture:** 主应用通过当前标签页的 `sessionStorage` 传递规范化留言，并用查询参数只标识来源。猫猫生成器从同源临时存储读取留言，将固定文案分别注入气泡控制器和纪念卡渲染器；普通猫猫入口与 JIEYOU 星星详情保持原行为。

**Tech Stack:** React 18、TypeScript、sessionStorage、原生 JavaScript、Three.js、Canvas 2D、Vite、Node.js test runner

---

## File Structure

- Modify `src/utils/meowGenerator.ts`: 定义幸福星来源、临时存储键、留言规范化、保存、导航及幸福入口 URL。
- Modify `tests/meowGenerator.test.ts`: 覆盖 URL、空留言回退、200 字限制和临时保存。
- Modify `src/components/StarrySky/StarrySky.tsx`: 仅在 `life` 主题替换详情交互并执行同标签导航。
- Create `vendor/meow-generator/src/happinessMessage.js`: 纯函数解析来源并安全读取幸福留言。
- Create `vendor/meow-generator/scripts/test_happiness_message.mjs`: 覆盖普通入口、幸福入口、缺失存储和异常存储。
- Modify `vendor/meow-generator/src/speechBubbles.js`: 支持持续固定在猫猫上方的可选文案。
- Modify `vendor/meow-generator/src/main.js`: 读取幸福上下文并注入气泡和纪念卡。
- Modify `vendor/meow-generator/src/shareCard.js`: 实时卡和 PNG 使用“幸福时刻”及最多三行的幸福留言。
- Modify `vendor/meow-generator/src/style.css`: 实时纪念卡副标题支持三行省略。
- Modify `vendor/meow-generator/package.json`: 增加幸福留言定向测试命令。
- Rebuild and sync `vendor/meow-generator/dist` into `public/meow-generator`.

### Task 1: 定义主应用留言传递契约

**Files:**
- Modify: `tests/meowGenerator.test.ts`
- Modify: `src/utils/meowGenerator.ts`

- [ ] **Step 1: Write failing tests**

新增测试，要求：

```ts
assert.equal(getHappinessMeowGeneratorUrl('/jieyou/'), '/jieyou/meow-generator/index.html?source=happiness-star')
assert.equal(normalizeHappinessMessage('  跑步听歌  '), '跑步听歌')
assert.equal(normalizeHappinessMessage('   '), '这一刻值得被记住')
assert.equal(normalizeHappinessMessage('长'.repeat(205)).length, 200)
assert.equal(storeHappinessMessage(storageStub, '  跑步听歌  '), '跑步听歌')
```

另用注入的 `getStorage` 与 `navigate` 测试导航行为：连续传入两颗星的不同留言时临时键依次被覆盖为对应内容；`getStorage` 或 `setItem` 抛错时仍只调用一次当前标签导航。

- [ ] **Step 2: Run RED**

Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/meowGenerator.test.ts`.
Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement the contract**

Export:

```ts
export const HAPPINESS_MEOW_SOURCE = 'happiness-star'
export const HAPPINESS_MESSAGE_STORAGE_KEY = 'jieyou:happiness-star-message'
export const DEFAULT_HAPPINESS_MESSAGE = '这一刻值得被记住'
export function normalizeHappinessMessage(message?: string): string
export function storeHappinessMessage(storage: Pick<Storage, 'setItem'>, message?: string): string
export function getHappinessMeowGeneratorUrl(base?: string): string
export function openHappinessMeowGenerator(options: {
  message?: string
  base?: string
  getStorage?: () => Pick<Storage, 'setItem'>
  navigate?: (url: string) => void
}): string
```

`openHappinessMeowGenerator` 在同一个异常边界内安全取得 storage 并写入；无论取得或写入是否失败，都必须在异常处理后调用一次 `navigate`。保持现有 `getMeowGeneratorUrl` 的返回值和测试不变。

- [ ] **Step 4: Run GREEN**

Run the same focused test. Expected: all Meow URL/message tests PASS.

### Task 2: 解析猫猫页幸福留言并固定气泡

**Files:**
- Create: `vendor/meow-generator/src/happinessMessage.js`
- Create: `vendor/meow-generator/scripts/test_happiness_message.mjs`
- Modify: `vendor/meow-generator/package.json`
- Modify: `vendor/meow-generator/src/speechBubbles.js`
- Modify: `vendor/meow-generator/src/main.js`

- [ ] **Step 1: Write the failing vendor test**

覆盖：无 `source` 返回 inactive；正确来源读取并 trim；空值/读取异常使用回退；最多 200 字；注入的 `getStorage` 自身抛错时仍返回 active + 回退文案。

- [ ] **Step 2: Run RED**

Run `npm run test:happiness` in `vendor/meow-generator`. Expected: FAIL because `happinessMessage.js` is absent.

- [ ] **Step 3: Implement happiness context parsing**

`readHappinessMessageContext({ search, getStorage })` 返回：

```js
{ active: false, message: '' }
// or
{ active: true, message: '对应幸福星留言' }
```

仅识别 `source=happiness-star`。helper 内部调用 `getStorage()`，同时捕获 storage 属性获取和 `getItem` 异常，并允许 storage 缺失后回退。

- [ ] **Step 4: Make the speech bubble persistent**

为 `createSpeechBubbleController` 增加可选 `pinnedCatText`。存在固定文案时：

- 始终选择猫猫 actor；
- 完整显示并换行；
- 每帧跟随猫猫位置；
- `hide()` 或重建后在下一帧恢复；
- 不调度猫、鱼、鸭随机对白。

普通入口不传该参数，保持原逻辑。

- [ ] **Step 5: Inject context from main**

`main.js` 把 `window.location.search` 与 `getStorage: () => window.sessionStorage` 传给 helper，不能在 helper 外提前求值 `window.sessionStorage`。把 `context.message` 传给气泡；inactive 时传空字符串。

- [ ] **Step 6: Run GREEN**

Run `npm run test:happiness`. Expected: PASS.

### Task 3: 让实时纪念卡与 PNG 使用幸福文案

**Files:**
- Modify: `vendor/meow-generator/src/shareCard.js`
- Modify: `vendor/meow-generator/src/style.css`
- Modify: `vendor/meow-generator/scripts/test_share_card.mjs`
- Modify: `vendor/meow-generator/src/main.js`

- [ ] **Step 1: Write failing line-layout tests**

为导出的纯函数增加两组测试：

- `getHappinessCardLines(text, measure, maxWidth, maxLines)`：短留言一行完整返回；长留言不超过三行；截断文本最后一行以 `…` 结束。
- `getShareCardCopy(localeCopy, happinessMessage)`：幸福入口返回 `{ headline: '幸福时刻', subtitle: 对应留言 }`；普通入口返回 `{ headline: '幸福时刻', subtitle: localeCopy.title }`。实时 DOM 同步和 PNG 绘制都必须调用这一份文案模型。

- [ ] **Step 2: Run RED**

Run `npm run test:share` in `vendor/meow-generator`. Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement live-card copy**

`createShareCardCapture` 接收 `getHappinessMessage`，并在每次同步/捕获时调用 `getShareCardCopy`：

- `.share-card-live-title` 固定显示“幸福时刻”；
- active 幸福模式下 subtitle 使用当前幸福留言；
- 普通模式 subtitle 继续使用本地化的“猫猫纪念卡”等原文案；
- CSS 将 subtitle 限制为三行并省略。

- [ ] **Step 4: Implement PNG copy**

Canvas 主标题与副标题都使用同一个 `getShareCardCopy` 结果：主标题为“幸福时刻”；幸福模式下在副标题区域用纯函数最多绘制三行留言；普通模式绘制本地化副标题。测试必须证明实时卡与 PNG 路径引用同一文案模型，而不是各自分支硬编码。

- [ ] **Step 5: Run GREEN**

Run `npm run test:share`. Expected: PASS.

### Task 4: 改造 life 主题星星详情弹窗

**Files:**
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Create: `tests/happinessMeowIntegration.test.ts`

- [ ] **Step 1: Write a failing integration contract test**

读取 `StarrySky.tsx` 并断言存在：`theme.id === 'life'` 主题门控、右上角关闭按钮、“找杰宝”、调用 `openHappinessMeowGenerator({ message: selectedStar.message })`；同时保留 JIEYOU 的“关闭”分支。不同留言覆盖和写入失败仍导航的真实行为由 Task 1 的纯函数注入测试保证，不能只靠源码字符串。

- [ ] **Step 2: Run RED**

Run focused Node test. Expected: FAIL before component wiring exists.

- [ ] **Step 3: Implement life-only interaction**

- `life` 详情卡设为 relative，并在右上角渲染 `×`。
- `life` 底部左按钮为“找杰宝”；点击后把 `selectedStar.message` 传给已测试的 `openHappinessMeowGenerator`，由它尝试获取/写入 sessionStorage 并用 `window.location.assign(...)` 当前标签导航。
- 获取或写入存储失败也继续导航，猫猫页自行回退。
- `jieyou` 主题继续显示原底部“关闭”按钮。
- 删除按钮及所有权判断保持不变。

- [ ] **Step 4: Run GREEN**

Run focused integration and helper tests. Expected: PASS.

### Task 5: 构建同步与完整验证

**Files:**
- Build: `vendor/meow-generator/dist/**`
- Sync: `public/meow-generator/index.html`
- Sync: `public/meow-generator/assets/**`

- [ ] **Step 1: Run vendor focused tests**

Run in `vendor/meow-generator`:

```powershell
npm run test:happiness
npm run test:share
```

- [ ] **Step 2: Build vendor**

Run `npm run build` in `vendor/meow-generator` with `VITE_PUBLIC_BASE=./`; copy generated `dist/index.html` and `dist/assets/*` into `public/meow-generator` while preserving public license records.

- [ ] **Step 3: Run root verification**

Run:

```powershell
pnpm run check
pnpm test
pnpm build
```

Expected: TypeScript check, all tests, and production build exit 0.

- [ ] **Step 4: Review isolation and generated output**

Confirm the life-only gate, per-star message source, ordinary Meow entry fallback, no star mutation/API write, live-card/PNG copy parity, and that public HTML references existing rebuilt assets.

- [ ] **Step 5: Leave working tree for user commit**

The environment exposes `.git` read-only. Do not block delivery on commit or mutate unrelated existing changes.

### Task 6: 修复纪念卡文字重叠并更新品牌文案

**Files:**
- Modify: `vendor/meow-generator/scripts/test_share_card.mjs`
- Modify: `vendor/meow-generator/src/shareCard.js`
- Modify: `vendor/meow-generator/src/style.css`
- Rebuild and sync: `public/meow-generator/index.html`, `public/meow-generator/assets/**`

- [ ] **Step 1: Write failing card layout/copy tests**

断言实时卡和 Canvas 共用的版标为 `JIEYOU×HAPPiNESS`，底部文案为“谢谢你分享自己的幸福，愿它能一直陪伴着你😊”。为 Canvas 导出一个幸福卡排版模型，测试必须计算并证明：主标题相较旧 `0.812` 基线向上移动；首行留言上边缘低于主标题下边缘；三行留言末行下边缘位于 `0.894 * cardHeight` 的元信息区域上方。另读取 CSS 并断言幸福模式 title 使用更小字号与更小 `top`，subtitle 使用更大的 `top`、最多三行，并根据固定 3:4 卡片比例计算标题底部、三行留言底部与 meta 顶部之间均存在正间距。

- [ ] **Step 2: Run RED**

Run `npm run test:share` in `vendor/meow-generator`. Expected: FAIL because the old labels/layout remain.

- [ ] **Step 3: Implement the shared labels and non-overlapping layout**

在 `shareCard.js` 集中定义版标和感谢文案，实时 DOM 与 Canvas 均引用同一常量。幸福模式使用独立 Canvas 排版参数：主标题基线从 `0.812` 上移，字号缩小，留言首行下移，三行结尾仍在 meta 区域前。CSS 为 `[data-happiness="true"]` 同时覆盖 title 与 subtitle：title 上移并缩小，subtitle 下移并缩小，使标题后留出可见间距，同时为三行留言保留底部安全区。普通模式布局保持原值。

- [ ] **Step 4: Run GREEN and rebuild**

Run `npm run test:share`, build vendor with `VITE_PUBLIC_BASE=./`, sync `dist` into `public/meow-generator`, then run:

```powershell
node --experimental-strip-types --test tests/meowStaticAssets.test.ts
pnpm build
```

静态资源测试除检查 HTML 引用存在外，还须读取 public HTML 指向的最新 JS/CSS bundle，并断言 bundle 包含 `JIEYOU×HAPPiNESS`、完整感谢文案及 happiness 专用 title/subtitle 布局标记，证明同步的是最新 vendor 产物。

### Task 7: 在纪念卡预览和 PNG 中保留幸福留言气泡及点亮日期

**Files:**
- Modify: `tests/meowGenerator.test.ts`
- Modify: `src/utils/meowGenerator.ts`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `vendor/meow-generator/scripts/test_happiness_message.mjs`
- Modify: `vendor/meow-generator/scripts/test_share_card.mjs`
- Modify: `vendor/meow-generator/src/happinessMessage.js`
- Modify: `vendor/meow-generator/src/main.js`
- Modify: `vendor/meow-generator/src/shareCard.js`
- Modify: `vendor/meow-generator/src/style.css`
- Rebuild and sync: `public/meow-generator/index.html`, `public/meow-generator/assets/**`

- [ ] **Step 1: Write failing date-transfer tests**

主应用把规范化留言与 `selectedStar.createdAt` 组成一个 JSON 对象，通过单次 `sessionStorage.setItem` 写入专用 context 键，并仍保持单次当前页导航。测试连续写入两颗不同星，断言留言和日期始终成对覆盖；`setItem` 抛错时不产生半写入且仍导航。Vendor 测试要求幸福来源解析同一对象并格式化为 `2026年8月18日`，缺失、损坏或无效日期返回“日期未知”；普通入口不读取该对象。

- [ ] **Step 2: Write failing preview/PNG bubble tests**

为气泡完整换行函数和 Canvas 气泡布局写纯函数测试：使用接近 200 字的无空格留言，断言所有文字行均落在卡片画面区域内、拼接后与规范化原文完全一致且不含省略号或空行。源码契约测试要求实时卡包含专用 bubble 元素，并具备圆角、尾巴及幸福模式专用显隐；同时保留 `data-share-card-open=true` 时隐藏原 `.scene-speech-bubble` 的规则，避免卡框外重复。Canvas 捕获路径必须在场景画面完成后调用气泡绘制函数。卡片元信息测试要求幸福模式使用点亮日期，普通模式继续使用卡号。

- [ ] **Step 3: Implement the message/date flow**

`openHappinessMeowGenerator` 同时暂存留言和原始点亮时间；`StarrySky` 传入当前星星 `createdAt`。猫猫页只在 `source=happiness-star` 时读取日期并格式化，不修改星星数据或 URL。

- [ ] **Step 4: Implement live and exported bubbles**

实时卡新增只在幸福模式显示的圆角气泡，内容来自同一个 `getHappinessMessage`；原场景气泡在卡片开启时继续隐藏。PNG 捕获在 `targetWindow` 裁剪区域内用 Canvas 绘制圆角气泡、尾巴和完整换行文案；普通入口不绘制。

- [ ] **Step 5: Replace happiness serial with date and verify**

实时卡与 PNG 的左下角元信息在幸福模式显示 `YYYY年M月D日`，普通入口保持本地化卡号。运行：

```powershell
# vendor/meow-generator
npm run test:happiness
npm run test:share
$env:VITE_PUBLIC_BASE='./'; npm run build

# repo root：复制 dist/index.html 与 dist/assets/* 到 public/meow-generator 后
node --experimental-strip-types --test tests/meowGenerator.test.ts tests/happinessMeowIntegration.test.ts tests/meowStaticAssets.test.ts
pnpm build
```

`meowStaticAssets.test.ts` 必须读取 public HTML 指向的 JS/CSS bundle，断言包含统一幸福 context 键及其 `message`/`createdAt` 解析标记、卡内气泡 class、Canvas 气泡绘制路径和幸福日期元信息标记，证明 public 已同步最新 vendor 产物。
