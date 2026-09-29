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
    const result = { id: group.id, name: group.name.trim(), description: group.description.trim(), songIds: [...group.songIds] };
    if (group.medleys !== undefined) {
      if (!Array.isArray(group.medleys) || group.medleys.length > 10) fail();
      const medleyIds = new Set();
      result.medleys = group.medleys.map(medley => {
        if (!medley || !text(medley.id, 100) || medleyIds.has(medley.id) || !text(medley.name, 60)
          || typeof medley.chordProgression !== 'string' || medley.chordProgression.length > 80
          || typeof medley.notes !== 'string' || medley.notes.length > 1000
          || typeof medley.lyrics !== 'string' || medley.lyrics.length > 12000
          || !Array.isArray(medley.songIds) || medley.songIds.length < 2 || medley.songIds.length > 50
          || medley.songIds.some(id => !group.songIds.includes(id))
          || new Set(medley.songIds).size !== medley.songIds.length) fail();
        medleyIds.add(medley.id);
        return { id: medley.id, name: medley.name.trim(), chordProgression: medley.chordProgression.trim(),
          notes: medley.notes.trim(), songIds: [...medley.songIds], lyrics: medley.lyrics.trim() };
      });
    }
    return result;
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
  // 旧页面不认识 medleys 字段；保存组内排序时保留已存的链和歌词。
  // 新页面显式发送 [] 才表示删除全部链；移除链内歌曲需先处理链。
  const preservedGroups = groups.map(group => {
    const existing = current?.groups?.find(item => item.id === group.id);
    return group.medleys === undefined && existing?.medleys !== undefined ? { ...group, medleys: existing.medleys } : group;
  });
  const snapshot = { revision: expectedRevision + 1, groups: validateSongGroups(preservedGroups), updatedAt: new Date().toISOString() };
  await ref.set(snapshot);
  return snapshot;
});
module.exports = { validateSongGroups, saveSongGroupsAtomically };
