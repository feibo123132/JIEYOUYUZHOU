const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEntries, saveJournal } = require('../cloudfunctions/songRequestSync/enoughJournal');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const crypto = require('node:crypto');
const entry = { id: 'one', kind: 'desire', title: '一把吉他', category: '物品', benefit: '', trigger: '看到演奏视频', need: '享受音乐', reflection: '', status: 'wanting', linkedId: '', createdAt: '2026-09-11T00:00:00Z', updatedAt: '2026-09-11T00:00:00Z' };
test('校验记录、状态、关联与重复标识，禁止注入多余字段', () => {
  assert.equal(validateEntries([{ ...entry, workspaceId: 'other' }])[0].workspaceId, undefined);
  for (const entries of [[{ ...entry, title: '' }], [entry, entry], [{ ...entry, status: 'bad' }], [{ ...entry, linkedId: 'missing' }], [{ ...entry, kind: 'possession', status: 'wanting' }]]) {
    assert.throws(() => validateEntries(entries), /INVALID_JOURNAL/);
  }
  assert.equal(validateEntries([{ ...entry, status: 'owned' }])[0].need, '享受音乐');
});
test('事务隔离账号、拒绝旧版本覆盖，删除后旧设备不能复活记录', async () => {
  const docs = new Map();
  const db = { runTransaction: fn => fn({ collection: () => ({ doc: id => ({ get: async () => ({ data: docs.has(id) ? [docs.get(id)] : [] }), set: async value => docs.set(id, value) }) }) }) };
  const first = await saveJournal(db, 'alice', 0, [entry]);
  assert.equal(first.revision, 1);
  await assert.rejects(saveJournal(db, 'alice', 0, [entry]), /CONFLICT/);
  assert.equal((await saveJournal(db, 'bob', 0, [])).entries.length, 0);
  await saveJournal(db, 'alice', 1, []);
  await assert.rejects(saveJournal(db, 'alice', 1, [entry]), /CONFLICT/);
  assert.deepEqual(docs.get('enough-alice').entries, []);
});

test('云端必须验证账号口令，并忽略请求伪造的他人账号标识', async () => {
  const id = alias => crypto.createHash('sha256').update(alias).digest('hex');
  const docs = new Map(['alice', 'bob'].map(alias => [id(alias), { alias, passwordSalt: 'salt', passwordHash: crypto.scryptSync('secret1', 'salt', 32).toString('hex') }]));
  const handler = createHandler({
    getWorkspace: async key => docs.get(key),
    saveJournal: async (key, revision, entries) => {
      const journal = { revision: revision + 1, entries };
      docs.set(`enough-${key}`, journal);
      return journal;
    },
  });
  assert.equal((await handler({ action: 'enough:pull', alias: 'alice', password: 'wrong123' })).error, 'AUTH_FAILED');
  const saved = await handler({ action: 'enough:save', alias: 'alice', password: 'secret1', ownerId: id('bob'), expectedRevision: 0, entries: [entry] });
  assert.equal(saved.ok, true);
  assert.deepEqual((await handler({ action: 'enough:pull', alias: 'bob', password: 'secret1' })).journal.entries, []);
  assert.equal((await handler({ action: 'enough:pull', alias: 'alice', password: 'secret1' })).journal.entries[0].title, '一把吉他');
  assert.equal((await handler({ action: 'enough:save', alias: 'alice', password: 'secret1', expectedRevision: -1, entries: [] })).error, 'INVALID_JOURNAL');
});
