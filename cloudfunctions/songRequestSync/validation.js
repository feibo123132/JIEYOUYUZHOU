const ACTIONS = new Set([
  'votes:pull',
  'votes:increment',
  'votes:finishAll',
  'roadshows:register',
  'roadshows:pull',
  'roadshows:save',
  'roadshows:delete',
  'roadshows:publicQuizRanking',
  'songRecords:pull',
  'songRecords:publicRanking',
  'songRecords:save',
  'songRecords:saveBatch',
  'songRecords:delete',
  'songScores:pull',
  'songScores:save',
  'songScores:delete',
  'artistSettings:pull',
  'artistSettings:push',
  'featuredSongs:pull',
  'featuredSongs:set',
  'quizLibrary:pull',
  'quizLibrary:set',
]);

const ARTIST_SETTINGS_REQUEST_LIMIT = 5 * 1024 * 1024;
const DEFAULT_REQUEST_LIMIT = 256 * 1024;
const ARTIST_AVATAR_LIMIT = 1024 * 1024;
const SONG_SCORES_REQUEST_LIMIT = 5 * 1024 * 1024;
const SONG_SCORE_PAGE_LIMIT = 4;
const SONG_SCORE_PAGES_TOTAL_LIMIT = 4600000;
const ROADSHOW_LOCATIONS = new Set(['医大（武鸣）', '医大（本部）', '南湖']);

const optionalRankingLocation = (value) => {
  if (value === undefined) return {};
  if (!ROADSHOW_LOCATIONS.has(value)) throw new Error('INVALID_LOCATION');
  return { location: value };
};

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

const validateRecognitionAttempt = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECORD');
  const attempt = {
    id: cleanText(value.id, 100, 'INVALID_RECORD'),
    title: cleanText(value.title, 100, 'INVALID_RECORD'),
    artist: typeof value.artist === 'string' ? value.artist.trim().slice(0, 100) : '',
    correct: value.correct,
    answeredAt: cleanIsoTime(value.answeredAt, 'INVALID_RECORD'),
  };
  if (typeof value.correct !== 'boolean') throw new Error('INVALID_RECORD');
  if (value.catalogId !== undefined) attempt.catalogId = cleanText(value.catalogId, 80, 'INVALID_RECORD');
  if (value.participantName !== undefined) attempt.participantName = cleanText(value.participantName, 24, 'INVALID_RECORD');
  return attempt;
};

const validateRecognitionAttempts = (value) => {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('INVALID_RECORD');
  const attempts = value.map(validateRecognitionAttempt);
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) throw new Error('INVALID_RECORD');
  return attempts;
};

const validateRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECORD');
  const date = cleanText(value.date, 10, 'INVALID_RECORD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_RECORD');
  const optionalFields = {};
  if (value.location !== undefined) optionalFields.location = cleanOptionalText(value.location, 80, 'INVALID_RECORD');
  if (value.weather !== undefined) optionalFields.weather = cleanOptionalText(value.weather, 40, 'INVALID_RECORD');
  if (value.recognitionAttempts !== undefined) optionalFields.recognitionAttempts = validateRecognitionAttempts(value.recognitionAttempts);
  return {
    id: cleanText(value.id, 80, 'INVALID_RECORD'),
    title: cleanText(value.title, 60, 'INVALID_RECORD'),
    date,
    ...optionalFields,
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

const validateArtistName = (value) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100 || value.trim() !== value) throw new Error('INVALID_ARTIST_SETTINGS');
  return value;
};

const validImageMagic = (mime, bytes) => {
  if (mime === 'png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
};

const validateArtistAvatar = (value) => {
  if (typeof value !== 'string') throw new Error('INVALID_ARTIST_SETTINGS');
  const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('INVALID_ARTIST_SETTINGS');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > ARTIST_AVATAR_LIMIT || !validImageMagic(match[1], bytes)) throw new Error('INVALID_ARTIST_SETTINGS');
  return value;
};

