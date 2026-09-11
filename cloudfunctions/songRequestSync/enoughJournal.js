const validateEntries = (entries) => {
  const fail = () => { throw new Error('INVALID_JOURNAL'); };
  if (!Array.isArray(entries) || entries.length > 200 || Buffer.byteLength(JSON.stringify(entries), 'utf8') > 600000) fail();
  const ids = new Set();
  const clean = entries.map(entry => {
    if (!entry || !['possession', 'desire'].includes(entry.kind) || !['wanting', 'paused', 'released', 'owned'].includes(entry.status)
      || (entry.kind === 'possession' && entry.status !== 'owned')) fail();
    const result = { kind: entry.kind, status: entry.status };
    for (const [field, limit] of Object.entries({ id: 100, title: 100, category: 30, benefit: 1000, trigger: 1000, need: 1000, reflection: 1000, linkedId: 100, createdAt: 40, updatedAt: 40 })) {
      if (typeof entry[field] !== 'string' || entry[field].length > limit) fail();
      result[field] = entry[field].trim();
    }
    if (!result.id || !result.title || ids.has(result.id) || !Number.isFinite(Date.parse(result.createdAt)) || !Number.isFinite(Date.parse(result.updatedAt))) fail();
    ids.add(result.id);
    return result;
  });
  for (const entry of clean) if (entry.linkedId && (entry.linkedId === entry.id || !clean.some(item => item.id === entry.linkedId && (item.kind === 'possession' || item.status === 'owned')))) fail();
  return clean;
};

const saveJournal = (db, ownerId, revision, entries) => db.runTransaction(async transaction => {
  const ref = transaction.collection('song_request_workspaces').doc(`enough-${ownerId}`);
  let current;
  try {
    const result = await ref.get();
    current = Array.isArray(result.data) ? result.data[0] : result.data;
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error?.message))) throw error;
  }
  if ((current?.revision ?? 0) !== revision) throw new Error('CONFLICT');
  const snapshot = { revision: revision + 1, entries, updatedAt: new Date().toISOString() };
  await ref.set(snapshot);
  return snapshot;
});
module.exports = { validateEntries, saveJournal };
