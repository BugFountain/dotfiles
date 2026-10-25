// The glossary filter finds a term from the words a reader remembers: in any
// order, with a slip, or only in its definition, and ranks the term that
// carries the words in its name first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const win = {};
runInNewContext(readFileSync(new URL('./runtime/search.js', import.meta.url), 'utf8'), { window: win });
const { score } = win.WTSearch;

const terms = [
  ['Plan run', 'One execution of a pinned Plan version, from the start command to its settle.'],
  ['Command inbox', 'The table that records each Kafka delivery before the worker acts on it.'],
  ['Step', 'One node of a Plan graph that the interpreter walks.'],
  ['Alias pointer', 'The row that names which published version a Plan alias serves.'],
];
const find = (q) =>
  terms
    .map(([name, def]) => [name, score(q, name, def)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

test('words typed out of order or with one slip still find the term', () => {
  assert.equal(find('run plan')[0], 'Plan run');
  assert.equal(find('inbox comand')[0], 'Command inbox');
  assert.equal(find('stpe')[0], 'Step');
  assert.equal(find('alais')[0], 'Alias pointer');
});

test('a term named by the words outranks one whose definition only mentions them', () => {
  assert.deepEqual(find('plan').slice(0, 1), ['Plan run']);
  assert.ok(find('plan').includes('Step'), 'a definition match still shows');
  assert.deepEqual(find('kafka delivery'), ['Command inbox']);
});

test('a word that fits nothing hides every term', () => {
  assert.deepEqual(find('plan zebra'), []);
  assert.deepEqual(find('xq'), []);
});
