export const AUDIO_MARKER_COLORS = [
  { label: '天蓝', value: '#7dd3fc' },
  { label: '琥珀', value: '#fcd34d' },
  { label: '玫瑰', value: '#fda4af' },
  { label: '薄荷', value: '#6ee7b7' },
  { label: '淡紫', value: '#c4b5fd' },
] as const;

/** 区间标记的最短长度：太短的「片段」画不出虚线框，也会和点标记撞在一起。 */
export const MIN_AUDIO_MARKER_SPAN = 0.05;

/**
 * 音频标记。`time` 既是起点也是身份（同一时刻只能有一条）。
 * 不带 `end` 的是点标记（波形上的 M 旗标）；带 `end` 的是区间标记（给某个局部片段写的评论）。
 */
export interface AudioMarker {
  time: number;
  /** 区间终点（秒）。缺省表示点标记。 */
  end?: number;
  topic?: string;
  note: string;
  color: typeof AUDIO_MARKER_COLORS[number]['value'];
}

export const DEFAULT_AUDIO_MARKER_COLOR = AUDIO_MARKER_COLORS[0].value;

/** 标记覆盖的终点：点标记就是自身位置。 */
export const audioMarkerEnd = (marker: Pick<AudioMarker, 'time' | 'end'>) => marker.end ?? marker.time;
export const isAudioMarkerSpan = (marker: Pick<AudioMarker, 'time' | 'end'>) => (
  typeof marker.end === 'number' && marker.end - marker.time >= MIN_AUDIO_MARKER_SPAN
);

export const normalizeAudioMarkers = (entries: unknown, duration: number): AudioMarker[] => {
  if (!Array.isArray(entries)) return [];

  const markers = new Map<number, AudioMarker>();
  for (const entry of entries) {
    const details = entry && typeof entry === 'object' ? entry : null;
    const time = typeof entry === 'number' ? entry : details?.time;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > duration || markers.has(time)) continue;
    // 区间终点越界或颠倒就当没写：退化成点标记，至少评论内容不丢。
    const rawEnd = details?.end;
    const end = typeof rawEnd === 'number' && Number.isFinite(rawEnd)
      && rawEnd - time >= MIN_AUDIO_MARKER_SPAN && rawEnd <= duration ? rawEnd : undefined;
    markers.set(time, {
      time,
      ...(end === undefined ? {} : { end }),
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
