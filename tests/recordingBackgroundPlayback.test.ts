import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { joinedPosition, probePlayback, slicePlayback } from '../src/components/SongRequest/recordingPlayback.ts';

const parts = [{ start: 5, end: 20 }, { start: 30, end: 45 }];

test('播放头落在保留段内就继续放', () => {
  assert.deepEqual(probePlayback(parts, 5), { kind: 'ok' });
  assert.deepEqual(probePlayback(parts, 12.4), { kind: 'ok' });
  assert.deepEqual(probePlayback(parts, 31), { kind: 'ok' });
});

test('播放头进了被删掉的段落，跳到下一段开头', () => {
  assert.deepEqual(probePlayback(parts, 20), { kind: 'seek', at: 30 });
  assert.deepEqual(probePlayback(parts, 26.5), { kind: 'seek', at: 30 });
  // 开头被裁掉（clipStart > 0）也一样：先跳到第一段的起点。
  assert.deepEqual(probePlayback(parts, 0), { kind: 'seek', at: 5 });
});

test('越过最后一段就算播完', () => {
  assert.deepEqual(probePlayback(parts, 45), { kind: 'end' });
  assert.deepEqual(probePlayback(parts, 60), { kind: 'end' });
  assert.deepEqual(probePlayback([], 1), { kind: 'end' });
});

test('两个时间轴能互相换算（元素时间是原文件时间，榜上是拼接后的时间）', () => {
  // 原文件第 10 秒 = 保留段的第 5 秒。
  assert.equal(joinedPosition(parts, 10), 5);
  // 拼接后的第 20 秒 = 第二段的第 35 秒。
  assert.deepEqual(slicePlayback(parts, 20), [{ start: 35, end: 45 }]);
});

test('录音播放默认走媒体元素（息屏 / 后台才不会被掐断）', () => {
  const panel = readFileSync(new URL('../src/components/SongRequest/SongRecordingPanel.tsx', import.meta.url), 'utf8');

  assert.match(panel, /const applyMediaSession = \(song: Song \| null, recording: SongRecording \| null, playing: boolean\)/);
  assert.match(panel, /navigator\.mediaSession\.metadata = new MediaMetadata\(/);
  assert.match(panel, /playbackState = playing \? 'playing' : 'paused'/);
  assert.match(panel, /setHandler\('pause', \(\) => playbackControlsRef\.current\.stop\?\.\(\)\)/);
  // iOS 只认「手势里 play 过一次」的媒体元素。
  assert.match(panel, /const SILENT_WAV = 'data:audio\/wav;base64,/);
  assert.match(panel, /audio\.dataset\.unlocked = '1'/);
  assert.match(panel, /audio\.setAttribute\('playsinline', 'true'\)/);
  // 只有存过增益的录音才退回 Web Audio（<audio> 抬不动电平）。
  assert.match(panel, /if \(!hasRecordingGain\(recording\.gain\)\) \{\s*try \{\s*if \(await playWithMediaElement\(/);
  // 裁剪段靠 rAF 追帧跳过，后台 rAF 停了还有 timeupdate 兜。
  assert.match(panel, /segmentRafRef\.current = requestAnimationFrame\(pump\)/);
  assert.match(panel, /audio\.ontimeupdate = \(\) => \{ settleIntoKeptPart\(\); \}/);
});

test('录音在播时切到练习 / 路演不会卸载播放器，还能就地停掉', () => {
  const panel = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  // 谱子面板常驻挂载、只隐藏。
  assert.match(panel, /<section data-song-score-panel aria-hidden=\{activeJournal !== 'score'\}/);
  assert.doesNotMatch(panel, /\{activeJournal === 'score' && \(\s*<section data-song-score-panel/);
  // 其他维度顶部给一个「正在播放录音 · 停止」。
  assert.match(panel, /activeJournal !== 'score' && isRecordingPlaying/);
  assert.match(panel, /recordingsRef\.current\?\.stopPlayback\(\)/);
  assert.match(panel, /正在播放录音/);
});
