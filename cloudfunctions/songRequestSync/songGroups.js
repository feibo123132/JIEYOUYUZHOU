const validateSongGroups = (groups) => {
  const fail = () => { throw new Error('INVALID_SONG_GROUPS'); };
  if (!Array.isArray(groups) || groups.length > 50) fail();
  const ids = new Set();
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  return groups.map(group => {
    if (!group || !text(group.id, 100) || ids.has(group.id) || !text(group.name, 60)
      || typeof group.description !== 'string' || group.description.length > 1000
      || !Array.isArray(group.songIds) || !group.songIds.length || group.songIds.length > 50
      || group.songIds.some(id => !text(id, 100)) || new Set(group.songIds).size !== group.songIds.length) fail();
    ids.add(group.id);
    return { id: group.id, name: group.name.trim(), description: group.description.trim(), songIds: [...group.songIds] };
  });
};

const saveSongGroupsAtomically = (db, documentId, expectedRevision, groups) => db.runTransaction(async transaction => {
  const ref = transaction.collection('song_request_workspaces').doc(documentId);
  let current;
  try {
    const result = await ref.get();
    current = Array.isArray(result.data) ? result.data[0] : result.data;
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error?.message))) throw error;
  }
  if ((current?.revision ?? 0) !== expectedRevision) throw new Error('CONFLICT');
  const snapshot = { revision: expectedRevision + 1, groups, updatedAt: new Date().toISOString() };
  await ref.set(snapshot);
  return snapshot;
});
module.exports = { validateSongGroups, saveSongGroupsAtomically };
