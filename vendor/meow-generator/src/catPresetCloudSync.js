import {
  createPresetSyncCoordinator,
  formatPresetSyncCode,
  generatePresetSyncCode,
  maskPresetSyncCode,
  parsePresetSyncState,
  serializePresetSyncState,
} from './catPresetSyncCore.js';

export const CAT_PRESET_SYNC_STORAGE_KEY = 'meow-generator-cat-preset-sync-v1';

export function createCloudPresetRemote({
  env,
  loadSdk = () => import('@cloudbase/js-sdk'),
} = {}) {
  let clientPromise;
  const getClient = async () => {
    if (!clientPromise) clientPromise = (async () => {
      const resolvedEnv = env ?? import.meta.env?.VITE_TCB_ENV_ID;
      if (!resolvedEnv) throw new Error('MISSING_TCB_ENV');
      const module = await loadSdk();
      const cloudbase = module.default ?? module;
      const app = cloudbase.init({ env: resolvedEnv });
      const auth = app.auth({ persistence: 'local' });
      if (!await auth.getLoginState()) {
        const response = typeof auth.signInAnonymously === 'function'
          ? await auth.signInAnonymously()
          : await auth.anonymousAuthProvider().signIn();
        if (response?.error) throw response.error;
      }
      return app;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
    return clientPromise;
  };
  const call = async (data) => {
    const app = await getClient();
    const response = await app.callFunction({ name: 'catPresetSync', data });
    const result = response?.result ?? response;
    if (!result?.ok) throw new Error(result?.error || 'SYNC_FAILED');
    return result;
  };
  return {
    async pull(code) { return (await call({ action: 'pull', code })).presets ?? null; },
    async push(code, presets) { await call({ action: 'push', code, presets }); },
  };
}

export function createPresetCloudSync({
  storage = localStorage,
  remote = createCloudPresetRemote(),
  readPresets,
  replacePresets,
  onStatus,
}) {
  let volatileState = null;
  const coordinator = createPresetSyncCoordinator({
    remote,
    readPresets,
    replacePresets,
    readState: () => {
      try {
        volatileState = parsePresetSyncState(storage.getItem(CAT_PRESET_SYNC_STORAGE_KEY));
      } catch {
        // Keep syncing in memory when private browsing or storage policy blocks localStorage.
      }
      return volatileState;
    },
    writeState: (state) => {
      volatileState = state?.code ? parsePresetSyncState(state) : null;
      try {
        if (volatileState) storage.setItem(CAT_PRESET_SYNC_STORAGE_KEY, serializePresetSyncState(volatileState));
        else storage.removeItem(CAT_PRESET_SYNC_STORAGE_KEY);
      } catch {
        // The current session still has volatileState and can continue cloud syncing.
      }
    },
    onStatus,
  });
  return {
    ...coordinator,
    generateCode: generatePresetSyncCode,
    formatCode: formatPresetSyncCode,
    maskCode: maskPresetSyncCode,
  };
}
