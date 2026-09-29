import assert from 'node:assert/strict';
import test from 'node:test';
import { SONGS } from '../src/components/SongRequest/songCatalog.ts';
import {
  CATALOG_STORAGE_KEY, CATALOG_VERSION, loadEditableCatalog, removeCatalogSong,
  upgradeEditableCatalog,
} from '../src/components/SongRequest/songRequest.ts';

const requestedSongs = [
  ['一点点', '周杰伦'], ['说好不哭', '周杰伦'], ['一直很安静', '阿桑'],
  ['可不可以', '张紫豪'], ['下雨天', '南拳妈妈'], ['知我', '哦漏'],
  ['泡沫', '邓紫棋'], ['画', '邓紫棋'], ['三国恋', 'TANK'],
  ['你曾是少年', 'S.H.E'], ['坏女孩', '徐良、小凌'], ['冷夜', '陈默之'],
  ['苏公堤', '杨一歌'], ['迷人的危险', 'Dance Flow'], ['入画江南', '黄龄'],
  ['给你呀', '蒋小呢'], ['少一点天分', '孙盛希'], ['Young and Beautiful', 'Lana Del Rey'],
  ['想你时风起', '单依纯'], ['我多想说再见啊', '柯立可'],
  ['乌兰巴托的夜', '蒋敦豪'], ['赤伶', 'HITA'], ['游京', '海伦'], ['至少还有你', '林忆莲'],
];

test('图片清单中的24首歌曲均归入对应歌手并带有独立描写', () => {
  assert.equal(requestedSongs.length, 24);
  const comments = requestedSongs.map(([title, artist]) => {
    const matches = SONGS.filter(song => song.title === title && song.artist === artist);
    assert.equal(matches.length, 1, `${artist}：${title}`);
    assert.ok(matches[0].hotComment?.trim(), `${title}需要描写`);
    return matches[0].hotComment;
  });
  assert.equal(new Set(comments).size, 24);
  assert.equal(new Set(SONGS.map(song => song.id)).size, SONGS.length);
});

test('第十版本地及云端曲库均补齐24首歌，保留原有编辑、排序和删除', () => {
  const edited = { ...SONGS[0], title: '我的晴天', hotComment: '自己的描写' };
  const custom = { id: 'custom:kept', title: '自定义歌曲', artist: '自定义歌手', category: '华语流行', featured: false };
  const existingRequest = { id: 'custom:yi-dian-dian', title: '一点点', artist: '周杰伦', category: '华语流行', featured: false, hotComment: '保留我的描写' };
  const previous = { version: 10, artists: ['自定义歌手', '周杰伦'], songs: [custom, edited, existingRequest] };
  const upgraded = upgradeEditableCatalog(previous, SONGS);
  assert.equal(upgraded.version, CATALOG_VERSION);
  assert.ok(upgraded.version > previous.version);
  assert.deepEqual(upgraded.songs.slice(0, 3), previous.songs);
  assert.deepEqual(upgraded.artists.slice(0, 2), previous.artists);
  for (const [title, artist] of requestedSongs) {
    assert.equal(upgraded.songs.filter(song => song.title === title && song.artist === artist).length, 1);
    assert.ok(upgraded.artists.includes(artist));
  }
  // 上一批被用户删除的歌，不应因本次新增再次恢复。
  assert.equal(upgraded.songs.some(song => song.id === 'rny-hou-lai'), false);
  const local = loadEditableCatalog({ getItem: key => key === CATALOG_STORAGE_KEY ? JSON.stringify(previous) : null }, SONGS);
  assert.deepEqual(local, upgraded);
  // 本次升级完成后，用户删掉新增歌曲，重新加载仍应保持删除。
  const deleted = removeCatalogSong(upgraded, 'dzq-pao-mo');
  assert.strictEqual(upgradeEditableCatalog(deleted, SONGS), deleted);
  assert.deepEqual(loadEditableCatalog({ getItem: () => JSON.stringify(deleted) }, SONGS), deleted);
  assert.deepEqual(previous.songs, [custom, edited, existingRequest]);
});
