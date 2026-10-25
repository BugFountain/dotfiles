// The domain model chart lays itself out. An arrow that points up for no
// reason reads as the wrong owner, two boxes in one place hide one, an arrow
// that skips a rank through a box reads as a relation to that box, and two
// labels on one spot read as neither.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DM, modelLayout } from './views.mjs';

test('lays out a domain model down its arrows: one arrow up per cycle, no box on another, no arrow through a box, no label on another', () => {
  const entities = ['talent', 'execution', 'event', 'run', 'task', 'debit', 'webhook'].map((id) => ({ id, name: id, line: `the ${id} row` }));
  entities[3].tag = 'new #9491';
  const rel = (from, to, label) => ({ from, to, label, text: label });
  const relations = [
    rel('talent', 'execution', 'has many'),
    rel('execution', 'run', 'carried by'),
    rel('run', 'event', 'drains'),
    rel('execution', 'event', 'has many'),
    rel('execution', 'webhook', 'receives'),
    rel('webhook', 'task', 'starts'),
    rel('webhook', 'debit', 'starts'),
    rel('task', 'execution', 'completes a step of'),
  ];
  const L = modelLayout(entities, relations);
  assert.deepEqual(modelLayout(entities, relations), L, 'the same model draws a different chart');
  const rank = (id) => L.boxes.get(id).rank;
  const up = L.edges.filter((e) => rank(e.from) >= rank(e.to));
  assert.deepEqual(up.map((e) => `${e.from}→${e.to}`), ['task→execution'], 'only the arrow that closes the cycle points up');
  for (const [a, A] of L.boxes)
    for (const [b, B] of L.boxes) if (a < b && A.rank === B.rank) assert.ok(A.x + A.w + DM.gapX / 2 <= B.x || B.x + B.w + DM.gapX / 2 <= A.x, `${a} and ${b} overlap`);
  for (const e of L.edges)
    for (const p of e.pts.slice(1, -1))
      for (const [id, b] of L.boxes) assert.ok(!(p.x > b.x && p.x < b.x + b.w && p.y >= b.y && p.y <= b.y + b.h), `${e.from}→${e.to} runs through ${id}`);
  for (const [i, e] of L.edges.entries())
    for (const f of L.edges.slice(i + 1)) assert.ok(Math.abs(e.label.y - f.label.y) >= DM.labelH || Math.abs(e.label.x - f.label.x) >= (e.w + f.w) / 2, `the labels of ${e.from}→${e.to} and ${f.from}→${f.to} overlap`);
  for (const e of entities) assert.ok(L.boxes.get(e.id).w >= e.line.length * DM.line, `${e.id}'s line runs out of its box`);
});
