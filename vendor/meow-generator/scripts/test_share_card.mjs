import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  getShareCardDescriptor,
  getShareCardFilename,
  getHappinessCardLines,
  getShareCardCopy,
  getShareCardMeta,
  getHappinessCardMetaLabel,
  getShareCardSubjectPanOffset,
  shouldCaptureShareCardShortcut,
  HAPPINESS_CARD_MARK,
  HAPPINESS_CARD_CANVAS_LAYOUT,
  SHARE_CARD_EDITION,
  SHARE_CARD_REPOSITORY,
} from '../src/shareCard.js';

const first = getShareCardDescriptor(0);
const repeat = getShareCardDescriptor(0);
const nextTheme = getShareCardDescriptor(1);
const normalized = getShareCardDescriptor(-1);

assert.equal(first.serial, '0052');
assert.equal(first.theme.name, 'peach');
assert.deepEqual(first, repeat, 'the same seed should produce the same card');
assert.equal(nextTheme.theme.name, 'sky');
assert.equal(nextTheme.serial, '0125');
assert.deepEqual(normalized, nextTheme, 'negative seeds should normalize consistently');

const catPalette = {
  base: '#f6dfbd',
  primary: '#e6913f',
  secondary: '#ad5d22',
  accent: '#d99a2b',
};
const catSignature = getShareCardDescriptor(42, catPalette);
const alternate = getShareCardDescriptor(42, catPalette, 9876);
const alternateRepeat = getShareCardDescriptor(42, catPalette, 9876);

assert.equal(catSignature.theme.name, 'cat-signature');
assert.equal(catSignature.theme.pattern, 'cat-paws');
assert.equal(catSignature.theme.primary, catPalette.primary);
assert.ok(['R', 'SR', 'AR'].includes(catSignature.rarity));
assert.match(alternate.theme.name, /^cat-remix-/);
assert.notDeepEqual(alternate.theme, catSignature.theme, 'alternate skin should visibly remix the cat palette');
assert.deepEqual(alternate, alternateRepeat, 'the same skin variant should be reproducible');
assert.equal(SHARE_CARD_EDITION, 'JIEYOU×生命万岁企划');
assert.equal(HAPPINESS_CARD_MARK, 'GXMU');
assert.equal(getHappinessCardMetaLabel('2026年8月18日'), '2026年8月18日  GXMU');
assert.equal(shouldCaptureShareCardShortcut({ key: 'p', active: true }), true);
assert.equal(shouldCaptureShareCardShortcut({ key: 'P', active: true }), true);
assert.equal(shouldCaptureShareCardShortcut({ key: 'p', active: false }), false);
assert.equal(shouldCaptureShareCardShortcut({ key: 'p', active: true, repeat: true }), false);
assert.equal(shouldCaptureShareCardShortcut({ key: 'p', active: true, disabled: true }), false);
assert.equal(shouldCaptureShareCardShortcut({ key: 'p', active: true, editable: true }), false);
assert.equal(SHARE_CARD_REPOSITORY.label, '欲买桂花同载酒，终不似，少年游。希望年少时的幸福能一直伴你左右😊');
assert.equal(getShareCardFilename(42), 'meow_card_42.png');
assert.equal(getShareCardFilename(-42), 'meow_card_42.png');

const cardHeight = 1540;
const canvasLayout = HAPPINESS_CARD_CANVAS_LAYOUT;
assert.equal(canvasLayout.captionYRatio, 0.802, 'happiness title should return to its original position');
assert.ok(canvasLayout.subtitleSize >= 32, 'happiness message should be larger');
assert.ok(canvasLayout.subtitleLineHeight >= 40, 'happiness message should have more line spacing');
assert.equal(canvasLayout.subtitleMaxLines, 4);
assert.equal(canvasLayout.dateBadgeTop, 32);
assert.ok(canvasLayout.dateBadgeWidth >= 300);
const canvasTitleBottom = cardHeight * canvasLayout.captionYRatio + canvasLayout.titleSize / 2;
const canvasFirstSubtitleTop = cardHeight * canvasLayout.captionYRatio
  + canvasLayout.subtitleOffset
  - canvasLayout.subtitleSize / 2;
const canvasLastSubtitleBottom = cardHeight * canvasLayout.captionYRatio
  + canvasLayout.subtitleOffset
  + canvasLayout.subtitleLineHeight * (canvasLayout.subtitleMaxLines - 1)
  + canvasLayout.subtitleSize / 2;
assert.ok(canvasFirstSubtitleTop > canvasTitleBottom, 'canvas title and message must not overlap');
assert.ok(canvasLastSubtitleBottom < cardHeight * 0.953, 'four message lines should use the space above footer');

