// The cross-layer pass changes chapters only through verdicts, so a verdict
// that lands on the wrong flag, or on nothing, would publish an unchecked
// look-ahead claim as if it had been checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, mergeVerdicts } from './assemble.mjs';

const stop = (id, flags = []) => ({ id, flags });
const chapterFile = (layer, stops, hops = []) => ({
  chapter: { id: `c${layer}`, layer, stops, claims: [{ text: 'Runs once.', state: 'complete', stops: [] }] },
  hops,
  glossary: [{ term: 'Inbox', def: 'One row per delivery.', stop: stops[0].id }],
});
const stack = {
  title: 'Stack',
  repo: 'acme/app',
  intro: {},
  layers: [{ id: '1' }, { id: '2' }],
  spine: { lanes: [{ id: 'runtime', title: 'Runtime' }] },
};
const files = () =>
  new Map([
    ['1', chapterFile('1', [stop('c1-s1', [{ type: 'dormant', text: 'No caller.', status: 'candidate' }, { type: 'interim', text: 'Replaced.', status: 'candidate' }])], [{ id: 'c1-h', from: 'A', to: 'B' }])],
    ['2', chapterFile('2', [stop('c2-s1')])],
  ]);

test('applies each verdict to the flag, claim, stop and node it names', () => {
  const verdicts = mergeVerdicts([
    { flags: [{ stop: 'c1-s1', type: 'interim', status: 'confirmed', completedBy: '2' }], nodes: { A: 'Producer' } },
    { claims: [{ chapter: 'c1', index: 0, state: 'later', completedBy: '2' }], stops: [{ id: 'c2-s1', scene: 'inbox' }] },
  ]);
  const { outline, errors } = assemble({ stack, chapterFiles: files(), verdicts });
  assert.deepEqual(errors, []);
  const [dormant, interim] = outline.chapters[0].stops[0].flags;
  assert.equal(dormant.status, 'candidate');
  assert.equal(interim.status, 'confirmed');
  assert.equal(interim.completedBy, '2');
  assert.equal(outline.chapters[0].claims[0].state, 'later');
  assert.equal(outline.chapters[1].stops[0].scene, 'inbox');
  assert.equal(outline.spine.hops[0].from, 'Producer');
  assert.equal(outline.glossary.length, 1);
});

test('rejects a verdict that names no flag', () => {
  const verdicts = { flags: [{ stop: 'c2-s1', type: 'dormant', status: 'dropped' }] };
  const { errors } = assemble({ stack, chapterFiles: files(), verdicts });
  assert.match(errors.join('\n'), /no dormant flag on c2-s1/);
});
