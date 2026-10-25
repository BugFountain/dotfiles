// A compacted snapshot puts megabytes on one diff line. The page must stay
// under the artifact size limit and still show what changed on that line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SQ, caveatWhere, caveatsOn, cutLines, flowSteps, hunkRows, inline, seqLayout, termMarker, unmark, withMarks } from './views.mjs';
import { catalogProblems } from './catalog.mjs';
import { narrationScript } from './narration.mjs';

test('cuts a long changed line to a window around the change', () => {
  const pad = 'x'.repeat(50_000);
  const [old, next] = cutLines([
    ['-', `${pad}"version":1${pad}`, 1, null],
    ['+', `${pad}"version":2${pad}`, null, 1],
  ]);
  assert.ok(next.text.length < 2_000);
  assert.match(old.text, /"version":1/);
  assert.match(next.text, /"version":2/);
  assert.deepEqual(next.cut.slice(2), [100_011]);
});

test("a cut line's rows stay inside the catalog, so render.mjs draws them", () => {
  const { html } = hunkRows({ header: '@@ -1 +1 @@', file: 'snap.json', lines: [['+', 'x'.repeat(4_101), null, 1], ['\\', ' No newline at end of file', null, null]] });
  assert.match(html, /line cut: characters 1–1,200 of 4,101/);
  assert.deepEqual(catalogProblems(html), []);
});

// A question's link lands on a <mark>; a mark opened inside a code span, or two
// marks for overlapping quotes, would break the markup around the answer.
test('marks an answer quote around the markup it contains', () => {
  const table = [];
  const text = 'The repo checks `(id, tenant)` first. A foreign tenant gets an error.';
  const quotes = [
    { quote: 'The repo checks `(id, tenant)` first.', id: 'q0' },
    { quote: 'checks `(id, tenant)` first. A foreign tenant', id: 'q1' },
  ];
  assert.equal(
    unmark(inline(withMarks(text, quotes, table)), table),
    '<mark class="answer" data-answer="q0 q1">The repo checks <code class="inline-code" translate="no">(id, tenant)</code> first. A foreign tenant</mark> gets an error.',
  );
});

// An act's diagram gives each component one column, a system's heads side by
// side in the outline's order, and each hop one row: an arrow in the wrong
// column points at the wrong component, a system split in two reads as two
// systems, and a name wider than its box at the figure's narrowest width runs
// into its neighbor.
test("lays out an act's diagram: columns grouped by system, one row per hop, every name inside its box", () => {
  const systems = [
    { id: 'app', title: 'App', nodes: ['Worker', 'Interpreter'] },
    { id: 'db', title: 'Postgres', nodes: ['Run row'] },
  ];
  const hops = [
    { from: 'Worker', to: 'Run row', via: 'db', label: 'insert the run' },
    { from: 'Run row', to: 'Interpreter', via: 'hatchet', label: 'wake the interpreter' },
    { from: 'Interpreter', to: 'Vendor', via: 'http', label: 'place the call' },
    { from: 'Vendor', to: 'Vendor', via: 'other', label: 'ring' },
  ];
  const L = seqLayout(systems, hops);
  assert.deepEqual(L.cols, ['Worker', 'Interpreter', 'Run row', 'Vendor']);
  assert.deepEqual(L.groups.map((g) => [g.title, g.start, g.end]), [['App', 0, 1], ['Postgres', 2, 2], ['other', 3, 3]]);
  assert.deepEqual(L.rows.map((r) => [r.from, r.to]), [[0, 2], [2, 1], [1, 3], [3, 3]]);
  const crowded = Array.from({ length: 9 }, (_, i) => ({ from: `Component number ${i}`, to: `Component number ${i + 1}`, via: 'call', label: 'x' }));
  const C = seqLayout([], crowded);
  assert.equal(C.tiers, 2, 'ten heads in one tier leave each name a sliver');
  for (const layout of [L, C]) {
    const col = layout.minWidth / layout.cols.length;
    for (const h of layout.heads) for (const line of h.lines) assert.ok(line.length * SQ.char + 10 <= col * h.span * 0.92 + 0.5, `"${line}" overflows its box at ${layout.minWidth}px`);
  }
});

