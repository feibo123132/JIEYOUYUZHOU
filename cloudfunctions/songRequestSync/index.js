const crypto = require('node:crypto');
const { validateRequest } = require('./validation');

const PUBLIC_ERRORS = new Set([
  'INVALID_ACTION', 'PAYLOAD_TOO_LARGE', 'INVALID_SONG_ID', 'INVALID_ALIAS', 'INVALID_PASSWORD',
  'INVALID_SONG', 'INVALID_SONG_LIST', 'INVALID_RECORD', 'ALREADY_REGISTERED', 'NOT_REGISTERED',
  'INVALID_SONG_RECORD', 'INVALID_ARTIST_SETTINGS', 'AUTH_FAILED', 'CONFLICT', 'NOT_FOUND',
  'INVALID_FEATURED_SONGS',
  'INVALID_QUIZ_LIBRARY',
  'INVALID_SONG_SCORE',
  'INVALID_LOCATION',
]);

const FEATURED_SONGS_OWNER_ALIAS = '2421415030@qq.com';
const ROADSHOW_LOCATION_KEYS = Object.freeze({
  '医大（武鸣）': 'medicalWuming',
  '医大（本部）': 'medicalMain',
  '南湖': 'nanhu',
});
const cleanVoteCounts = (value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter(([, count]) => Number.isInteger(count) && count > 0))
  : {};
const cleanLocationVoteCounts = (value) => Object.fromEntries(Object.values(ROADSHOW_LOCATION_KEYS).map((key) => [
  key, cleanVoteCounts(value?.[key]),
]));
const latestRoadshowLocation = (workspace) => {
  const records = Array.isArray(workspace?.roadshows) ? workspace.roadshows.filter((record) => !record.deletedAt && ROADSHOW_LOCATION_KEYS[record.location]) : [];
  records.sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')) || String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  return records[0]?.location;
};
const workspaceId = (alias) => crypto.createHash('sha256').update(alias.trim().toLocaleLowerCase()).digest('hex');
const passwordHash = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const songRecordDocumentId = (workspace, record) => crypto.createHash('sha256').update(`${workspace}:${record}`).digest('hex');
const songScoreDocumentId = (workspace, songId) => crypto.createHash('sha256').update(`${workspace}:score:${songId}`).digest('hex');
const publicSongRecord = ({ workspaceId: _workspaceId, deletedAt: _deletedAt, _id: _documentId, ...record }) => record;
const publicSongScore = ({ workspaceId: _workspaceId, deletedAt: _deletedAt, _id: _documentId, ...score }) => score;
const publicArtistSettings = (settings) => {
  if (!settings) return null;
  const { ownerWorkspaceId: _ownerWorkspaceId, _id: _documentId, ...snapshot } = settings;
  return snapshot;
};
const buildWritableWorkspace = ({ _id: _documentId, ...workspace }) => workspace;
const buildSoftDeletedSongRecord = (current, workspaceId, deletedAt) => {
  if (!current || current.workspaceId !== workspaceId || current.deletedAt) throw new Error('NOT_FOUND');
  const { _id: _documentId, ...writableRecord } = current;
  return { ...writableRecord, deletedAt, updatedAt: deletedAt };
};

const buildPublicPracticeRanking = (records) => {
  const groups = new Map();
  for (const record of records) {
    if (record.kind !== 'practice' || record.deletedAt || !Number.isInteger(record.matchScore)) continue;
    const current = groups.get(record.songId) || {
      songId: record.songId,
      songTitle: record.songTitle,
      songArtist: record.songArtist,
      total: 0,
      count: 0,
    };
    current.total += record.matchScore;
    current.count += 1;
    groups.set(record.songId, current);
  }
  return [...groups.values()].map(({ songId, songTitle, songArtist, total, count }) => ({
    songId,
    songTitle,
    songArtist,
    score: Math.round((total / count) * 10) / 10,
  })).sort((left, right) => right.score - left.score || left.songTitle.localeCompare(right.songTitle, 'zh-CN')).slice(0, 500);
};

