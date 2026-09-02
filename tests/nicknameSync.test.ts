import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const roadshowUrl = new URL('../src/components/SongRequest/RoadshowPanel.tsx', import.meta.url)
const nicknameInputUrl = new URL('../src/components/Welcome/NicknameInput.tsx', import.meta.url)

test('答题用户名会清理首尾空格、原样保留字符并覆盖旧值', async () => {
  const { QUIZ_NICKNAME_STORAGE_KEY, readSyncedNickname, saveSyncedNickname } = await import('../src/components/Welcome/nicknameSync.ts')
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }

  assert.equal(readSyncedNickname(storage), '')
  assert.equal(saveSyncedNickname(storage, '  小安 🙂  '), '小安 🙂')
  assert.equal(values.get(QUIZ_NICKNAME_STORAGE_KEY), '小安 🙂')
  assert.equal(saveSyncedNickname(storage, '新用户'), '新用户')
  assert.equal(readSyncedNickname(storage), '新用户')
  assert.equal(saveSyncedNickname(storage, '   '), '')
  assert.equal(readSyncedNickname(storage), '新用户')
})

test('本地存储不可用时昵称同步静默降级', async () => {
  const { readSyncedNickname, saveSyncedNickname } = await import('../src/components/Welcome/nicknameSync.ts')
  const storage = {
    getItem: (_key: string) => { throw new Error('blocked') },
    setItem: (_key: string, _value: string) => { throw new Error('blocked') },
  }

  assert.equal(readSyncedNickname(storage), '')
  assert.equal(saveSyncedNickname(storage, ' 小安 '), '小安')
})

test('开始答题写入昵称且欢迎页优先读取同步值', () => {
  const roadshow = readFileSync(roadshowUrl, 'utf8')
  const nicknameInput = readFileSync(nicknameInputUrl, 'utf8')

  assert.match(roadshow, /saveSyncedNickname\(window\.localStorage, name\)/)
  assert.match(nicknameInput, /readSyncedNickname\(window\.localStorage\) \|\| initialNickname/)
})
