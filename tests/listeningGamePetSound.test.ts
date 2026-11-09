import assert from 'node:assert/strict';
import test from 'node:test';
import { createPetSound, getPetSoundPair, guestDuckSoundPair } from '../src/components/SongRequest/listeningGamePetSound.ts';

test('桌宠按下和松开分别使用导入的两段音频，缺文件时不播放', async t => {
  const scheduled: { time: number; clip: number }[] = [];
  const gains: number[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: class {
      state = 'running';
      currentTime = 1;
      destination = {};

      async decodeAudioData(bytes: ArrayBuffer) {
        const clip = new Uint8Array(bytes)[0];
        return { duration: clip / 1000, clip };
      }

      createGain() {
        return { gain: { value: 0 }, connect() { gains.push(this.gain.value); } };
      }

      createBufferSource() {
        return {
          buffer: null as { clip: number } | null,
          connect() {},
          start(time: number) {
            scheduled.push({ time, clip: this.buffer!.clip });
          },
        };
      }

      async close() {}
    },
  });
  const pet = createPetSound();
  t.after(() => {
    pet.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'AudioContext', descriptor);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });

  const files = await pet.importFiles([
    new File([Uint8Array.of(240)], 'Ya1.mp3'),
    new File([Uint8Array.of(110)], 'Ya2.mp3'),
  ]);
  const pair = getPetSoundPair({ preset: 'duck', files });
  pet.press(1, pair);
  pet.release(1, true);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(scheduled, [
    { time: 1, clip: 240 },
    { time: 1.2, clip: 110 },
  ]);
  assert.deepEqual(gains, [0.9]);

  pet.press(2, pair);
  await new Promise<void>(resolve => setImmediate(resolve));
  pet.release(2, false);
  pet.press(3, getPetSoundPair({ preset: 'duck', files: { 'Ya1.mp3': files['Ya1.mp3'] } }));
  pet.release(3, true);
  pet.press(4, getPetSoundPair({ preset: 'muted', files }));
  pet.release(4, true);
  assert.equal(scheduled.length, 3);

  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    return new Response(Uint8Array.of(url.endsWith('/Ya1.mp3') ? 240 : 110));
  });
  pet.press(5, guestDuckSoundPair);
  pet.release(5, true);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ['./dsh-pet-7340/sound/Ya1.mp3', './dsh-pet-7340/sound/Ya2.mp3']);
  assert.deepEqual(scheduled.slice(3), [{ time: 1, clip: 240 }, { time: 1.2, clip: 110 }]);
});
