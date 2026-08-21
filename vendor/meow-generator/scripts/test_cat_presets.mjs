import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CAT_PRESET_LIMIT,
  applyCatPresetSnapshot,
  createCatPreset,
  parseCatPresets,
  renameCatPreset,
  removeCatPreset,
  updateCatPresetParameters,
  upsertCatPreset,
} from '../src/catPresets.js';

const preset = createCatPreset('  橘橘  ', {
  seed: 123,
  pose: 'stretch',
  expression: 'smug',
  lightAzimuth: -42,
  lightElevation: 61,
  containerSeed: 456,
  headSize: 1.2,
  dynamicCoatA: '#e6913f',
  eyeColor: '#d99a2b',
  motionDebug: true,
  weather: 'thunder',
}, '2026-08-21T08:00:00.000Z');

assert.equal(preset.name, '橘橘');
assert.deepEqual(preset.parameters, {
  seed: 123,
  pose: 'stretch',
  expression: 'smug',
  lightAzimuth: -42,
  lightElevation: 61,
  eyeColor: '#d99a2b',
  headSize: 1.2,
  dynamicCoatA: '#e6913f',
});
assert.equal(preset.updatedAt, '2026-08-21T08:00:00.000Z');
assert.equal(
  createCatPreset('猫窝里的猫', { pose: 'containerCrouch', headSize: 1 }).parameters.pose,
  'standing',
);

assert.throws(() => parseCatPresets('{broken-json'));
assert.throws(() => parseCatPresets(JSON.stringify({ presets: 'not-an-array' })));
assert.deepEqual(
  parseCatPresets(JSON.stringify({ presets: [preset, null, { name: '', parameters: {} }] })),
  [preset],
);
assert.deepEqual(
  parseCatPresets(JSON.stringify({
    presets: [{
      name: '损坏预设',
      parameters: {
        pose: 'unknown',
        expression: 'unknown',
        lightAzimuth: 999,
        lightElevation: 'high',
        headSize: 'huge',
        eyeColor: 'red',
        chubbiness: 1.2,
      },
      updatedAt: '2026-08-21T08:00:00.000Z',
    }],
  })),
  [createCatPreset('损坏预设', { chubbiness: 1.2 }, '2026-08-21T08:00:00.000Z')],
);

const first = createCatPreset('橘橘', { headSize: 1 }, '2026-08-21T08:00:00.000Z');
const replacement = createCatPreset('橘橘', { headSize: 2 }, '2026-08-21T09:00:00.000Z');
assert.deepEqual(upsertCatPreset([first], replacement), [replacement]);

const many = Array.from({ length: CAT_PRESET_LIMIT }, (_, index) => (
  createCatPreset(`猫-${index}`, { headSize: index }, `2026-08-21T${String(index).padStart(2, '0')}:00:00.000Z`)
));
const newest = createCatPreset('最新', { headSize: 9 }, '2026-08-22T00:00:00.000Z');
const capped = upsertCatPreset(many, newest);
assert.equal(capped.length, CAT_PRESET_LIMIT);
assert.equal(capped[0].name, '最新');
assert.equal(capped.some((item) => item.name === '猫-19'), false);

assert.deepEqual(removeCatPreset([newest, first], '橘橘'), [newest]);

assert.deepEqual(
  applyCatPresetSnapshot(
    { expression: 'sad', headSize: 1 },
    { azimuth: 20, elevation: 40 },
    { headSize: 2 },
  ),
  {
    parameters: { expression: 'sad', headSize: 2 },
    lightAngles: { azimuth: 20, elevation: 40 },
    lightChanged: false,
  },
);
assert.deepEqual(
  applyCatPresetSnapshot(
    { expression: 'sad' },
    { azimuth: 20, elevation: 40 },
    { expression: 'angry', lightAzimuth: -30 },
  ),
  {
    parameters: { expression: 'angry' },
    lightAngles: { azimuth: -30, elevation: 40 },
    lightChanged: true,
  },
);

assert.deepEqual(
  renameCatPreset([first, newest], '橘橘', '  小眼睛  '),
  [{ ...first, name: '小眼睛' }, newest],
);
assert.throws(
  () => renameCatPreset([first, newest], '橘橘', '   '),
  (error) => error.code === 'EMPTY_PRESET_NAME',
);
assert.throws(
  () => renameCatPreset([first, newest], '橘橘', '最新'),
  (error) => error.code === 'DUPLICATE_PRESET_NAME',
);
assert.deepEqual(
  updateCatPresetParameters(
    [first, newest],
    '橘橘',
    { headSize: 2 },
    '2026-08-22T08:00:00.000Z',
  ),
  [createCatPreset('橘橘', { headSize: 2 }, '2026-08-22T08:00:00.000Z'), newest],
);

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const sceneSectionIndex = mainSource.indexOf("section('场景与渲染'");
const presetSectionIndex = mainSource.indexOf("section('预设保存'");
const motionSectionIndex = mainSource.indexOf("section('Motion'");
assert.ok(sceneSectionIndex < presetSectionIndex && presetSectionIndex < motionSectionIndex);
assert.match(mainSource, /CAT_PRESET_STORAGE_KEY/);
assert.match(mainSource, /保存当前猫咪/);
assert.match(mainSource, /应用/);
assert.match(mainSource, /删除/);
assert.match(mainSource, /更新/);
assert.match(mainSource, /preset-item-name-input/);
assert.match(mainSource, /lightAzimuth:\s*lightAngles\.azimuth/);
assert.match(mainSource, /lightElevation:\s*lightAngles\.elevation/);
assert.match(mainSource, /applyCatPresetSnapshot/);
assert.match(mainSource, /floorPaletteSeed = params\.seed/);
assert.match(mainSource, /name\.dataset\.i18nIgnore/);

const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
assert.match(styles, /\.preset-save-row/);
assert.match(styles, /\.preset-list/);

const i18nSource = await readFile(new URL('../src/i18n.js', import.meta.url), 'utf8');
assert.match(i18nSource, /'预设保存'/);
assert.match(i18nSource, /'保存当前猫咪'/);

console.log('cat preset checks passed');
