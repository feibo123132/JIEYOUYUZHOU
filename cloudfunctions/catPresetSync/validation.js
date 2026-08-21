const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PARAMETER_KEYS = new Set([
  'seed','pose','expression','lightAzimuth','lightElevation','coatId','eyeColor','oddEyes','eyeColorRight',
  'headSize','chubbiness','legLength','earSize','eyeSize','eyeSpacing','irisScale','irisHighlightScale',
  'wateryEyes','wateryEyeShape','tailLength','tailCurl','fluffy','furFluff','outlineJitter','dynamicCoat',
  'dynamicCoatBase','dynamicCoatA','dynamicCoatB','dynamicCoatCount','dynamicCoatScale','dynamicCoatSoftness',
  'dynamicCoatIrregularity','dynamicCoatBodyDensity','dynamicCoatBodyWidth','dynamicCoatBodyIrregularity',
  'dynamicCoatHeadDensity','dynamicCoatHeadWidth','dynamicCoatHeadIrregularity',
]);
const color = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const ranges = {
  lightAzimuth:[-150,150], lightElevation:[8,82], headSize:[.35,2.8], chubbiness:[.3,4.5], legLength:[.05,5], earSize:[.1,4.5],
  eyeSize:[.6,1.7], eyeSpacing:[.55,1], irisScale:[.1,1.3], irisHighlightScale:[1,2.4], wateryEyeShape:[0,2], tailLength:[.05,4.5],
  tailCurl:[-.75,2.25], furFluff:[.15,3], outlineJitter:[0,1], dynamicCoatCount:[1,12], dynamicCoatScale:[.45,2],
  dynamicCoatSoftness:[0,1.4], dynamicCoatIrregularity:[0,1.5], dynamicCoatBodyDensity:[.8,32], dynamicCoatBodyWidth:[.01,1.1],
  dynamicCoatBodyIrregularity:[0,4], dynamicCoatHeadDensity:[1,64], dynamicCoatHeadWidth:[.01,1.1], dynamicCoatHeadIrregularity:[0,4],
};
const bools = new Set(['oddEyes','wateryEyes','fluffy','dynamicCoat']);
const colors = new Set(['eyeColor','eyeColorRight','dynamicCoatBase','dynamicCoatA','dynamicCoatB']);
const strings = {
  pose:new Set(['standing','loaf','stretch','biped','slouchSit','sideFlat','banana']),
  expression:new Set(['normal','sad','angry','smug']),
  coatId:new Set(['orange','greyTabby','brownTabby','cream','tuxedo','calico','tortoiseshell','siamese','black','white','blueGrey']),
};

function normalizeCode(value) {
  const code = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== 20 || [...code].some((c) => !ALPHABET.includes(c))) throw new Error('INVALID_CODE');
  return code;
}

function validatePresets(presets) {
  if (!Array.isArray(presets) || presets.length > 20) throw new Error('INVALID_PRESETS');
  for (const item of presets) {
    if (Object.keys(item || {}).some((key) => !['name','parameters','updatedAt'].includes(key))) throw new Error('INVALID_PRESET');
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name !== item.name.trim() || item.name.length > 40) throw new Error('INVALID_PRESET');
    if (typeof item.updatedAt !== 'string' || new Date(item.updatedAt).toISOString() !== item.updatedAt) throw new Error('INVALID_PRESET');
    if (!item.parameters || typeof item.parameters !== 'object' || Array.isArray(item.parameters) || !Object.keys(item.parameters).length) throw new Error('INVALID_PRESET');
    for (const [key, value] of Object.entries(item.parameters)) {
      if (!PARAMETER_KEYS.has(key)) throw new Error('INVALID_PARAMETER');
      if (key === 'seed' && (!Number.isInteger(value) || value < 0 || value > 0xffffffff)) throw new Error('INVALID_PARAMETER');
      if (ranges[key] && (!Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1])) throw new Error('INVALID_PARAMETER');
      if (bools.has(key) && typeof value !== 'boolean') throw new Error('INVALID_PARAMETER');
      if (colors.has(key) && !color(value)) throw new Error('INVALID_PARAMETER');
      if (strings[key] && !strings[key].has(value)) throw new Error('INVALID_PARAMETER');
    }
  }
  return presets;
}

function validateRequest(event) {
  if (!event || !['pull','push'].includes(event.action)) throw new Error('INVALID_ACTION');
  const expectedKeys = event.action === 'push' ? ['action','code','presets'] : ['action','code'];
  if (Object.keys(event).some((key) => !expectedKeys.includes(key))) throw new Error('INVALID_REQUEST');
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 128 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
  const code = normalizeCode(event.code);
  return { action: event.action, code, presets: event.action === 'push' ? validatePresets(event.presets) : undefined };
}

module.exports = { validateRequest };
