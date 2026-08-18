import assert from 'node:assert/strict';
import test from 'node:test';

import { getMeowGeneratorUrl } from '../src/utils/meowGenerator.ts';

test('builds the Meow Generator URL from a relative base path', () => {
  assert.equal(getMeowGeneratorUrl('./'), './meow-generator/index.html');
});

test('builds the Meow Generator URL from a nested base path', () => {
  assert.equal(getMeowGeneratorUrl('/jieyou/'), '/jieyou/meow-generator/index.html');
});

test('adds a trailing slash to the base path before building the URL', () => {
  assert.equal(getMeowGeneratorUrl('/jieyou'), '/jieyou/meow-generator/index.html');
});

test('uses the root base path by default outside Vite', () => {
  assert.equal(getMeowGeneratorUrl(), '/meow-generator/index.html');
});
