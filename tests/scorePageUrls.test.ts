import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const cloudUrl = new URL('../src/components/SongRequest/songRequestCloud.ts', import.meta.url)
const hookUrl = new URL('../src/components/SongRequest/useResolvedScorePages.ts', import.meta.url)
const detailUrl = new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url)
const viewerUrl = new URL('../src/components/SongRequest/ScoreViewer.tsx', import.meta.url)

// 谱子用的是 getTempFileURL 换来的签名地址，过期后页面会变成裂图、过去只能刷新整页恢复。
// 下面几条断言守住「不需要手动刷新就能自愈」这条链路，避免以后被改回一次性换链。

test('云端谱子地址提供按需换链接口，且不再沿用上一次换来的签名地址', () => {
  const source = readFileSync(cloudUrl, 'utf8')

  assert.match(source, /export const refreshSongScorePageUrls = async \(pages: string\[\]\)/)
  assert.match(source, /refreshSongScorePageUrls[\s\S]*ensureSignIn\(\)[\s\S]*getScorePageUrls\(pages\)/)
  assert.doesNotMatch(
    source,
    /score\.pageUrls\?\.length === score\.pages\.length\) return scores/,
    'pullSongScores 不能信任已存的签名地址，否则过期链接会一直用下去',
  )
  assert.match(source, /const needsResolve = scores\.some\(\(score\) => score\.pages\.some\(isCloudScorePage\)\)/)
})

test('谱子地址自愈 Hook 监听挂载、回到前台、网络恢复与定时换新，并对失败重试设上限', () => {
  assert.equal(existsSync(hookUrl), true, '自愈 Hook 模块应存在')
  const source = readFileSync(hookUrl, 'utf8')

  assert.match(source, /export const useResolvedScorePages/)
  assert.match(source, /document\.addEventListener\('visibilitychange', onWake\)/)
  assert.match(source, /window\.addEventListener\('online', onOnline\)/)
  assert.match(source, /window\.setInterval\(/)
  assert.match(source, /const MAX_AUTO_REFRESH = \d+/)
  assert.match(source, /generation !== generationRef\.current/)
  assert.match(source, /score-retry=/)
})

test('SongDetailPanel 用 Hook 取谱页地址并在缩略图加载失败时换新', () => {
  const source = readFileSync(detailUrl, 'utf8')

  assert.match(source, /import \{ useResolvedScorePages \} from '\.\/useResolvedScorePages'/)
  assert.match(source, /const \{ pages: scorePages, refresh: refreshScorePages \} = useResolvedScorePages\(/)
  assert.match(source, /onError=\{\(\) => refreshScorePages\(\)\}/)
  assert.match(source, /onPagesStale=\{refreshScorePages\}/)
  // Hook 必须在 `if (!session)` 早返回之前调用，否则违反 Hooks 规则。
  assert.ok(
    source.indexOf('useResolvedScorePages(') < source.indexOf('if (!session) {'),
    'useResolvedScorePages 必须在早返回之前调用',
  )
})

test('翻谱器在图片加载失败时通知换新并给出重新加载入口', () => {
  const source = readFileSync(viewerUrl, 'utf8')

  assert.match(source, /onPagesStale\?: \(force\?: boolean\) => void/)
  assert.match(source, /onError=\{\(\) => \{[\s\S]*setPageError\(true\)[\s\S]*onPagesStale\?\.\(\)/)
  assert.match(source, /setPageError\(false\)/)
  assert.match(source, /谱子加载失败，点此重新加载/)
})
