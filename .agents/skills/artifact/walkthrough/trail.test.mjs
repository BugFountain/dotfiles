// Back and `b` must land where the reader was before a jump, and Forward
// where Back left: an index off by one restores the wrong place, a replaced
// entry that drops its state loses the way back, and a frame that refuses
// history writes must still take `b`. The browser's history here is a small
// stand-in that keeps entries and fires popstate the way a browser does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const box = {};
runInNewContext(readFileSync(new URL('./runtime/trail.js', import.meta.url), 'utf8'), { globalThis: box });

function browser({ refuse = false } = {}) {
  const entries = [{ state: null, hash: '#c-open' }];
  let i = 0;
  const listeners = [];
  const win = {
    location: { get hash() { return entries[i].hash; } },
    addEventListener: (type, fn) => type === 'popstate' && listeners.push(fn),
    history: {
      get state() { return entries[i].state; },
      replaceState(state, _t, url) {
        if (refuse) throw new Error('SecurityError');
        entries[i] = { state, hash: url ?? entries[i].hash };
      },
      pushState(state, _t, url) {
        if (refuse) throw new Error('SecurityError');
        entries.splice(i + 1, Infinity, { state, hash: url ?? entries[i].hash });
        i++;
      },
      back() { i--; listeners.forEach((f) => f({ state: entries[i].state })); },
      forward() { i++; listeners.forEach((f) => f({ state: entries[i].state })); },
    },
    // A reload keeps the entries and drops the old page's listeners.
    reload() { listeners.length = 0; },
    // A fragment typed into the address bar: a new entry with no state.
    type(hash) {
      entries.splice(i + 1, Infinity, { state: null, hash });
      i++;
      listeners.forEach((f) => f({ state: null }));
    },
  };
  return win;
}

function reader(win) {
  const page = { y: 0, hop: 0, restored: [] };
  const trail = box.WTTrail.create({
    win,
    snapshot: () => ({ y: page.y, hop: page.hop }),
    restore: (p) => {
      page.restored.push(p);
      page.y = p.y;
      page.hop = p.hop;
    },
  });
  return { page, trail };
}

test('Back and b return to the place before each jump, and Forward to where Back left', () => {
  const win = browser();
  const { page, trail } = reader(win);
  page.y = 120;
  trail.jump('#c9491-s2', { origin: 'stop 03' });
  page.y = 4800;
  page.hop = 7;
  trail.replace('#c9491-s2');
  trail.jump('#faq');
  page.y = 9000;

  assert.equal(trail.last().y, 4800);
  assert.ok(trail.back());
  assert.deepEqual([page.y, page.hop], [4800, 7]);
  assert.ok(trail.popped('#c9491-s2'), 'the hash change Back caused is the trail\'s');
  assert.ok(!trail.popped('#c9491-s2'), 'and only once');

  win.history.back();
  assert.deepEqual([page.y, page.hop], [120, 0]);
  assert.equal(page.restored.at(-1).origin, 'stop 03');
  assert.equal(trail.last(), null);
  assert.equal(trail.back(), false);

  win.history.forward();
  assert.equal(page.y, 4800, 'Forward returns to where Back left');

  // A jump from the middle of the trail drops what lay ahead.
  trail.jump('#glossary');
  page.y = 50;
  trail.back();
  assert.equal(page.y, 4800);
});

test('b returns through memory where the frame refuses history writes', () => {
  const { page, trail } = reader(browser({ refuse: true }));
  page.y = 300;
  trail.jump('#faq');
  page.y = 7000;
  assert.ok(trail.back());
  assert.equal(page.y, 300);
  assert.equal(trail.back(), false);
});

test('leaves Back to an entry made before a reload to the page\'s hash routing', () => {
  const win = browser();
  const before = reader(win);
  before.trail.jump('#c1');
  before.trail.jump('#c-close');
  win.reload();
  const { page, trail } = reader(win);
  win.history.back();
  assert.equal(win.location.hash, '#c1');
  assert.equal(trail.popped('#c1'), false, 'the fresh trail has no place to restore');
  assert.deepEqual(page.restored, []);
});

// Back between two entries of one fragment fires no hashchange, so the
// trail's claim on it must end at the next hash the page sees.
test('a Back that left the fragment as it was claims no later hash change', () => {
  const win = browser();
  const { trail } = reader(win);
  trail.jump('#c1');
  trail.jump('#c1');
  win.history.back();
  win.type('#c-close');
  assert.equal(trail.popped('#c-close'), false);
  win.history.back();
  assert.equal(win.location.hash, '#c1');
  assert.equal(trail.popped('#c1'), false, 'the page routes to #c1');
});
