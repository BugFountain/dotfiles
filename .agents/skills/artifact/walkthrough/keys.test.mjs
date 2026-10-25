// A keys sheet that lists a key the page does not answer sends the reader to
// a dead key. `?` is Shift+/ on a keyboard, and a handler that dropped every
// event with Shift held left `?` listed and dead. Each key a sheet lists goes
// through WTKeys as a keyboard sends it, and must reach the page's binding.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { helpSheet } from './views.mjs';
import { unknownClasses } from './catalog.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const box = {};
runInNewContext(read('runtime/keys.js'), { globalThis: box });
const { keyOf } = box.WTKeys;

// A US layout types these with Shift held.
const SHIFTED = new Set([...'~!@#$%^&*()_+{}|:"<>?']);
const pressed = (k) => ({ key: k, shiftKey: SHIFTED.has(k), ctrlKey: false, altKey: false, metaKey: false });
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const dead = (listed, bound) => [...listed].filter((k) => !bound.has(keyOf(pressed(k))));

test('every key a keys sheet lists reaches a binding, as a keyboard sends it', () => {
  // The review page: helpSheet's keycaps against walkthrough.js's ACTIONS.
  const outline = { chapters: [{}, {}], glossary: [] };
  const listed = new Set([...helpSheet(outline).matchAll(/data-key="([^"]+)"/g)].map((m) => unescape(m[1])));
  const src = read('runtime/walkthrough.js');
  const body = /const ACTIONS = \{\n([\s\S]*?)\n {2}\};/.exec(src)[1];
  const bound = new Set([...body.matchAll(/^ {4}(?:'((?:\\'|[^'])+)'|([\w]+)):/gm)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")));
  assert.ok(listed.size >= 15 && bound.size >= 15, `${listed.size} listed, ${bound.size} bound`);
  assert.deepEqual(dead(listed, bound), [], 'the review page lists these keys and answers none of them');

  // A hand-painted page: page.js's own sheet against its switch.
  const page = read('runtime/page.js');
  const sheet = /function keySheet\(\) \{([\s\S]*?)\n {2}\}/.exec(page)[1];
  const kit = new Set([...sheet.matchAll(/(?:keycap|pair)\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])).filter((k) => !/\s/.test(k) && k !== 'esc'));
  kit.add('?');
  const handled = new Set([...page.matchAll(/case '((?:\\'|[^'])+)':|k === '((?:\\'|[^'])+)'/g)].map((m) => m[1] ?? m[2]));
  assert.deepEqual(dead(kit, handled), [], 'the page kit lists these keys and answers none of them');
});

// The arrows scroll a focused block that is wider than its column, and step
// the walk everywhere else. walkthrough.js tells the two apart by WIDE, so a
// wrapper the page draws under a class WIDE does not name steps the walk.
test('the arrows scroll every focusable wrapper the page draws, by a class the catalog holds', () => {
  const wide = /const WIDE = '([^']+)'/.exec(read('runtime/walkthrough.js'))[1].split(/,\s*/);
  const drawn = new Set([...read('views.mjs').matchAll(/<div class="([a-z][a-z0-9-]*)[^"]*" tabindex="0"/g)].map((m) => `.${m[1]}`));
  assert.ok(drawn.size > 0, 'views.mjs draws no focusable wrapper');
  assert.deepEqual([...drawn].filter((c) => !wide.includes(c)), [], 'views.mjs draws these wrappers and the arrows step past them');
  const edge = /:is\(([^)]*)\)\.is-wide/.exec(read('runtime/walkthrough.css'))[1].split(/,\s*/);
  assert.deepEqual(unknownClasses([...wide, ...edge].map((c) => c.slice(1))), [], 'the runtime selects a wrapper no component draws');
});