const validateAdjustment = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['x', 'y', 'scale', 'rotation'].includes(key))) throw new Error('INVALID_ARTIST_SETTINGS');
  const inRange = (entry, min, max) => typeof entry === 'number' && Number.isFinite(entry) && entry >= min && entry <= max;
  if (!inRange(value.x, 0, 100) || !inRange(value.y, 0, 100)
    || !inRange(value.scale, 1, 4) || !inRange(value.rotation, -30, 30)) throw new Error('INVALID_ARTIST_SETTINGS');
  return { x: value.x, y: value.y, scale: value.scale, rotation: value.rotation };
};

const validateArtistSettings = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['version', 'artistOrder', 'songOrder', 'customAvatars', 'avatarAdjustments', 'revision', 'updatedAt'].includes(key))
    || value.version !== 1 || !Array.isArray(value.artistOrder)
    || value.artistOrder.length < 1 || value.artistOrder.length > 200) throw new Error('INVALID_ARTIST_SETTINGS');
  const artistOrder = value.artistOrder.map(validateArtistName);
  const songOrder = value.songOrder === undefined ? [] : value.songOrder;
  if (new Set(artistOrder).size !== artistOrder.length
    || !Array.isArray(songOrder) || songOrder.length > 2000
    || !value.customAvatars || typeof value.customAvatars !== 'object' || Array.isArray(value.customAvatars)
    || !value.avatarAdjustments || typeof value.avatarAdjustments !== 'object' || Array.isArray(value.avatarAdjustments)) throw new Error('INVALID_ARTIST_SETTINGS');
  const cleanSongOrder = songOrder.map((songId) => cleanText(songId, 120, 'INVALID_ARTIST_SETTINGS'));
  if (new Set(cleanSongOrder).size !== cleanSongOrder.length) throw new Error('INVALID_ARTIST_SETTINGS');
  const artistSet = new Set(artistOrder);
  const avatarEntries = Object.entries(value.customAvatars);
  const adjustmentEntries = Object.entries(value.avatarAdjustments);
  if (avatarEntries.length > 100 || adjustmentEntries.length > 200
    || avatarEntries.some(([artist]) => !artistSet.has(artist))
    || adjustmentEntries.some(([artist]) => !artistSet.has(artist))) throw new Error('INVALID_ARTIST_SETTINGS');
  return {
    version: 1,
    artistOrder,
    songOrder: cleanSongOrder,
    customAvatars: Object.fromEntries(avatarEntries.map(([artist, avatar]) => [artist, validateArtistAvatar(avatar)])),
    avatarAdjustments: Object.fromEntries(adjustmentEntries.map(([artist, adjustment]) => [artist, validateAdjustment(adjustment)])),
  };
};

const validateSongScore = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SONG_SCORE');
  const score = {
    id: cleanText(value.id, 120, 'INVALID_SONG_SCORE'),
    songId: cleanText(value.songId, 100, 'INVALID_SONG_SCORE'),
    songTitle: cleanText(value.songTitle, 100, 'INVALID_SONG_SCORE'),
    songArtist: cleanOptionalText(value.songArtist, 100, 'INVALID_SONG_SCORE'),
    pages: value.pages,
  };
  if (!Array.isArray(score.pages) || score.pages.length < 1 || score.pages.length > SONG_SCORE_PAGE_LIMIT) throw new Error('INVALID_SONG_SCORE');
  for (const page of score.pages) {
    if (typeof page !== 'string' || page.length === 0) throw new Error('INVALID_SONG_SCORE');
    if (/^https:\/\//i.test(page)) {
      if (page.length > 600) throw new Error('INVALID_SONG_SCORE');
      continue;
    }
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(page);
    if (!match) throw new Error('INVALID_SONG_SCORE');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || !validImageMagic(match[1], bytes)) throw new Error('INVALID_SONG_SCORE');
  }
  if (score.pages.join('').length > SONG_SCORE_PAGES_TOTAL_LIMIT) throw new Error('PAYLOAD_TOO_LARGE');
  return score;
};

