const legacyNotebook = (records = []) => {
  const pages = records.filter(record => !record.deletedAt && typeof record.feelings === 'string' && record.feelings.trim())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(record => ({ id: `legacy:${record.id}`, title: `${record.date} · ${record.title}`, text: record.feelings }));
  return { version: 1, revision: 0, pages: pages.length ? pages : [{ id: 'page-1', title: '', text: '' }] };
};

const validateNotebookPages = (pages) => {
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new Error('INVALID_NOTEBOOK');
  const ids = new Set();
  return pages.map(page => {
    if (!page || typeof page.id !== 'string' || !page.id.trim() || page.id.length > 100 || ids.has(page.id)
      || typeof page.title !== 'string' || page.title.length > 100
      || typeof page.text !== 'string' || page.text.length > 10000) throw new Error('INVALID_NOTEBOOK');
    ids.add(page.id);
    return { id: page.id, title: page.title, text: page.text };
  });
};

const saveNotebookAtomically = (db, documentId, expectedRevision, pages) => db.runTransaction(async transaction => {
  const ref = transaction.collection('song_request_workspaces').doc(documentId);
  let current;
  try {
    const result = await ref.get();
    current = Array.isArray(result.data) ? result.data[0] : result.data;
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error?.message))) throw error;
  }
  if ((current?.revision ?? 0) !== expectedRevision) throw new Error('CONFLICT');
  const notebook = { version: 1, revision: expectedRevision + 1, pages, updatedAt: new Date().toISOString() };
  await ref.set(notebook);
  return notebook;
});

module.exports = { legacyNotebook, validateNotebookPages, saveNotebookAtomically };
