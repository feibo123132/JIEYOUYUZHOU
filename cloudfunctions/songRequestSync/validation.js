const { validateNotebookPages } = require('./feelingsNotebook');
const { validateSongGroups } = require('./songGroups');
const { validateEntries } = require('./enoughJournal');
const ACTIONS = new Set([
  'stars:verifyOwner',
  'stars:ownerPull', 'stars:ownerCreate', 'stars:ownerUpdate', 'stars:ownerDelete', 'stars:ownerRestore', 'stars:ownerPurge',
  'enough:pull', 'enough:save', 'inquiries:pull', 'inquiries:save',
  'invitations:create',
  'invitations:revoke',
  'songGroups:pull',
  'songGroups:save',
  'feelingsNotebook:pull',
  'feelingsNotebook:save',
  'votes:pull',
  'votes:increment',
  'votes:adjustSung',
  'votes:finishAll',
  'votes:clearPending',
  'votes:clearSung',
  'roadshowSings:pull',
  'roadshowSings:adjust',
  'roadshowSings:clear',
  'roadshowSings:migrateLegacy',
  'roadshowQuiz:pull',
  'roadshowQuiz:start',
  'roadshowQuiz:judge',
  'roadshowQuiz:undo',
  'roadshows:register',
  'roadshows:pull',
  'roadshows:save',
  'roadshows:delete',
  'roadshows:publicQuizRanking',
  'roadshows:clearQuizRanking',
  'songRecords:pull',
  'songRecords:publicRanking',
  'songRecords:save',
  'songRecords:saveBatch',
  'songRecords:delete',
  'songScores:publicPull',
  'songScores:pull',
  'songScores:uploadPage',
  'songScores:save',
  'songScores:delete',
  'recordings:pull',
  'recordings:save',
  'recordings:delete',
  'recordings:uploadChunk',
  'recordings:finishUpload',
  'recordings:readChunk',
  'scorePages:read',
  'artistSettings:privatePull',
  'songScores:copyOwner',
  'artistSettings:pull',
  'artistSettings:push',
  'artistTags:pull',
  'tags:list',
  'songTags:pull',
  'songTags:save',
  'artistTags:save',
  'featuredSongs:pull',
  'featuredSongs:set',
  'quizLibrary:pull',
  'quizLibrary:set',
]);

const ARTIST_SETTINGS_REQUEST_LIMIT = 5 * 1024 * 1024;
const SONG_SCORE_UPLOAD_REQUEST_LIMIT = 4_700_000;
const DEFAULT_REQUEST_LIMIT = 256 * 1024;
const ARTIST_AVATAR_LIMIT = 1024 * 1024;
const SONG_SCORE_PAGE_BYTES_LIMIT = 3_500_000;
const SONG_SCORE_PAGE_LIMIT = 4;
// 谱页 fileID 的固定形状；代理读取接口沿用它，避免被拿来读别的云端文件。
const SONG_SCORE_PAGE_FILE_ID = /^cloud:\/\/[^/\s]{1,180}\/song-request-scores\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9-]{16,64}\.jpg$/i;
// 录音 fileID：云端直传路径 song-request-recordings/{workspaceHash}/{songHash}/{timestamp-random}.{ext}
const SONG_RECORDING_FILE_ID = /^cloud:\/\/[^/\s]{1,180}\/song-request-recordings\/[a-f0-9]{64}\/[a-f0-9]{64}\/[A-Za-z0-9-]{1,80}\.(mp3|m4a|aac|wav|webm|ogg|flac|bin)$/i;
const SONG_RECORDING_MAX_BYTES = 40 * 1024 * 1024;
const RECORDING_CHUNK_BYTES = 3 * 1024 * 1024;
const RECORDING_CHUNK_BASE64 = /^data:application\/octet-stream;base64,([A-Za-z0-9+/]+={0,2})$/;
const RECORDING_UPLOAD_ID = /^[a-z0-9-]{8,64}$/i;
const RECORDING_EXTENSION = /^(mp3|m4a|aac|wav|webm|ogg|flac|bin)$/i;
const ROADSHOW_LOCATIONS = new Set(['医大（武鸣）', '医大（本部）', '南湖']);
// 狂扫速度的可填范围，与前端 songRecords.ts 的 STRUM_BPM_MIN/MAX 保持一致。
const STRUM_BPM_MIN = 20;
const STRUM_BPM_MAX = 300;

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
  if (value.fixedBonus !== undefined) {
    if (typeof value.fixedBonus !== 'boolean') throw new Error('INVALID_SONG');
    song.fixedBonus = value.fixedBonus;
  }
  if (value.repeatSuggested !== undefined) {
    if (typeof value.repeatSuggested !== 'boolean') throw new Error('INVALID_SONG');
    song.repeatSuggested = value.repeatSuggested;
  }
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