function validateRequest(event) {
  if (!event || typeof event !== 'object' || !ACTIONS.has(event.action)) throw new Error('INVALID_ACTION');
  const requestLimit = event.action === 'artistSettings:push' ? ARTIST_SETTINGS_REQUEST_LIMIT
    : event.action === 'songScores:save' ? SONG_SCORES_REQUEST_LIMIT
    : DEFAULT_REQUEST_LIMIT;
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > requestLimit) throw new Error('PAYLOAD_TOO_LARGE');

  if (event.action === 'votes:pull' || event.action === 'roadshows:publicQuizRanking') {
    return { action: event.action, ...optionalRankingLocation(event.location) };
  }
  if (event.action === 'songRecords:publicRanking'
    || event.action === 'artistSettings:pull' || event.action === 'featuredSongs:pull'
    || event.action === 'quizLibrary:pull') return { action: event.action };
  if (event.action === 'votes:increment') {
    const songId = cleanText(event.songId, 80, 'INVALID_SONG_ID');
    if (!/^[a-z0-9-]+$/i.test(songId)) throw new Error('INVALID_SONG_ID');
    return { action: event.action, songId };
  }

  const alias = cleanText(event.alias, 30, 'INVALID_ALIAS');
  if (typeof event.password !== 'string' || event.password.length < 6 || event.password.length > 64) throw new Error('INVALID_PASSWORD');
  const base = { action: event.action, alias, password: event.password };
  if (event.action === 'featuredSongs:set') {
    if (!Array.isArray(event.songIds) || event.songIds.length > 500) throw new Error('INVALID_FEATURED_SONGS');
    const songIds = event.songIds.map((songId) => cleanText(songId, 100, 'INVALID_FEATURED_SONGS'));
    return { ...base, songIds: [...new Set(songIds)] };
  }
  if (event.action === 'quizLibrary:set') {
    if (!event.assignments || typeof event.assignments !== 'object' || Array.isArray(event.assignments)) throw new Error('INVALID_QUIZ_LIBRARY');
    const entries = Object.entries(event.assignments);
    if (entries.length > 500) throw new Error('INVALID_QUIZ_LIBRARY');
    const levels = new Set(['warmup', 'standard', 'hard', 'hell']);
    const assignments = {};
    for (const [rawSongId, level] of entries) {
      const songId = cleanText(rawSongId, 100, 'INVALID_QUIZ_LIBRARY');
      if (!levels.has(level)) throw new Error('INVALID_QUIZ_LIBRARY');
      assignments[songId] = level;
    }
    return { ...base, assignments };
  }
  if (event.action === 'artistSettings:push') {
    const expectedRevision = event.expectedRevision;
    if (!(expectedRevision === null || (Number.isInteger(expectedRevision) && expectedRevision >= 1))) throw new Error('INVALID_ARTIST_SETTINGS');
    return { ...base, expectedRevision, snapshot: validateArtistSettings(event.snapshot) };
  }
  if (event.action === 'roadshows:save') return { ...base, record: validateRecord(event.record) };
  if (event.action === 'roadshows:delete') return { ...base, id: cleanText(event.id, 80, 'INVALID_RECORD') };
  if (event.action === 'songRecords:save') return { ...base, record: validateSongRecord(event.record) };
  if (event.action === 'songRecords:saveBatch') {
    if (!Array.isArray(event.records) || event.records.length < 1 || event.records.length > 50) throw new Error('INVALID_SONG_RECORD');
    const records = event.records.map(validateSongRecord);
    if (records.some((record) => record.kind !== 'practice') || new Set(records.map((record) => record.id)).size !== records.length) throw new Error('INVALID_SONG_RECORD');
    return { ...base, records };
  }
  if (event.action === 'songScores:save') return { ...base, score: validateSongScore(event.score) };
  if (event.action === 'songScores:delete') return { ...base, songId: cleanText(event.songId, 100, 'INVALID_SONG_SCORE') };
  if (event.action === 'songRecords:delete') return { ...base, id: cleanText(event.id, 100, 'INVALID_SONG_RECORD') };
  return base;
}

module.exports = { validateRequest };
