import defaults from './defaults.json';

const storageKey = 'jieyou-listening-game-dsh-pet-v0.3.8';
const editableKeys = [
  'pets', 'notificationsEnabled', 'whisperImageEnabled', 'chatImageEnabled',
  'confineToScreen', 'physics', 'whisperModel', 'chatModel', 'chatMemoryRounds',
  'chatImageLimit', 'font',
] as const;

type Settings = Partial<Pick<typeof defaults, typeof editableKeys[number]>>;
type StateLeaf = { counter: number; data: unknown };
const sections: Record<string, StateLeaf> = {};
const petStates: Record<string, { say: StateLeaf }> = Object.create(null);
let counter = 0;

const guestConfig = {
  ...defaults,
  confineToScreen: true,
  font: { ...defaults.font, size: 16, followPet: false },
  pets: [{
    ...defaults.pets[0],
    name: '鲸鱼娘',
    size: 240,
    display: 'web',
    fixedEnabled: true,
    balanceEnabled: false,
    whisperEnabled: false,
    position: { corner: 'bottom-right', marginX: -42, marginY: 24 },
  }],
};

const cues = {
  waiting: { state: 'waiting', task: '等大家到齐就开场。' },
  listening: { state: 'thinking', task: '演奏开始啦，我也在认真听。' },
  open: { state: 'working', task: '可以提交答案啦！' },
  revealed: { state: 'success', task: '本轮结束，下一首见！' },
  ended: { state: 'success', task: '今天的猜歌到这里啦。' },
};
type GamePhase = keyof typeof cues;
let currentGame: { phase: GamePhase; roundId: string | null; submissions: number } | undefined;

export function updatePetGame(phase: GamePhase, roundId: string | null, submissions: number) {
  const sameRound = currentGame?.phase === phase && currentGame.roundId === roundId;
  if (sameRound && currentGame.submissions === submissions) return;
  const data = sameRound && submissions > currentGame.submissions
    ? { state: 'result', task: `已有 ${submissions} 人提交答案。` }
    : cues[phase];
  currentGame = { phase, roundId, submissions };
  sections.workStatus = { counter: ++counter, data };
}

function editableSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(editableKeys.filter(key => {
    const item = record[key];
    return item != null && typeof item === typeof defaults[key]
      && Array.isArray(item) === Array.isArray(defaults[key]);
  }).map(key => [key, record[key]]));
}

function loadSettings(): Settings {
  try {
    return editableSettings(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
  } catch {
    return {};
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
  return jsonResponse({ main: { ...defaults, ...settings } });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// The vendored client uses this fetch binding. The rest of the game uses its own transport.
export async function petFetch(input: string, init?: RequestInit): Promise<Response> {
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const base = new URL('./dsh-pet-7340/', document.baseURI);
  const url = new URL(input, document.baseURI);
  if (!url.href.startsWith(base.href)) return new Response(null, { status: 404 });
  const route = url.pathname.slice(base.pathname.length);
  const method = init?.method ?? 'GET';

  if (method === 'GET') {
    if (route === 'config') {
      return jsonResponse({ main: url.searchParams.has('guest') ? guestConfig : { ...defaults, ...loadSettings() } });
    }
    if (route === 'config/meta') {
      return jsonResponse({
        user: '当前浏览器',
        default: 'dsh-pet v0.3.8 内置配置',
        animations: './dsh-pet-7340/thumb/main/',
        memes: './dsh-pet-7340/pic/memes/main/',
        storage: [],
      });
    }
    if (route === 'models') return jsonResponse({ providers: [] });
    if (route === 'state') return jsonResponse({ sections, pets: petStates });
    if (route.startsWith('thumb/main/')) {
      // The upstream host also falls back to WebM when no MOV pack is present.
      url.pathname = url.pathname.replace(/\.mov$/, '.webm');
      return window.fetch(url, init);
    }
  }

  try {
    if (route === 'config' && method === 'PUT') {
      const next = editableSettings(JSON.parse(String(init?.body)));
      return saveSettings({ ...loadSettings(), ...next });
    }
    if (route === 'config' && method === 'POST') return saveSettings({});
    if (route === 'pet-display' && method === 'POST') {
      const { id, display } = JSON.parse(String(init?.body));
      const settings = loadSettings();
      const pets = settings.pets ?? defaults.pets;
      if (!['web', 'desktop', 'both', 'none'].includes(display) || !pets.some(pet => pet.id === id)) {
        return jsonResponse({ ok: false, reason: 'invalid-pet-display' }, 400);
      }
      return saveSettings({ ...settings, pets: pets.map(pet => pet.id === id ? { ...pet, display } : pet) });
    }
    if (route === 'whisper' && method === 'POST') {
      const settings = { ...defaults, ...loadSettings() };
      const id = url.searchParams.get('pet') ?? 'main';
      if (!settings.pets.some(pet => pet.id === id)) return new Response(null, { status: 404 });
      const phase = currentGame?.phase ?? 'waiting';
      const image = phase === 'revealed' ? '厉害了我的鲸' : '可爱';
      petStates[id] = {
        say: {
          counter: ++counter,
          data: { text: cues[phase].task, image: settings.whisperImageEnabled ? image : undefined },
        },
      };
      return jsonResponse({ ok: true });
    }
    if (route === 'balance' && method === 'POST') {
      sections.balance = {
        counter: ++counter,
        data: { ok: false, reason: 'unsupported', provider: 'DSH', manual: true },
      };
      return jsonResponse({ ok: true });
    }
    if (route === 'chat' && method === 'POST') {
      return jsonResponse({ ok: false, reason: 'provider-missing', message: '当前网页未接入对话模型。' });
    }
  } catch {
    return jsonResponse({ ok: false }, 500);
  }

  return new Response(null, { status: 404 });
}