const validateFunGroupRounds = (value) => {
  if (!Array.isArray(value) || value.length > 200) throw new Error('INVALID_RECORD');
  const rounds = value.map(round => {
    if (!round || typeof round !== 'object' || Array.isArray(round)
      || !Number.isInteger(round.round) || round.round < 1 || round.round > 9999
      || !Array.isArray(round.songIds) || round.songIds.length < 1 || round.songIds.length > 4) throw new Error('INVALID_RECORD');
    const songIds = round.songIds.map(id => cleanText(id, 100, 'INVALID_RECORD'));
    if (new Set(songIds).size !== songIds.length) throw new Error('INVALID_RECORD');
    return {
      id: cleanText(round.id, 100, 'INVALID_RECORD'),
      groupId: cleanText(round.groupId, 100, 'INVALID_RECORD'),
      round: round.round,
      songIds,
      ...(round.sungAt === undefined ? {} : { sungAt: cleanIsoTime(round.sungAt, 'INVALID_RECORD') }),
    };
  });
  if (new Set(rounds.map(round => round.id)).size !== rounds.length
    || new Set(rounds.map(round => round.round)).size !== rounds.length) throw new Error('INVALID_RECORD');
  return rounds;
};

const validateRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECORD');
  const date = cleanText(value.date, 10, 'INVALID_RECORD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_RECORD');
  const optionalFields = {};
  if (value.location !== undefined) optionalFields.location = cleanOptionalText(value.location, 80, 'INVALID_RECORD');
  if (value.weather !== undefined) optionalFields.weather = cleanOptionalText(value.weather, 40, 'INVALID_RECORD');
  if (value.feelings !== undefined) optionalFields.feelings = cleanOptionalText(value.feelings, 10000, 'INVALID_RECORD');
  if (value.recognitionAttempts !== undefined) optionalFields.recognitionAttempts = validateRecognitionAttempts(value.recognitionAttempts);
  if (value.funGroupRounds !== undefined) optionalFields.funGroupRounds = validateFunGroupRounds(value.funGroupRounds);
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
    const femaleKey = value.femaleKey === undefined ? '' : cleanOptionalText(value.femaleKey, 80, 'INVALID_SONG_RECORD');
    if (value.chorusStars !== undefined && (!Number.isInteger(value.chorusStars) || value.chorusStars < 0 || value.chorusStars > 5)) throw new Error('INVALID_SONG_RECORD');
    if (value.chorusScore !== undefined && (!Number.isInteger(value.chorusScore) || value.chorusScore < 70 || value.chorusScore > 100)) throw new Error('INVALID_SONG_RECORD');
    if (value.strumScore !== undefined && (!Number.isInteger(value.strumScore) || value.strumScore < 70 || value.strumScore > 100)) throw new Error('INVALID_SONG_RECORD');
    if (value.strumBpm !== undefined && (!Number.isInteger(value.strumBpm) || value.strumBpm < STRUM_BPM_MIN || value.strumBpm > STRUM_BPM_MAX)) throw new Error('INVALID_SONG_RECORD');
    if (value.needsMorePractice !== undefined && typeof value.needsMorePractice !== 'boolean') throw new Error('INVALID_SONG_RECORD');
    if (value.needsImprovement !== undefined && typeof value.needsImprovement !== 'boolean') throw new Error('INVALID_SONG_RECORD');
    if (value.singingMoods !== undefined && (!Array.isArray(value.singingMoods) || value.singingMoods.length > 9 || !value.singingMoods.every((mood) => ['快乐', '感动', '想哭', '爽歌', '舒服', '欢快', '音色', '歌词', '爆款'].includes(mood)))) throw new Error('INVALID_SONG_RECORD');
    return {
      ...base,
      kind: 'practice',
      matchScore: value.matchScore,
      feelings,
      problems,
      improvements,
      needsMorePractice: Boolean(value.needsMorePractice),
      needsImprovement: Boolean(value.needsImprovement),
      singingMoods: [...new Set((value.singingMoods ?? []).map(mood => mood === '快乐' ? '欢快' : mood === '想哭' ? '爆款' : mood))],
      ...(Number.isInteger(value.chorusScore) ? { chorusScore: value.chorusScore } : {}),
      ...(Number.isInteger(value.strumScore) ? { strumScore: value.strumScore } : {}),
      ...(Number.isInteger(value.strumBpm) ? { strumBpm: value.strumBpm } : {}),
      ...(Number.isInteger(value.chorusStars) && value.chorusStars > 0 ? { chorusStars: value.chorusStars } : {}),
      ...(femaleKey ? { femaleKey } : {}),
    };
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

