import type { AudioCut } from './songRecordings.ts';

export interface GainRange extends AudioCut {
  db: number;
}

export interface RecordingGain {
  overallDb: number;
  ranges: GainRange[];
}

export const MIN_GAIN_DB = -60;
export const MAX_GAIN_DB = 24;
export const MAX_GAIN_RANGES = 100;
export const DEFAULT_RECORDING_GAIN: RecordingGain = { overallDb: 0, ranges: [] };

export const clampGainDb = (db: number) => Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, db));
export const dbToGain = (db: number) => 10 ** (db / 20);
export const hasRecordingGain = (gain?: RecordingGain) => Boolean(gain && (gain.overallDb || gain.ranges.length));

export const sameRecordingGain = (left: RecordingGain, right?: RecordingGain) => (
  right !== undefined && left.overallDb === right.overallDb && left.ranges.length === right.ranges.length
  && left.ranges.every(({ start, end, db }, index) => {
    const other = right.ranges[index];
    return start === other.start && end === other.end && db === other.db;
  })
);

export const resolveGainSegments = (segment: AudioCut, ranges: GainRange[]): GainRange[] => {
  const result: GainRange[] = [];
  let cursor = segment.start;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start >= segment.end) break;
    const start = Math.max(cursor, range.start);
    const end = Math.min(segment.end, range.end);
    if (start > cursor) result.push({ start: cursor, end: start, db: 0 });
    result.push({ start, end, db: range.db });
    cursor = end;
  }
  if (cursor < segment.end) result.push({ start: cursor, end: segment.end, db: 0 });
  return result;
};

/** Apply a relative change to every span in the selection, leaving both outside edges intact. */
export const adjustGainRange = (
  ranges: GainRange[], selection: AudioCut, adjustment: number | 'reset',
): GainRange[] | null => {
  if (selection.end <= selection.start || adjustment === 0) return ranges;
  const changed = adjustment === 'reset' ? [] : resolveGainSegments(selection, ranges).map(part => ({
    ...part,
    db: Number((part.db + adjustment).toFixed(10)),
  }));
  if (changed.some(({ db }) => db < MIN_GAIN_DB || db > MAX_GAIN_DB)) return null;

  const next = changed.filter(({ db }) => db !== 0);
  for (const range of ranges) {
    if (range.end <= selection.start || range.start >= selection.end) next.push(range);
    else {
      if (range.start < selection.start) next.push({ ...range, end: selection.start });
      if (range.end > selection.end) next.push({ ...range, start: selection.end });
    }
  }
  // Keep adjacent selections individually addressable even if their gains match.
  return next.sort((left, right) => left.start - right.start);
};

/** Schedule gain on the joined playback timeline, skipping the same deleted intervals as playback. */
export const scheduleAudioGain = (param: AudioParam, segments: AudioCut[], gain: RecordingGain, startedAt: number) => {
  let cursor = startedAt;
  for (const segment of segments) {
    for (const part of resolveGainSegments(segment, gain.ranges)) {
      param.setValueAtTime(dbToGain(gain.overallDb + part.db), cursor + (part.start - segment.start));
    }
    cursor += segment.end - segment.start;
  }
};

export const isRecordingGain = (value: unknown, duration: number): value is RecordingGain => {
  if (!value || typeof value !== 'object') return false;
  const { overallDb, ranges } = value as Partial<RecordingGain>;
  const validDb = (db: unknown) => typeof db === 'number' && Number.isFinite(db) && db >= MIN_GAIN_DB && db <= MAX_GAIN_DB;
  if (!validDb(overallDb) || !Array.isArray(ranges) || ranges.length > MAX_GAIN_RANGES) return false;
  let previousEnd = 0;
  for (const range of ranges) {
    if (!range || !validDb(range.db) || range.db === 0 || !Number.isFinite(range.start)
      || !Number.isFinite(range.end) || range.start < previousEnd || range.end <= range.start || range.end > duration) return false;
    previousEnd = range.end;
  }
  return true;
};
