const crypto = require('node:crypto');

const GAME_ACTIONS = new Set(['create', 'current', 'pull', 'start', 'open', 'lock', 'reveal', 'end', 'submit']);
const ACTIVE_GAME_DOCUMENT_ID = 'listening-game-active';
const roomDocumentId = id => `listening-game-${id}`;
const answerDocumentId = (roomId, roundId, uid) => `listening-answer-${crypto.createHash('sha256').update(JSON.stringify([roomId, roundId, uid])).digest('hex')}`;
const gameId = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) throw new Error('INVALID_GAME');
  return value;
};
const songId = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('INVALID_GAME');
  return value.trim();
};
function validateGameRequest(event, credentials = {}) {
  const action = event.action.slice('listeningGame:'.length);
  if (!GAME_ACTIONS.has(action)) throw new Error('INVALID_ACTION');
  const request = { action: event.action, ...credentials };
  if (!['create', 'current'].includes(action)) request.roomId = gameId(event.roomId);
  if (!['create', 'current', 'pull'].includes(action)) {
    request.roundId = event.roundId === null ? null : gameId(event.roundId);
    if (action !== 'start' && !request.roundId) throw new Error('INVALID_GAME');
  }
  if (action === 'start' || action === 'submit') request.songId = songId(event.songId);
  return request;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function selectGameOptions(songs, correctId) {
  const pool = [...new Map(songs.map(s => [s.id, { id: s.id, title: s.title, artist: s.artist }])).values()];
  const answer = pool.find(s => s.id === correctId);
  if (!answer) throw new Error('INVALID_QUIZ_SONG');
  if (pool.length < 10) throw new Error('INSUFFICIENT_QUIZ_SONGS');
  return shuffle([answer, ...shuffle(pool.filter(s => s.id !== correctId)).slice(0, 9)]);
}
const readDocument = async ref => {
  try {
    const result = await ref.get();
    const data = (Array.isArray(result.data) ? result.data[0] : result.data) ?? null;
    if (!data) return null;
    const { _id, ...value } = data;
    return value;
  } catch (error) {
    if (/not found|does not exist/i.test(String(error?.message))) return null;
    throw error;
  }
};
function publicGameRoom(room, submission, owner = false) {
  if (!room) throw new Error('GAME_NOT_FOUND');
  const revealed = ['revealed', 'ended'].includes(room.phase);
  return {
    id: room.id, roundId: room.roundId, roundNumber: room.roundNumber, phase: room.phase,
    options: room.options, revision: room.revision, submissionCount: room.submissionCount,
    ...(owner || revealed ? { answerSongId: room.answerSongId, counts: room.counts } : {}),
    submission: submission ? { songId: submission.songId, submittedAt: submission.submittedAt } : null,
  };
}
async function readListeningGame(store, roomId, uid, owner) {
  const room = await store.getWorkspace(roomDocumentId(roomId));
  if (!room) throw new Error('GAME_NOT_FOUND');
  const submission = uid && room.roundId ? await store.getWorkspace(answerDocumentId(roomId, room.roundId, uid)) : null;
  return publicGameRoom(room, submission, owner);
}

async function readCurrentListeningGame(store, uid, owner) {
  const active = await store.getWorkspace(ACTIVE_GAME_DOCUMENT_ID);
  if (!active?.roomId) return null;
  return readListeningGame(store, gameId(active.roomId), uid, owner);
}

function mutateListeningGame(db, request, uid, now) {
  const action = request.action.slice('listeningGame:'.length);
  const roomId = action === 'create' ? crypto.randomBytes(16).toString('hex') : request.roomId;
  // 题目与提交记录在同一个事务中读写，使暂停、换题与并发提交互斥。
  return db.runTransaction(async transaction => {
    const collection = transaction.collection('song_request_workspaces');
    const ref = collection.doc(roomDocumentId(roomId));
    const current = await readDocument(ref);
    if (action === 'create') {
      if (current) throw new Error('CONFLICT');
      const activeRef = collection.doc(ACTIVE_GAME_DOCUMENT_ID);
      await readDocument(activeRef);
      const room = { id: roomId, roundId: null, roundNumber: 0, phase: 'waiting', options: [], counts: {},
        answerSongId: null, submissionCount: 0, revision: 1, createdAt: now, updatedAt: now };
      await ref.set(room);
      // 与房间一起提交，固定网址不会指向尚未创建成功的场次。
      await activeRef.set({ roomId, updatedAt: now });
      return publicGameRoom(room, null, true);
    }
    if (!current) throw new Error('GAME_NOT_FOUND');
    if (current.roundId !== request.roundId) throw new Error('STALE_GAME_ROUND');
    if (action === 'submit') {
      if (!uid) throw new Error('AUTH_FAILED');
      const answerRef = collection.doc(answerDocumentId(roomId, current.roundId, uid));
      const previous = await readDocument(answerRef);
      // 网络重试保持第一次答案，每个云端匿名身份每轮只能提交一次。
      if (previous) return publicGameRoom(current, previous);
      if (current.phase !== 'open') throw new Error('SUBMISSIONS_CLOSED');
      if (!current.options.some(s => s.id === request.songId)) throw new Error('INVALID_QUIZ_SONG');
      const submission = { songId: request.songId, submittedAt: now };
      const next = { ...current, counts: { ...current.counts, [request.songId]: (current.counts[request.songId] ?? 0) + 1 },
        submissionCount: current.submissionCount + 1, revision: current.revision + 1, updatedAt: now };
      await answerRef.set(submission);
      await ref.set(next);
      return publicGameRoom(next, submission);
    }
    let next = { ...current, revision: current.revision + 1, updatedAt: now };
    if (action === 'start') {
      if (!['waiting', 'revealed'].includes(current.phase)) throw new Error('INVALID_GAME_PHASE');
      next = { ...next, roundId: crypto.randomBytes(16).toString('hex'), roundNumber: current.roundNumber + 1,
        phase: 'listening', answerSongId: request.songId, options: request.options, counts: {}, submissionCount: 0 };
    } else {
      const transitions = { open: ['listening'], lock: ['open'], reveal: ['listening', 'open'], end: ['listening', 'open', 'revealed'] };
      if (!transitions[action]?.includes(current.phase)) throw new Error('INVALID_GAME_PHASE');
      next.phase = { open: 'open', lock: 'listening', reveal: 'revealed', end: 'ended' }[action];
    }
    await ref.set(next);
    return publicGameRoom(next, null, true);
  });
}

module.exports = { validateGameRequest, selectGameOptions, readListeningGame, readCurrentListeningGame, mutateListeningGame };
