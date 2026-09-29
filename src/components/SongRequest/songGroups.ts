export interface SongMedley {
  id: string;
  name: string;
  chordProgression: string;
  notes: string;
  songIds: string[];
  lyrics: string;
}

export interface SongGroup {
  id: string;
  name: string;
  description: string;
  songIds: string[];
  medleys?: SongMedley[];
}

// 仅为截图中的旧歌组补上已确认的串烧关系；显式空数组表示用户已删除链。
export const initializeSongGroupMedleys = (group: SongGroup, songs: Array<{ id: string; title: string }>): SongGroup => {
  if (group.medleys !== undefined || !group.name.includes('万能和弦')) return group;
  const titles = ['再见太难', '最长的电影', '修炼爱情'];
  const songIds = titles.map(title => group.songIds.find(id => songs.some(song => song.id === id && song.title === title)));
  if (songIds.some(id => !id)) return group;
  return {
    ...group,
    medleys: [{ id: '4536251-chorus', name: '高潮串烧', chordProgression: '4536251', notes: '', songIds: songIds as string[], lyrics: '' }],
  };
};
export interface SongGroupsSnapshot {
  revision: number;
  groups: SongGroup[];
}
