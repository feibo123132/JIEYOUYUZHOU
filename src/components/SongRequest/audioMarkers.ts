export const AUDIO_MARKER_COLORS = [
  { label: '天蓝', value: '#7dd3fc' },
  { label: '琥珀', value: '#fcd34d' },
  { label: '玫瑰', value: '#fda4af' },
  { label: '薄荷', value: '#6ee7b7' },
  { label: '淡紫', value: '#c4b5fd' },
] as const;

export interface AudioMarker {
  time: number;
  topic?: string;
  note: string;
  color: typeof AUDIO_MARKER_COLORS[number]['value'];
}

export const DEFAULT_AUDIO_MARKER_COLOR = AUDIO_MARKER_COLORS[0].value;

export const normalizeAudioMarkers = (entries: unknown, duration: number): AudioMarker[] => {
  if (!Array.isArray(entries)) return [];

  const markers = new Map<number, AudioMarker>();
  for (const entry of entries) {
    const details = entry && typeof entry === 'object' ? entry : null;
    const time = typeof entry === 'number' ? entry : details?.time;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > duration || markers.has(time)) continue;
    markers.set(time, {
      time,
      ...(typeof details?.topic === 'string' ? { topic: details.topic } : {}),
      note: typeof details?.note === 'string' ? details.note : '',
      color: AUDIO_MARKER_COLORS.find(option => option.value === details?.color)?.value ?? DEFAULT_AUDIO_MARKER_COLOR,
    });
  }
  return [...markers.values()].sort((left, right) => left.time - right.time);
};

export const parseAudioMarkers = (raw: string, duration: number): AudioMarker[] => {
  try { return normalizeAudioMarkers(JSON.parse(raw), duration); } catch { return []; }
};

export const loadLegacyAudioMarkers = (
  storage: Pick<Storage, 'getItem'>, alias: string, recordingId: string, duration: number,
): AudioMarker[] => {
  const key = `jieyou-recording-markers-v1:${encodeURIComponent(alias.trim().toLowerCase())}:${recordingId}`;
  try { return parseAudioMarkers(storage.getItem(key) ?? '[]', duration); } catch { return []; }
};
