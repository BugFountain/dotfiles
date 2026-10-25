// The parts both kinds of page draw from runtime/markup.js stay whole: every
// key a control names prints the key a keyboard shows, every icon a page asks
// for is on the sheet, and no control in the page's shell carries a keycap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WTMarkup as M, shellView } from './views.mjs';

const SOURCES = ['views.mjs', 'render.mjs', 'runtime/walkthrough.js', 'runtime/page.js', 'runtime/motion.js'];
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
// A shortcut as aria-keyshortcuts spells it, as the key the keycap takes.
const asKey = (k) => (k === 'Space' ? ' ' : k.split('+').at(-1));

function namedKeys() {
  const keys = new Set();
  for (const f of SOURCES) {
    const src = read(f);
    for (const m of src.matchAll(/keycap\('((?:\\'|[^'])+)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
    for (const m of src.matchAll(/aria-keyshortcuts="([^"$]+)"/g)) for (const k of m[1].split(' ')) keys.add(asKey(k));
  }
  return keys;
}

test('every key a control names shows the key a keyboard prints, not its DOM name', () => {
  const raw = [...namedKeys()].filter((k) => k.length > 1 && !(k in M.KEY_LABEL));
  assert.deepEqual(raw, [], `these keys print their DOM name on their keycap; give each a legend in KEY_LABEL: ${raw.join(', ')}`);
  const legend = (k) => /<kbd[^>]*>([^<]*)<\/kbd>/.exec(M.keycap(k))[1];
  assert.equal(legend('ArrowLeft'), '←');
  assert.equal(legend(' '), 'space');
});

test('every icon a page draws is on the sheet', () => {
  const named = new Set();
  for (const f of SOURCES) for (const m of read(f).matchAll(/\bicon\('([a-z-]+)'/g)) named.add(m[1]);
  const missing = [...named].filter((n) => !(n in M.ICONS));
  assert.deepEqual(missing, [], `no symbol for: ${missing.join(', ')}`);
  const sheet = M.sprite();
  for (const n of named) assert.match(sheet, new RegExp(`<symbol id="wt-i-${n}"`));
});

test("no control in the page's shell carries a keycap: it names its keys for the peek", () => {
  const outline = { title: 'A walk', chapters: [], glossary: [] };
  const ctx = { layerIndex: new Map(), layerLabel: (id) => id };
  const html = shellView(ctx, outline, { opening: '', chapters: '', closing: '', rail: '' });
  const controls = [...html.matchAll(/<(button|a)\b[^>]*aria-keyshortcuts="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
  assert.ok(controls.length >= 8, `the shell names ${controls.length} shortcuts`);
  // A keycap beside the control's icon or word says the same thing twice;
  // keys.js shows the keys in the control's peek on hover and keyboard focus.
  const capped = controls.filter(([, , , inner]) => inner.includes('<kbd')).map(([, , shortcuts]) => shortcuts);
  assert.deepEqual(capped, []);
});
