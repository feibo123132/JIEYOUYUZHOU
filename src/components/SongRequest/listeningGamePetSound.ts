export const petSoundFiles = {
  duck: ['Ya1.mp3', 'Ya2.mp3'],
  pop: ['D1.mp3', 'D2.mp3'],
} as const;

type SoundFile = (typeof petSoundFiles)[keyof typeof petSoundFiles][number];
type SoundClip = string | { url: string };
type SoundPair = [press: SoundClip, release: SoundClip];
type SoundPreset = keyof typeof petSoundFiles | 'muted';
type SoundBuffers = [press: AudioBuffer, release: AudioBuffer];
export type PetSoundSettings = {
  preset: SoundPreset;
  files: Partial<Record<SoundFile, string>>;
};

const storageKey = 'listening-game-pet-sound';
const soundFileNames = Object.values(petSoundFiles).flat();
const maxFileBytes = 128 * 1024;
const releaseLeadSeconds = 0.04;
const volume = 0.9;

export const guestDuckSoundPair: SoundPair = [
  { url: `./dsh-pet-7340/sound/${petSoundFiles.duck[0]}` },
  { url: `./dsh-pet-7340/sound/${petSoundFiles.duck[1]}` },
];

export function readPetSoundSettings(): PetSoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved && ['duck', 'pop', 'muted'].includes(saved.preset)) {
      return { preset: saved.preset, files: saved.files ?? {} };
    }
  } catch {
    // A browser may block local storage.
  }
  return { preset: 'duck', files: {} };
}

export function savePetSoundSettings(settings: PetSoundSettings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

export function getPetSoundPair({ preset, files }: PetSoundSettings): SoundPair | null {
  if (preset === 'muted') return null;
  const [pressFile, releaseFile] = petSoundFiles[preset];
  const press = files[pressFile];
  const release = files[releaseFile];
  return typeof press === 'string' && press && typeof release === 'string' && release
    ? [press, release]
    : null;
}

type Press = {
  pointerId: number;
  released: boolean;
  release?: AudioBuffer;
  pressEnd?: number;
};

export function createPetSound() {
  let audio: AudioContext | undefined;
  let output: GainNode | undefined;
  let active: Press | undefined;
  let cached: { files: SoundPair; buffers: Promise<SoundBuffers> } | undefined;

  function context() {
    if (!audio) {
      const Audio = globalThis.AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audio = new Audio();
    }
    return audio;
  }

  async function decode(file: SoundClip) {
    const ctx = context();
    if (typeof file === 'string') {
      const bytes = Uint8Array.from(atob(file), character => character.charCodeAt(0));
      return ctx.decodeAudioData(bytes.buffer);
    }
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`音效加载失败 (${response.status})`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  }

  function play(buffer: AudioBuffer, time: number) {
    const ctx = context();
    if (!output) {
      output = ctx.createGain();
      output.gain.value = volume;
      output.connect(ctx.destination);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(time);
  }

  function finishPress(press: Press) {
    if (!press.released || !press.release || press.pressEnd === undefined) return;
    play(press.release, Math.max(context().currentTime, press.pressEnd - releaseLeadSeconds));
    active = undefined;
  }

  return {
    async importFiles(files: File[]): Promise<PetSoundSettings['files']> {
      const clips = await Promise.all(files.map(async file => {
        const name = file.name as SoundFile;
        if (!soundFileNames.includes(name)) throw new Error('请选择 Ya1.mp3、Ya2.mp3、D1.mp3 或 D2.mp3。');
        if (file.size > maxFileBytes) throw new Error(`${name} 超过 128 KB。`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
        await decode(encoded).catch(() => {
          throw new Error(`无法读取 ${name}，请选择有效的音频文件。`);
        });
        return [name, encoded] as const;
      }));
      return Object.fromEntries(clips);
    },
    press(pointerId: number, files: SoundPair | null) {
      if (!files) return;
      let ctx: AudioContext;
      try {
        ctx = context();
      } catch {
        return;
      }
      const press: Press = { pointerId, released: false };
      active = press;
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      if (cached?.files[0] !== files[0] || cached?.files[1] !== files[1]) {
        cached = { files, buffers: Promise.all([decode(files[0]), decode(files[1])]) };
      }
      const clips = cached;
      void clips.buffers.then(([pressBuffer, releaseBuffer]) => {
        if (active !== press) return;
        const now = ctx.currentTime;
        play(pressBuffer, now);
        press.pressEnd = now + pressBuffer.duration;
        press.release = releaseBuffer;
        finishPress(press);
      }).catch(() => {
        if (active === press) active = undefined;
        if (cached === clips) cached = undefined;
      });
    },
    release(pointerId: number, completed: boolean) {
      if (active?.pointerId !== pointerId || active.released) return;
      if (!completed) {
        active = undefined;
        return;
      }
      if (audio && audio.state !== 'running') void audio.resume().catch(() => {});
      active.released = true;
      finishPress(active);
    },
    dispose() {
      active = undefined;
      cached = undefined;
      output = undefined;
      void audio?.close().catch(() => {});
      audio = undefined;
    },
  };
}
