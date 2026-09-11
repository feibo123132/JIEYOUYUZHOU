const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const { ownerStars } = require('../cloudfunctions/songRequestSync/ownerStars');
const owner = { alias: '2421415030@qq.com', password: 'secret123' };
function fixture() {
  let data = new Map();
  let fail = false;
  for (const alias of [owner.alias, 'visitor']) data.set(`song_request_workspaces/${crypto.createHash('sha256').update(alias).digest('hex')}`, { passwordSalt: 'salt', passwordHash: crypto.scryptSync(owner.password, 'salt', 32).toString('hex') });
  data.set('life_stars/old', { nickname: 'jieyou', message: '秘密', created_at: '2026-09-11', position_x: 20, position_y: 20 });
  data.set('life_stars/public', { nickname: 'visitor', message: '公共' });
  const collection = (map, name) => ({
    doc: id => ({
      get: async () => ({ data: map.has(`${name}/${id}`) ? [{ ...map.get(`${name}/${id}`), _id: id }] : [] }),
      set: async value => { if (fail) throw new Error('WRITE_FAILED'); map.set(`${name}/${id}`, value); },
      remove: async () => map.delete(`${name}/${id}`),
    }),
    where(filters) { this.filters = filters; return this; },
    skip(offset) { this.offset = offset; return this; },
    limit(count) { this.count = count; return this; },
    async get() { return { data: [...map].filter(([key, value]) => key.startsWith(`${name}/`) && Object.entries(this.filters || {}).every(([k, v]) => value[k] === v)).slice(this.offset || 0, (this.offset || 0) + (this.count || 100)).map(([key, value]) => ({ ...value, _id: key.slice(name.length + 1) })) }; },
  });
  const db = { collection: name => collection(data, name), runTransaction: async fn => { const draft = structuredClone(data); const result = await fn({ collection: name => collection(draft, name) }); data.clear(); for (const [key, value] of draft) data.set(key, value); return result; } };
  const handler = createHandler({ getWorkspace: async id => data.get(`song_request_workspaces/${id}`), ownerStars: request => ownerStars(db, request) });
  return { handler, data: () => data, fail: value => { fail = value; } };
}
test('仅真实站长可验证、读取或创建私密星星', async () => {
  const { handler } = fixture();
  for (const action of ['stars:verifyOwner', 'stars:ownerPull', 'stars:ownerCreate']) {
    assert.equal((await handler({ action, ...owner, password: 'wrong123', themeId: 'life' })).error, 'AUTH_FAILED');
    assert.equal((await handler({ action, ...owner, alias: 'visitor', themeId: 'life' })).error, 'AUTH_FAILED');
  }
  assert.equal((await handler({ action: 'stars:verifyOwner', ...owner })).owner, true);
});
test('旧站长星星原子转存，普通星星保留；重复转存不会重复', async () => {
  const state = fixture();
  const request = { action: 'stars:ownerPull', ...owner, themeId: 'life' };
  state.fail(true);
  assert.equal((await state.handler(request)).ok, false);
  assert.equal(state.data().has('life_stars/old'), true);
  state.fail(false);
  const result = await state.handler(request);
  assert.equal(result.stars[0].message, '秘密');
  assert.equal(state.data().has('life_stars/old'), false);
  assert.equal(state.data().has('life_stars/public'), true);
  assert.equal((await state.handler(request)).stars.length, 1);
});
test('新星星只写私密区，支持修改、删除、恢复；不能修改其他文档', async () => {
  const state = fixture();
  const call = (action, rest = {}) => state.handler({ action, ...owner, themeId: 'life', ...rest });
  const result = await call('stars:ownerCreate', { star: { position_x: 1, position_y: 2, message: '自己看', nickname: 'visitor' } });
  assert.equal(result.ok, true);
  const id = result.star.id;
  assert.equal(result.star.nickname, 'JIEYOU');
  assert.equal(state.data().has(`life_stars/${id}`), false);
  assert.equal((await call('stars:ownerUpdate', { id, star: { message: '修改' } })).star.message, '修改');
  assert.ok((await call('stars:ownerDelete', { id })).star.deleted_at);
  assert.equal((await call('stars:ownerUpdate', { id, star: { message: '复活' } })).error, 'NOT_FOUND');
  assert.equal((await call('stars:ownerRestore', { id })).star.deleted_at, undefined);
  assert.equal((await call('stars:ownerDelete', { id: 'someone-else' })).error, 'INVALID_STAR');
});
