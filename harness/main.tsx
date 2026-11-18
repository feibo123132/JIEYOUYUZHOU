import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import AudioTrimDialog from '../src/components/SongRequest/AudioTrimDialog';
import type { AudioCut } from '../src/components/SongRequest/songRecordings';
import type { RecordingGain } from '../src/components/SongRequest/audioGain';

const sampleRate = 8000;
const duration = 6;
const buffer = new AudioBuffer({ length: sampleRate * duration, sampleRate, numberOfChannels: 1 });
const data = buffer.getChannelData(0);
for (let index = 0; index < data.length; index += 1) {
  data[index] = Math.sin(index / 6) * 0.28 * (0.45 + 0.55 * Math.sin(index / 2600));
}

declare global {
  interface Window {
    __saved?: { start: number; end: number; cuts: AudioCut[]; gain?: RecordingGain; markers?: unknown[] } | null;
    __saveCount?: number;
  }
}
window.__saved = null;
window.__saveCount = 0;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioTrimDialog
      recordingTitle="测试录音 · 片段评论"
      buffer={buffer}
      initialStart={0}
      initialEnd={duration}
      initialMarkers={[]}
      noteStorageKey="harness-note"
      minimized={false}
      onMinimize={() => {}}
      onCancel={() => {}}
      onSave={(clip) => {
        window.__saved = clip;
        window.__saveCount = (window.__saveCount ?? 0) + 1;
        return true;
      }}
    />
  </StrictMode>,
);
