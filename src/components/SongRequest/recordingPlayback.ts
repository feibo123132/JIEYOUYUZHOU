import { createSamplePeakReader } from './audioClipping.ts';
import { dbToGain, DEFAULT_RECORDING_GAIN, resolveGainSegments, type RecordingGain } from './audioGain.ts';
import type { AudioCut } from './songRecordings.ts';

export interface RecordingWaveform {
  id: string;
  duration: number;
  peaks: Float32Array | null;
  unavailable?: boolean;
}

export const playbackDuration = (parts: AudioCut[]) => parts.reduce((duration, part) => duration + (part.end - part.start), 0);

/** Drop the elapsed part of a joined recording, leaving source offsets for playback. */
export const slicePlayback = (parts: AudioCut[], position: number): AudioCut[] => {
  let remaining = Math.max(0, position);
  return parts.flatMap(part => {
    const duration = part.end - part.start;
    const offset = remaining;
    remaining = Math.max(0, remaining - duration);
    return offset < duration - 1e-8 ? [{ start: part.start + offset, end: part.end }] : [];
  });
};

export const joinedPosition = (parts: AudioCut[], sourceTime: number): number => (
  parts.reduce((position, part) => position + Math.max(0, Math.min(sourceTime, part.end) - part.start), 0)
);

/**
 * 媒体元素播放时校正播放头：落在保留段内就继续放，
 * 落在被删掉的段落里就跳到下一段，越过最后一段就算播完。
 * （<audio> 只能顺序播原文件，删除段得靠这个逐帧纠回来。）
 */
export type PlaybackProbe =
  | { kind: 'ok' }
  | { kind: 'seek'; at: number }
  | { kind: 'end' };

export const probePlayback = (parts: AudioCut[], sourceTime: number): PlaybackProbe => {
  if (parts.some((part) => sourceTime >= part.start && sourceTime < part.end)) return { kind: 'ok' };
  const next = parts.find((part) => part.start > sourceTime);
  return next ? { kind: 'seek', at: next.start } : { kind: 'end' };
};

export const buildPlaybackPeaks = (buffer: AudioBuffer, parts: AudioCut[], gain: RecordingGain = DEFAULT_RECORDING_GAIN) => {
  const readPeak = createSamplePeakReader(buffer);
  const peaks = new Float32Array(1600);
  const duration = playbackDuration(parts);
  if (!duration) return peaks;
  const secondsPerBucket = duration / peaks.length;
  let offset = 0;
  for (const part of parts) {
    for (const span of resolveGainSegments(part, gain.ranges)) {
      const displayStart = offset + (span.start - part.start);
      const displayEnd = offset + (span.end - part.start);
      const multiplier = dbToGain(gain.overallDb + span.db);
      const first = Math.floor(displayStart / secondsPerBucket);
      const last = Math.min(peaks.length, Math.ceil(displayEnd / secondsPerBucket));
      for (let index = first; index < last; index += 1) {
        const from = Math.max(0, index * secondsPerBucket - displayStart);
        const to = Math.min(span.end - span.start, (index + 1) * secondsPerBucket - displayStart);
        const amplitude = readPeak(span.start + from, Math.min(span.end, span.start + to)) * multiplier;
        peaks[index] = Math.max(peaks[index], amplitude);
      }
    }
    offset += part.end - part.start;
  }
  return peaks;
};
