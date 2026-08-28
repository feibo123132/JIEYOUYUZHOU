const ACTIONS = new Set([
  'votes:pull',
  'votes:increment',
  'roadshows:register',
  'roadshows:pull',
  'roadshows:save',
  'roadshows:delete',
  'songRecords:pull',
  'songRecords:publicRanking',
  'songRecords:save',
  'songRecords:saveBatch',
  'songRecords:delete',
]);

const cleanText = (value, max, error) => {
  if (typeof value !== 'string') throw new Error(error);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(error);
  return text;
};

const cleanOptionalText = (value, max, error) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(error);
  return value.trim();
};

const cleanIsoTime = (value, error) => {
  const text = cleanText(value, 40, error);
  if (!Number.isFinite(Date.parse(text))) throw new Error(error);
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

const validateSongRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SONG_RECORD');
  const base = {
    id: cleanText(value.id, 100, 'INVALID_SONG_RECORD'),
    songId: cleanText(value.songId, 100, 'INVALID_SONG_RECORD'),
    songTitle: cleanText(value.songTitle, 100, 'INVALID_SONG_RECORD'),
    songArtist: cleanOptionalText(value.songArtist, 100, 'INVALID_SONG_RECORD'),
    occurredAt: cleanIsoTime(value.occurredAt, 'INVALID_SONG_RECORD'),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
  if (value.kind === 'practice') {
    if (!Number.isInteger(value.matchScore) || value.matchScore < 70 || value.matchScore > 100) throw new Error('INVALID_SONG_RECORD');
    const feelings = cleanOptionalText(value.feelings, 2000, 'INVALID_SONG_RECORD');
    const problems = cleanOptionalText(value.problems, 2000, 'INVALID_SONG_RECORD');
    const improvements = cleanOptionalText(value.improvements, 2000, 'INVALID_SONG_RECORD');
    return { ...base, kind: 'practice', matchScore: value.matchScore, feelings, problems, improvements };
  }
  if (value.kind === 'roadshow') {
    return {
      ...base,
      kind: 'roadshow',
      audienceName: cleanOptionalText(value.audienceName, 100, 'INVALID_SONG_RECORD'),
      feedback: cleanText(value.feedback, 4000, 'INVALID_SONG_RECORD'),
    };
  }
  throw new Error('INVALID_SONG_RECORD');
};

function validateRequest(event) {
  if (!event || typeof event !== 'object' || !ACTIONS.has(event.action)) throw new Error('INVALID_ACTION');
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 256 * 1024) throw new Error('PAYLOAD_TOO_LARGE');

  if (event.action === 'votes:pull' || event.action === 'songRecords:publicRanking') return { action: event.action };
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
  if (event.action === 'songRecords:save') return { ...base, record: validateSongRecord(event.record) };
  if (event.action === 'songRecords:saveBatch') {
    if (!Array.isArray(event.records) || event.records.length < 1 || event.records.length > 50) throw new Error('INVALID_SONG_RECORD');
    const records = event.records.map(validateSongRecord);
    if (records.some((record) => record.kind !== 'practice') || new Set(records.map((record) => record.id)).size !== records.length) throw new Error('INVALID_SONG_RECORD');
    return { ...base, records };
  }
  if (event.action === 'songRecords:delete') return { ...base, id: cleanText(event.id, 100, 'INVALID_SONG_RECORD') };
  return base;
}

module.exports = { validateRequest };
