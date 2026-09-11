export type DesireStatus = 'wanting' | 'paused' | 'released' | 'owned';
export interface JournalEntry {
  id: string;
  kind: 'possession' | 'desire';
  title: string;
  category: string;
  benefit: string;
  trigger: string;
  need: string;
  reflection: string;
  status: DesireStatus;
  linkedId: string;
  createdAt: string;
  updatedAt: string;
}
export interface JournalSnapshot { revision: number; entries: JournalEntry[] }
export const desireStatuses: Record<DesireStatus, string> = { wanting: '仍然想要', paused: '暂时放一放', released: '已经放下', owned: '已经拥有' };
export const isOwned = (entry: JournalEntry) => entry.kind === 'possession' || entry.status === 'owned';
export const newEntry = (kind: JournalEntry['kind']): JournalEntry => ({
  id: crypto.randomUUID(), kind, title: '', category: '', benefit: '', trigger: '', need: '', reflection: '', linkedId: '',
  status: kind === 'possession' ? 'owned' : 'wanting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
