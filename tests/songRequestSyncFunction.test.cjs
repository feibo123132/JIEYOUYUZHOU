const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functionPath = path.join(__dirname, '..', 'cloudfunctions', 'songRequestSync', 'index.js');
const validationPath = path.join(__dirname, '..', 'cloudfunctions', 'songRequestSync', 'validation.js');
const cloudbaseConfigPath = path.join(__dirname, '..', 'cloudbaserc.json');

test('CloudBase deployment config points directly at the small function directory', () => {
  const config = JSON.parse(readFileSync(cloudbaseConfigPath, 'utf8'));
  assert.equal(config.functionRoot, 'cloudfunctions');
  assert.deepEqual(config.functions, [{
    name: 'songRequestSync',
    dir: 'cloudfunctions/songRequestSync',
    runtime: 'Nodejs20.19',
    handler: 'index.main',
    installDependency: true,
  }]);
});

function loadFunction() {
  assert.ok(existsSync(functionPath), 'songRequestSync cloud function must exist');
  return require(functionPath);
}

function memoryStore() {
  const workspaces = new Map();
  const votes = new Map();
  const songRecords = new Map();
  const locationKeys = { '医大（武鸣）': 'medicalWuming', '医大（本部）': 'medicalMain', '南湖': 'nanhu' };
  let artistSettings = null;
  return {
    workspaces,
    votes,
    songRecords,
    get artistSettings() { return artistSettings; },
    getWorkspace: async (id) => workspaces.get(id) ?? null,
    setWorkspace: async (id, value) => { workspaces.set(id, structuredClone(value)); },
    setFeaturedSongIds: async (id, songIds, updatedAt) => {
      workspaces.set(id, { ...workspaces.get(id), featuredSongIds: structuredClone(songIds), updatedAt });
    },
    setQuizLibraryAssignments: async (id, assignments, updatedAt) => {
      workspaces.set(id, { ...workspaces.get(id), quizLibraryAssignments: structuredClone(assignments), updatedAt });
    },
    getVotes: async (location) => Object.fromEntries([...votes.entries()].flatMap(([songId, vote]) => {
      const count = location ? vote.locationCounts?.[locationKeys[location]] || 0 : vote.count;
      return count > 0 ? [[songId, count]] : [];
    })),
    incrementVote: async (songId, location) => {
      const current = votes.get(songId) || { count: 0, locationCounts: {} };
      const key = locationKeys[location];
      const next = {
        count: current.count + 1,
        locationCounts: { ...current.locationCounts, ...(key ? { [key]: (current.locationCounts[key] || 0) + 1 } : {}) },
      };
      votes.set(songId, next);
      return next.count;
    },
    finishVotesAtomically: async (ownerWorkspaceId) => {
      const workspace = workspaces.get(ownerWorkspaceId);
      const sungCounts = { ...(workspace?.sungVoteCounts || {}) };
      const sungVoteCountsByLocation = structuredClone(workspace?.sungVoteCountsByLocation || {});
      for (const [songId, vote] of votes) {
        if (vote.count > 0) sungCounts[songId] = (sungCounts[songId] || 0) + vote.count;
        for (const [key, count] of Object.entries(vote.locationCounts || {})) {
          sungVoteCountsByLocation[key] ||= {};
          sungVoteCountsByLocation[key][songId] = (sungVoteCountsByLocation[key][songId] || 0) + count;
        }
      }
      votes.clear();
      workspaces.set(ownerWorkspaceId, { ...workspace, sungVoteCounts: sungCounts, sungVoteCountsByLocation });
      return { counts: {}, sungCounts: structuredClone(sungCounts) };
    },
    getSongRecords: async (workspaceId) => [...songRecords.values()]
      .filter((record) => record.workspaceId === workspaceId && !record.deletedAt)
      .map((record) => structuredClone(record)),
    getAllSongRecords: async () => [...songRecords.values()].map((record) => structuredClone(record)),
    getAllRoadshows: async () => [...workspaces.values()].flatMap((workspace) => (
      workspace.roadshows || []
    )).filter((record) => !record.deletedAt).map((record) => structuredClone(record)),
    saveSongRecordAtomically: async (documentId, value) => {
      const current = songRecords.get(documentId);
      if (current?.deletedAt) throw new Error('NOT_FOUND');
      songRecords.set(documentId, structuredClone(value));
    },
    saveSongRecordsAtomically: async (items) => {
      for (const { documentId, value } of items) {
        const current = songRecords.get(documentId);
        if (current?.deletedAt) throw new Error('NOT_FOUND');
      }
      for (const { documentId, value } of items) songRecords.set(documentId, structuredClone(value));
    },
    softDeleteSongRecordAtomically: async (documentId, workspaceId, deletedAt) => {
      const current = songRecords.get(documentId);
      if (!current || current.workspaceId !== workspaceId || current.deletedAt) throw new Error('NOT_FOUND');
      songRecords.set(documentId, { ...current, deletedAt, updatedAt: deletedAt });
    },
    getArtistSettings: async () => artistSettings ? structuredClone(artistSettings) : null,
    saveArtistSettingsAtomically: async (ownerWorkspaceId, expectedRevision, snapshot) => {
      if (!artistSettings) {
        if (expectedRevision !== null) throw new Error('CONFLICT');
        artistSettings = { ...structuredClone(snapshot), ownerWorkspaceId, revision: 1, updatedAt: '2026-08-25T12:00:00.000Z' };
        return structuredClone(artistSettings);
      }
      if (artistSettings.ownerWorkspaceId !== ownerWorkspaceId) throw new Error('AUTH_FAILED');
      if (expectedRevision !== artistSettings.revision) throw new Error('CONFLICT');
      artistSettings = { ...structuredClone(snapshot), ownerWorkspaceId, revision: artistSettings.revision + 1, updatedAt: '2026-08-25T12:00:00.000Z' };
      return structuredClone(artistSettings);
    },
    now: () => '2026-08-25T12:00:00.000Z',
  };
}

