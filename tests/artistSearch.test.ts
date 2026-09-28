import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const station = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');
const { groupSongsByArtist } = await import('../src/components/SongRequest/roadshow.ts');
// Execute the component's actual memo callback without refactoring the product
// just to expose a tiny filter, or mocking the station's unrelated cloud calls.
const callback = station.match(/const artistGroups = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[artistLanguageFilter/);
assert.ok(callback);
const getGroups = new Function('groupSongsByArtist', 'catalogSongs', 'query', 'catalog', 'artistLanguageFilter',
  'songRecordSession', 'isFeaturedSongManager', 'recoveredSongs', callback[1]);
const songs = [
  { id: 'hu-1', artist: '胡歌', title: '共同旋律', category: '华语流行' },
  { id: 'hu-2', artist: '胡歌', title: '逍遥叹', category: '华语流行' },
  { id: 'hy-1', artist: '胡杨林', title: '香水有毒', category: '华语流行' },
  { id: 'foreign-1', artist: 'Foreign Two', title: 'First', category: '欧美流行' },
  { id: 'foreign-2', artist: 'Foreign Two', title: 'Second', category: '欧美流行' },
  { id: 'solo-1', artist: 'Foreign Solo', title: '共同旋律', category: '欧美流行' },
];
const catalog = { artists: [...new Set(songs.map((song) => song.artist))], songs };
const search = (query: string, filter: string) => getGroups(groupSongsByArtist, songs, query, catalog, filter,
  { alias: 'reader' }, () => false, []).map((group: { artist: string }) => group.artist);

test('artist name search finds 胡歌 and 胡杨林 from every category', () => {
  for (const filter of ['chinese', 'foreign', 'single']) {
    assert.deepEqual(search(' 胡 ', filter), ['胡歌', '胡杨林']);
  }
});

test('song title search crosses language and song count filters and handles case', () => {
  for (const filter of ['chinese', 'foreign', 'single']) {
    assert.deepEqual(search('共同旋律', filter), ['胡歌', 'Foreign Solo']);
    assert.deepEqual(search('FOREIGN', filter), ['Foreign Two', 'Foreign Solo']);
    assert.deepEqual(search('没有这位歌手', filter), []);
  }
});

test('empty or whitespace search restores the selected category', () => {
  for (const query of ['', '  ']) {
    assert.deepEqual(search(query, 'chinese'), ['胡歌']);
    assert.deepEqual(search(query, 'foreign'), ['Foreign Two']);
    assert.deepEqual(search(query, 'single'), ['胡杨林', 'Foreign Solo']);
  }
});

test('active search bypasses the hot songs view without changing its selection', () => {
  const condition = station.match(/:\s*(showHotSongs[^?]*)\?\s*\(/);
  assert.ok(condition);
  const showHot = new Function('showHotSongs', 'query', `return Boolean(${condition[1]});`);
  assert.equal(showHot(true, '胡'), false);
  assert.equal(showHot(true, ''), true);
  assert.equal(showHot(true, '  '), true);
  assert.equal(showHot(false, ''), false);
});
