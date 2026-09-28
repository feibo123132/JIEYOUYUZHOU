// Keep the existing synchronous settings helpers, but commit their staged writes
// atomically to IndexedDB before publishing an upload or sending a cloud draft.
export interface ArtistSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  flush(): Promise<void>;
}

interface SettingsBackend {
  read(scope: string): Promise<Record<string, string> | null>;
  write(scope: string, values: Record<string, string>): Promise<void>;
}

const LEGACY_KEYS = [
  'jieyou-song-catalog-v1',
  'jieyou-custom-artist-avatars-v1',
  'jieyou-artist-avatar-adjustments-v1',
  'jieyou-artist-settings-cache-v1',
  'jieyou-artist-settings-dirty-v1',
];

export const artistSettingsStorageError = (error: unknown) => {
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return '浏览器存储空间不足，本次修改未保存。请释放磁盘空间后重试。';
  }
  return '歌单本地存储不可用，本次修改未保存。请检查浏览器是否允许本站保存数据后重试。';
};

const createIndexedDBBackend = (): SettingsBackend => {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open('jieyou-artist-settings-v1', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('IndexedDB blocked')); };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
  return {
    async read(scope) {
      const db = await open();
      try {
        return await new Promise<Record<string, string> | null>((resolve, reject) => {
          const transaction = db.transaction('accounts', 'readonly');
          const request = transaction.objectStore('accounts').get(scope);
          transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read aborted'));
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const value = request.result;
            if (value === undefined) return resolve(null);
            if (!value || typeof value !== 'object' || Array.isArray(value)
              || Object.values(value).some((item) => typeof item !== 'string')) {
              return reject(new Error('Invalid artist settings storage'));
            }
            resolve(value);
          };
        });
      } finally { db.close(); }
    },
    async write(scope, values) {
      const db = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('accounts', 'readwrite');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
          transaction.objectStore('accounts').put(values, scope);
        });
      } finally { db.close(); }
    },
  };
};

const browserBackend = createIndexedDBBackend();
const opening = new WeakMap<SettingsBackend, Map<string, Promise<ArtistSettingsStorage>>>();

export const openArtistSettingsStorage = (
  scope: string,
  legacy: Pick<Storage, 'getItem' | 'removeItem'>,
  backend: SettingsBackend = browserBackend,
): Promise<ArtistSettingsStorage> => {
  let scopes = opening.get(backend);
  if (!scopes) { scopes = new Map(); opening.set(backend, scopes); }
  const existing = scopes.get(scope);
  if (existing) return existing;
  const operation = hydrateArtistSettingsStorage(scope, legacy, backend);
  scopes.set(scope, operation);
  const remove = () => { scopes.delete(scope); };
  void operation.then(remove, remove);
  return operation;
};

const hydrateArtistSettingsStorage = async (
  scope: string,
  legacy: Pick<Storage, 'getItem' | 'removeItem'>,
  backend: SettingsBackend,
): Promise<ArtistSettingsStorage> => {
  let committed = await backend.read(scope);
  const legacyKey = (key: string) => scope === 'shared' ? key : `${key}:${scope}`;
  if (committed === null) {
    committed = {};
    for (const key of LEGACY_KEYS) {
      const value = legacy.getItem(legacyKey(key));
      if (value !== null) committed[key] = value;
    }
    // Do not remove even one old value until the entire migration is durable.
    await backend.write(scope, committed);
  }
  for (const key of LEGACY_KEYS) {
    try { legacy.removeItem(legacyKey(key)); } catch { /* The committed copy is safe. */ }
  }
  let staged = { ...committed };
  let version = 0;
  let committedVersion = 0;
  let pending = Promise.resolve();
  return {
    getItem: (key) => staged[key] ?? null,
    setItem: (key, value) => { staged[key] = value; version += 1; },
    removeItem: (key) => { delete staged[key]; version += 1; },
    flush() {
      const snapshot = { ...staged };
      const writeVersion = version;
      const operation = pending.catch(() => {}).then(async () => {
        if (writeVersion <= committedVersion) return;
        try {
          await backend.write(scope, snapshot);
          committed = snapshot;
          committedVersion = writeVersion;
        } catch (error) {
          if (version === writeVersion) staged = { ...committed };
          throw error;
        }
      });
      pending = operation;
      return operation;
    },
  };
};