const artistSettingsPayload = () => ({
  version: 1,
  artistOrder: ['周杰伦', '林俊杰'],
  songOrder: ['qing-tian', 'dao-xiang'],
  customAvatars: { 周杰伦: 'data:image/png;base64,iVBORw0KGgo=' },
  avatarAdjustments: { 周杰伦: { x: 50, y: 28, scale: 1.4, rotation: 0 } },
});

test('validates public and private actions without rejecting platform metadata', () => {
  assert.ok(existsSync(validationPath), 'songRequestSync validation must exist');
  const { validateRequest } = require(validationPath);

  assert.deepEqual(validateRequest({ action: 'votes:increment', songId: 'qing-tian', userInfo: { uid: 'u1' } }), {
    action: 'votes:increment', songId: 'qing-tian',
  });
  assert.deepEqual(validateRequest({ action: 'votes:finishAll', alias: '2421415030@qq.com', password: 'guitar-2026' }), {
    action: 'votes:finishAll', alias: '2421415030@qq.com', password: 'guitar-2026',
  });
  assert.deepEqual(validateRequest({ action: 'roadshows:publicQuizRanking', location: '医大（武鸣）' }), { action: 'roadshows:publicQuizRanking', location: '医大（武鸣）' });
  assert.deepEqual(validateRequest({ action: 'votes:pull', location: '南湖' }), { action: 'votes:pull', location: '南湖' });
  assert.throws(() => validateRequest({ action: 'votes:pull', location: '其他' }), /INVALID_LOCATION/);
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: '', password: '123456' }), /INVALID_ALIAS/);
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: 'JIEYOU', password: '123' }), /INVALID_PASSWORD/);
})

test('谱子云函数只接收云存储文件引用，不再接收 Base64 图片', () => {
  const { validateRequest } = require(validationPath);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const fileId = `cloud://env-123/song-request-scores/${'a'.repeat(64)}/${'b'.repeat(64)}/123e4567-e89b-12d3-a456-426614174000.jpg`;
  const storedScore = {
    id: 'score-qing-tian', songId: 'qing-tian', songTitle: '晴天', songArtist: '周杰伦',
    pages: [fileId],
  };
  const score = { ...storedScore, updatedAt: '2026-09-02T08:00:00.000Z' };

  assert.deepEqual(validateRequest({ action: 'songScores:save', ...auth, score }), {
    action: 'songScores:save', ...auth, score: storedScore,
  });
  assert.throws(() => validateRequest({
    action: 'songScores:save', ...auth,
    score: { ...score, pages: ['data:image/jpeg;base64,/9j/'] },
  }), /INVALID_SONG_SCORE/);
});

