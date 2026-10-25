#!/usr/bin/env node
// Merges one chapter file per layer and a stack file into the outline that
// render.mjs draws. The merge is mechanical, so no model retypes a chapter.
// Cross-layer verdicts (flag and claim status, hop proof, node names) arrive
// as a small overlay file.
//
// Usage:
//   node assemble.mjs --stack <stack.json> --chapters <dir> --out <outline.json> [--verdicts <a.json>[,<b.json>…]] [--brief <brief.json>] [--caveats <caveats.json>]
//
// --brief takes the brief from its own file, in place of the stack file's `brief`,
// and --caveats the known caveats, a JSON array, in place of its `caveats`.
//
// Writes <outline.json>, and storyboards.json beside it with every chapter's
// scene storyboards.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from './diff-index.mjs';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function assemble({ stack, chapterFiles, verdicts = {} }) {
  const errors = [];
  const rename = (name) => verdicts.nodes?.[name] ?? name;
  const chapters = [];
  const hops = [];
  const glossary = [];
  const storyboards = [];
  const seenTerms = new Set();
  const seenHops = new Set();

  for (const layer of stack.layers) {
    const file = chapterFiles.get(layer.id);
    if (!file) {
      errors.push(`layer ${layer.id} has no chapter file`);
      continue;
    }
    const { hops: layerHops = [], glossary: terms = [], scenes = [] } = file;
    for (const chapter of file.chapters ?? [file.chapter]) {
      if (chapter.layer !== layer.id) errors.push(`chapter file for ${layer.id} holds layer ${chapter.layer}`);
      chapters.push(chapter);
    }
    for (const h of layerHops) {
      if (seenHops.has(h.id)) errors.push(`hop id ${h.id} appears twice`);
      seenHops.add(h.id);
      hops.push({ ...h, from: rename(h.from), to: rename(h.to), layer: h.layer ?? layer.id });
    }
    for (const t of verdicts.glossary ? [] : terms) {
      const k = t.term.toLowerCase();
      if (seenTerms.has(k)) continue;
      seenTerms.add(k);
      glossary.push(t);
    }
    for (const s of scenes) storyboards.push({ layer: layer.id, ...s });
  }

  const stops = new Map(chapters.flatMap((ch) => ch.stops.map((s) => [s.id, s])));
  const judged = new WeakSet();
  for (const v of verdicts.flags ?? []) {
    const f = stops.get(v.stop)?.flags?.find((x) => x.type === v.type && !judged.has(x));
    if (!f) {
      errors.push(`verdict names no ${v.type} flag on ${v.stop}`);
      continue;
    }
    for (const k of ['status', 'completedBy', 'text', 'evidence']) if (v[k] !== undefined) f[k] = v[k];
    judged.add(f);
  }
  // A stop correction replaces prose, the scene id, or the flag list (to add a
  // flag the extractor missed); hunk citations stay as the extractor made them.
  for (const v of verdicts.stops ?? []) {
    const s = stops.get(v.id);
    if (!s) {
      errors.push(`verdict names no stop ${v.id}`);
      continue;
    }
    for (const k of ['title', 'gist', 'detail', 'slowDown', 'untested', 'scene', 'transition', 'flags']) if (v[k] !== undefined) s[k] = v[k];
  }
  const byChapter = new Map(chapters.map((ch) => [ch.id, ch]));
  for (const v of verdicts.chapters ?? []) {
    const ch = byChapter.get(v.id);
    if (!ch) {
      errors.push(`verdict names no chapter ${v.id}`);
      continue;
    }
    for (const k of ['title', 'gist', 'intent', 'before', 'after', 'entry', 'takeaways']) if (v[k] !== undefined) ch[k] = v[k];
  }
  for (const v of verdicts.claims ?? []) {
    const ch = byChapter.get(v.chapter);
    const c = ch && (Number.isInteger(v.index) ? ch.claims[v.index] : ch.claims.find((x) => x.text === v.text));
    if (!c) {
      errors.push(`verdict names no claim ${v.index ?? JSON.stringify(v.text)} in ${v.chapter}`);
      continue;
    }
    for (const k of ['state', 'completedBy', 'text', 'tests', 'stops']) if (v[k] !== undefined) c[k] = v[k];
  }
  // Answer quotes: where in a stop's prose a question or a card is answered.
  for (const v of verdicts.looks ?? []) {
    const ch = byChapter.get(v.chapter);
    const target = Number.isInteger(v.qa) ? ch?.qa[v.qa] : Number.isInteger(v.card) ? ch?.selfCheck[v.card] : null;
    if (!target) {
      errors.push(`look verdict names no ${Number.isInteger(v.card) ? `card ${v.card}` : `question ${v.qa}`} in ${v.chapter}`);
      continue;
    }
    if (Number.isInteger(v.qa)) target.look = v.look;
    else target.quote = v.quote;
  }
  // Hops no single chapter owns, such as an external system calling back in.
  for (const h of stack.spine.hops ?? []) {
    if (seenHops.has(h.id)) errors.push(`hop id ${h.id} appears twice`);
    seenHops.add(h.id);
    hops.push(h);
  }
  const hopById = new Map(hops.map((h) => [h.id, h]));
  for (const v of verdicts.hops ?? []) {
    const h = hopById.get(v.id);
    if (!h) {
      errors.push(`verdict names no hop ${v.id}`);
      continue;
    }
    for (const k of ['from', 'to', 'via', 'proof', 'note', 'label', 'lane', 'stop', 'story', 'sub']) if (v[k] !== undefined) h[k] = v[k];
  }

  const outline = {
    version: 1,
    kind: stack.kind ?? 'stack',
    title: stack.title,
    ...(stack.name ? { name: stack.name } : {}),
    repo: stack.repo,
    ...(stack.generatedAt ? { generatedAt: stack.generatedAt } : {}),
    intro: stack.intro,
    ...(stack.brief ? { brief: stack.brief } : {}),
    ...(stack.caveats?.length ? { caveats: stack.caveats } : {}),
    layers: stack.layers,
    spine: {
      lanes: stack.spine.lanes,
      hops,
      ...(verdicts.acts ?? stack.spine.acts ? { acts: verdicts.acts ?? stack.spine.acts } : {}),
      ...(verdicts.narration ?? stack.spine.narration ? { narration: verdicts.narration ?? stack.spine.narration } : {}),
      ...(verdicts.systems ?? stack.spine.systems ? { systems: verdicts.systems ?? stack.spine.systems } : {}),
    },
    chapters,
    biographies: verdicts.biographies ?? stack.biographies ?? [],
    glossary: verdicts.glossary ?? [...glossary, ...(stack.glossary ?? [])],
    ...(stack.reference ? { reference: stack.reference } : {}),
  };
  return { outline, storyboards, errors };
}

