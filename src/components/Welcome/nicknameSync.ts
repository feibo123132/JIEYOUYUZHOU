export const QUIZ_NICKNAME_STORAGE_KEY = 'jieyou:quiz-participant-nickname';

interface ReadableStorage {
  getItem: (key: string) => unknown;
}

interface WritableStorage {
  setItem: (key: string, value: string) => void;
}

export const readSyncedNickname = (storage: ReadableStorage): string => {
  try {
    const value = storage.getItem(QUIZ_NICKNAME_STORAGE_KEY);
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
};

export const saveSyncedNickname = (storage: WritableStorage, nickname: string): string => {
  const value = nickname.trim();
  if (!value) return '';
  try {
    storage.setItem(QUIZ_NICKNAME_STORAGE_KEY, value);
  } catch {}
  return value;
};