test('validates global artist settings actions, revisions, images, and payload limits', () => {
  const { validateRequest } = require(validationPath);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };

  assert.deepEqual(validateRequest({ action: 'artistSettings:pull', userInfo: { uid: 'u1' } }), { action: 'artistSettings:pull' });
  assert.deepEqual(validateRequest({
    action: 'artistSettings:push', ...auth, expectedRevision: null,
    snapshot: { ...artistSettingsPayload(), revision: 999, updatedAt: 'client-time' },
  }), { action: 'artistSettings:push', ...auth, expectedRevision: null, snapshot: artistSettingsPayload() });
  assert.throws(() => validateRequest({ action: 'artistSettings:push', ...auth, expectedRevision: 0, snapshot: artistSettingsPayload() }), /INVALID_ARTIST_SETTINGS/);
  assert.throws(() => validateRequest({
    action: 'artistSettings:push', ...auth, expectedRevision: null,
    snapshot: { ...artistSettingsPayload(), customAvatars: { 周杰伦: 'data:image/png;base64,SGVsbG8=' } },
  }), /INVALID_ARTIST_SETTINGS/);
  const oversizedImage = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1024 * 1024)]).toString('base64')}`;
  assert.throws(() => validateRequest({
    action: 'artistSettings:push', ...auth, expectedRevision: null,
    snapshot: { ...artistSettingsPayload(), customAvatars: { 周杰伦: oversizedImage } },
  }), /INVALID_ARTIST_SETTINGS/);
  assert.throws(() => validateRequest({ action: 'artistSettings:pull', padding: 'x'.repeat(5 * 1024 * 1024) }), /PAYLOAD_TOO_LARGE/);
})

test('publishes and transactionally protects one global artist settings snapshot', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };
  const other = { alias: 'OTHER', password: 'guitar-2026' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...other });

  assert.deepEqual(await handler({ action: 'artistSettings:pull' }), { ok: true, snapshot: null });
  const first = await handler({ action: 'artistSettings:push', ...owner, expectedRevision: null, snapshot: artistSettingsPayload() });
  assert.equal(first.ok, true);
  assert.equal(first.snapshot.revision, 1);
  assert.equal(first.snapshot.updatedAt, '2026-08-25T12:00:00.000Z');
  assert.equal('ownerWorkspaceId' in first.snapshot, false);
  assert.deepEqual(await handler({ action: 'artistSettings:pull' }), { ok: true, snapshot: first.snapshot });

  assert.deepEqual(await handler({ action: 'artistSettings:push', ...owner, expectedRevision: null, snapshot: artistSettingsPayload() }), { ok: false, error: 'CONFLICT' });
  assert.deepEqual(await handler({ action: 'artistSettings:push', ...other, expectedRevision: 1, snapshot: artistSettingsPayload() }), { ok: false, error: 'AUTH_FAILED' });
  const second = await handler({ action: 'artistSettings:push', ...owner, expectedRevision: 1, snapshot: { ...artistSettingsPayload(), artistOrder: ['林俊杰', '周杰伦'], revision: 888, updatedAt: 'client-time' } });
  assert.equal(second.snapshot.revision, 2);
  assert.deepEqual(second.snapshot.artistOrder, ['林俊杰', '周杰伦']);
  assert.notEqual(second.snapshot.updatedAt, 'client-time');
  assert.deepEqual(await handler({ action: 'artistSettings:push', ...owner, expectedRevision: 1, snapshot: artistSettingsPayload() }), { ok: false, error: 'CONFLICT' });
})

test('rejects a non-owner before the global artist settings document exists', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const visitor = { alias: 'VISITOR', password: 'guitar-2026' };
  await handler({ action: 'roadshows:register', ...visitor });

  assert.deepEqual(await handler({
    action: 'artistSettings:push',
    ...visitor,
    expectedRevision: null,
    snapshot: artistSettingsPayload(),
  }), { ok: false, error: 'AUTH_FAILED' });
  assert.equal(store.artistSettings, null);
})

test('artist settings writes hide whether a private workspace exists', async () => {
  const { createHandler } = loadFunction();
  const handler = createHandler(memoryStore());

  assert.deepEqual(await handler({
    action: 'artistSettings:push',
    alias: 'MISSING',
    password: 'guitar-2026',
    expectedRevision: null,
    snapshot: artistSettingsPayload(),
  }), { ok: false, error: 'AUTH_FAILED' });
})

test('production artist settings storage uses the fixed global document transactionally', () => {
  const source = readFileSync(functionPath, 'utf8');

  assert.match(source, /db\.collection\('song_request_artist_settings'\)/);
  assert.match(source, /transaction\.collection\('song_request_artist_settings'\)\.doc\('global'\)/);
  assert.match(source, /saveArtistSettingsAtomically/);
})

test('artist settings datastore failures remain sync failures and never look empty', async () => {
  const readStore = memoryStore();
  readStore.getArtistSettings = async () => { throw new Error('database offline'); };
  const writeStore = memoryStore();
  writeStore.saveArtistSettingsAtomically = async () => { throw new Error('database offline'); };
  const { createHandler } = loadFunction();
  assert.deepEqual(await createHandler(readStore)({ action: 'artistSettings:pull' }), { ok: false, error: 'SYNC_FAILED' });
  const writeHandler = createHandler(writeStore);
  await writeHandler({ action: 'roadshows:register', alias: '2421415030@qq.com', password: 'guitar-2026' });
  assert.deepEqual(await writeHandler({ action: 'artistSettings:push', alias: '2421415030@qq.com', password: 'guitar-2026', expectedRevision: null, snapshot: artistSettingsPayload() }), { ok: false, error: 'SYNC_FAILED' });
})

test('increments and pulls public song request votes', async () => {
  const { createHandler } = loadFunction();
  const handler = createHandler(memoryStore());

  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 1 });
  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 2 });
  assert.deepEqual(await handler({ action: 'votes:pull' }), { ok: true, counts: { 'qing-tian': 2 }, sungCounts: {} });
})

test('only the authenticated owner can move every pending vote into cumulative sung counts', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };
  const visitor = { alias: 'visitor@example.com', password: 'guitar-2026' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...visitor });
  await handler({ action: 'votes:increment', songId: 'qing-tian' });
  await handler({ action: 'votes:increment', songId: 'qing-tian' });
  await handler({ action: 'votes:increment', songId: 'hua-hai' });

  assert.deepEqual(await handler({ action: 'votes:finishAll', ...visitor }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'votes:finishAll', ...owner, password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'votes:finishAll', ...owner }), {
    ok: true, counts: {}, sungCounts: { 'qing-tian': 2, 'hua-hai': 1 },
  });
  assert.deepEqual(await handler({ action: 'votes:pull' }), {
    ok: true, counts: {}, sungCounts: { 'qing-tian': 2, 'hua-hai': 1 },
  });

  await handler({ action: 'votes:increment', songId: 'qing-tian' });
  assert.deepEqual(await handler({ action: 'votes:finishAll', ...owner }), {
    ok: true, counts: {}, sungCounts: { 'qing-tian': 3, 'hua-hai': 1 },
  });
})

test('only the authenticated owner email can publish global featured songs', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };
  const visitor = { alias: 'visitor@example.com', password: 'guitar-2026' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...visitor });

  assert.deepEqual(await handler({ action: 'featuredSongs:pull' }), { ok: true, songIds: null });
  assert.deepEqual(await handler({ action: 'featuredSongs:set', ...visitor, songIds: ['a'] }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'featuredSongs:set', ...owner, password: 'wrong-password', songIds: ['a'] }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'featuredSongs:set', ...owner, songIds: ['c', 'a', 'a'] }), { ok: true, songIds: ['c', 'a'] });
  assert.deepEqual(await handler({ action: 'featuredSongs:pull' }), { ok: true, songIds: ['c', 'a'] });
})

test('validates featured song ids and keeps the pull action public', () => {
  const { validateRequest } = require(validationPath);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };

  assert.deepEqual(validateRequest({ action: 'featuredSongs:pull' }), { action: 'featuredSongs:pull' });
  assert.deepEqual(validateRequest({ action: 'featuredSongs:set', ...owner, songIds: ['a', 'custom:1', 'a'] }), {
    action: 'featuredSongs:set', ...owner, songIds: ['a', 'custom:1'],
  });
  assert.throws(() => validateRequest({ action: 'featuredSongs:set', ...owner, songIds: Array(501).fill('a') }), /INVALID_FEATURED_SONGS/);
})

test('识曲歌库仅允许固定管理员发布并可公开读取', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };
  const visitor = { alias: 'visitor@example.com', password: 'guitar-2026' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...visitor });

  assert.deepEqual(await handler({ action: 'quizLibrary:pull' }), { ok: true, assignments: null });
  assert.deepEqual(await handler({ action: 'quizLibrary:set', ...visitor, assignments: { a: 'warmup' } }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({
    action: 'quizLibrary:set', ...owner, assignments: { a: 'warmup', b: 'hell' },
  }), { ok: true, assignments: { a: 'warmup', b: 'hell' } });
  assert.deepEqual(await handler({ action: 'quizLibrary:pull' }), { ok: true, assignments: { a: 'warmup', b: 'hell' } });
});

test('segments pending and sung vote counts by the owner latest roadshow location while preserving totals', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };
  const roadshow = (id, date, location) => ({
    id, title: id, date, location, updatedAt: `${date}T12:00:00.000Z`, performanceSongs: [], recognitionSongs: [],
  });

  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:save', ...owner, record: roadshow('武鸣场', '2026-09-01', '医大（武鸣）') });
  await handler({ action: 'votes:increment', songId: 'qing-tian' });
  assert.deepEqual(await handler({ action: 'votes:pull', location: '医大（武鸣）' }), { ok: true, counts: { 'qing-tian': 1 }, sungCounts: {} });
  assert.deepEqual(await handler({ action: 'votes:pull', location: '南湖' }), { ok: true, counts: {}, sungCounts: {} });
  assert.deepEqual(await handler({ action: 'votes:pull' }), { ok: true, counts: { 'qing-tian': 1 }, sungCounts: {} });

  await handler({ action: 'votes:finishAll', ...owner });
  assert.deepEqual(await handler({ action: 'votes:pull', location: '医大（武鸣）' }), { ok: true, counts: {}, sungCounts: { 'qing-tian': 1 } });
});

test('识曲歌库校验四档、数量并合并清理后的重复歌曲编号', () => {
  const { validateRequest } = require(validationPath);
  const owner = { alias: '2421415030@qq.com', password: 'guitar-2026' };

  assert.deepEqual(validateRequest({ action: 'quizLibrary:pull' }), { action: 'quizLibrary:pull' });
  assert.deepEqual(validateRequest({
    action: 'quizLibrary:set', ...owner, assignments: { a: 'warmup', ' a ': 'hard', b: 'hell' },
  }), { action: 'quizLibrary:set', ...owner, assignments: { a: 'hard', b: 'hell' } });
  assert.throws(() => validateRequest({ action: 'quizLibrary:set', ...owner, assignments: { a: 'unknown' } }), /INVALID_QUIZ_LIBRARY/);
  assert.throws(() => validateRequest({
    action: 'quizLibrary:set', ...owner,
    assignments: Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`song-${index}`, 'warmup'])),
  }), /INVALID_QUIZ_LIBRARY/);
});

test('publishes only sanitized practice averages to guests without credentials', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const practice = (id, songId, songTitle, score) => ({
    id, kind: 'practice', songId, songTitle, songArtist: '邓紫棋',
    occurredAt: '2026-08-26T12:00:00.000Z', matchScore: score,
    feelings: '私人感受', problems: '私人问题', improvements: '私人计划', updatedAt: '2026-08-26T12:00:00.000Z',
  });

  await handler({ action: 'roadshows:register', ...auth });
  await handler({ action: 'songRecords:saveBatch', ...auth, records: [
    practice('practice-1', 'guang-nian-zhi-wai', '光年之外', 86),
    practice('practice-2', 'guang-nian-zhi-wai', '光年之外', 83),
    practice('practice-3', 'ju-hao', '句号', 80),
  ] });

  const result = await handler({ action: 'songRecords:publicRanking' });
  assert.deepEqual(result, {
    ok: true,
    ranking: [
      { songId: 'guang-nian-zhi-wai', songTitle: '光年之外', songArtist: '邓紫棋', score: 84.5 },
      { songId: 'ju-hao', songTitle: '句号', songArtist: '邓紫棋', score: 80 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(result), /occurredAt|practiceCount|feelings|problems|improvements|updatedAt|workspaceId/);
})

test('protects private roadshows with an alias and password', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);

  assert.deepEqual(await handler({ action: 'roadshows:register', alias: 'JIEYOU', password: 'guitar-2026' }), { ok: true, records: [] });
  assert.deepEqual(await handler({ action: 'roadshows:pull', alias: 'JIEYOU', password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'roadshows:pull', alias: 'JIEYOU', password: 'guitar-2026' }), { ok: true, records: [] });

  const workspace = [...store.workspaces.values()][0];
  assert.notEqual(workspace.passwordHash, 'guitar-2026');
  assert.ok(workspace.passwordSalt);
})

test('saves roadshows and keeps soft-deleted records out of pulls', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const record = {
    id: 'roadshow-1', title: '第一次路演', date: '2026-08-25', updatedAt: '2026-08-25T11:00:00.000Z',
    location: '解忧杂货铺', weather: '晴',
    performanceSongs: [{ id: 'catalog:qing-tian', catalogId: 'qing-tian', title: '晴天', artist: '周杰伦', source: 'catalog' }],
    recognitionSongs: [{ id: 'manual:test', title: '测试歌曲', artist: '', source: 'manual' }],
  };

  await handler({ action: 'roadshows:register', ...auth });
  assert.deepEqual(await handler({ action: 'roadshows:save', ...auth, record }), { ok: true, record: { ...record, updatedAt: '2026-08-25T12:00:00.000Z' } });
  assert.equal((await handler({ action: 'roadshows:pull', ...auth })).records.length, 1);
  assert.deepEqual(await handler({ action: 'roadshows:delete', ...auth, id: 'roadshow-1' }), { ok: true });
  assert.deepEqual(await handler({ action: 'roadshows:pull', ...auth }), { ok: true, records: [] });

  const workspace = [...store.workspaces.values()][0];
  assert.equal(workspace.roadshows[0].deletedAt, '2026-08-25T12:00:00.000Z');
})

test('publishes a quiz ranking from roadshow answers without exposing private workspaces', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const first = { alias: 'JIEYOU', password: 'guitar-2026' };
  const second = { alias: 'PLAYER', password: 'guitar-2026' };
  const song = (id, title, artist, correct, attempt, participantName) => ({
    id: attempt, catalogId: id, title, artist, correct, answeredAt: `2026-09-01T12:00:0${attempt.slice(-1)}.000Z`,
    ...(participantName ? { participantName } : {}),
  });
  const roadshow = (id, recognitionAttempts, location = '医大（武鸣）') => ({
    id, title: id, date: '2026-09-01', location, updatedAt: '2026-09-01T12:00:00.000Z',
    performanceSongs: [], recognitionSongs: [], recognitionAttempts,
  });

  await handler({ action: 'roadshows:register', ...first });
  await handler({ action: 'roadshows:register', ...second });
  await handler({ action: 'roadshows:save', ...first, record: roadshow('第一场', [
    song('a', '晴天', '周杰伦', true, 'attempt-1', '小安'),
    song('a', '晴天', '周杰伦', false, 'attempt-2', '小安'),
    song('b', '江南', '林俊杰', true, 'attempt-3', 'ALICE'),
  ]) });
  await handler({ action: 'roadshows:save', ...second, record: roadshow('第二场', [
    song('a', '晴天', '周杰伦', true, 'attempt-4', 'alice'),
  ], '南湖') });

  const result = await handler({ action: 'roadshows:publicQuizRanking' });
  assert.deepEqual(result, { ok: true, ranking: [
    { songId: 'b', songTitle: '江南', songArtist: '林俊杰', answerCount: 1, correctCount: 1, accuracy: 100 },
    { songId: 'a', songTitle: '晴天', songArtist: '周杰伦', answerCount: 3, correctCount: 2, accuracy: 66.7 },
  ], participantRanking: [
    { participantName: 'ALICE', score: 2, answerCount: 2, correctCount: 2, accuracy: 100 },
    { participantName: '小安', score: 1, answerCount: 2, correctCount: 1, accuracy: 50 },
  ] });
  assert.doesNotMatch(JSON.stringify(result), /alias|password|workspaceId|answeredAt/);
  const wuming = await handler({ action: 'roadshows:publicQuizRanking', location: '医大（武鸣）' });
  assert.deepEqual(wuming.ranking, [
    { songId: 'b', songTitle: '江南', songArtist: '林俊杰', answerCount: 1, correctCount: 1, accuracy: 100 },
    { songId: 'a', songTitle: '晴天', songArtist: '周杰伦', answerCount: 2, correctCount: 1, accuracy: 50 },
  ]);
})

test('participant ranking applies every tie-break and caps results at 500', () => {
  const { buildPublicQuizParticipantRanking } = loadFunction();
  const attempt = (participantName, correct, index) => ({ id: `a-${index}`, title: '歌', artist: '', correct, participantName, answeredAt: `2026-09-01T12:${String(index).padStart(2, '0')}:00.000Z` });
  const ranking = buildPublicQuizParticipantRanking([{ recognitionAttempts: [
    attempt('Alpha', true, 1), attempt('Alpha', true, 2),
    attempt('Beta', true, 3), attempt('Beta', true, 4), attempt('Beta', false, 5),
    attempt('Gamma', true, 6), attempt('Gamma', true, 7), attempt('Gamma', false, 8),
  ] }]);
  assert.deepEqual(ranking.map((item) => item.participantName), ['Alpha', 'Beta', 'Gamma']);
  const capped = buildPublicQuizParticipantRanking([{ recognitionAttempts: Array.from({ length: 501 }, (_, index) => attempt(`用户${String(index).padStart(3, '0')}`, true, index)) }]);
  assert.equal(capped.length, 500);
});

test('validates private song practice and roadshow record payloads', () => {
  const { validateRequest } = require(validationPath);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const practice = {
    id: 'practice-1', kind: 'practice', songId: 'qing-tian', songTitle: '晴天', songArtist: '周杰伦',
    occurredAt: '2026-08-25T10:00:00.000Z', matchScore: 88,
    feelings: '适合', problems: '', improvements: '慢练', updatedAt: '2026-08-25T10:00:00.000Z',
  };

  assert.equal(validateRequest({ action: 'songRecords:save', ...auth, record: practice }).record.matchScore, 88);
  assert.equal('durationMinutes' in validateRequest({ action: 'songRecords:save', ...auth, record: { ...practice, durationMinutes: 30 } }).record, false);
  assert.equal(validateRequest({ action: 'songRecords:save', ...auth, record: { ...practice, matchScore: 70 } }).record.matchScore, 70);
  assert.deepEqual(validateRequest({ action: 'songRecords:save', ...auth, record: { ...practice, feelings: '', problems: '', improvements: '' } }).record.feelings, '');
  assert.throws(() => validateRequest({ action: 'songRecords:save', ...auth, record: { ...practice, matchScore: 69 } }), /INVALID_SONG_RECORD/);
  assert.throws(() => validateRequest({ action: 'songRecords:save', ...auth, record: { ...practice, kind: 'roadshow', audienceName: '', feedback: '' } }), /INVALID_SONG_RECORD/);
  assert.equal(validateRequest({ action: 'songRecords:saveBatch', ...auth, records: [practice, { ...practice, id: 'practice-2' }] }).records.length, 2);
  assert.throws(() => validateRequest({ action: 'songRecords:saveBatch', ...auth, records: [] }), /INVALID_SONG_RECORD/);
  assert.throws(() => validateRequest({ action: 'songRecords:saveBatch', ...auth, records: Array.from({ length: 51 }, (_, index) => ({ ...practice, id: `practice-${index}` })) }), /INVALID_SONG_RECORD/);
})

test('batch saves daily practices after one authentication', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const practice = (id, score) => ({
    id, kind: 'practice', songId: id, songTitle: id, songArtist: '',
    occurredAt: '2026-08-26T12:00:00.000Z', matchScore: score,
    feelings: '', problems: '', improvements: '', updatedAt: '2026-08-26T12:00:00.000Z',
  });

  await handler({ action: 'roadshows:register', ...auth });
  const result = await handler({ action: 'songRecords:saveBatch', ...auth, records: [practice('a', 80), practice('b', 90)] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.records.map((record) => [record.id, record.matchScore]), [['a', 80], ['b', 90]]);
  assert.equal((await handler({ action: 'songRecords:pull', ...auth })).records.length, 2);
  assert.match(readFileSync(functionPath, 'utf8'), /\.skip\(offset\)\.limit\(pageSize\)/);
})

test('soft delete strips the CloudBase reserved document id before writing', () => {
  const { buildSoftDeletedSongRecord } = loadFunction();
  const deletedAt = '2026-08-26T01:00:00.000Z';
  const current = { _id: 'cloud-document-id', id: 'practice-1', workspaceId: 'workspace-1', updatedAt: 'old' };

  assert.equal(typeof buildSoftDeletedSongRecord, 'function');
  assert.deepEqual(buildSoftDeletedSongRecord(current, 'workspace-1', deletedAt), {
    id: 'practice-1', workspaceId: 'workspace-1', deletedAt, updatedAt: deletedAt,
  });
  assert.throws(() => buildSoftDeletedSongRecord(current, 'workspace-2', deletedAt), /NOT_FOUND/);
  assert.match(readFileSync(functionPath, 'utf8'), /ref\.set\(buildSoftDeletedSongRecord\(current, workspaceId, deletedAt\)\)/);
})

test('roadshow save strips the CloudBase reserved workspace id before writing', () => {
  const { buildWritableWorkspace } = loadFunction();
  const workspace = { _id: 'cloud-document-id', version: 1, alias: 'JIEYOU', roadshows: [] };

  assert.equal(typeof buildWritableWorkspace, 'function');
  assert.deepEqual(buildWritableWorkspace(workspace), { version: 1, alias: 'JIEYOU', roadshows: [] });
  assert.match(readFileSync(functionPath, 'utf8'), /setWorkspace: \(id, value\) => workspaces\.doc\(id\)\.set\(buildWritableWorkspace\(value\)\)/);
})

test('keeps private song records isolated, independent, and soft-deleted', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const otherAuth = { alias: 'OTHER', password: 'guitar-2026' };
  const practice = {
    id: 'practice-1', kind: 'practice', songId: 'qing-tian', songTitle: '晴天', songArtist: '周杰伦',
    occurredAt: '2026-08-25T10:00:00.000Z', matchScore: 88,
    feelings: '适合', problems: '', improvements: '慢练', updatedAt: '2026-08-25T10:00:00.000Z',
  };
  const roadshow = {
    id: 'feedback-1', kind: 'roadshow', songId: 'qing-tian', songTitle: '晴天', songArtist: '周杰伦',
    occurredAt: '2026-08-25T11:00:00.000Z', audienceName: '小林', feedback: '副歌很有共鸣', updatedAt: '2026-08-25T11:00:00.000Z',
  };

  await handler({ action: 'roadshows:register', ...auth });
  await handler({ action: 'roadshows:register', ...otherAuth });
  assert.equal((await handler({ action: 'songRecords:save', ...auth, record: practice })).record.updatedAt, '2026-08-25T12:00:00.000Z');
  assert.equal((await handler({ action: 'songRecords:save', ...auth, record: roadshow })).record.id, 'feedback-1');
  assert.equal((await handler({ action: 'songRecords:pull', ...auth })).records.length, 2);
  assert.deepEqual(await handler({ action: 'songRecords:pull', ...auth, password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'songRecords:pull', ...otherAuth }), { ok: true, records: [] });

  const stored = [...store.songRecords.values()];
  assert.ok(stored.every((record) => record.workspaceId && record.songTitle === '晴天' && record.songArtist === '周杰伦'));
  assert.deepEqual(await handler({ action: 'songRecords:delete', ...auth, id: 'practice-1' }), { ok: true });
  assert.deepEqual((await handler({ action: 'songRecords:pull', ...auth })).records.map((record) => record.id), ['feedback-1']);
  assert.deepEqual(await handler({ action: 'songRecords:save', ...auth, record: practice }), { ok: false, error: 'NOT_FOUND' });
})
