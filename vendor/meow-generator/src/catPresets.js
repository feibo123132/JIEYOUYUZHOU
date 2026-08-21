import { COATS, POSES } from './coats.js';

export const CAT_PRESET_STORAGE_KEY = 'meow-generator-cat-presets-v1';
export const CAT_PRESET_LIMIT = 20;

export const CAT_PRESET_PARAMETER_KEYS = Object.freeze([
  'seed',
  'pose',
  'expression',
  'lightAzimuth',
  'lightElevation',
  'coatId',
  'eyeColor',
  'oddEyes',
  'eyeColorRight',
  'headSize',
  'chubbiness',
  'legLength',
  'earSize',
  'eyeSize',
  'eyeSpacing',
  'irisScale',
  'irisHighlightScale',
  'wateryEyes',
  'wateryEyeShape',
  'tailLength',
  'tailCurl',
  'fluffy',
  'furFluff',
  'outlineJitter',
  'dynamicCoat',
  'dynamicCoatBase',
  'dynamicCoatA',
  'dynamicCoatB',
  'dynamicCoatCount',
  'dynamicCoatScale',
  'dynamicCoatSoftness',
  'dynamicCoatIrregularity',
  'dynamicCoatBodyDensity',
  'dynamicCoatBodyWidth',
  'dynamicCoatBodyIrregularity',
  'dynamicCoatHeadDensity',
  'dynamicCoatHeadWidth',
  'dynamicCoatHeadIrregularity',
]);

const POSE_IDS = new Set(POSES.map((item) => item.id));
const COAT_IDS = new Set(COATS.map((item) => item.id));
const EXPRESSION_IDS = new Set(['normal', 'sad', 'angry', 'smug']);
const isBoolean = (value) => typeof value === 'boolean';
const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const numberIn = (min, max) => (value) => Number.isFinite(value) && value >= min && value <= max;
const VALIDATORS = {
  seed: (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
  pose: (value) => POSE_IDS.has(value),
  expression: (value) => EXPRESSION_IDS.has(value),
  lightAzimuth: numberIn(-150, 150),
  lightElevation: numberIn(8, 82),
  coatId: (value) => COAT_IDS.has(value),
  eyeColor: isColor,
  oddEyes: isBoolean,
  eyeColorRight: isColor,
  headSize: numberIn(0.35, 2.8),
  chubbiness: numberIn(0.3, 4.5),
  legLength: numberIn(0.05, 5),
  earSize: numberIn(0.1, 4.5),
  eyeSize: numberIn(0.6, 1.7),
  eyeSpacing: numberIn(0.55, 1),
  irisScale: numberIn(0.1, 1.3),
  irisHighlightScale: numberIn(1, 2.4),
  wateryEyes: isBoolean,
  wateryEyeShape: numberIn(0, 2),
  tailLength: numberIn(0.05, 4.5),
  tailCurl: numberIn(-0.75, 2.25),
  fluffy: isBoolean,
  furFluff: numberIn(0.15, 3),
  outlineJitter: numberIn(0, 1),
  dynamicCoat: isBoolean,
  dynamicCoatBase: isColor,
  dynamicCoatA: isColor,
  dynamicCoatB: isColor,
  dynamicCoatCount: numberIn(1, 12),
  dynamicCoatScale: numberIn(0.45, 2),
  dynamicCoatSoftness: numberIn(0, 1.4),
  dynamicCoatIrregularity: numberIn(0, 1.5),
  dynamicCoatBodyDensity: numberIn(0.8, 32),
  dynamicCoatBodyWidth: numberIn(0.01, 1.1),
  dynamicCoatBodyIrregularity: numberIn(0, 4),
  dynamicCoatHeadDensity: numberIn(1, 64),
  dynamicCoatHeadWidth: numberIn(0.01, 1.1),
  dynamicCoatHeadIrregularity: numberIn(0, 4),
};

function pickCatParameters(parameters) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return {};
  const normalized = parameters.pose === 'containerCrouch'
    ? { ...parameters, pose: 'standing' }
    : parameters;
  return Object.fromEntries(
    CAT_PRESET_PARAMETER_KEYS
      .filter((key) => Object.hasOwn(normalized, key) && VALIDATORS[key](normalized[key]))
      .map((key) => [key, normalized[key]])
  );
}

export function createCatPreset(name, parameters, updatedAt = new Date().toISOString()) {
  return {
    name: String(name ?? '').trim().slice(0, 40),
    parameters: pickCatParameters(parameters),
    updatedAt,
  };
}

export function applyCatPresetSnapshot(currentParameters, currentLightAngles, storedParameters) {
  const { lightAzimuth, lightElevation, ...parameterPatch } = storedParameters ?? {};
  const hasAzimuth = lightAzimuth !== undefined;
  const hasElevation = lightElevation !== undefined;
  return {
    parameters: { ...currentParameters, ...parameterPatch },
    lightAngles: {
      azimuth: hasAzimuth ? lightAzimuth : currentLightAngles.azimuth,
      elevation: hasElevation ? lightElevation : currentLightAngles.elevation,
    },
    lightChanged: hasAzimuth || hasElevation,
  };
}

export function parseCatPresets(raw) {
  if (raw == null || raw === '') return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.presets)) throw new TypeError('Invalid cat preset store');
  return parsed.presets
    .filter((item) => item && typeof item.name === 'string' && item.name.trim())
    .map((item) => createCatPreset(item.name, item.parameters, item.updatedAt))
    .filter((item) => Object.keys(item.parameters).length > 0)
    .slice(0, CAT_PRESET_LIMIT);
}

export function serializeCatPresets(presets) {
  return JSON.stringify({ version: 1, presets: presets.slice(0, CAT_PRESET_LIMIT) });
}

export function upsertCatPreset(presets, preset) {
  const remaining = presets.filter((item) => item.name !== preset.name);
  return [preset, ...remaining].slice(0, CAT_PRESET_LIMIT);
}

function presetNameError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function renameCatPreset(presets, oldName, newName) {
  const normalizedName = String(newName ?? '').trim().slice(0, 40);
  if (!normalizedName) throw presetNameError('EMPTY_PRESET_NAME');
  if (
    normalizedName !== oldName
    && presets.some((preset) => preset.name === normalizedName)
  ) throw presetNameError('DUPLICATE_PRESET_NAME');
  return presets.map((preset) => (
    preset.name === oldName ? { ...preset, name: normalizedName } : preset
  ));
}

export function updateCatPresetParameters(
  presets,
  name,
  parameters,
  updatedAt = new Date().toISOString()
) {
  return presets.map((preset) => (
    preset.name === name ? createCatPreset(name, parameters, updatedAt) : preset
  ));
}

export function removeCatPreset(presets, name) {
  return presets.filter((item) => item.name !== name);
}
