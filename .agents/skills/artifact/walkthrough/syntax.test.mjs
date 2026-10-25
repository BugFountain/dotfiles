// Syntax colors wrap diff text in tags; they must never change a character of
// the evidence, and the change marks must land on the words that changed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paint, paintHunk, tokenize } from './syntax.mjs';

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('painting keeps every character of a line, whatever it holds', () => {
  const lines = [
    `const url = 'https://x.io/a//b'; // a "quote" & <tag>`,
    'const t = `line ${a + "b"} /* not a comment */`;',
    `if (s === "it's \\"escaped\\"" && n > 0x1f) return /re\\/x/g;`,
    '  -- SELECT * FROM "table" WHERE a <> \'b\';',
    'key: "value" # comment: with colon',
    '→ unicode ✓ “quotes” and a tab\tafter',
  ];
  for (const [i, line] of lines.entries()) {
    const lang = ['js', 'js', 'js', 'sql', 'yaml', 'js'][i];
    const { tokens } = tokenize(line, lang);
    assert.equal(text(paint(line, tokens, [[2, 6]])), line);
  }
  const hunk = paintHunk(
    lines.map((l, i) => [i % 2 ? '+' : '-', l, i, i]),
    'src/a.ts',
  );
  hunk.forEach((html, i) => assert.equal(text(html), lines[i]));
});

test('a comment marker inside a string stays string, and a block comment runs on only on its own side', () => {
  const [str] = tokenize("const u = 'http://x'; // note", 'js').tokens.filter((t) => t.k === 'ys');
  assert.equal("const u = 'http://x'; // note".slice(str.s, str.e), "'http://x'");
  const html = paintHunk(
    [
      ['-', '/* old comment opens', 1, null],
      ['+', 'const kept = 1;', null, 1],
      ['-', 'still old comment */', 2, null],
      ['+', 'const next = 2;', null, 2],
    ],
    'src/a.ts',
  );
  assert.match(html[2], /^<i class="yc">still old comment \*\/<\/i>$/);
  assert.match(html[3], /<i class="yk">const<\/i> next/);
});

test('a removed line and the added line that replaces it mark only the words that changed', () => {
  const [del, add] = paintHunk(
    [
      ['-', 'if (membership == null) {', 1, null],
      ['+', 'if (identity === null) {', null, 1],
    ],
    'src/a.ts',
  );
  const marked = (html) => [...html.matchAll(/<i class="[^"]*yx[^"]*">([^<]*)<\/i>/g)].map((m) => m[1]).join('|');
  assert.equal(marked(del), 'membership ==');
  assert.equal(marked(add), 'identity ===');
  const [a, b] = paintHunk(
    [
      ['-', 'return { name: group.name, key: group.key };', 1, null],
      ['+', 'await queue.flush(batch);', null, 1],
    ],
    'src/a.ts',
  );
  assert.doesNotMatch(a + b, /yx/, 'a rewritten line reads whole, with no word marks');
});

test('binary and octal literals tokenize as numbers, whole, beside hex', () => {
  for (const [line, lit] of [
    ['const flags = 0b1010;', '0b1010'],
    ['const bits = 0B1100;', '0B1100'],
    ['const perm = 0o644;', '0o644'],
    ['const mask = 0xFF;', '0xFF'],
  ]) {
    const { tokens } = tokenize(line, 'js');
    const nums = tokens.filter((t) => t.k === 'yn').map((t) => line.slice(t.s, t.e));
    assert.deepEqual(nums, [lit]);
  }
});
