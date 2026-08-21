const crypto = require('node:crypto');
const { validateRequest } = require('./validation');
const PUBLIC_ERRORS = new Set([
  'INVALID_ACTION',
  'INVALID_REQUEST',
  'INVALID_CODE',
  'PAYLOAD_TOO_LARGE',
  'INVALID_PRESETS',
  'INVALID_PRESET',
  'INVALID_PARAMETER',
]);

function createHandler(store) {
  return async (event) => {
    try {
      const request = validateRequest(event);
      const id = crypto.createHash('sha256').update(request.code).digest('hex');
      if (request.action === 'pull') {
        const document = await store.get(id);
        return { ok: true, presets: document?.presets ?? null };
      }
      await store.set(id, { version: 1, presets: request.presets, updatedAt: store.now() });
      return { ok: true };
    } catch (error) {
      const message = error?.message;
      if (PUBLIC_ERRORS.has(message)) return { ok: false, error: message };
      store.logError?.(error);
      return { ok: false, error: 'SYNC_FAILED' };
    }
  };
}

let defaultHandler;
exports.main = async (event) => {
  if (!defaultHandler) {
    const cloudbase = require('@cloudbase/node-sdk');
    const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const collection = db.collection('cat_preset_snapshots');
    defaultHandler = createHandler({
      async get(id) {
        try {
          const result = await collection.doc(id).get();
          return Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        } catch (error) {
          if (/not found|does not exist/i.test(String(error?.message))) return null;
          throw error;
        }
      },
      set: (id, value) => collection.doc(id).set(value),
      now: () => db.serverDate(),
      logError: (error) => console.error('catPresetSync failed', error),
    });
  }
  return defaultHandler(event);
};

exports.createHandler = createHandler;
