/**
 * 音频裁剪相关的前端工具。
 *
 * 设计取舍：
 * - 上传时保留原始音频文件，不转码、不重编码 → 不损音质、上传快。
 * - “裁剪”以 [clipStart, clipEnd] 区间保存，播放时只播放这一段。
 * - 需要真正剪下来时，用 OfflineAudioContext 精确截取并编码成 WAV 下载。
 */

import { dbToGain, DEFAULT_RECORDING_GAIN, resolveGainSegments, type RecordingGain } from './audioGain.ts';
import type { AudioCut } from './songRecordings.ts';

let sharedContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!sharedContext || sharedContext.state === 'closed') {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedContext = new Ctor();
  }
  return sharedContext;
};

export const decodeAudioBlob = async (blob: Blob): Promise<AudioBuffer> => {
  const context = getAudioContext();
  // decodeAudioData 会转移（detach）传入的 ArrayBuffer，这里传副本避免原数据失效。
  const arrayBuffer = await blob.arrayBuffer();
  return await context.decodeAudioData(arrayBuffer.slice(0));
};

export type ReadSamplePeak = (start: number, end: number) => number;

const frameAt = (seconds: number, sampleRate: number, length: number) => (
  seconds >= length / sampleRate ? length : Math.max(0, Math.floor(seconds * sampleRate))
);

/** Cache complete blocks. Scan partial blocks so a peak outside a selection cannot affect it. */
export const createSamplePeakReader = (buffer: AudioBuffer): ReadSamplePeak => {
  const { length, sampleRate, numberOfChannels } = buffer;
  const channels = Array.from({ length: numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const blockSize = 128;
  const blocks = new Float32Array(Math.ceil(length / blockSize));
  const scan = (start: number, end: number) => {
    let max = 0;
    for (const channel of channels) {
      for (let frame = start; frame < end; frame += 1) {
        const amplitude = Math.abs(channel[frame]);
        if (amplitude > max) max = amplitude;
      }
    }
    return max;
  };
  for (let block = 0; block < blocks.length; block += 1) {
    blocks[block] = scan(block * blockSize, Math.min(length, (block + 1) * blockSize));
  }
  return (start, end) => {
    // Use the same inclusive start and exclusive end as the WAV encoder.
    const from = frameAt(start, sampleRate, length);
    const to = frameAt(end, sampleRate, length);
    if (from >= to) return 0;
    const firstBlock = Math.ceil(from / blockSize);
    const lastBlock = Math.floor(to / blockSize);
    if (firstBlock >= lastBlock) return scan(from, to);
    let peak = Math.max(scan(from, firstBlock * blockSize), scan(lastBlock * blockSize, to));
    for (let block = firstBlock; block < lastBlock; block += 1) {
      if (blocks[block] > peak) peak = blocks[block];
    }
    return peak;
  };
};

export const measureSamplePeak = (readPeak: ReadSamplePeak, segments: AudioCut[], gain: RecordingGain) => {
  let peak = 0;
  for (const segment of segments) {
    for (const { start, end, db } of resolveGainSegments(segment, gain.ranges)) {
      peak = Math.max(peak, readPeak(start, end) * dbToGain(gain.overallDb + db));
    }
  }
  return peak;
};

/** Largest 0.1 dB adjustment that keeps a non-silent sample peak strictly below full scale. */
export const sampleHeadroomDb = (peak: number): number => {
  if (peak === 0) return Infinity;
  const steps = Math.floor(-20 * Math.log10(peak) * 10);
  return (peak * dbToGain(steps / 10) >= 1 ? steps - 1 : steps) / 10;
};

export const formatDuration = (seconds: number, withTenths = false): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return withTenths ? '0:00.0' : '0:00';
  const total = withTenths ? Math.round(seconds * 10) / 10 : Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = withTenths ? (total - minutes * 60).toFixed(1) : String(Math.floor(total % 60)).padStart(2, '0');
  return `${minutes}:${withTenths ? rest.padStart(4, '0') : rest}`;
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** 把若干保留区间按顺序拼接，编码为 16bit PCM WAV。 */
export const encodeAudioClipToWav = (
  buffer: AudioBuffer, segments: Array<{ start: number; end: number }>, gain: RecordingGain = DEFAULT_RECORDING_GAIN,
): Blob => {
  const sampleRate = buffer.sampleRate;
  const channels = Math.min(2, buffer.numberOfChannels);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const ranges = segments
    .flatMap((segment) => resolveGainSegments(segment, gain.ranges))
    .map((segment) => ({
      from: frameAt(segment.start, sampleRate, buffer.length),
      to: frameAt(segment.end, sampleRate, buffer.length),
      multiplier: dbToGain(gain.overallDb + segment.db),
    }))
    .filter((range) => range.to > range.from);
  const frameCount = ranges.reduce((sum, range) => sum + (range.to - range.from), 0);
  const dataSize = frameCount * blockAlign;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  let offset = 44;
  for (const range of ranges) {
    for (let sourceIndex = range.from; sourceIndex < range.to; sourceIndex += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, (channelData[channel][sourceIndex] ?? 0) * range.multiplier));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
  }

  return new Blob([output], { type: 'audio/wav' });
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
