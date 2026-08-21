const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../cloudfunctions/catPresetSync');

const code = 'ABCDEFGHJKLMNPQRSTUV';
const preset = { name: '橘橘', parameters: { headSize: 1.2 }, updatedAt: '2026-08-21T08:00:00.000Z' };

function setup() {
  const docs = new Map();
  return {
    docs,
    handler: createHandler({
      get: async (id) => docs.get(id) ?? null,
      set: async (id, value) => docs.set(id, value),
      now: () => 'SERVER_DATE',
    }),
  };
}

test('rejects invalid requests', async () => {
  const { handler } = setup();
  for (const event of [
    { action: 'delete', code },
    { action: 'pull', code, unknown: true },
    { action: 'pull', code: 'short' },
    { action: 'push', code, presets: Array(21).fill(preset) },
    { action: 'push', code, presets: [{ ...preset, parameters: { unknown: 1 } }] },
    { action: 'push', code, presets: [{ ...preset, extra: true }] },
    { action: 'push', code, presets: [{ ...preset, parameters: { coatId: 'unknown' } }] },
    { action: 'push', code, presets: [{ ...preset, name: 'x'.repeat(140000) }] },
  ]) assert.equal((await handler(event)).ok, false);
});

test('stores and retrieves one complete snapshot', async () => {
  const { handler, docs } = setup();
  assert.deepEqual(await handler({ action: 'pull', code }), { ok: true, presets: null });
  assert.deepEqual(await handler({ action: 'push', code, presets: [preset] }), { ok: true });
  assert.equal(docs.size, 1);
  assert.deepEqual(await handler({ action: 'pull', code }), { ok: true, presets: [preset] });
  assert.deepEqual(await handler({ action: 'push', code, presets: [] }), { ok: true });
  assert.deepEqual(await handler({ action: 'pull', code }), { ok: true, presets: [] });
});

test('does not expose internal database errors', async () => {
  const handler = createHandler({
    get: async () => { throw new Error('secret database hostname leaked'); },
    set: async () => {},
    now: () => 'SERVER_DATE',
  });
  assert.deepEqual(await handler({ action: 'pull', code }), { ok: false, error: 'SYNC_FAILED' });
});
