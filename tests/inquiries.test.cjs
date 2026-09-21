const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validateInquiries } = require('../cloudfunctions/songRequestSync/inquiries');
const { saveJournal } = require('../cloudfunctions/songRequestSync/enoughJournal');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const entry = { id: 'one', topic: 'philosophy', question: '人生的意义是什么？', insight: '' };
test('inquiries validate topics, separate questions and insights, reject malformed records', () => {
  assert.deepEqual(validateInquiries([{ ...entry, injected: true }]), [entry]);
  for (const entries of [[{ ...entry, topic: 'bad' }], [entry, entry], [{ ...entry, question: ' ' }], [{ ...entry, insight: 1 }], [{ ...entry, insight: 'x'.repeat(10001) }]]) assert.throws(() => validateInquiries(entries));
});
test('inquiries require owner, persist edits and deletions, reject stale writes and isolate journals', async () => {
  const docs = new Map();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const owner = { alias: '2421415030@qq.com', password: 'secret1' };
  for (const alias of [owner.alias, 'reader']) docs.set(hash(alias), { alias, passwordSalt: 'salt', passwordHash: crypto.scryptSync('secret1', 'salt', 32).toString('hex') });
  const db = { runTransaction: fn => fn({ collection: () => ({ doc: id => ({ get: async () => ({ data: docs.has(id) ? [docs.get(id)] : [] }), set: async value => docs.set(id, value) }) }) }) };
  const handler = createHandler({ getWorkspace: async id => docs.get(id), saveInquiries: (id, revision, entries) => saveJournal(db, id, revision, entries, 'inquiries') });
  for (const credentials of [{}, { alias: 'reader', password: 'secret1' }, { ...owner, password: 'wrong123' }]) for (const action of ['inquiries:pull', 'inquiries:save']) assert.equal((await handler({ action, ...credentials, expectedRevision: 0, entries: [entry] })).ok, false);
  const save = (expectedRevision, entries) => handler({ action: 'inquiries:save', ...owner, expectedRevision, entries });
  assert.equal((await save(0, [entry])).ok, true);
  assert.equal((await save(0, [])).error, 'CONFLICT');
  assert.equal((await save(1, [{ ...entry, insight: '我的看法' }])).ok, true);
  assert.equal((await handler({ action: 'inquiries:pull', ...owner })).snapshot.entries[0].insight, '我的看法');
  assert.equal(docs.has(`enough-${hash(owner.alias)}`), false);
  assert.equal((await save(2, [])).ok, true);
  assert.deepEqual((await handler({ action: 'inquiries:pull', ...owner })).snapshot.entries, []);
});
