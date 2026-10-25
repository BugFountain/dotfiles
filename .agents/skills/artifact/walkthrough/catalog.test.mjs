// A page draws only the catalog's parts (kits/components.md). Each check here
// passes on the skill's own markup, runtime and styles, and goes red on a
// planted violation of the kind it exists to catch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogProblems, cssProblems, selectProblems, sourceProblems, unknownClasses } from './catalog.mjs';
import { lintProse } from './check.mjs';
import { shellView } from './views.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const RUNTIME = ['walkthrough.js', 'page.js', 'motion.js', 'markup.js', 'layers.js', 'sound.js', 'search.js', 'confetti.js', 'juice.js', 'voice.js', 'keys.js', 'disclose.js', 'trail.js'];

test("render.mjs's catalog check passes the page's shell and refuses each kind of stray part", () => {
  const html = shellView({ layerIndex: new Map(), layerLabel: (id) => id }, { title: 'A walk', chapters: [], glossary: [] }, { opening: '', chapters: '', closing: '', rail: '' });
  assert.deepEqual(catalogProblems(html), []);
  const planted = catalogProblems('<span class="tag chip">x</span><i style="color:red">y</i><p>flagged ⚑ here</p><pre>a ─▶ b</pre><kbd class="key" data-key="ArrowLeft">ArrowLeft</kbd>');
  assert.equal(planted.length, 4, planted.join('\n'));
  assert.match(planted.join('\n'), /class "chip"/);
  assert.match(planted.join('\n'), /style "color:red"/);
  assert.match(planted.join('\n'), /glyph "⚑"/);
  assert.match(planted.join('\n'), /not built by keycap/);
});

test("the runtime's templates draw only catalog classes, no glyph icon and no hand-built keycap", () => {
  for (const f of RUNTIME) assert.deepEqual(sourceProblems(read(`runtime/${f}`), { name: f, keycapHome: f === 'markup.js' }), []);
  const planted = sourceProblems("el.innerHTML = `<span class=\"chip ${on ? 'on' : ''}\">⚑ flagged</span><kbd>x</kbd>`; el.classList.add('pill-ish');", { name: 'planted.js' });
  assert.equal(planted.length, 4, planted.join('\n'));
});

test('the stylesheets take colors, radii, spaces and tints from tokens outside :root, stay flat, and dash only the code-only proof', () => {
  for (const f of ['walkthrough.css', 'page.css']) assert.deepEqual(cssProblems(read(`runtime/${f}`), f), []);
  const planted = cssProblems(':root { --x: #fff; } .x { color: #fff; border-radius: 4px; padding: 3px 40px; background: color-mix(in srgb, var(--ink) 13%, transparent); } .card:hover { transform: perspective(600px) rotateX(4deg); background: linear-gradient(var(--ink), var(--bg)); } .tag.count { border-style: dashed; } .tag.assembled { border-style: dashed; } .tag.assembled, .panel { border: 1px dashed var(--hair); }');
  assert.equal(planted.length, 8, planted.join('\n'));
  assert.match(planted.join('\n'), /tilt on hover[\s\S]*gradient[\s\S]*\.tag\.count \{ border-style: dashed \}: a dashed border[\s\S]*\.tag\.assembled, \.panel \{ border: 1px dashed var\(--hair\) \}: a dashed border/);
});

test("page-check.mjs's walk names each class no component owns", () => {
  assert.deepEqual(unknownClasses(['tag', 'layer', 'i-test', 'sq-row', 'chip', 'tag', 'wtp-done']), ['chip', 'wtp-done']);
});

test("check.mjs warns on an emoji or a pictograph in an outline's prose, and not on an arrow", () => {
  const warnings = [];
  lintProse('The worker runs the 🧪 suite.', 'stop gist', warnings);
  lintProse('The worker hands off A → B.', 'stop detail', warnings);
  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /stop gist: "🧪"/);
});

test('a trademark or copyright sign in prose renders, while its emoji form and a pictograph do not', () => {
  assert.deepEqual(catalogProblems('<p>Sonar™ analysis. Copyright © 2026, a registered® mark.</p>'), []);
  assert.match(catalogProblems('<p>Sonar™\uFE0F analysis</p>').join('\n'), /the glyph "™\uFE0F"/);
  assert.match(catalogProblems('<p>Runs the 🧪 suite</p>').join('\n'), /the glyph "🧪"/);
  const warnings = [];
  lintProse('Copyright © 2026 Sonar™.', 'stop gist', warnings);
  assert.deepEqual(warnings, []);
});

test('every chrome root the catalog names is out of selection, and a dropped one is caught', () => {
  const css = ['page.css', 'walkthrough.css'].map((f) => read(`runtime/${f}`)).join('\n');
  assert.deepEqual(selectProblems(css), []);
  const planted = selectProblems(css.replace(/\.btn, /g, ''));
  assert.match(planted.join('\n'), /Button: chrome root "btn" stays selectable/);
});