const EDITABLE_CATALOG_VERSION = 11;

const validateCatalog = (value) => {
  if (!value || ![10, EDITABLE_CATALOG_VERSION].includes(value.version) || !Array.isArray(value.artists) || value.artists.length > 200 || !Array.isArray(value.songs) || value.songs.length > 2000) throw new Error('INVALID_ARTIST_SETTINGS');
  const artists = value.artists.map(validateArtistName);
  const songs = value.songs.map(song => ({
    id: cleanText(song.id, 100, 'INVALID_ARTIST_SETTINGS'), title: cleanText(song.title, 100, 'INVALID_ARTIST_SETTINGS'),
    artist: cleanText(song.artist, 100, 'INVALID_ARTIST_SETTINGS'), category: cleanText(song.category, 100, 'INVALID_ARTIST_SETTINGS'),
    featured: Boolean(song.featured), ...(song.hotComment ? { hotComment: cleanText(song.hotComment, 2000, 'INVALID_ARTIST_SETTINGS') } : {}),
  }));
  if (new Set(artists).size !== artists.length || new Set(songs.map(s => s.id)).size !== songs.length || songs.some(s => !artists.includes(s.artist))) throw new Error('INVALID_ARTIST_SETTINGS');
  return { version: value.version, artists, songs };
};

const validateArtistSettings = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['version', 'artistOrder', 'songOrder', 'customAvatars', 'avatarAdjustments', 'revision', 'updatedAt', 'catalog'].includes(key))
    || value.version !== 1 || !Array.isArray(value.artistOrder)
    || value.artistOrder.length > 200) throw new Error('INVALID_ARTIST_SETTINGS');
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
    ...(value.catalog === undefined ? {} : { catalog: validateCatalog(value.catalog) }),
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
    lyrics: value.lyrics === undefined ? '' : cleanOptionalText(value.lyrics, 12000, 'INVALID_SONG_SCORE'),
    scoreNote: value.scoreNote === undefined ? '' : cleanOptionalText(value.scoreNote, 500, 'INVALID_SONG_SCORE'),
  };
  if (!Array.isArray(score.pages) || score.pages.length > SONG_SCORE_PAGE_LIMIT || (!score.pages.length && !score.lyrics && !score.scoreNote)) throw new Error('INVALID_SONG_SCORE');
  for (const page of score.pages) {
    if (typeof page !== 'string' || !SONG_SCORE_PAGE_FILE_ID.test(page)) throw new Error('INVALID_SONG_SCORE');
  }
  const { lyrics, scoreNote, ...base } = score;
  return { ...base, ...(lyrics ? { lyrics } : {}), ...(scoreNote ? { scoreNote } : {}) };
};

