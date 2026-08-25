const ACTIONS = new Set([
  'votes:pull',
  'votes:increment',
  'roadshows:register',
  'roadshows:pull',
  'roadshows:save',
  'roadshows:delete',
]);

const cleanText = (value, max, error) => {
  if (typeof value !== 'string') throw new Error(error);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(error);
  return text;
};

const validateSong = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SONG');
  const source = value.source;
  if (!['catalog', 'manual'].includes(source)) throw new Error('INVALID_SONG');
  const song = {
    id: cleanText(value.id, 100, 'INVALID_SONG'),
    title: cleanText(value.title, 100, 'INVALID_SONG'),
    artist: typeof value.artist === 'string' ? value.artist.trim().slice(0, 100) : '',
    source,
  };
  if (source === 'catalog') song.catalogId = cleanText(value.catalogId, 80, 'INVALID_SONG');
  return song;
};

const validateSongList = (value) => {
  if (!Array.isArray(value) || value.length > 100) throw new Error('INVALID_SONG_LIST');
  return value.map(validateSong);
};

const validateRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECORD');
  const date = cleanText(value.date, 10, 'INVALID_RECORD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_RECORD');
  return {
    id: cleanText(value.id, 80, 'INVALID_RECORD'),
    title: cleanText(value.title, 60, 'INVALID_RECORD'),
    date,
    performanceSongs: validateSongList(value.performanceSongs),
    recognitionSongs: validateSongList(value.recognitionSongs),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
};

function validateRequest(event) {
  if (!event || typeof event !== 'object' || !ACTIONS.has(event.action)) throw new Error('INVALID_ACTION');
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 256 * 1024) throw new Error('PAYLOAD_TOO_LARGE');

  if (event.action === 'votes:pull') return { action: event.action };
  if (event.action === 'votes:increment') {
    const songId = cleanText(event.songId, 80, 'INVALID_SONG_ID');
    if (!/^[a-z0-9-]+$/i.test(songId)) throw new Error('INVALID_SONG_ID');
    return { action: event.action, songId };
  }

  const alias = cleanText(event.alias, 30, 'INVALID_ALIAS');
  if (typeof event.password !== 'string' || event.password.length < 6 || event.password.length > 64) throw new Error('INVALID_PASSWORD');
  const base = { action: event.action, alias, password: event.password };
  if (event.action === 'roadshows:save') return { ...base, record: validateRecord(event.record) };
  if (event.action === 'roadshows:delete') return { ...base, id: cleanText(event.id, 80, 'INVALID_RECORD') };
  return base;
}

module.exports = { validateRequest };
