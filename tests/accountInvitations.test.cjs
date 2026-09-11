const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const { invitationId, registerWithInvitation, revokeInvitation } = require('../cloudfunctions/songRequestSync/invitations');
const owner = { alias: '2421415030@qq.com', password: 'owner-secret' };
const member = { alias: 'existing-member', password: 'member-secret' };
const hash = alias => crypto.createHash('sha256').update(alias.trim().toLowerCase()).digest('hex');
function setup() {
  let records = new Map();
  let now = '2026-09-10T00:00:00.000Z';
  let failAccountWrite = false;
  for (const credentials of [owner, member]) records.set(hash(credentials.alias), {
    alias: credentials.alias, passwordSalt: 'salt',
    passwordHash: crypto.scryptSync(credentials.password, 'salt', 32).toString('hex'), roadshows: [],
  });
  let queue = Promise.resolve();
  const db = { runTransaction: callback => {
    const task = queue.then(async () => {
      const draft = structuredClone(records);
      const result = await callback({ collection: () => ({ doc: id => ({
        get: async () => ({ data: draft.has(id) ? [draft.get(id)] : [] }),
        set: async value => {
          if (failAccountWrite && !id.startsWith('invite-')) throw new Error('WRITE_FAILED');
          draft.set(id, value);
        },
      }) }) });
      records = draft;
      return result;
    });
    queue = task.catch(() => {});
    return task;
  } };
  const handler = createHandler({ now: () => now,
    getWorkspace: async id => records.get(id),
    setWorkspace: async (id, data) => records.set(id, data),
    registerWithInvitation: (...args) => registerWithInvitation(db, ...args),
    revokeInvitation: (...args) => revokeInvitation(db, ...args),
  });
  return { handler, records: () => records, advance: () => { now = '2026-09-18T00:00:00.000Z'; }, fail: value => { failAccountWrite = value; } };
}
const signup = (handler, code, alias = 'new-member') => handler({ action: 'roadshows:register', alias, password: 'new-secret', invitationCode: code });
const invite = (handler, boundAlias = '') => handler({ action: 'invitations:create', ...owner, boundAlias });

test('仅真实站主可发码和撤销；已有账号无需邀请码登录', async () => {
  const { handler } = setup();
  assert.equal((await handler({ action: 'invitations:create', ...member })).error, 'AUTH_FAILED');
  assert.equal((await handler({ action: 'invitations:create', ...owner, password: 'wrong-secret' })).error, 'AUTH_FAILED');
  assert.equal((await handler({ action: 'roadshows:pull', ...owner })).ok, true);
  assert.equal((await handler({ action: 'roadshows:pull', ...member })).ok, true);
  const { code } = await invite(handler);
  assert.match(code, /^[A-F0-9]{32}$/);
  assert.equal((await handler({ action: 'invitations:revoke', ...member, invitationCode: code })).error, 'AUTH_FAILED');
  assert.equal((await signup(handler, code)).ok, true);
});

test('无邀请码和错误绑定不能注册；邀请码不存明文且使用一次失效', async () => {
  const { handler, records } = setup();
  assert.equal((await signup(handler)).error, 'INVALID_INVITATION');
  assert.equal((await signup(handler, 'bad-code')).error, 'INVALID_INVITATION');
  const { code } = await invite(handler, 'New-Member');
  assert.equal(JSON.stringify(records().get(invitationId(code))).includes(code), false);
  assert.equal((await signup(handler, code, 'someone-else')).error, 'INVALID_INVITATION');
  assert.equal((await signup(handler, code.toLowerCase())).ok, true);
  assert.equal((await signup(handler, code, 'someone-else')).error, 'INVALID_INVITATION');
  assert.equal((await handler({ action: 'roadshows:pull', alias: 'new-member', password: 'new-secret' })).ok, true);
});

test('过期和已撤销的邀请码不能注册', async () => {
  const state = setup();
  const { code } = await invite(state.handler);
  assert.equal((await state.handler({ action: 'invitations:revoke', ...owner, invitationCode: code })).ok, true);
  assert.equal((await signup(state.handler, code)).error, 'INVALID_INVITATION');
  const fresh = await invite(state.handler);
  state.advance();
  assert.equal((await signup(state.handler, fresh.code)).error, 'INVALID_INVITATION');
});

test('并发抢同一码仅成功一次；已有账号不可覆盖且不消耗新码', async () => {
  const { handler } = setup();
  const { code } = await invite(handler);
  const results = await Promise.all([signup(handler, code, 'a'), signup(handler, code, 'b')]);
  assert.equal(results.filter(result => result.ok).length, 1);
  const next = await invite(handler);
  assert.equal((await signup(handler, next.code, member.alias)).error, 'ALREADY_REGISTERED');
  assert.equal((await signup(handler, next.code, 'c')).ok, true);
});

test('注册写入失败时回滚邀请码核销', async () => {
  const state = setup();
  const { code } = await invite(state.handler);
  state.fail(true);
  assert.equal((await signup(state.handler, code)).ok, false);
  assert.equal(state.records().get(invitationId(code)).usedAt, undefined);
  state.fail(false);
  assert.equal((await signup(state.handler, code)).ok, true);
});