const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const liveTitleRule = styles.match(/\.share-card-live-frame\[data-happiness="true"\] \.share-card-live-title\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const liveSubtitleRule = styles.match(/\.share-card-live-frame\[data-happiness="true"\] \.share-card-live-subtitle\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const liveSerialRule = styles.match(/\.share-card-live-frame\[data-happiness="true"\] \.share-card-serial\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const editionRule = styles.match(/\.share-card-edition\s*\{([\s\S]*?)\}/)?.[1] ?? '';
assert.match(editionRule, /width:\s*max-content/);
assert.match(editionRule, /white-space:\s*nowrap/);
assert.match(liveTitleRule, /top:\s*79\.8%/);
assert.match(liveTitleRule, /font-size:\s*clamp\([^;]*22px\)/);
assert.match(liveSubtitleRule, /top:\s*83\.7%/);
assert.match(liveSubtitleRule, /width:\s*86%/);
assert.match(liveSubtitleRule, /font-size:\s*clamp\([^;]*16px\)/);
assert.match(liveSubtitleRule, /line-height:\s*1\.24/);
assert.match(liveSubtitleRule, /-webkit-line-clamp:\s*4/);
assert.match(liveSerialRule, /top:\s*2\.35%/);
assert.match(liveSerialRule, /right:\s*5%/);
assert.match(liveSerialRule, /left:\s*auto/);
assert.match(styles, /data-happiness="true"[^\{]*\.share-card-gem[^\{]*\{\s*display:\s*none/);
assert.match(styles, /data-happiness="true"[^\{]*\.share-card-rarity[^\{]*\{\s*display:\s*none/);
const liveHeight = 740;
const liveTitleBottom = liveHeight * 0.798 + 22 * 1.1;
const liveSubtitleTop = liveHeight * 0.837;
const liveSubtitleBottom = liveSubtitleTop + 4 * 16 * 1.24;
assert.ok(liveTitleBottom < liveSubtitleTop, 'live title and message must have a positive gap');
assert.ok(liveSubtitleBottom < liveHeight * 0.9445, 'live four-line message must stay above footer');

const measureCharacters = (text) => text.length;
assert.deepEqual(getHappinessCardLines('跑步听歌', measureCharacters, 8, 3), ['跑步听歌']);
const longMessageLines = getHappinessCardLines('这是一个需要被截断为三行的幸福留言', measureCharacters, 5, 3);
assert.equal(longMessageLines.length, 3);
assert.ok(longMessageLines[2].endsWith('…'));
assert.ok(longMessageLines.every((line) => measureCharacters(line) <= 5));

const localeCopy = { title: '猫猫纪念卡', cardNumber: (serial) => `第 ${serial} 张 / 9999` };
assert.deepEqual(getShareCardCopy(localeCopy, '我喜欢晚上边跑步边听歌', '小王'), {
  headline: '小王的幸福时刻',
  subtitle: '我喜欢晚上边跑步边听歌',
});
assert.deepEqual(getShareCardCopy(localeCopy, ''), {
  headline: '幸福时刻',
  subtitle: '猫猫纪念卡',
});

assert.equal(getShareCardMeta(localeCopy, '1641', '', ''), '第 1641 张 / 9999');
assert.equal(getShareCardMeta(localeCopy, '1641', '幸福留言', '2026年8月18日'), '2026年8月18日');
assert.equal(getShareCardMeta(localeCopy, '1641', '幸福留言', ''), '日期未知');

const shareSource = await readFile(new URL('../src/shareCard.js', import.meta.url), 'utf8');
assert.match(styles, /data-share-card-open="true"[^\{]*\.scene-speech-bubble/);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 5);
const orbitTarget = new THREE.Vector3(0, 0, 0);
camera.lookAt(orbitTarget);
camera.updateMatrixWorld(true);
const subject = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial()
);
subject.position.set(1, 0, 0);
subject.updateMatrixWorld(true);
const beforeDirection = camera.getWorldDirection(new THREE.Vector3()).clone();
const panOffset = getShareCardSubjectPanOffset({
  camera,
  subject,
  frameRect: { left: 0, top: 0, width: 1000, height: 1000 },
  canvasRect: { left: 0, top: 0, width: 1000, height: 1000 },
});
assert.ok(panOffset.x > 0.9 && panOffset.x < 1.1, 'off-center kitten should pan into the card');
camera.position.add(panOffset);
orbitTarget.add(panOffset);
camera.lookAt(orbitTarget);
camera.updateMatrixWorld(true);
const centered = new THREE.Box3()
  .setFromObject(subject)
  .getCenter(new THREE.Vector3())
  .project(camera);
const afterDirection = camera.getWorldDirection(new THREE.Vector3());
assert.ok(Math.abs(centered.x) < 1e-6, 'camera pan should center the kitten in the card window');
assert.ok(
  beforeDirection.distanceTo(afterDirection) < 1e-8,
  'camera pan must preserve the user rotation angle'
);

console.log('share card descriptor checks passed');
