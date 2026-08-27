import { useMemo } from 'react';
import MessageBarrage from '../StarrySky/MessageBarrage';
import type { Song } from './songCatalog';

interface PopularSongBarrageProps {
  songs: Song[];
  intimate: boolean;
  fill: boolean;
  onSelectSong: (song: Song) => void;
  immersive?: boolean;
}

const COLORS = ['#fca5a5', '#fde68a', '#99f6e4', '#bae6fd', '#ddd6fe', '#fbcfe8', '#bbf7d0'];
const colorForSong = (song: Song) => {
  const hash = [...song.id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
};

const PopularSongBarrage = ({ songs, intimate, fill, onSelectSong, immersive = false }: PopularSongBarrageProps) => {
  const songById = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const messages = useMemo(() => songs.map((song) => ({
    id: song.id,
    message: song.title,
    nickname: '',
    createdAt: '',
    color: colorForSong(song),
  })), [songs]);

  return (
    <section className={`popular-song-board ${immersive ? 'popular-song-board--immersive' : ''}`} aria-label="热门歌曲弹幕">
      <MessageBarrage
        messages={messages}
        immersive={immersive}
        intimate={intimate}
        fill={fill}
        simple
        ariaLabel="热门歌曲弹幕"
        onSelectMessage={(songId) => {
          const song = songById.get(songId);
          if (song) onSelectSong(song);
        }}
      />
      <p className="sr-only">选择任意歌曲可查看详情并点歌。</p>
    </section>
  );
};

export default PopularSongBarrage;
