export interface SongGroup {
  id: string;
  name: string;
  description: string;
  songIds: string[];
}
export interface SongGroupsSnapshot {
  revision: number;
  groups: SongGroup[];
}