const validateSongScorePage = (value) => {
  if (typeof value !== 'string') throw new Error('INVALID_SONG_SCORE');
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error('INVALID_SONG_SCORE');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > SONG_SCORE_PAGE_BYTES_LIMIT || !validImageMagic('jpeg', bytes)) {
    throw new Error('INVALID_SONG_SCORE');
  }
  return bytes;
};

const validateRecording = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECORDING');
  const id = cleanText(value.id, 120, 'INVALID_RECORDING');
  const songId = cleanText(value.songId, 100, 'INVALID_RECORDING');
  const songTitle = cleanText(value.songTitle, 100, 'INVALID_RECORDING');
  const songArtist = cleanOptionalText(value.songArtist, 100, 'INVALID_RECORDING');
  const title = cleanText(value.title, 160, 'INVALID_RECORDING');
  const fileName = cleanText(value.fileName, 260, 'INVALID_RECORDING');
  const mimeType = cleanText(value.mimeType, 120, 'INVALID_RECORDING');
  if (typeof value.fileID !== 'string' || !SONG_RECORDING_FILE_ID.test(value.fileID)) throw new Error('INVALID_RECORDING');
  if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > SONG_RECORDING_MAX_BYTES) throw new Error('INVALID_RECORDING');
  const duration = Number(value.duration);
  const clipStart = Number(value.clipStart);
  const clipEnd = Number(value.clipEnd);
  if (![duration, clipStart, clipEnd].every(Number.isFinite)) throw new Error('INVALID_RECORDING');
  if (duration <= 0 || clipStart < 0 || clipEnd <= clipStart || clipEnd > duration + 0.5) throw new Error('INVALID_RECORDING');
  // 删除段：发生在 clipStart..clipEnd 之内，最多 30 段。
  const rawCuts = value.cuts === undefined ? [] : value.cuts;
  if (!Array.isArray(rawCuts) || rawCuts.length > 30) throw new Error('INVALID_RECORDING');
  const cuts = rawCuts.map((cut) => {
    if (!cut || typeof cut !== 'object') throw new Error('INVALID_RECORDING');
    const cutStart = Number(cut.start);
    const cutEnd = Number(cut.end);
    if (![cutStart, cutEnd].every(Number.isFinite)) throw new Error('INVALID_RECORDING');
    if (cutStart < clipStart - 0.01 || cutEnd <= cutStart || cutEnd > clipEnd + 0.5) throw new Error('INVALID_RECORDING');
    return { start: cutStart, end: cutEnd };
  }).sort((left, right) => left.start - right.start);
  const createdAt = cleanOptionalText(value.createdAt, 40, 'INVALID_RECORDING') || new Date().toISOString();
  const updatedAt = cleanOptionalText(value.updatedAt, 40, 'INVALID_RECORDING') || createdAt;
  return {
    id, songId, songTitle, songArtist, title, fileName, mimeType, fileID: value.fileID,
    size: value.size, duration, clipStart, clipEnd, ...(cuts.length ? { cuts } : {}), createdAt, updatedAt,
  };
};