const buildPublicQuizRanking = (roadshows) => {
  const groups = new Map();
  for (const roadshow of roadshows) {
    for (const attempt of roadshow.recognitionAttempts || []) {
      if (!attempt || typeof attempt.correct !== 'boolean' || !attempt.title) continue;
      const songId = attempt.catalogId || `manual:${String(attempt.title).trim().toLocaleLowerCase()}:${String(attempt.artist || '').trim().toLocaleLowerCase()}`;
      const current = groups.get(songId) || {
        songId,
        songTitle: attempt.title,
        songArtist: attempt.artist || '',
        answerCount: 0,
        correctCount: 0,
      };
      current.answerCount += 1;
      if (attempt.correct) current.correctCount += 1;
      groups.set(songId, current);
    }
  }
  return [...groups.values()].map((entry) => ({
    ...entry,
    accuracy: Math.round((entry.correctCount / entry.answerCount) * 1000) / 10,
  })).sort((left, right) => (
    right.accuracy - left.accuracy
    || right.answerCount - left.answerCount
    || left.songTitle.localeCompare(right.songTitle, 'zh-CN')
  )).slice(0, 500);
};

const buildPublicQuizParticipantRanking = (roadshows) => {
  const attempts = roadshows.flatMap((roadshow) => roadshow.recognitionAttempts || [])
    .filter((attempt) => attempt && typeof attempt.correct === 'boolean' && typeof attempt.participantName === 'string' && attempt.participantName.trim())
    .sort((left, right) => String(left.answeredAt || '').localeCompare(String(right.answeredAt || '')) || String(left.id || '').localeCompare(String(right.id || '')));
  const groups = new Map();
  for (const attempt of attempts) {
    const participantName = attempt.participantName.trim();
    const key = participantName.toLocaleLowerCase();
    const current = groups.get(key) || { participantName, score: 0, answerCount: 0, correctCount: 0 };
    current.answerCount += 1;
    if (attempt.correct) {
      current.correctCount += 1;
      current.score += 1;
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((entry) => ({
    ...entry,
    accuracy: Math.round((entry.correctCount / entry.answerCount) * 1000) / 10,
  })).sort((left, right) => (
    right.score - left.score
    || right.accuracy - left.accuracy
    || right.answerCount - left.answerCount
    || left.participantName.localeCompare(right.participantName, 'zh-CN', { sensitivity: 'base' })
    || left.participantName.localeCompare(right.participantName, 'zh-CN')
  )).slice(0, 500);
};

const authenticate = async (store, alias, password) => {
  const id = workspaceId(alias);
  const workspace = await store.getWorkspace(id);
  if (!workspace) throw new Error('NOT_REGISTERED');
  const actual = Buffer.from(passwordHash(password, workspace.passwordSalt), 'hex');
  const expected = Buffer.from(workspace.passwordHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('AUTH_FAILED');
  return { id, workspace };
};

function createHandler(store) {
  return async (event) => {
    try {
      const request = validateRequest(event);
      if (request.action === 'votes:pull') {
        const owner = await store.getWorkspace(workspaceId(FEATURED_SONGS_OWNER_ALIAS));
        const locationKey = request.location ? ROADSHOW_LOCATION_KEYS[request.location] : null;
        return {
          ok: true,
          counts: await store.getVotes(request.location),
          sungCounts: cleanVoteCounts(locationKey ? owner?.sungVoteCountsByLocation?.[locationKey] : owner?.sungVoteCounts),
        };
      }
      if (request.action === 'songRecords:publicRanking') {
        return { ok: true, ranking: buildPublicPracticeRanking(await store.getAllSongRecords()) };
      }
      if (request.action === 'roadshows:publicQuizRanking') {
        const roadshows = (await store.getAllRoadshows()).filter((record) => !request.location || record.location === request.location);
        return { ok: true, ranking: buildPublicQuizRanking(roadshows), participantRanking: buildPublicQuizParticipantRanking(roadshows) };
      }
      if (request.action === 'artistSettings:pull') {
        return { ok: true, snapshot: publicArtistSettings(await store.getArtistSettings()) };
      }
      if (request.action === 'featuredSongs:pull') {
        const owner = await store.getWorkspace(workspaceId(FEATURED_SONGS_OWNER_ALIAS));
        return { ok: true, songIds: Array.isArray(owner?.featuredSongIds) ? owner.featuredSongIds : null };
      }
      if (request.action === 'quizLibrary:pull') {
        const owner = await store.getWorkspace(workspaceId(FEATURED_SONGS_OWNER_ALIAS));
        const assignments = owner?.quizLibraryAssignments;
        return { ok: true, assignments: assignments && typeof assignments === 'object' && !Array.isArray(assignments) ? assignments : null };
      }
      if (request.action === 'votes:increment') {
        const owner = await store.getWorkspace(workspaceId(FEATURED_SONGS_OWNER_ALIAS));
        const location = ROADSHOW_LOCATION_KEYS[request.location] ? request.location : latestRoadshowLocation(owner);
        return { ok: true, count: await store.incrementVote(request.songId, location), location: location || null };
      }

      if (request.action === 'roadshows:register') {
        const id = workspaceId(request.alias);
        if (await store.getWorkspace(id)) throw new Error('ALREADY_REGISTERED');
        const salt = crypto.randomBytes(16).toString('hex');
        await store.setWorkspace(id, {
          version: 1,
          alias: request.alias,
          passwordSalt: salt,
          passwordHash: passwordHash(request.password, salt),
          roadshows: [],
          updatedAt: store.now(),
        });
        return { ok: true, records: [] };
      }

      let authenticated;
      try {
        authenticated = await authenticate(store, request.alias, request.password);
      } catch (error) {
        if ((request.action === 'artistSettings:push' || request.action === 'featuredSongs:set' || request.action === 'quizLibrary:set' || request.action === 'votes:finishAll')
          && error?.message === 'NOT_REGISTERED') throw new Error('AUTH_FAILED');
        throw error;
      }
      const { id, workspace } = authenticated;
      if (request.action === 'votes:finishAll') {
        if (id !== workspaceId(FEATURED_SONGS_OWNER_ALIAS)) throw new Error('AUTH_FAILED');
        return { ok: true, ...await store.finishVotesAtomically(id) };
      }
      if (request.action === 'featuredSongs:set') {
        if (id !== workspaceId(FEATURED_SONGS_OWNER_ALIAS)) throw new Error('AUTH_FAILED');
        await store.setFeaturedSongIds(id, request.songIds, store.now());
        return { ok: true, songIds: request.songIds };
      }
      if (request.action === 'quizLibrary:set') {
        if (id !== workspaceId(FEATURED_SONGS_OWNER_ALIAS)) throw new Error('AUTH_FAILED');
        await store.setQuizLibraryAssignments(id, request.assignments, store.now());
        return { ok: true, assignments: request.assignments };
      }
      if (request.action === 'artistSettings:push') {
        if (id !== workspaceId(FEATURED_SONGS_OWNER_ALIAS)) throw new Error('AUTH_FAILED');
        const saved = await store.saveArtistSettingsAtomically(id, request.expectedRevision, request.snapshot);
        return { ok: true, snapshot: publicArtistSettings(saved) };
      }
      if (request.action === 'songRecords:pull') {
        const records = await store.getSongRecords(id);
        return { ok: true, records: records.filter((record) => !record.deletedAt).map(publicSongRecord) };
      }

      if (request.action === 'songRecords:save') {
        const saved = { ...request.record, workspaceId: id, updatedAt: store.now() };
        await store.saveSongRecordAtomically(songRecordDocumentId(id, saved.id), saved);
        return { ok: true, record: publicSongRecord(saved) };
      }

      if (request.action === 'songRecords:saveBatch') {
        const updatedAt = store.now();
        const saved = request.records.map((record) => ({ ...record, workspaceId: id, updatedAt }));
        await store.saveSongRecordsAtomically(saved.map((value) => ({ documentId: songRecordDocumentId(id, value.id), value })));
        return { ok: true, records: saved.map(publicSongRecord) };
      }

      if (request.action === 'songRecords:delete') {
        await store.softDeleteSongRecordAtomically(songRecordDocumentId(id, request.id), id, store.now());
        return { ok: true };
      }

      if (request.action === 'songScores:pull') {
        const scores = await store.getSongScores(id);
        const visibleScores = scores.filter((score) => !score.deletedAt).map(publicSongScore);
        return { ok: true, scores: store.resolveSongScores ? await store.resolveSongScores(visibleScores) : visibleScores };
      }

      if (request.action === 'songScores:save') {
        const saved = { ...request.score, workspaceId: id, updatedAt: store.now() };
        await store.saveSongScoreAtomically(songScoreDocumentId(id, saved.songId), saved);
        return { ok: true, score: publicSongScore(saved) };
      }

      if (request.action === 'songScores:delete') {
        await store.deleteSongScoreAtomically(songScoreDocumentId(id, request.songId), id, request.songId, store.now());
        return { ok: true };
      }

      if (request.action === 'roadshows:pull') {
        const records = (workspace.roadshows || []).filter((record) => !record.deletedAt);
        return { ok: true, records };
      }

      if (request.action === 'roadshows:save') {
        const saved = { ...request.record, updatedAt: store.now() };
        const records = [...(workspace.roadshows || [])];
        const index = records.findIndex((record) => record.id === saved.id);
        if (index >= 0) records[index] = saved;
        else {
          if (records.filter((record) => !record.deletedAt).length >= 100) throw new Error('INVALID_RECORD');
          records.push(saved);
        }
        await store.setWorkspace(id, { ...workspace, roadshows: records, updatedAt: saved.updatedAt });
        return { ok: true, record: saved };
      }

      const records = [...(workspace.roadshows || [])];
      const index = records.findIndex((record) => record.id === request.id && !record.deletedAt);
      if (index < 0) throw new Error('NOT_FOUND');
      records[index] = { ...records[index], deletedAt: store.now(), updatedAt: store.now() };
      await store.setWorkspace(id, { ...workspace, roadshows: records, updatedAt: store.now() });
      return { ok: true };
    } catch (error) {
      const message = error?.message;
      if (PUBLIC_ERRORS.has(message)) return { ok: false, error: message };
      store.logError?.(error);
      return { ok: false, error: 'SYNC_FAILED' };
    }
  };
}

let defaultHandler;
exports.main = async (event) => {
  if (!defaultHandler) {
    const cloudbase = require('@cloudbase/node-sdk');
    const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const workspaces = db.collection('song_request_workspaces');
    const votes = db.collection('song_request_votes');
    const songRecords = db.collection('song_request_song_records');
    const songScores = db.collection('song_request_song_scores');
    const artistSettings = db.collection('song_request_artist_settings');
    const command = db.command;
    const readVoteCounts = async (location) => {
      const pageSize = 1000;
      const counts = {};
      const locationKey = location ? ROADSHOW_LOCATION_KEYS[location] : null;
      for (let offset = 0; ; offset += pageSize) {
        const result = await votes.skip(offset).limit(pageSize).get();
        const page = result.data || [];
        for (const item of page) {
          const count = Number(locationKey ? item.locationCounts?.[locationKey] : item.count) || 0;
          if (count > 0) counts[item._id] = count;
        }
        if (page.length < pageSize) return counts;
      }
    };
    defaultHandler = createHandler({
      async getWorkspace(id) {
        try {
          const result = await workspaces.doc(id).get();
          return Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        } catch (error) {
          if (/not found|does not exist/i.test(String(error?.message))) return null;
          throw error;
        }
      },
      setWorkspace: (id, value) => workspaces.doc(id).set(buildWritableWorkspace(value)),
      setFeaturedSongIds: (id, songIds, updatedAt) => workspaces.doc(id).update({ featuredSongIds: songIds, updatedAt }),
      setQuizLibraryAssignments: (id, assignments, updatedAt) => workspaces.doc(id).update({ quizLibraryAssignments: assignments, updatedAt }),
      getVotes: readVoteCounts,
      async incrementVote(songId, location) {
        const ref = votes.doc(songId);
        const locationKey = location ? ROADSHOW_LOCATION_KEYS[location] : null;
        let data = {};
        try {
          const doc = await ref.get();
          data = Array.isArray(doc.data) ? (doc.data[0] ?? {}) : (doc.data ?? {});
        } catch { /* 文档可能不存在，忽略错误 */ }
        const currentCount = Number(data.count) || 0;
        const currentLocationCounts = data.locationCounts || {};
        const newCount = currentCount + 1;
        const newLocationCounts = locationKey
          ? { ...currentLocationCounts, [locationKey]: (Number(currentLocationCounts[locationKey]) || 0) + 1 }
          : currentLocationCounts;
        await ref.set({
          count: newCount,
          ...(Object.keys(newLocationCounts).length > 0 ? { locationCounts: newLocationCounts } : {}),
          updatedAt: new Date().toISOString(),
        });
        return newCount;
      },
      async finishVotesAtomically(ownerWorkspaceId) {
        const pendingSnapshot = await readVoteCounts();
        const songIds = Object.keys(pendingSnapshot);
        const sungCounts = await db.runTransaction(async (transaction) => {
          const workspaceRef = transaction.collection('song_request_workspaces').doc(ownerWorkspaceId);
          const workspaceResult = await workspaceRef.get();
          const currentWorkspace = Array.isArray(workspaceResult.data) ? workspaceResult.data[0] : workspaceResult.data;
          if (!currentWorkspace) throw new Error('AUTH_FAILED');
          const nextSungCounts = cleanVoteCounts(currentWorkspace.sungVoteCounts);
          const nextSungCountsByLocation = cleanLocationVoteCounts(currentWorkspace.sungVoteCountsByLocation);
          for (const songId of songIds) {
            const voteRef = transaction.collection('song_request_votes').doc(songId);
            const voteResult = await voteRef.get();
            const currentVote = Array.isArray(voteResult.data) ? voteResult.data[0] : voteResult.data;
            const count = Number(currentVote?.count) || 0;
            if (count <= 0) continue;
            nextSungCounts[songId] = (nextSungCounts[songId] || 0) + count;
            for (const locationKey of Object.values(ROADSHOW_LOCATION_KEYS)) {
              const locationCount = Number(currentVote?.locationCounts?.[locationKey]) || 0;
              if (locationCount > 0) nextSungCountsByLocation[locationKey][songId] = (nextSungCountsByLocation[locationKey][songId] || 0) + locationCount;
            }
            await voteRef.set({ count: 0, locationCounts: {}, updatedAt: new Date().toISOString() });
          }
          await workspaceRef.set(buildWritableWorkspace({
            ...currentWorkspace,
            sungVoteCounts: nextSungCounts,
            sungVoteCountsByLocation: nextSungCountsByLocation,
            updatedAt: new Date().toISOString(),
          }));
          return nextSungCounts;
        });
        return { counts: await readVoteCounts(), sungCounts };
      },
      async getSongRecords(workspaceId) {
        const pageSize = 1000;
        const records = [];
        for (let offset = 0; ; offset += pageSize) {
          const result = await songRecords.where({ workspaceId }).skip(offset).limit(pageSize).get();
          const page = result.data || [];
          records.push(...page);
          if (page.length < pageSize) return records;
        }
      },
      async getAllSongRecords() {
        const pageSize = 1000;
        const records = [];
        for (let offset = 0; ; offset += pageSize) {
          const result = await songRecords.skip(offset).limit(pageSize).get();
          const page = result.data || [];
          records.push(...page);
          if (page.length < pageSize) return records;
        }
      },
      async getAllRoadshows() {
        const pageSize = 1000;
        const records = [];
        for (let offset = 0; ; offset += pageSize) {
          const result = await workspaces.skip(offset).limit(pageSize).get();
          const page = result.data || [];
          for (const workspace of page) {
            records.push(...(workspace.roadshows || []).filter((record) => !record.deletedAt));
          }
          if (page.length < pageSize) return records;
        }
      },
      async getSongScores(workspaceId) {
        const pageSize = 100;
        const scores = [];
        for (let offset = 0; ; offset += pageSize) {
          const result = await songScores.where({ workspaceId }).skip(offset).limit(pageSize).get();
          const page = result.data || [];
          scores.push(...page);
          if (page.length < pageSize) return scores;
        }
      },
      async resolveSongScores(scores) {
        const fileIds = [...new Set(scores.flatMap((score) => score.pages || []))];
        if (!fileIds.length) return scores;
        const urlByFileId = new Map();
        for (let offset = 0; offset < fileIds.length; offset += 50) {
          const response = await app.getTempFileURL({ fileList: fileIds.slice(offset, offset + 50) });
          for (const item of response.fileList || []) {
            const fileId = item.fileID || item.fileid;
            const url = item.tempFileURL || item.download_url;
            if (fileId && url && (!item.code || item.code === 'SUCCESS')) urlByFileId.set(fileId, url);
          }
        }
        return scores.map((score) => ({ ...score, pageUrls: score.pages.map((page) => urlByFileId.get(page) || page) }));
      },
      saveSongScoreAtomically: (documentId, value) => db.runTransaction(async (transaction) => {
        const ref = transaction.collection('song_request_song_scores').doc(documentId);
        await ref.set(value);
      }),
      deleteSongScoreAtomically: (documentId, workspaceId, songId, deletedAt) => db.runTransaction(async (transaction) => {
        const ref = transaction.collection('song_request_song_scores').doc(documentId);
        await ref.set({ workspaceId, songId, deletedAt, updatedAt: deletedAt });
      }),
      async getArtistSettings() {
        try {
          const result = await artistSettings.doc('global').get();
          return Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        } catch (error) {
          if (/not found|does not exist/i.test(String(error?.message))) return null;
          throw error;
        }
      },
      saveArtistSettingsAtomically: (ownerWorkspaceId, expectedRevision, snapshot) => db.runTransaction(async (transaction) => {
        const ref = transaction.collection('song_request_artist_settings').doc('global');
        let current = null;
        try {
          const result = await ref.get();
          current = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
        } catch (error) {
          if (!/not found|does not exist/i.test(String(error?.message))) throw error;
        }
        if (!current) {
          if (expectedRevision !== null) throw new Error('CONFLICT');
        } else {
          if (current.ownerWorkspaceId !== ownerWorkspaceId) throw new Error('AUTH_FAILED');
          if (current.revision !== expectedRevision) throw new Error('CONFLICT');
        }
        const saved = {
          ...snapshot,
          ownerWorkspaceId,
          revision: current ? current.revision + 1 : 1,
          updatedAt: new Date().toISOString(),
        };
        await ref.set(saved);
        return saved;
      }),
      saveSongRecordAtomically: (documentId, value) => db.runTransaction(async (transaction) => {
        const ref = transaction.collection('song_request_song_records').doc(documentId);
        let current = null;
        try {
          const result = await ref.get();
          current = Array.isArray(result.data) ? result.data[0] : result.data;
        } catch (error) {
          if (!/not found|does not exist/i.test(String(error?.message))) throw error;
        }
        if (current?.deletedAt) throw new Error('NOT_FOUND');
        await ref.set(value);
      }),
      saveSongRecordsAtomically: (items) => db.runTransaction(async (transaction) => {
        const writable = [];
        for (const { documentId, value } of items) {
          const ref = transaction.collection('song_request_song_records').doc(documentId);
          let current = null;
          try {
            const result = await ref.get();
            current = Array.isArray(result.data) ? result.data[0] : result.data;
          } catch (error) {
            if (!/not found|does not exist/i.test(String(error?.message))) throw error;
          }
          if (current?.deletedAt) throw new Error('NOT_FOUND');
          writable.push({ ref, value });
        }
        for (const { ref, value } of writable) await ref.set(value);
      }),
      softDeleteSongRecordAtomically: (documentId, workspaceId, deletedAt) => db.runTransaction(async (transaction) => {
        const ref = transaction.collection('song_request_song_records').doc(documentId);
        let current;
        try {
          const result = await ref.get();
          current = Array.isArray(result.data) ? result.data[0] : result.data;
        } catch (error) {
          if (/not found|does not exist/i.test(String(error?.message))) throw new Error('NOT_FOUND');
          throw error;
        }
        await ref.set(buildSoftDeletedSongRecord(current, workspaceId, deletedAt));
      }),
      now: () => new Date().toISOString(),
      logError: (error) => console.error('songRequestSync failed', error),
    });
  }
  return defaultHandler(event);
};

exports.createHandler = createHandler;
exports.buildWritableWorkspace = buildWritableWorkspace;
exports.buildSoftDeletedSongRecord = buildSoftDeletedSongRecord;
exports.buildPublicPracticeRanking = buildPublicPracticeRanking;
exports.buildPublicQuizRanking = buildPublicQuizRanking;
exports.buildPublicQuizParticipantRanking = buildPublicQuizParticipantRanking;
exports.publicArtistSettings = publicArtistSettings;
