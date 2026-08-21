import assert from 'node:assert/strict';
import { getStandingTailX } from '../src/tailLayout.js';

const widestBody = Math.sqrt(4.5);
const points = getStandingTailX(widestBody, -1, 2.25);

assert.equal(points.root, 0, 'tail root must remain attached to the body');
assert.ok(
  Math.abs(points.mid) - 0.33 * widestBody >= 0.109,
  'tail midsection must clear the widest supported body by more than its root radius'
);
assert.ok(
  Math.abs(points.tip) - 0.33 * widestBody >= 0.064,
  'curled tail tip must stay outside the body by more than its tip radius'
);

console.log('tail clearance tests passed');
