// Every layer closes the same way: Escape closes the newest one first and
// gives focus back to its opener, and a press beside a drawer closes it
// without taking the focus the press chose, while its own toggle keeps the
// toggle's job.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function page() {
  const listeners = {};
  const document = { body: { name: 'body' }, activeElement: null, addEventListener: (type, fn) => (listeners[type] = fn) };
  document.activeElement = document.body;
  const win = { document };
  runInNewContext(readFileSync(new URL('./runtime/layers.js', import.meta.url), 'utf8'), { window: win });
  const el = (name, kids = []) => {
    const node = { name, kids, contains: (t) => t === node || kids.some((k) => k.contains(t)), focus: () => (document.activeElement = node) };
    return node;
  };
  const press = (target) => listeners.pointerdown({ target });
  return { L: win.WTLayers, document, el, press };
}

test('Escape closes the newest layer first, and focus goes back to its opener', () => {
  const { L, document, el } = page();
  const closed = [];
  const link = el('chapter link');
  const drawer = el('drawer', [link]);
  const toggle = el('menu toggle');
  const panel = el('voice panel');
  L.open(drawer, { close: () => closed.push('drawer'), opener: toggle });
  L.open(panel, { close: () => closed.push('panel') });
  link.focus();
  assert.equal(L.closeTop(), true);
  assert.deepEqual(closed, ['panel']);
  assert.equal(L.top(), drawer);
  assert.equal(L.closeTop(), true);
  assert.deepEqual(closed, ['panel', 'drawer']);
  assert.equal(document.activeElement, toggle);
  assert.equal(L.closeTop(), false);
});

test('a press beside the drawer closes it and leaves focus where the press puts it', () => {
  const { L, document, el, press } = page();
  let shut = 0;
  const link = el('chapter link');
  const drawer = el('drawer', [link]);
  const toggle = el('menu toggle');
  const main = el('reading column');
  L.open(drawer, { close: () => shut++, opener: toggle });
  link.focus();
  press(link);
  press(toggle);
  assert.equal(shut, 0);
  press(main);
  assert.equal(shut, 1);
  assert.equal(L.isOpen(drawer), false);
  assert.equal(document.activeElement, link);
});

test('closed() restores focus to the opener when a layer closes its own way', () => {
  const { L, document, el } = page();
  const link = el('menu item');
  const panel = el('menu panel', [link]);
  const toggle = el('menu toggle');
  L.open(panel, { close: () => {}, opener: toggle });
  link.focus();
  L.closed(panel);
  assert.equal(document.activeElement, toggle);
  assert.equal(L.isOpen(panel), false);
  assert.equal(L.closeTop(), false);
});

test('closing a layer opened without an opener restores focus to whatever was active when it opened', () => {
  const { L, document, el } = page();
  const trigger = el('inline command');
  const item = el('panel item');
  const panel = el('quick panel', [item]);
  trigger.focus();
  L.open(panel, { close: () => {} });
  item.focus();
  assert.equal(L.closeTop(), true);
  assert.equal(document.activeElement, trigger);
});

test('restore() leaves focus alone once the reader has already moved it outside the layer', () => {
  const { L, document, el } = page();
  const link = el('menu item');
  const drawer = el('drawer', [link]);
  const toggle = el('menu toggle');
  const elsewhere = el('reading column');
  L.open(drawer, { close: () => {}, opener: toggle });
  elsewhere.focus();
  assert.equal(L.closeTop(), true);
  assert.equal(document.activeElement, elsewhere);
});

test('opening the same layer again moves it to the top instead of duplicating it', () => {
  const { L, el } = page();
  const closedOrder = [];
  const a = el('layer a');
  const b = el('layer b');
  L.open(a, { close: () => closedOrder.push('a') });
  L.open(b, { close: () => closedOrder.push('b') });
  L.open(a, { close: () => closedOrder.push('a') });
  assert.equal(L.top(), a);
  assert.equal(L.closeTop(), true);
  assert.deepEqual(closedOrder, ['a']);
  assert.equal(L.top(), b);
  assert.equal(L.closeTop(), true);
  assert.deepEqual(closedOrder, ['a', 'b']);
  assert.equal(L.closeTop(), false);
});
