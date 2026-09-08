import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mergeNotebookPages, searchNotebook, notebookCacheKey } from '../src/components/SongRequest/feelingsNotebook.ts'
const require = createRequire(import.meta.url)
const { legacyNotebook, validateNotebookPages, saveNotebookAtomically } = require('../cloudfunctions/songRequestSync/feelingsNotebook.js')

test('首次迁移与冲突合并保留云端其他路演和本地改写，不丢页、不重复已有页', () => {
  const cloud = [{ id: 'one', title: '第一场', text: '云端原文' }, { id: 'two', title: '第二场', text: '其他路演' }]
  const merged = mergeNotebookPages(cloud, [{ ...cloud[0], text: '本地改写' }])
  assert.deepEqual(merged.map(page => page.text), ['云端原文', '其他路演', '本地改写'])
  assert.equal(new Set(merged.map(page => page.id)).size, 3)
  assert.deepEqual(mergeNotebookPages(cloud, cloud), cloud)
})

test('各场旧感受按日期归入共享笔记本，保留原文和来源', () => {
  const records = [{ id: 'b', title: '第2次', date: '2026-09-07', feelings: '开心\n合唱' }, { id: 'a', title: '第1次', date: '2026-09-03', feelings: ' 紧张 ' }]
  const notebook = legacyNotebook(records)
  assert.deepEqual(notebook.pages.map((p: { text: string }) => p.text), [' 紧张 ', '开心\n合唱'])
  assert.equal(notebook.pages[0].id, 'legacy:a')
  assert.match(notebook.pages[0].title, /第1次/)
  assert.equal(records[0].feelings, '开心\n合唱')
  assert.equal(legacyNotebook([]).pages.length, 1)
})

test('跨页搜索返回每个命中的页与准确文字位置，特殊字符按普通文字检索', () => {
  const pages = [{ id: 'a', title: '', text: '路演开心，开心' }, { id: 'b', title: '', text: '新的开心 [歌]' }]
  assert.deepEqual(searchNotebook(pages, '开心').map(hit => [hit.pageId, hit.start, hit.end]), [['a', 2, 4], ['a', 5, 7], ['b', 2, 4]])
  assert.equal(searchNotebook(pages, '[歌]')[0].start, 5)
  assert.deepEqual(searchNotebook(pages, ''), [])
  assert.deepEqual(searchNotebook(pages, '不存在'), [])
  assert.equal(notebookCacheKey(' TEST '), notebookCacheKey('test'))
  assert.notEqual(notebookCacheKey('test'), notebookCacheKey('other'))
})

test('分页内容保留换行和空白，并校验重复页标识与长度', () => {
  const pages = [{ id: 'p1', title: '一页', text: '  原文\n ' }]
  assert.deepEqual(validateNotebookPages(pages), pages)
  assert.throws(() => validateNotebookPages([...pages, ...pages]), /INVALID_NOTEBOOK/)
  assert.throws(() => validateNotebookPages([{ ...pages[0], text: '字'.repeat(10001) }]), /INVALID_NOTEBOOK/)
  assert.throws(() => validateNotebookPages([]), /INVALID_NOTEBOOK/)
})

test('保存共享页使用独立文档和版本校验，过期设备不能覆盖新记录', async () => {
  let stored: any = null
  const db = { runTransaction: async (run: any) => run({ collection: (name: string) => {
    assert.equal(name, 'song_request_workspaces')
    return { doc: (id: string) => {
      assert.equal(id, 'feelings:owner')
      return { get: async () => ({ data: stored }), set: async (value: any) => { stored = structuredClone(value) } }
    } }
  } }) }
  const pages = [{ id: 'page1', title: '', text: '共享记录' }]
  const first = await saveNotebookAtomically(db, 'feelings:owner', 0, pages)
  assert.equal(first.revision, 1)
  await assert.rejects(saveNotebookAtomically(db, 'feelings:owner', 0, [{ ...pages[0], text: '旧设备' }]), /CONFLICT/)
  assert.equal(stored.pages[0].text, '共享记录')
  assert.equal((await saveNotebookAtomically(db, 'feelings:owner', 1, [...pages, { id: 'page2', title: '', text: '' }])).pages.length, 2)
})

test('共享笔记本按私人档案隔离，保存后与进入哪场路演无关', async () => {
  const { createHandler } = require('../cloudfunctions/songRequestSync/index.js')
  const workspaces = new Map<string, any>()
  const handler = createHandler({
    getWorkspace: async (id: string) => workspaces.get(id),
    setWorkspace: async (id: string, value: any) => workspaces.set(id, value),
    saveNotebookAtomically: async (id: string, revision: number, pages: any[]) => {
      const notebook = { version: 1, revision: revision + 1, pages }
      workspaces.set(id, notebook)
      return notebook
    },
    now: () => '2026-09-08T00:00:00.000Z',
  })
  const auth = { alias: 'test', password: 'test-secret' }
  const other = { alias: 'other', password: 'test-secret' }
  await handler({ action: 'roadshows:register', ...auth })
  await handler({ action: 'roadshows:register', ...other })
  const pages = [{ id: 'p1', title: '', text: '第一场和第二场都能看到' }]
  assert.equal((await handler({ action: 'feelingsNotebook:save', ...auth, expectedRevision: 0, pages })).ok, true)
  assert.deepEqual((await handler({ action: 'feelingsNotebook:pull', ...auth })).notebook.pages, pages)
  assert.equal((await handler({ action: 'feelingsNotebook:pull', ...other })).notebook.pages[0].text, '')
  assert.equal((await handler({ action: 'feelingsNotebook:pull', ...auth, password: 'bad-secret' })).error, 'AUTH_FAILED')
})
