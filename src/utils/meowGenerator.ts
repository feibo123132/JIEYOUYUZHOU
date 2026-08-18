export function getMeowGeneratorUrl(
  base = import.meta.env?.BASE_URL || '/',
): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}meow-generator/index.html`;
}

export const HAPPINESS_MEOW_SOURCE = 'happiness-star';
export const HAPPINESS_CONTEXT_STORAGE_KEY = 'jieyou:happiness-star-context';
export const DEFAULT_HAPPINESS_MESSAGE = '这一刻值得被记住';

type WritableStorage = Pick<Storage, 'setItem'>;

export function normalizeHappinessMessage(message?: string): string {
  const normalized = typeof message === 'string' ? message.trim().slice(0, 200) : '';
  return normalized || DEFAULT_HAPPINESS_MESSAGE;
}

export interface HappinessStoredContext {
  message: string;
  createdAt: string;
}

export function storeHappinessContext(
  storage: WritableStorage,
  message?: string,
  createdAt?: string,
): HappinessStoredContext {
  const context = {
    message: normalizeHappinessMessage(message),
    createdAt: typeof createdAt === 'string' ? createdAt.trim().slice(0, 100) : '',
  };
  storage.setItem(HAPPINESS_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  return context;
}

export function getHappinessMeowGeneratorUrl(
  base = import.meta.env?.BASE_URL || '/',
): string {
  return `${getMeowGeneratorUrl(base)}?source=${HAPPINESS_MEOW_SOURCE}`;
}

interface OpenHappinessMeowGeneratorOptions {
  message?: string;
  createdAt?: string;
  base?: string;
  getStorage?: () => WritableStorage | undefined;
  navigate?: (url: string) => void;
}

export function openHappinessMeowGenerator({
  message,
  createdAt,
  base,
  getStorage = () => window.sessionStorage,
  navigate = (url) => window.location.assign(url),
}: OpenHappinessMeowGeneratorOptions): string {
  const normalized = normalizeHappinessMessage(message);
  try {
    const storage = getStorage();
    if (storage) storeHappinessContext(storage, normalized, createdAt);
  } catch {
    // Navigation must still work when temporary browser storage is unavailable.
  }
  navigate(getHappinessMeowGeneratorUrl(base));
  return normalized;
}