function validateRequest(event) {
  if (!event || typeof event !== 'object' || !ACTIONS.has(event.action)) throw new Error('INVALID_ACTION');
  const requestLimit = event.action === 'enough:save' ? 650000 : event.action === 'feelingsNotebook:save' ? 4 * 1024 * 1024 : (event.action === 'artistSettings:push' || event.action === 'artistSettings:privatePull')
    ? ARTIST_SETTINGS_REQUEST_LIMIT
    : (event.action === 'songScores:uploadPage' || event.action === 'recordings:uploadChunk') ? SONG_SCORE_UPLOAD_REQUEST_LIMIT : DEFAULT_REQUEST_LIMIT;
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > requestLimit) throw new Error('PAYLOAD_TOO_LARGE');

  if (event.action === 'votes:pull' || event.action === 'roadshows:publicQuizRanking') {
    return { action: event.action, ...optionalRankingLocation(event.location) };
  }
  if (event.action === 'songScores:publicPull' || event.action === 'songRecords:publicRanking'
    || event.action === 'artistSettings:pull' || event.action === 'featuredSongs:pull'
    || event.action === 'quizLibrary:pull' || event.action === 'songGroups:pull') return { action: event.action };
  if (event.action === 'votes:increment') {
    const songId = cleanText(event.songId, 80, 'INVALID_SONG_ID');
    if (!/^[a-z0-9-]+$/i.test(songId)) throw new Error('INVALID_SONG_ID');
    const requesterName = event.requesterName === undefined ? '' : cleanOptionalText(event.requesterName, 24, 'INVALID_ALIAS');
    return { action: event.action, songId, ...(requesterName ? { requesterName } : {}), ...optionalRankingLocation(event.location) };
  }

  if (event.action === 'tags:list') return { action: event.action };
  if (event.action === 'artistTags:pull') return { action: event.action, artist: cleanText(event.artist, 100, 'INVALID_ARTIST_SETTINGS') };
  if (event.action === 'songTags:pull') return { action: event.action, songId: cleanText(event.songId, 100, 'INVALID_SONG_ID') };
  const alias = cleanText(event.alias, 30, 'INVALID_ALIAS');
  if (typeof event.password !== 'string' || event.password.length < 6 || event.password.length > 64) throw new Error('INVALID_PASSWORD');
  const base = { action: event.action, alias, password: event.password };
  if (event.action === 'inquiries:save') {
    if (!Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0) throw new Error('INVALID_JOURNAL');
    return { ...base, expectedRevision: event.expectedRevision, entries: require('./inquiries').validateInquiries(event.entries) };
  }
  if (event.action === 'artistTags:save' || event.action === 'songTags:save') {
    if (!Array.isArray(event.tags) || event.tags.length > 30) throw new Error('INVALID_ARTIST_SETTINGS');
    const tags = [...new Set(event.tags.map((tag) => cleanText(tag, 500, 'INVALID_ARTIST_SETTINGS')))];
    return { ...base, ...(event.action === 'songTags:save' ? { songId: cleanText(event.songId, 100, 'INVALID_SONG_ID') } : { artist: cleanText(event.artist, 100, 'INVALID_ARTIST_SETTINGS') }), tags };
  }
  if (event.action === 'votes:adjustSung') {
    const songId = cleanText(event.songId, 80, 'INVALID_SONG_ID');
    if (!/^[a-z0-9-]+$/i.test(songId) || ![1, -1].includes(event.delta)) throw new Error('INVALID_SONG_ID');
    return { ...base, songId, delta: event.delta, ...optionalRankingLocation(event.location) };
  }
  if (event.action === 'roadshowSings:pull' || event.action === 'roadshowSings:migrateLegacy') return base;
  if (event.action === 'roadshowSings:clear') return { ...base, ...optionalRankingLocation(event.location) };
  if (event.action === 'roadshowSings:adjust') {
    const songId = cleanText(event.songId, 80, 'INVALID_SONG_ID');
    if (!/^[a-z0-9-]+$/i.test(songId) || ![1, -1].includes(event.delta)) throw new Error('INVALID_SONG_ID');
    return { ...base, songId, delta: event.delta, ...optionalRankingLocation(event.location), ...(event.legacy === true ? { legacy: true } : {}), ...(event.latest === true ? { latest: true } : {}), ...(event.eventId === undefined ? {} : { eventId: cleanText(event.eventId, 100, 'INVALID_RECORD') }) };
  }
  if (event.action === 'roadshowQuiz:pull') return { ...base, songId: cleanText(event.songId, 80, 'INVALID_SONG_ID') };
  if (event.action === 'roadshowQuiz:undo') return { ...base, eventId: cleanText(event.eventId, 100, 'INVALID_RECORD') };
  if (event.action === 'roadshowQuiz:start') return {
    ...base, eventId: cleanText(event.eventId, 100, 'INVALID_RECORD'), songId: cleanText(event.songId, 80, 'INVALID_SONG_ID'),
    title: cleanText(event.title, 100, 'INVALID_SONG'), artist: cleanOptionalText(event.artist, 100, 'INVALID_SONG'),
  };
  if (event.action === 'roadshowQuiz:judge') {
    if (typeof event.correct !== 'boolean') throw new Error('INVALID_RECORD');
    return { ...base, eventId: cleanText(event.eventId, 100, 'INVALID_RECORD'), correct: event.correct };
  }
  if (event.action.startsWith('stars:owner')) return { ...base, themeId: event.themeId, id: event.id, star: event.star };
  if (event.action === 'enough:save') {
    if (!Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0) throw new Error('INVALID_JOURNAL');
    return { ...base, expectedRevision: event.expectedRevision, entries: validateEntries(event.entries) };
  }
  if (event.action === 'invitations:create') return { ...base, boundAlias: event.boundAlias ? cleanText(event.boundAlias, 30, 'INVALID_ALIAS').toLowerCase() : '' };
  if (event.action === 'roadshows:register' || event.action === 'invitations:revoke') {
    const code = typeof event.invitationCode === 'string' ? event.invitationCode.trim().toUpperCase() : '';
    if (code && !/^[A-F0-9]{32}$/.test(code)) throw new Error('INVALID_INVITATION');
    return { ...base, invitationCode: code };
  }
  if (event.action === 'songGroups:save') {
    if (!Number.isInteger(event.expectedRevision) || event.expectedRevision < 0) throw new Error('INVALID_SONG_GROUPS');
    return { ...base, expectedRevision: event.expectedRevision, groups: validateSongGroups(event.groups) };
  }
  if (event.action === 'feelingsNotebook:save') {
    if (!Number.isInteger(event.expectedRevision) || event.expectedRevision < 0) throw new Error('INVALID_NOTEBOOK');
    return { ...base, expectedRevision: event.expectedRevision, pages: validateNotebookPages(event.pages) };
  }
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
  if (event.action === 'songScores:copyOwner') return { ...base, songId: cleanText(event.songId, 100, 'INVALID_SONG_SCORE') };
  if (event.action === 'artistSettings:privatePull') return { ...base, seed: validateArtistSettings(event.seed) };
  if (event.action === 'artistSettings:push') {
    const expectedRevision = event.expectedRevision;
    if (!(expectedRevision === null || (Number.isInteger(expectedRevision) && expectedRevision >= 1))) throw new Error('INVALID_ARTIST_SETTINGS');
    return { ...base, expectedRevision, snapshot: validateArtistSettings(event.snapshot) };
  }
  if (event.action === 'roadshows:save') return { ...base, record: validateRecord(event.record) };
  if (event.action === 'roadshows:clearQuizRanking') return { ...base, ...optionalRankingLocation(event.location) };
  if (event.action === 'roadshows:delete') return { ...base, id: cleanText(event.id, 80, 'INVALID_RECORD') };
  if (event.action === 'songRecords:save') return { ...base, record: validateSongRecord(event.record) };
  if (event.action === 'songRecords:saveBatch') {
    if (!Array.isArray(event.records) || event.records.length < 1 || event.records.length > 50) throw new Error('INVALID_SONG_RECORD');
    const records = event.records.map(validateSongRecord);
    if (records.some((record) => record.kind !== 'practice') || new Set(records.map((record) => record.id)).size !== records.length) throw new Error('INVALID_SONG_RECORD');
    return { ...base, records };
  }
  if (event.action === 'songScores:uploadPage') {
    return {
      ...base,
      songId: cleanText(event.songId, 100, 'INVALID_SONG_SCORE'),
      pageContent: validateSongScorePage(event.pageDataUrl),
    };
  }
  if (event.action === 'songScores:save') return { ...base, score: validateSongScore(event.score) };
  // 兜底读谱：浏览器直连签名地址被跨域策略拦住时，由云函数按 fileID 把原图取回来。
  if (event.action === 'scorePages:read') {
    if (typeof event.fileID !== 'string' || !SONG_SCORE_PAGE_FILE_ID.test(event.fileID)) throw new Error('INVALID_SONG_SCORE');
    return { ...base, fileID: event.fileID };
  }
  if (event.action === 'songScores:delete') return { ...base, songId: cleanText(event.songId, 100, 'INVALID_SONG_SCORE') };
  if (event.action === 'recordings:pull') return base;
  if (event.action === 'recordings:save') return { ...base, recording: validateRecording(event.recording) };
  if (event.action === 'recordings:delete') return { ...base, id: cleanText(event.id, 120, 'INVALID_RECORDING') };
  if (event.action === 'recordings:uploadChunk') {
    const songId = cleanText(event.songId, 100, 'INVALID_RECORDING');
    const uploadId = cleanText(event.uploadId, 64, 'INVALID_RECORDING');
    if (!RECORDING_UPLOAD_ID.test(uploadId)) throw new Error('INVALID_RECORDING');
    if (!Number.isSafeInteger(event.index) || event.index < 0 || event.index > 79) throw new Error('INVALID_RECORDING');
    const match = RECORDING_CHUNK_BASE64.exec(typeof event.chunkBase64 === 'string' ? event.chunkBase64 : '');
    if (!match) throw new Error('INVALID_RECORDING');
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > RECORDING_CHUNK_BYTES) throw new Error('INVALID_RECORDING');
    return { ...base, songId, uploadId, index: event.index, chunkContent: bytes };
  }
  if (event.action === 'recordings:finishUpload') {
    const songId = cleanText(event.songId, 100, 'INVALID_RECORDING');
    const uploadId = cleanText(event.uploadId, 64, 'INVALID_RECORDING');
    if (!RECORDING_UPLOAD_ID.test(uploadId)) throw new Error('INVALID_RECORDING');
    if (!Array.isArray(event.partFileIDs) || !event.partFileIDs.length || event.partFileIDs.length > 80) throw new Error('INVALID_RECORDING');
    const partFileIDs = event.partFileIDs.map((fileID) => cleanText(fileID, 600, 'INVALID_RECORDING'));
    const ext = cleanText(event.ext, 8, 'INVALID_RECORDING');
    if (!RECORDING_EXTENSION.test(ext)) throw new Error('INVALID_RECORDING');
    return { ...base, songId, uploadId, partFileIDs, ext: ext.toLowerCase() };
  }
  // 分段代理读录音：换设备后本机没有原始文件，浏览器直连签名地址又可能被跨域拦掉，
  // 由云函数按 fileID 取回并按 3MB 切片返回，前端拼回完整音频用于裁剪 / 导出。
  if (event.action === 'recordings:readChunk') {
    const fileID = cleanText(event.fileID, 600, 'INVALID_RECORDING');
    if (!SONG_RECORDING_FILE_ID.test(fileID)) throw new Error('INVALID_RECORDING');
    if (!Number.isSafeInteger(event.offset) || event.offset < 0 || event.offset > SONG_RECORDING_MAX_BYTES) throw new Error('INVALID_RECORDING');
    if (!Number.isSafeInteger(event.length) || event.length < 1 || event.length > RECORDING_CHUNK_BYTES) throw new Error('INVALID_RECORDING');
    return { ...base, fileID, offset: event.offset, length: event.length };
  }
  if (event.action === 'songRecords:delete') return { ...base, id: cleanText(event.id, 100, 'INVALID_SONG_RECORD') };
  return base;
}

module.exports = { validateRequest };