// Several verifiers can each own a slice: lists concatenate, maps merge, and
// the last file that sets biographies, glossary, acts, narration or systems wins.
export function mergeVerdicts(files) {
  const out = {};
  for (const v of files) {
    for (const k of ['flags', 'claims', 'stops', 'chapters', 'hops', 'looks']) if (v[k]) out[k] = [...(out[k] ?? []), ...v[k]];
    if (v.nodes) out.nodes = { ...out.nodes, ...v.nodes };
    for (const k of ['biographies', 'glossary', 'acts', 'narration', 'systems']) if (v[k]) out[k] = v[k];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.stack || !args.chapters || !args.out) {
    console.error('usage: assemble.mjs --stack <stack.json> --chapters <dir> --out <outline.json> [--verdicts <a.json>[,<b.json>…]] [--brief <brief.json>] [--caveats <caveats.json>]');
    process.exit(2);
  }
  const stack = readJson(resolve(args.stack));
  if (args.brief) stack.brief = readJson(resolve(args.brief));
  if (args.caveats) stack.caveats = readJson(resolve(args.caveats));
  const chapterFiles = new Map();
  for (const l of stack.layers) {
    const p = join(resolve(args.chapters), `chapter-${l.id}.json`);
    if (existsSync(p)) chapterFiles.set(l.id, readJson(p));
  }
  const verdicts = mergeVerdicts(args.verdicts ? String(args.verdicts).split(',').map((p) => readJson(resolve(p))) : []);
  const { outline, storyboards, errors } = assemble({ stack, chapterFiles, verdicts });
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  const out = resolve(args.out);
  writeFileSync(out, `${JSON.stringify(outline, null, 2)}\n`);
  writeFileSync(join(dirname(out), 'storyboards.json'), `${JSON.stringify(storyboards, null, 2)}\n`);
  const candidates = outline.chapters.flatMap((ch) => ch.stops.flatMap((s) => (s.flags ?? []).filter((f) => (f.status ?? 'candidate') === 'candidate').map((f) => `${s.id} ${f.type}`)));
  console.log(`wrote ${out}: ${outline.chapters.length} chapters, ${outline.chapters.reduce((n, ch) => n + ch.stops.length, 0)} stops, ${outline.spine.hops.length} hops, ${outline.glossary.length} terms`);
  if (candidates.length) console.log(`flags still candidate: ${candidates.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
