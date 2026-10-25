// Reduced motion turns the juice off whole (kits/motion-sound.md#juice): the
// script adds no listener and observes nothing, so no count or shake can
// start.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./runtime/juice.js', import.meta.url), 'utf8');

function load(reduce) {
  const calls = [];
  const target = (name) => ({ addEventListener: (type) => calls.push(`${name}:${type}`), querySelector: () => null, getElementById: () => null });
  const IntersectionObserver = class {
    constructor() {
      calls.push('observer');
    }
  };
  const window = { matchMedia: (q) => ({ matches: reduce && q.includes('reduce') }), IntersectionObserver, requestIdleCallback: () => {} };
  const document = target('document');
  runInNewContext(source, { window, document, IntersectionObserver, addEventListener: target('window').addEventListener });
  return calls;
}

test('reduced motion starts no count or shake', () => {
  assert.ok(load(false).length > 0, 'without reduced motion the script listens');
  assert.deepEqual(load(true), []);
});