// The flow spends its steps on the stack's hops. When flowSteps in views.mjs
// stops merging a run of hops from before the stack, the player's steps
// (render.mjs's DATA.flow), the dot map, the act diagram and narrationScript
// give every gray hop a step and a line of its own again.
test('passes a run of hops from before the stack as one step, inside its act, read as one line', () => {
  const hop = (id, layer, from, to) => ({ id, lane: 'runtime', from, to, label: id, via: 'call', layer, proof: 'tested', story: `Line ${id}.` });
  const outline = {
    title: 'Inbox',
    spine: {
      lanes: [{ id: 'runtime', title: 'Runtime' }],
      hops: [hop('b1', 'base', 'App', 'Api'), hop('b2', 'base', 'Api', 'Log'), hop('s1', 'l1', 'Log', 'Worker'), hop('b3', 'base', 'Worker', 'Vendor'), hop('b4', 'base', 'Vendor', 'Api')],
      acts: [
        { id: 'a1', title: 'Start', hops: ['b1', 'b2', 's1', 'b3'] },
        { id: 'a2', title: 'Finish', hops: ['b4'] },
      ],
    },
  };
  const steps = flowSteps(outline);
  assert.deepEqual(steps.map((s) => (s.passing ? `passing ${s.hops.map((h) => h.id).join('+')}` : s.id)), ['passing b1+b2', 's1', 'passing b3', 'passing b4']);
  assert.equal(steps[0].label, 'App → Api → Log');
  const lines = narrationScript(outline, steps).filter((s) => s.kind === 'hop').map((s) => s.text);
  assert.deepEqual(lines, ['Unchanged by this change: App, Api and Log.', 'Line s1.', 'Unchanged by this change: Worker and Vendor.', 'Unchanged by this change: Vendor and Api.']);
});

test('marks a glossary term as prose writes it, and never inside code', () => {
  const T = termMarker([
    { term: 'Drain', def: 'Applies pending events.' },
    { term: 'Stand-down', def: 'Returning without a write.' },
    { term: 'Owed work', def: 'What the rows still owe.' },
    { term: 'hatchet-lite', def: 'The local Hatchet image.' },
  ]).scope;
  const marked = (text) => [...inline(text, T()).matchAll(/data-term="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(marked('The drain applies each event.'), ['Drain']);
  assert.deepEqual(marked('Two drains overlap.'), ['Drain']);
  assert.deepEqual(marked('The task makes a stand down, then owed-work waits.'), ['Stand-down', 'Owed work']);
  assert.deepEqual(marked('`drain` runs; `hatchet-lite` boots.'), ['hatchet-lite']);
  assert.deepEqual(marked('A drainpipe and a redrain.'), []);
});

// A stop named by a caveat's `where` and by an open flag linking it carries one
// marker, and a hop and a stop that share caveats list each once, in list order.
test('marks a caveat once per stop and lists a place\'s caveats once each, in list order', () => {
  const outline = { chapters: [{ stops: [{ id: 'c1-s1', flags: [{ status: 'open', caveat: 'b' }, { status: 'dropped', caveat: 'a' }] }, { id: 'c1-s2' }] }] };
  assert.deepEqual(caveatWhere(outline, { id: 'b', where: ['c1-s1', 'h3'] }), ['c1-s1', 'h3']);
  assert.deepEqual(caveatWhere(outline, { id: 'a', where: ['c1-s2'] }), ['c1-s2']);
  const a = { c: { id: 'a' }, n: 1 };
  const b = { c: { id: 'b' }, n: 2 };
  const ctx = { caveatsAt: new Map([['h3', [b, a]], ['c1-s1', [a]]]) };
  assert.deepEqual(caveatsOn(ctx, ['h3', 'c1-s1']).map((x) => x.c.id), ['a', 'b']);
});
