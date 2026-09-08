export interface NotebookPage { id: string; title: string; text: string }
export interface FeelingsNotebook { version: 1; revision: number; pages: NotebookPage[]; updatedAt?: string }
export interface NotebookDraft { notebook: FeelingsNotebook; dirty: boolean; pageId: string }
export const notebookCacheKey = (alias: string) => `jieyou-feelings-notebook-v1:${encodeURIComponent(alias.trim().toLocaleLowerCase())}`;
export const mergeNotebookPages = (cloud: NotebookPage[], local: NotebookPage[]) => {
  const pages = [...cloud];
  for (const page of local) {
    const existing = pages.find(p => p.id === page.id);
    if (existing?.text === page.text && existing?.title === page.title) continue;
    pages.push(existing ? { ...page, id: `draft:${crypto.randomUUID()}`, title: `${page.title || '未命名'} · 本地草稿`.slice(0, 100) } : page);
  }
  return pages;
};
export const searchNotebook = (pages: NotebookPage[], query: string) => {
  const needle = query.trim().toLocaleLowerCase();
  const hits: { pageId: string; pageIndex: number; start: number; end: number; preview: string }[] = [];
  if (!needle) return hits;
  pages.forEach((page, pageIndex) => {
    const text = page.text.toLocaleLowerCase();
    let start = text.indexOf(needle);
    while (start !== -1) {
      hits.push({ pageId: page.id, pageIndex, start, end: start + needle.length, preview: page.text.slice(Math.max(0, start - 15), start + needle.length + 35) });
      start = text.indexOf(needle, start + needle.length);
    }
  });
  return hits;
};

export const readNotebookDraft = (storage: Pick<Storage, 'getItem'>, alias: string): NotebookDraft | null => {
  try {
    const value = JSON.parse(storage.getItem(notebookCacheKey(alias)) ?? 'null') as NotebookDraft | null;
    if (!value || value.notebook.version !== 1 || !Number.isInteger(value.notebook.revision)
      || !Array.isArray(value.notebook.pages) || !value.notebook.pages.length
      || !value.notebook.pages.every(p => typeof p.id === 'string' && typeof p.title === 'string' && typeof p.text === 'string')
      || new Set(value.notebook.pages.map(p => p.id)).size !== value.notebook.pages.length) return null;
    return value;
  } catch { return null; }
};
