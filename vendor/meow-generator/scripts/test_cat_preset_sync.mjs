import assert from 'node:assert/strict';

import {
  createPresetSyncCoordinator,
  formatPresetSyncCode,
  generatePresetSyncCode,
  maskPresetSyncCode,
  normalizePresetSyncCode,
  parsePresetSyncState,
  validateCloudPresetSnapshot,
} from '../src/catPresetSyncCore.js';
import {
  createCloudPresetRemote,
  createPresetCloudSync,
} from '../src/catPresetCloudSync.js';

const CODE_A = 'ABCDEFGHJKLMNPQRSTUV';
const CODE_B = '23456789ABCDEFGHJKLM';
const preset = (name = '橘橘') => ({
  name,
  parameters: { seed: 123, pose: 'standing', headSize: 1.2 },
  updatedAt: '2026-08-21T08:00:00.000Z',
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

assert.equal(normalizePresetSyncCode('abcd-efgh-jklm-npqr-stuv'), CODE_A);
assert.equal(formatPresetSyncCode(CODE_A), 'ABCDE-FGHJK-LMNPQ-RSTUV');
assert.equal(maskPresetSyncCode(CODE_A), 'ABCDE-•••••-•••••-RSTUV');
assert.throws(() => normalizePresetSyncCode('too-short'), /INVALID_SYNC_CODE/);
assert.equal(generatePresetSyncCode((bytes) => bytes.fill(0)), 'AAAAAAAAAAAAAAAAAAAA');
assert.deepEqual(parsePresetSyncState('{"code":"ABCDE-FGHJK-LMNPQ-RSTUV","dirty":true,"revision":3}'), {
  code: CODE_A,
  dirty: true,
  revision: 3,
});
assert.equal(parsePresetSyncState('{broken'), null);
assert.deepEqual(validateCloudPresetSnapshot([preset()]), [preset()]);
assert.throws(() => validateCloudPresetSnapshot([{ ...preset(), extra: true }]), /INVALID_CLOUD_SNAPSHOT/);
assert.throws(() => validateCloudPresetSnapshot([{ ...preset(), parameters: { headSize: 1.2, unknown: 1 } }]), /INVALID_CLOUD_SNAPSHOT/);

function harness({ state = null, presets = [preset()], pull = async () => null, push = async () => ({ ok: true }) } = {}) {
  let localState = state;
  let localPresets = presets;
  const statuses = [];
  const pushes = [];
  const coordinator = createPresetSyncCoordinator({
    remote: {
      pull,
      push: async (code, nextPresets) => {
        pushes.push({ code, presets: structuredClone(nextPresets) });
        return push(code, nextPresets);
      },
    },
    readPresets: () => localPresets,
    replacePresets: (next) => { localPresets = next; },
    readState: () => localState,
    writeState: (next) => { localState = next; },
    onStatus: (status) => statuses.push(status),
  });
  return {
    coordinator,
    getState: () => localState,
    getPresets: () => localPresets,
    statuses,
    pushes,
  };
}

{
  const h = harness({ state: { code: CODE_A, dirty: true, revision: 2 } });
  await h.coordinator.start();
  assert.equal(h.pushes.length, 1, 'dirty startup uploads local data');
  assert.equal(h.getState().dirty, false);
}

{
  const cloud = [preset('云端猫')];
  const h = harness({ state: { code: CODE_A, dirty: false, revision: 2 }, pull: async () => cloud });
  await h.coordinator.start();
  assert.deepEqual(h.getPresets(), cloud, 'clean startup downloads cloud data');
}

{
  const h = harness({ state: { code: CODE_A, dirty: false, revision: 0 }, pull: async () => null });
  await h.coordinator.start();
  assert.equal(h.pushes.length, 1, 'missing cloud document uploads local snapshot');
}

{
  const h = harness({
    state: { code: CODE_A, dirty: true, revision: 1 },
    push: async () => { throw new Error('offline'); },
  });
  await h.coordinator.start();
  assert.equal(h.getState().dirty, true, 'failed upload keeps dirty state');
  assert.equal(h.statuses.at(-1), 'error');
}

{
  const first = deferred();
  let calls = 0;
  const h = harness({
    state: { code: CODE_A, dirty: false, revision: 0 },
    push: async () => (++calls === 1 ? first.promise : { ok: true }),
  });
  h.coordinator.localChanged();
  h.coordinator.localChanged();
  h.coordinator.localChanged();
  first.resolve({ ok: true });
  await h.coordinator.whenIdle();
  assert.ok(calls <= 2, 'rapid edits are coalesced into at most one follow-up upload');
  assert.equal(h.getState().revision, 3);
  assert.equal(h.getState().dirty, false);
}

{
  const pendingPull = deferred();
  const h = harness({
    state: { code: CODE_A, dirty: false, revision: 0 },
    pull: async () => pendingPull.promise,
  });
  const syncing = h.coordinator.start();
  h.coordinator.localChanged();
  pendingPull.resolve([preset('迟到云端猫')]);
  await syncing;
  await h.coordinator.whenIdle();
  assert.notEqual(h.getPresets()[0].name, '迟到云端猫', 'late pull cannot overwrite a local edit');
  assert.equal(h.pushes.length, 1);
}

{
  const pendingPush = deferred();
  const h = harness({
    state: { code: CODE_A, dirty: false, revision: 0 },
    push: async () => pendingPush.promise,
  });
  h.coordinator.localChanged();
  h.coordinator.disconnect();
  await h.coordinator.connect(CODE_B, { sync: false });
  pendingPush.resolve({ ok: true });
  await h.coordinator.whenIdle();
  assert.equal(h.getState().code, CODE_B, 'stale upload cannot mutate a new connection');
  assert.equal(h.getState().dirty, false);
}

{
  const pendingPush = deferred();
  const h = harness({
    state: { code: CODE_A, dirty: false, revision: 0 },
    push: async (code) => (code === CODE_A ? pendingPush.promise : { ok: true }),
  });
  h.coordinator.localChanged();
  await h.coordinator.connect(CODE_B, { sync: false });
  h.coordinator.localChanged();
  pendingPush.reject(new Error('old connection failed'));
  await h.coordinator.whenIdle();
  assert.equal(h.pushes.filter(({ code }) => code === CODE_B).length, 1,
    'a stale failed upload cannot strand the new connection upload');
  assert.equal(h.getState().dirty, false);
}

{
  let initCalls = 0;
  const remote = createCloudPresetRemote({
    env: 'test-env',
    loadSdk: async () => ({
      default: {
        init: () => {
          initCalls += 1;
          return {
            auth: () => ({
              getLoginState: async () => null,
              signInAnonymously: async () => (initCalls === 1
                ? { error: new Error('offline') }
                : { data: { uid: 'ok' } }),
            }),
            callFunction: async () => ({ result: { ok: true, presets: [] } }),
          };
        },
      },
    }),
  });
  await assert.rejects(remote.pull(CODE_A), /offline/);
  assert.deepEqual(await remote.pull(CODE_A), [], 'failed authentication can be retried');
  assert.equal(initCalls, 2);
}

{
  let pushes = 0;
  const unavailableStorage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
    removeItem: () => { throw new Error('storage blocked'); },
  };
  const sync = createPresetCloudSync({
    storage: unavailableStorage,
    remote: {
      pull: async () => null,
      push: async () => { pushes += 1; },
    },
    readPresets: () => [preset()],
    replacePresets: () => {},
    onStatus: () => {},
  });
  await sync.connect(CODE_A, { sync: false });
  sync.localChanged();
  await sync.whenIdle();
  assert.equal(pushes, 1, 'storage failures do not disable the current-session cloud upload');
}

console.log('cat preset sync checks passed');
