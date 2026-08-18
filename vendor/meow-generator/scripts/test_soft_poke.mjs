import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MAX_POKES,
  pokeFeel,
  pokeUniforms,
  pokeOffsetAt,
  pulsePoke,
  updatePokes,
} from '../src/softPoke.js';

const point = new THREE.Vector3(0.1, 0.2, 0.3);
const inward = new THREE.Vector3(0, 0, -1);

pulsePoke(point, inward, 1);
const immediate = Math.max(...pokeUniforms.uPokeOff.value.map((offset) => offset.length()));
assert(immediate > pokeFeel.maxDepth, 'tap should deform immediately and visibly');
assert(pokeUniforms.uPokeRadius.value >= 0.4, 'default rua radius should affect a broad body area');

const nearbyOffset = new THREE.Vector3();
pokeOffsetAt(
  point.clone().add(new THREE.Vector3(pokeUniforms.uPokeRadius.value * 1.2, 0, 0)),
  null,
  nearbyOffset
);
assert(
  nearbyOffset.length() > immediate * 0.12,
  'rua should keep a visible soft-body response beyond the central dent'
);

for (let i = 0; i < 18; i++) {
  pulsePoke(point, inward, 1.55);
}

const stacked = pokeUniforms.uPokeOff.value.map((offset) => offset.length());
const maxAllowed = pokeFeel.maxDepth * 2.05 + 1e-6;
assert(Math.max(...stacked) <= maxAllowed, 'rapid rua must stay inside the safe deformation limit');
assert.equal(stacked.length, MAX_POKES, 'shader and spring slot counts must stay aligned');

for (let i = 0; i < 480; i++) updatePokes(1 / 60);
const settled = Math.max(...pokeUniforms.uPokeOff.value.map((offset) => offset.length()));
assert(settled < 1e-3, 'rua springs should settle back to the neutral surface');

console.log(JSON.stringify({
  status: 'ok',
  slots: MAX_POKES,
  immediate: Number(immediate.toFixed(4)),
  nearby: Number(nearbyOffset.length().toFixed(4)),
  stackedMax: Number(Math.max(...stacked).toFixed(4)),
  safeLimit: Number(maxAllowed.toFixed(4)),
  settled: Number(settled.toFixed(6)),
}, null, 2));
