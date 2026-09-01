import type { Song } from './songCatalog';

export const QUIZ_LEVELS = [
  { id: 'warmup', label: '简单', shortLabel: '简单', symbol: 'Ⅰ' },
  { id: 'standard', label: '常规', shortLabel: '常规', symbol: 'Ⅱ' },
  { id: 'hard', label: '较难', shortLabel: '较难', symbol: 'Ⅲ' },
  { id: 'hell', label: '很难', shortLabel: '很难', symbol: 'Ⅳ' },
] as const;

export type QuizLevel = typeof QUIZ_LEVELS[number]['id'];
export type QuizAssignments = Record<string, QuizLevel>;

export const QUIZ_ROADSHOW_QUOTAS: Record<QuizLevel, number> = {
  warmup: 6,
  standard: 10,
  hard: 10,
  hell: 4,
};

export type QuizRoadshowSelection =
  | { kind: 'selected'; songs: Song[] }
  | { kind: 'insufficient'; shortages: { level: QuizLevel; required: number; available: number }[] };

const QUIZ_LEVEL_IDS = new Set<string>(QUIZ_LEVELS.map((level) => level.id));

export const parseQuizAssignments = (value: unknown): QuizAssignments | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 500 || entries.some(([songId, level]) => (
    !songId.trim() || songId.length > 100 || !QUIZ_LEVEL_IDS.has(String(level))
  ))) return null;
  return Object.fromEntries(entries) as QuizAssignments;
};

export const setQuizLevel = (
  assignments: QuizAssignments,
  songId: string,
  level: QuizLevel,
): QuizAssignments => {
  const next = { ...assignments };
  if (next[songId] === level) delete next[songId];
  else next[songId] = level;
  return next;
};

export const groupQuizSongs = (songs: Song[], assignments: QuizAssignments) => {
  const groups = Object.fromEntries(QUIZ_LEVELS.map((level) => [level.id, []])) as Record<QuizLevel, Song[]>;
  for (const song of songs) {
    const level = assignments[song.id];
    if (level) groups[level].push(song);
  }
  return groups;
};

export const countQuizSongs = (assignments: QuizAssignments) => {
  const counts = { total: Object.keys(assignments).length, warmup: 0, standard: 0, hard: 0, hell: 0 };
  for (const level of Object.values(assignments)) counts[level] += 1;
  return counts;
};

export const selectQuizSongsForRoadshow = (
  songs: Song[],
  assignments: QuizAssignments,
  usedSongIds: ReadonlySet<string>,
  random: () => number = Math.random,
): QuizRoadshowSelection => {
  const groups = groupQuizSongs(songs, assignments);
  const available = Object.fromEntries(QUIZ_LEVELS.map((level) => [
    level.id,
    groups[level.id].filter((song) => !usedSongIds.has(song.id)),
  ])) as Record<QuizLevel, Song[]>;
  const shortages = QUIZ_LEVELS.flatMap((level) => {
    const required = QUIZ_ROADSHOW_QUOTAS[level.id];
    const count = available[level.id].length;
    return count < required ? [{ level: level.id, required, available: count }] : [];
  });
  if (shortages.length) return { kind: 'insufficient', shortages };

  const selected = QUIZ_LEVELS.flatMap((level) => {
    const pool = [...available[level.id]];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool.slice(0, QUIZ_ROADSHOW_QUOTAS[level.id]);
  });
  return { kind: 'selected', songs: selected };
};
