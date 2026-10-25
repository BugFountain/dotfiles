// A cue is a sound with one meaning (kits/motion-sound.md#audio-style-guide).
// A played name with no preset is silent, and a name with no row in the guide
// has no agreed meaning; either one fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const presets = new Set([...read('runtime/sound.js').matchAll(/^ {4}([a-z]+): \{/gm)].map((m) => m[1]));
const rows = new Set([...read('../kits/motion-sound.md').matchAll(/^\| [A-Z][a-z]+ \| `([a-z]+)`/gm)].map((m) => m[1]));

// Every cue name a runtime call can play: the literal arguments of S.play,
// WTSound.play, api.cue and page.js's cue, the sound a page.js move names,
// and the flow's hop table.
function played(src) {
  const names = new Set();
  for (const m of src.matchAll(/(?:S\.play|WTSound\??\.play|\.cue|\bcue)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/'([a-z]+)'/g)) names.add(q[1]);
  for (const m of src.matchAll(/\bsound: '([a-z]+)'/g)) names.add(m[1]);
  const via = /const VIA_CUE = \{([^}]*)\}/.exec(src);
  if (via) for (const q of via[1].matchAll(/\['([a-z]+)'/g)) names.add(q[1]);
  return names;
}

test('every played cue has a preset and a row in the audio style guide', () => {
  const names = new Set([...played(read('runtime/walkthrough.js')), ...played(read('runtime/motion.js')), ...played(read('runtime/page.js'))]);
  assert.ok(names.size > 10, `found only ${names.size} played cues; the call-site pattern no longer matches`);
  for (const n of names) {
    assert.ok(presets.has(n), `${n} is played but has no preset in sound.js`);
    assert.ok(rows.has(n), `${n} is played but has no row in kits/motion-sound.md`);
  }
  for (const n of rows) assert.ok(presets.has(n), `${n} has a row but no preset`);
  for (const n of presets) assert.ok(rows.has(n), `${n} has a preset but no row`);
});

// Every layer of every preset, read from sound.js itself.
function presetLayers() {
  const window = {};
  vm.runInNewContext(read('runtime/sound.js'), { window, performance: { now: () => 0 }, navigator: {}, setTimeout });
  return Object.entries(window.WTSound.presets).flatMap(([name, p]) =>
    (typeof p.layers === 'function' ? p.layers({ duration: 0.8 }) : p.layers).map((L) => [name, L]),
  );
}

test('every cue stays inside what laptop speakers play cleanly', () => {
  const layers = presetLayers();
  assert.ok(layers.length > 30, `read only ${layers.length} layers; the presets no longer load`);
  for (const [name, L] of layers) {
    const at = `${name}: ${L.tone ?? L.noise} at ${L.f} Hz`;
    if (L.tone) {
      assert.ok(Math.min(L.f, L.to ?? L.f) >= 220, `${at} goes under 220 Hz, which laptop speakers distort`);
      assert.ok(L.a >= 0.004, `${at} rises in ${L.a * 1000} ms; a tone faster than 4 ms clicks`);
    } else {
      assert.notEqual(L.noise, 'highpass', `${at} is highpassed noise, a hiss that sounds like clipping`);
      assert.ok(Math.max(L.f, L.to ?? L.f) <= 4000, `${at} puts noise above 4 kHz, a hiss that sounds like clipping`);
      assert.ok(L.a >= 0.002, `${at} rises in ${L.a * 1000} ms; noise faster than 2 ms clicks`);
    }
  }
});
