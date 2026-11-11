const AUDIENCE_BATCH_SIZE = 20;

export const getAudienceSongBatch = <T>(songs: T[], start: number) => {
  if (songs.length <= AUDIENCE_BATCH_SIZE) return { items: songs, nextStart: 0 };
  const offset = start % songs.length;
  const items = songs.slice(offset, offset + AUDIENCE_BATCH_SIZE);
  return {
    items: items.concat(songs.slice(0, AUDIENCE_BATCH_SIZE - items.length)),
    nextStart: (offset + AUDIENCE_BATCH_SIZE) % songs.length,
  };
};
