const crypto = require('node:crypto');
const { validateRequest } = require('./validation');

const PUBLIC_ERRORS = new Set([
  'INVALID_ACTION', 'PAYLOAD_TOO_LARGE', 'INVALID_SONG_ID', 'INVALID_ALIAS', 'INVALID_PASSWORD',
  'INVALID_SONG', 'INVALID_SONG_LIST', 'INVALID_RECORD', 'ALREADY_REGISTERED', 'NOT_REGISTERED',
  'INVALID_SONG_RECORD', 'AUTH_FAILED', 'NOT_FOUND',
]);

const workspaceId = (alias) => crypto.createHash('sha256').update(alias.trim().toLocaleLowerCase()).digest('hex');
const passwordHash = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const songRecordDocumentId = (workspace, record) => crypto.createHash('sha256').update(`${workspace}:${record}`).digest('hex');
const publicSongRecord = ({ workspaceId: _workspaceId, deletedAt: _deletedAt, _id: _documentId, ...record }) => record;
const buildSoftDeletedSongRecord = (current, workspaceId, deletedAt) => {
  if (!current || current.workspaceId !== workspaceId || current.deletedAt) throw new Error('NOT_FOUND');
  const { _id: _documentId, ...writableRecord } = current;
  return { ...writableRecord, deletedAt, updatedAt: deletedAt };
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
      if (request.action === 'votes:pull') return { ok: true, counts: await store.getVotes() };
      if (request.action === 'votes:increment') {
        return { ok: true, count: await store.incrementVote(request.songId) };
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

      const { id, workspace } = await authenticate(store, request.alias, request.password);
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
    const command = db.command;
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
      setWorkspace: (id, value) => workspaces.doc(id).set(value),
      async getVotes() {
        const result = await votes.limit(100).get();
        return Object.fromEntries((result.data || []).map((item) => [item._id, Number(item.count) || 0]));
      },
      async incrementVote(songId) {
        const ref = votes.doc(songId);
        try {
          await ref.update({ count: command.inc(1), updatedAt: new Date().toISOString() });
        } catch (error) {
          if (!/not found|does not exist/i.test(String(error?.message))) throw error;
          await ref.set({ count: 1, updatedAt: new Date().toISOString() });
        }
        const result = await ref.get();
        const value = Array.isArray(result.data) ? result.data[0] : result.data;
        return Number(value?.count) || 1;
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
exports.buildSoftDeletedSongRecord = buildSoftDeletedSongRecord;
