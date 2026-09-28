import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../src/components/SongRequest/artistSettingsStorage.ts', import.meta.url);
const avatarsKey = 'jieyou-custom-artist-avatars-v1';
const draftKey = 'jieyou-artist-settings-dirty-v1';

function backend() {
  const accounts = new Map<string, Record<string, string>>();
  let fail = false;
  return {
    accounts,
    setFail(value: boolean) { fail = value; },
    async read(scope: string) { return accounts.get(scope) ?? null; },
    async write(scope: string, values: Record<string, string>) {
      if (fail) throw new DOMException('Disk full', 'QuotaExceededError');
      accounts.set(scope, { ...values });
    },
  };
}

function legacy(values = new Map<string, string>()) {
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('full localStorage does not block avatar and offline draft persistence across reloads', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  const old = legacy();
  const storage = await openArtistSettingsStorage('account:alice', old, db);
  const avatars = JSON.stringify({ 任然: 'data:image/webp;base64,UklGRgAAAABXRUJQ' });
  storage.setItem(avatarsKey, avatars);
  storage.setItem(draftKey, JSON.stringify({ changeId: 1, snapshot: { customAvatars: JSON.parse(avatars) } }));
  await storage.flush();
  const reloaded = await openArtistSettingsStorage('account:alice', old, db);
  assert.equal(reloaded.getItem(avatarsKey), avatars);
  assert.equal(JSON.parse(reloaded.getItem(draftKey)!).changeId, 1);
});

test('migration preserves legacy avatars and drafts and only removes migrated keys after commit', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  const old = legacy(new Map([
    [avatarsKey, '{"任然":"old-avatar"}'],
    [draftKey, '{"changeId":7}'],
    ['unrelated-notebook', 'keep'],
    [avatarsKey + ':account:bob', 'bob-avatar'],
  ]));
  db.setFail(true);
  await assert.rejects(openArtistSettingsStorage('shared', old, db), /Disk full/);
  assert.equal(old.getItem(avatarsKey), '{"任然":"old-avatar"}');
  assert.equal(old.getItem(draftKey), '{"changeId":7}');
  db.setFail(false);
  const storage = await openArtistSettingsStorage('shared', old, db);
  assert.equal(storage.getItem(avatarsKey), '{"任然":"old-avatar"}');
  assert.equal(storage.getItem(draftKey), '{"changeId":7}');
  assert.equal(old.getItem(avatarsKey), null);
  assert.equal(old.getItem('unrelated-notebook'), 'keep');
  assert.equal(old.getItem(avatarsKey + ':account:bob'), 'bob-avatar');
});

test('accounts stay isolated and committed IndexedDB data wins over stale localStorage', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  db.accounts.set('account:alice', { [avatarsKey]: 'current', [draftKey]: 'pending' });
  const old = legacy(new Map([[avatarsKey + ':account:alice', 'stale'], [avatarsKey, 'public']]));
  const alice = await openArtistSettingsStorage('account:alice', old, db);
  const bob = await openArtistSettingsStorage('account:bob', old, db);
  assert.equal(alice.getItem(avatarsKey), 'current');
  assert.equal(bob.getItem(avatarsKey), null);
  assert.equal(old.getItem(avatarsKey), 'public');
  alice.removeItem(draftKey);
  await alice.flush();
  assert.equal((await openArtistSettingsStorage('account:alice', old, db)).getItem(draftKey), null);
});

test('failed writes preserve the last committed avatar and draft, and allow a later retry', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  db.accounts.set('shared', { [avatarsKey]: 'original', [draftKey]: 'original-draft' });
  const storage = await openArtistSettingsStorage('shared', legacy(), db);
  db.setFail(true);
  storage.setItem(avatarsKey, 'replacement');
  storage.setItem(draftKey, 'new-draft');
  await assert.rejects(storage.flush(), /Disk full/);
  assert.equal(storage.getItem(avatarsKey), 'original');
  assert.equal(storage.getItem(draftKey), 'original-draft');
  assert.equal(db.accounts.get('shared')![avatarsKey], 'original');
  db.setFail(false);
  storage.setItem(avatarsKey, 'retry');
  await storage.flush();
  assert.equal(db.accounts.get('shared')![avatarsKey], 'retry');
});

test('overlapping writes commit in order without losing the newest draft', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  const storage = await openArtistSettingsStorage('shared', legacy(), db);
  storage.setItem(draftKey, 'first');
  const first = storage.flush();
  storage.setItem(draftKey, 'latest');
  const latest = storage.flush();
  await Promise.all([first, latest]);
  assert.equal(db.accounts.get('shared')![draftKey], 'latest');
});

test('concurrent initial loads share the migration and cannot replace it with empty data', async () => {
  const { openArtistSettingsStorage } = await import(moduleUrl.href);
  const db = backend();
  const old = legacy(new Map([[avatarsKey, 'legacy-avatar'], [draftKey, 'pending-draft']]));
  const [first, second] = await Promise.all([
    openArtistSettingsStorage('shared', old, db),
    openArtistSettingsStorage('shared', old, db),
  ]);
  assert.equal(first, second);
  assert.equal(db.accounts.get('shared')![avatarsKey], 'legacy-avatar');
  assert.equal(db.accounts.get('shared')![draftKey], 'pending-draft');
});
