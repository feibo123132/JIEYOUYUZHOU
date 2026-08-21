import {
  CAT_PRESET_LIMIT,
  CAT_PRESET_PARAMETER_KEYS,
  createCatPreset,
} from './catPresets.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 20;

export function normalizePresetSyncCode(value) {
  const code = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== CODE_LENGTH || [...code].some((char) => !CODE_ALPHABET.includes(char))) {
    throw new TypeError('INVALID_SYNC_CODE');
  }
  return code;
}

export function formatPresetSyncCode(value) {
  return normalizePresetSyncCode(value).match(/.{1,5}/g).join('-');
}

export function maskPresetSyncCode(value) {
  const code = normalizePresetSyncCode(value);
  return `${code.slice(0, 5)}-•••••-•••••-${code.slice(-5)}`;
}

export function generatePresetSyncCode(randomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)) {
  const bytes = randomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

export function parsePresetSyncState(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed?.code) return null;
    return {
      code: normalizePresetSyncCode(parsed.code),
      dirty: parsed?.dirty === true,
      revision: Number.isSafeInteger(parsed?.revision) && parsed.revision >= 0 ? parsed.revision : 0,
    };
  } catch {
    return null;
  }
}

export function serializePresetSyncState(state) {
  const parsed = parsePresetSyncState(state);
  return parsed ? JSON.stringify(parsed) : '';
}

export function validateCloudPresetSnapshot(value) {
  try {
    if (!Array.isArray(value) || value.length > CAT_PRESET_LIMIT) throw new TypeError();
    const allowedKeys = new Set(CAT_PRESET_PARAMETER_KEYS);
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError();
      if (!['name', 'parameters', 'updatedAt'].every((key) => Object.hasOwn(item, key))) throw new TypeError();
      if (Object.keys(item).some((key) => !['name', 'parameters', 'updatedAt'].includes(key))) throw new TypeError();
      if (typeof item.name !== 'string' || !item.name || item.name !== item.name.trim() || item.name.length > 40) throw new TypeError();
      if (typeof item.updatedAt !== 'string' || new Date(item.updatedAt).toISOString() !== item.updatedAt) throw new TypeError();
      if (!item.parameters || typeof item.parameters !== 'object' || Array.isArray(item.parameters)) throw new TypeError();
      const keys = Object.keys(item.parameters);
      if (!keys.length || keys.some((key) => !allowedKeys.has(key))) throw new TypeError();
      const normalized = createCatPreset(item.name, item.parameters, item.updatedAt);
      if (Object.keys(normalized.parameters).length !== keys.length) throw new TypeError();
      for (const key of keys) {
        if (!Object.is(normalized.parameters[key], item.parameters[key])) throw new TypeError();
      }
      return { name: item.name, parameters: { ...item.parameters }, updatedAt: item.updatedAt };
    });
  } catch {
    throw new TypeError('INVALID_CLOUD_SNAPSHOT');
  }
}

export function createPresetSyncCoordinator({ remote, readPresets, replacePresets, readState, writeState, onStatus }) {
  let state = parsePresetSyncState(readState()) ?? { code: null, dirty: false, revision: 0 };
  let generation = 0;
  let pendingWrite = false;
  let writePromise = null;
  let uploadedRevision = state.dirty ? -1 : state.revision;

  const persistState = (value = { ...state }) => {
    try {
      writeState(value);
      return true;
    } catch {
      return false;
    }
  };
  const status = (value, expectedGeneration = generation, expectedCode = state.code) => {
    if (generation === expectedGeneration && state.code === expectedCode) onStatus(value);
  };

  const runWrites = async () => {
    while (pendingWrite && state.code) {
      pendingWrite = false;
      const attempt = { generation, code: state.code, revision: state.revision };
      const snapshot = validateCloudPresetSnapshot(readPresets());
      status('syncing', attempt.generation, attempt.code);
      try {
        await remote.push(attempt.code, snapshot);
      } catch {
        const current = generation === attempt.generation && state.code === attempt.code;
        if (current) {
          state.dirty = true;
          persistState();
          status('error', attempt.generation, attempt.code);
          return;
        }
        continue;
      }
      if (generation !== attempt.generation || state.code !== attempt.code) continue;
      if (state.revision === attempt.revision) {
        uploadedRevision = attempt.revision;
        state.dirty = false;
        persistState();
        status('synced', attempt.generation, attempt.code);
      } else {
        pendingWrite = true;
      }
    }
  };

  const requestUpload = () => {
    if (!state.code) return Promise.resolve();
    pendingWrite = true;
    if (!writePromise) {
      writePromise = runWrites().finally(() => {
        writePromise = null;
        if (pendingWrite && state.code) requestUpload();
      });
    }
    return writePromise;
  };

  const pull = async () => {
    if (!state.code) return;
    const attempt = { generation, code: state.code, revision: state.revision };
    status('syncing', attempt.generation, attempt.code);
    try {
      const cloud = await remote.pull(attempt.code);
      if (generation !== attempt.generation || state.code !== attempt.code) return;
      if (state.dirty || state.revision !== attempt.revision) {
        if (writePromise) await writePromise;
        if (generation !== attempt.generation || state.code !== attempt.code) return;
        if (state.dirty || uploadedRevision !== state.revision) await requestUpload();
        return;
      }
      if (cloud == null) {
        state.dirty = true;
        persistState();
        await requestUpload();
        return;
      }
      const snapshot = validateCloudPresetSnapshot(cloud);
      replacePresets(snapshot);
      uploadedRevision = state.revision;
      state.dirty = false;
      persistState();
      status('synced', attempt.generation, attempt.code);
    } catch {
      if (generation === attempt.generation && state.code === attempt.code) status('error', attempt.generation, attempt.code);
    }
  };

  return {
    start: () => (state.code ? (state.dirty ? requestUpload() : pull()) : Promise.resolve()),
    sync: () => (state.code ? (state.dirty ? requestUpload() : pull()) : Promise.resolve()),
    async connect(code, { sync = true } = {}) {
      generation += 1;
      pendingWrite = false;
      state = { code: normalizePresetSyncCode(code), dirty: false, revision: 0 };
      uploadedRevision = -1;
      persistState();
      if (sync) await pull();
    },
    disconnect() {
      generation += 1;
      pendingWrite = false;
      state = { code: null, dirty: false, revision: 0 };
      uploadedRevision = -1;
      persistState(null);
      onStatus('local');
    },
    localChanged() {
      state = { ...state, dirty: true, revision: state.revision + 1 };
      persistState();
      if (state.code) requestUpload();
    },
    getState: () => ({ ...state }),
    async whenIdle() {
      while (writePromise) await writePromise;
    },
  };
}
