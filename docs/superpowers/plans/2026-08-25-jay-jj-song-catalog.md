# 周杰伦与林俊杰曲库调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将点歌台曲库收敛为周杰伦和林俊杰，并为每首歌曲展示独立短文案。

**Architecture:** 继续以 `songCatalog.ts` 作为唯一曲库数据源，沿用 `hotComment` 字段与 `getSongSubtitle` 回退逻辑。仅让歌曲卡片调用该 helper，不改变点歌、排行、路演或云同步接口。

**Tech Stack:** React 18, TypeScript, Node test runner

---

### Task 1: 锁定曲库与文案要求

**Files:**
- Modify: `tests/songRequest.test.ts`
- Test: `tests/songRequest.test.ts`

- [ ] 添加测试：曲库歌手严格等于周杰伦、林俊杰；林俊杰指定 18 首完整；所有 ID 唯一；所有分类均为“华语流行”；每首歌有文案；仅《晴天》为热门。
- [ ] 运行 `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`，确认因当前曲库不符合要求而失败。

### Task 2: 更新曲库数据

**Files:**
- Modify: `src/components/SongRequest/songCatalog.ts`
- Test: `tests/songRequest.test.ts`

- [ ] 删除非周杰伦歌曲，新增 18 首林俊杰歌曲及原创短文案，并统一分类为“华语流行”。
- [ ] 再次运行定向测试，确认曲库测试通过。

### Task 3: 展示歌曲短文案

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Test: `tests/songRequest.test.ts`

- [ ] 添加源码契约测试，要求歌曲列表继续调用现有的 `getSongSubtitle(song)`，防止回退成“歌手 · 分类”。
- [ ] 运行定向测试，确认页面文案契约与更新后的曲库共同通过。
- [ ] 运行 `npm test`、`npm run check` 与一次 `npm run build`，确认回归测试和类型检查通过；若构建仍遇到已知 `esbuild spawn EPERM`，按环境限制记录且不重复重试。
