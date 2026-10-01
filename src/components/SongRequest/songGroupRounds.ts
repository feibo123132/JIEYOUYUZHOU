import type { RoadshowRecord, SongGroupRound } from './roadshow';

export const nextSongGroupRoundNumber = (record: Pick<RoadshowRecord, 'funGroupRounds'>): number =>
  Math.max(0, ...(record.funGroupRounds ?? []).map(item => item.round)) + 1;

export const upsertSongGroupRound = (record: RoadshowRecord, round: SongGroupRound): RoadshowRecord => {
  const existing = record.funGroupRounds ?? [];
  const index = existing.findIndex(item => item.id === round.id);
  const updated = [...existing];
  if (index < 0) updated.push(round); else updated[index] = round;
  return { ...record, funGroupRounds: updated.sort((left, right) => left.round - right.round) };
};

export const removeSongGroupRound = (record: RoadshowRecord, roundId: string): RoadshowRecord => ({
  ...record,
  funGroupRounds: (record.funGroupRounds ?? []).filter(item => item.id !== roundId),
});

export const countCompletedSongGroupRounds = (records: Pick<RoadshowRecord, 'funGroupRounds'>[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const round of record.funGroupRounds ?? []) {
      if (!round.sungAt) continue;
      for (const songId of round.songIds) counts[songId] = (counts[songId] ?? 0) + 1;
    }
  }
  return counts;
};
