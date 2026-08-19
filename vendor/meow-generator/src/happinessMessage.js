export const HAPPINESS_MEOW_SOURCE = 'happiness-star';
export const HAPPINESS_CONTEXT_STORAGE_KEY = 'jieyou:happiness-star-context';
export const DEFAULT_HAPPINESS_MESSAGE = '这一刻值得被记住';
export const DEFAULT_HAPPINESS_DATE = '日期未知';

export function normalizeHappinessMessage(message) {
  const normalized = typeof message === 'string' ? message.trim().slice(0, 200) : '';
  return normalized || DEFAULT_HAPPINESS_MESSAGE;
}

export function formatHappinessDate(createdAt) {
  const value = typeof createdAt === 'string' ? createdAt.trim() : '';
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() === year
      && check.getUTCMonth() === month - 1
      && check.getUTCDate() === day
    ) {
      return `${year}年${month}月${day}日`;
    }
  }
  return DEFAULT_HAPPINESS_DATE;
}

export function readHappinessMessageContext({ search = '', getStorage = () => undefined } = {}) {
  const source = new URLSearchParams(search).get('source');
  if (source !== HAPPINESS_MEOW_SOURCE) return { active: false, message: '', dateLabel: '', nickname: '' };

  let storedContext = {};
  try {
    const raw = getStorage()?.getItem(HAPPINESS_CONTEXT_STORAGE_KEY) ?? '';
    storedContext = raw ? JSON.parse(raw) : {};
  } catch {
    // Some browsers reject both sessionStorage access and reads.
  }
  return {
    active: true,
    message: normalizeHappinessMessage(storedContext?.message),
    dateLabel: formatHappinessDate(storedContext?.createdAt),
    nickname: typeof storedContext?.nickname === 'string' ? storedContext.nickname.trim().slice(0, 30) : '',
  };
}
