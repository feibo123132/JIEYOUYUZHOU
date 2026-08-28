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
  return {
    workspaces,
    votes,
    songRecords,
    getWorkspace: async (id) => workspaces.get(id) ?? null,
    setWorkspace: async (id, value) => { workspaces.set(id, structuredClone(value)); },
    getVotes: async () => Object.fromEntries(votes),
    incrementVote: async (songId) => {
      const count = (votes.get(songId) ?? 0) + 1;
      votes.set(songId, count);
      return count;
    },
    getSongRecords: async (workspaceId) => [...songRecords.values()]
      .filter((record) => record.workspaceId === workspaceId && !record.deletedAt)
      .map((record) => structuredClone(record)),
    getAllSongRecords: async () => [...songRecords.values()].map((record) => structuredClone(record)),
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
    now: () => '2026-08-25T12:00:00.000Z',
  };
}

test('validates public and private actions without rejecting platform metadata', () => {
  assert.ok(existsSync(validationPath), 'songRequestSync validation must exist');
  const { validateRequest } = require(validationPath);

  assert.deepEqual(validateRequest({ action: 'votes:increment', songId: 'qing-tian', userInfo: { uid: 'u1' } }), {
    action: 'votes:increment', songId: 'qing-tian',
  });
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: '', password: '123456' }), /INVALID_ALIAS/);
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: 'JIEYOU', password: '123' }), /INVALID_PASSWORD/);
})

test('increments and pulls public song request votes', async () => {
  const { createHandler } = loadFunction();
  const handler = createHandler(memoryStore());

  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 1 });
  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 2 });
  assert.deepEqual(await handler({ action: 'votes:pull' }), { ok: true, counts: { 'qing-tian': 2 } });
})

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
