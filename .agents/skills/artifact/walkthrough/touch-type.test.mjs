// A phone lifts every pixel size under 14 px in the page's own CSS, and
// nothing else: a larger size, SVG text, a rule for wider screens and a
// keycap keep theirs (kits/interactivity.md#touch).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchType } from './touch-type.mjs';

const css = ['page.css', 'walkthrough.css'].map((f) => readFileSync(new URL(`./runtime/${f}`, import.meta.url), 'utf8')).join('\n');
const out = touchType(css);
const lifted = (sel) => out.split('\n').some((l) => l.split(/,\s*/).some((s) => s.startsWith(`${sel}:where(`)));

test('small text in the page CSS lifts to the floor, larger text stays', () => {
  assert.match(out, /^@media \(max-width: 560px\) \{/);
  assert.ok(lifted('.code'), 'diff code at 11.5px lifts');
  assert.ok(lifted('.tag'), 'a tag at 11px lifts');
  assert.ok(!lifted('.ch-head h1'), 'a 27px title is left alone');
  assert.ok(!/font-size: (?!14px)/.test(out), 'every lifted size is the floor');
});

test('a shorthand with a pixel line height keeps its proportion', () => {
  const one = touchType('.fold { font: 11px/13px var(--ui); }');
  assert.match(one, /\.fold:where\(:not\(svg \*\)\) \{ font-size: 14px; line-height: 16\.5px; \}/);
});

test('SVG text, pseudo-elements, keycaps and wider screens are not lifted', () => {
  const one = touchType('.a, .b::before { font-size: 10px; } .key { font-size: 10px; } @media (min-width: 861px) { .c { font-size: 11px; } } @media (max-width: 860px) { .d { font-size: 12px; } }');
  assert.match(one, /\.a:where\(:not\(svg \*\)\)/);
  assert.doesNotMatch(one, /::before|\.key|\.c:where/);
  assert.match(one, /\.d:where/);
});
