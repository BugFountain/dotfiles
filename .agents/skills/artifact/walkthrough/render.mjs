#!/usr/bin/env node
// Draws one review page from an outline: static HTML for every chapter, stop
// and hunk, plus the runtime that makes it interactive. The output is page
// content without <html>/<head>/<body>, the shape a claude.ai artifact takes;
// a browser opens the same file locally.
//
// Usage:
//   node render.mjs --outline <outline.json> --layers <dir> --out <page.html> [--scenes <scenes.js>] [--narration <narration.json>] [--check] [--repo <path>]
//
// --check runs check.mjs first and refuses to render an outline with errors.
// --repo gives each call-site link a lens: the lines around it at the head.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseArgs } from './diff-index.mjs';
import { check, loadLayer, makeReader } from './check.mjs';
import { makeResolver } from './receipts.mjs';
import { caveatMarks, caveatPeek, caveatWhere, chapterView, closingView, esc, flowSteps, hopStage, icon, inline, keycap, layerVar, bareStopLinks, nestedControls, openingView, railView, shellView, stopNumbering, termMarker, withBriefDefs } from './views.mjs';
import { filesOf } from './files.mjs';
import { catalogProblems } from './catalog.mjs';
import { NARRATOR, clipName, narrationScript } from './narration.mjs';
import { langOf, paint, tokenize } from './syntax.mjs';
import { touchType } from './touch-type.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const runtime = (f) => readFileSync(join(here, 'runtime', f), 'utf8');
const MONOCRAFT = join(here, '..', 'themes', 'fonts', 'monocraft-code.woff2');

// Scenes are browser code; render reads only their titles and step captions.
export function sceneMeta(source) {
  if (!source) return {};
  const sandbox = { window: {}, document: undefined };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(source, sandbox, { timeout: 1000 });
  } catch (e) {
    throw new Error(`scenes file failed to load: ${e.message}`, { cause: e });
  }
  const defs = sandbox.window.WT_SCENES ?? sandbox.WT_SCENES ?? {};
  return Object.fromEntries(Object.entries(defs).map(([id, d]) => [id, { title: d.title, steps: (d.steps ?? []).map((s) => s.caption) }]));
}

// A lens is the few lines around a linked line at its layer's head, with
// the lines that layer adds marked, so a reader sees the code in place.
function lensOf(lines, at, added, path) {
  const text = lines.at(-1) === '' ? lines.slice(0, -1) : lines;
  if (!(at >= 1 && at <= text.length)) return null;
  const from = Math.max(1, at - 4);
  const to = Math.min(text.length, at + 5);
  // The lens colors its lines as the diff does; a comment opened above the
  // window carries in from the lines before it.
  const lang = langOf(path);
  let st = null;
  if (lang) for (let n = Math.max(1, from - 400); n < from; n++) st = tokenize(text[n - 1], lang, st).state;
  const shown = text.slice(from - 1, to);
  const html = shown.map((t) => {
    const r = lang ? tokenize(t, lang, st) : { tokens: [], state: null };
    st = r.state;
    return paint(t, r.tokens);
  });
  return { at, from, lines: shown, html, added: [...added].filter((n) => n >= from && n <= to).sort((a, b) => a - b) };
}

export function buildContext(outline, layersDir, scenes, { read = null, repo = null } = {}) {
  const layers = new Map(outline.layers.map((l) => [l.id, l]));
  const layerIndex = new Map(outline.layers.map((l, i) => [l.id, i]));
  const index = new Map();
  for (const l of outline.layers) index.set(l.id, loadLayer(layersDir, l.id));
  const homeOf = new Map();
  const homeKind = new Map();
  const home = (layer, key, stopId, kind) => {
    homeOf.set(`${layer}|${key}`, stopId);
    homeKind.set(`${layer}|${key}`, kind);
  };
  for (const ch of outline.chapters) {
    const idx = index.get(ch.layer);
    const fileHome = (path, id, kind) => {
      home(ch.layer, `file:${path}`, id, kind);
      for (const h of idx?.files.get(path)?.hunks ?? []) home(ch.layer, h.id, id, kind);
    };
    for (const s of ch.stops) {
      for (const a of s.anchors) if (a.role === 'home') home(ch.layer, a.hunk, s.id, 'anchor');
      for (const p of s.proof ?? []) {
        if (p.role !== 'home') continue;
        if (p.hunk) home(ch.layer, p.hunk, s.id, 'proof');
        else if (p.file) fileHome(p.file, s.id, 'proof');
      }
      for (const m of s.margin ?? []) {
        if (m.role !== 'home') continue;
        if (m.hunk) home(ch.layer, m.hunk, s.id, 'margin');
        else if (m.file) fileHome(m.file, s.id, 'margin');
      }
    }
    for (const h of ch.housekeeping) fileHome(h.file, `hk-${ch.id}`, 'housekeeping');
    for (const h of ch.everythingElse) fileHome(h.file, `hk-${ch.id}`, 'else');
  }
  const layerLabel = (id) => {
    if (!id) return '';
    if (id === 'base') return outline.layers.length > 1 ? 'before the stack' : 'before this PR';
    const l = layers.get(id);
    return l?.pr ? `#${l.pr}` : id;
  };
  const dispositionOf = (layerId, f) => {
    const kinds = new Set(f.hunks.map((h) => homeKind.get(`${layerId}|${h.id}`)));
    kinds.add(homeKind.get(`${layerId}|file:${f.path}`));
    if (kinds.has('anchor')) return 'primary seam';
    if (kinds.has('proof')) return 'test';
    if (kinds.has('margin')) return f.kind === 'docs' ? 'docs' : 'supporting';
    if (kinds.has('housekeeping')) return f.kind === 'generated' ? 'generated' : 'housekeeping';
    return 'everything else';
  };
  const sceneSlot = (id, stopId) => {
    const meta = scenes[id];
    if (!meta) return '';
    return `<div class="panel scene" data-scene="${esc(id)}" data-stop="${esc(stopId)}"><div class="scene-head"><span class="kicker">scene · 動き</span><strong>${esc(meta.title)}</strong></div><div class="scene-stage"><button class="scene-cover" type="button" aria-label="play the scene"><span class="play">${icon('play')}play the scene ${keycap(' ')}</span></button></div><div class="scene-bar"><span class="scene-cap" data-scene-cap><span class="n">0/${meta.steps.length}</span>press play</span><span></span><span class="scene-ctl"><button type="button" class="btn outline" data-scene-act="prev" aria-label="previous step">←</button><button type="button" class="btn outline" data-scene-act="play">play</button><button type="button" class="btn outline" data-scene-act="next" aria-label="next step">→</button><button type="button" class="btn outline" data-scene-act="replay" aria-label="replay"><span class="mouse-lbl">r</span><span class="touch-lbl">replay</span></button></span><div class="scene-scrub" data-scene-scrub>${meta.steps.map((_, i) => `<button type="button" class="gauge" data-scene-seek="${i}" aria-label="step ${i + 1}"></button>`).join('')}</div></div><ol class="scene-steps">${meta.steps.map((c) => `<li>${c}</li>`).join('')}</ol></div>`;
  };
  // The file view: every changed file per layer, with its tier, its tests and
  // the stop that first cites it.
  // A single PR may take one chapter per flow, so one layer can have several
  // chapters, each with its own file view; a hunk's whole file opens in the
  // chapter that homes it.
  const chapterOfLayer = new Map();
  for (const ch of outline.chapters) if (!chapterOfLayer.has(ch.layer)) chapterOfLayer.set(ch.layer, ch.id);
  const chapterOfStop = new Map(outline.chapters.flatMap((ch) => [[`hk-${ch.id}`, ch.id], ...ch.stops.map((s) => [s.id, ch.id])]));
  const stopNums = new Map();
  for (const ch of outline.chapters) for (const [id, n] of stopNumbering(ch)) stopNums.set(id, n);
  for (const ch of outline.chapters) stopNums.set(`hk-${ch.id}`, 'housekeeping');
  const fileViews = new Map();
  for (const ch of outline.chapters) {
    const idx = index.get(ch.layer);
    if (!idx) continue;
    const first = new Map();
    ch.stops.forEach((s, i) => {
      for (const a of s.anchors) {
        const path = idx.hunks.get(a.hunk)?.file;
        if (path && !first.has(path)) first.set(path, i);
      }
    });
    const view = filesOf([...idx.files.values()], { firstStop: (p) => first.get(p) ?? null, homeOf: (id) => homeOf.get(`${ch.layer}|${id}`) });
    view.files.forEach((f, i) => (f.i = i));
    fileViews.set(ch.id, view);
  }
  const fileRow = (chId, path) => fileViews.get(chId)?.files.find((f) => f.p === path) ?? null;
  const stopTitles = new Map(outline.chapters.flatMap((ch) => ch.stops.map((s) => [s.id, s.title])));
  const stops = new Map(outline.chapters.flatMap((ch) => ch.stops.map((s) => [s.id, s])));
  const stopLayers = new Map(outline.chapters.flatMap((ch) => ch.stops.map((s) => [s.id, ch.layer])));
  const steps = flowSteps(outline);
  // Without the repository, a link keeps only its GitHub target.
  const lenses = new Map();
  const lensFor = (layerId, path, line) => {
    const l = layers.get(layerId);
    const text = read && l && line ? read(l.head, path) : null;
    if (!text) return null;
    const key = `${layerId}|${path}|${line}`;
    if (!lenses.has(key)) {
      const added = (index.get(layerId)?.files.get(path)?.hunks ?? []).flatMap((h) => h.lines.filter((x) => x[0] === '+').map((x) => x[3]));
      const lens = lensOf(text, line, added, path);
      if (!lens) return null;
      lenses.set(key, { path, layer: layerId, ...lens });
    }
    return key;
  };
  // Answer quotes by stop: a question's look entries and a card's quote.
  const looks = new Map();
  const look = (stop, quote, id) => quote && looks.set(stop, [...(looks.get(stop) ?? []), { quote, id }]);
  for (const ch of outline.chapters) {
    ch.qa.forEach((q, i) => (q.look ?? []).forEach((l) => look(l.stop, l.quote, `${ch.id}-qa-${i}`)));
    ch.selfCheck.forEach((c, i) => look(c.stop, c.quote, `${ch.id}-sc-${i}`));
  }
  return {
    repo: outline.repo,
    layers,
    layerIndex,
    index,
    homeOf,
    homeKind,
    layerLabel,
    dispositionOf,
    sceneSlot,
    terms: termMarker(withBriefDefs(outline)),
    fileViews,
    fileRow,
    homeChapter: (layerId, hunkId) => chapterOfStop.get(homeOf.get(`${layerId}|${hunkId}`)) ?? chapterOfLayer.get(layerId) ?? `c${layerId}`,
    stopNum: (id) => stopNums.get(id),
    stopTitle: (id) => stopTitles.get(id),
    stop: (id) => stops.get(id) ?? null,
    looks,
    lensFor,
    lenses,
    resolveRef: repo ? makeResolver(repo, layers, (id) => [...(index.get(id)?.files.keys() ?? [])]) : null,
    links: new Set(),
    nums: new Map(),
    read,
    caveatsAt: caveatMarks(outline),
    caveatWhere: (c) => caveatWhere(outline, c),
    stopLayer: (id) => stopLayers.get(id) ?? null,
    hopName: (id) => {
      const h = outline.spine.hops.find((x) => x.id === id);
      return h ? `${h.from} → ${h.to}` : null;
    },
    hopNum: (id) => {
      const h = steps.find((x) => x.id === id || x.hops?.some((y) => y.id === id));
      return h ? (h.passing ? 'in passing' : `hop ${h.num}`) : null;
    },
  };
}

// Every GitHub link names a path at one commit. A path the commit lacks opens
// GitHub's 404, so the page refuses to render one. `--batch-check` reads one
// name per line, so a path that holds a newline is asked about on its own.
export function missingLinks(repo, targets) {
  const lined = targets.filter((t) => !t.includes('\n'));
  const out = lined.length ? execFileSync('git', ['-C', repo, 'cat-file', '--batch-check'], { input: `${lined.join('\n')}\n`, encoding: 'utf8', maxBuffer: 1 << 26 }) : '';
  const missing = out
    .split('\n')
    .filter((l) => l.endsWith(' missing'))
    .map((l) => l.slice(0, -' missing'.length));
  for (const t of targets.filter((t) => t.includes('\n'))) {
    try {
      execFileSync('git', ['-C', repo, 'cat-file', '-e', t], { stdio: 'ignore' });
    } catch {
      missing.push(t);
    }
  }
  return missing;
}

export function runtimeData(outline, ctx, recorded = null) {
  ctx.here = null;
  const key = createHash('sha1')
    .update(outline.repo + outline.layers.map((l) => l.head).join(','))
    .digest('hex')
    .slice(0, 12);
  return {
    key,
    title: outline.title,
    repo: outline.repo,
    layers: outline.layers.map((l) => ({ id: l.id, label: ctx.layerLabel(l.id), title: l.title, url: l.url ?? '', head: l.head, base: l.base })),
    chapters: outline.chapters.map((ch) => ({
      id: ch.id,
      layer: ch.layer,
      title: ch.title,
      gist: ch.gist,
      stops: ch.stops.map((s) => ({
        id: s.id,
        title: s.title,
        gist: s.gist,
        detail: s.detail,
        kind: s.kind,
        branch: s.branch ?? null,
        frame: s.frame,
        wake: s.wake,
        stack: s.stack,
        payload: s.payload ?? null,
        flags: (s.flags ?? []).filter((f) => f.status !== 'dropped'),
        proof: (s.proof ?? []).map((p) => ({ name: p.name, covers: p.covers ?? '' })),
        untested: s.untested ?? [],
        scene: s.scene ?? null,
      })),
    })),
    glossary: withBriefDefs(outline),
    lens: Object.fromEntries(ctx.lenses),
    // Per chapter: every changed file with its tier, tests and first stop;
    // the page builds the file view from this and the hunks already on it.
    files: Object.fromEntries(outline.chapters.filter((ch) => ctx.fileViews.has(ch.id)).map((ch) => [ch.id, ctx.fileViews.get(ch.id)])),
    narration: narrationData(outline, recorded),
    // Each entry's title and its first sentence, for the peek of a link to it.
    reference: (outline.reference ?? []).map((x) => ({ id: x.id, title: x.title.replace(/`/g, ''), line: String(x.text ?? x.faq?.[0]?.q ?? x.after ?? '').replace(/`/g, '').split(/(?<=[.!?])\s+/)[0].slice(0, 240), hops: x.hops ?? [] })),
    // Each caveat's compact card for its peek and its touch sheet; the card
    // in the reference holds its links.
    caveats: (outline.caveats ?? []).map((c, i) => ({ id: c.id, n: i + 1, title: inline(c.title), peek: caveatPeek({ c, n: i + 1 }), where: caveatWhere(outline, c) })),
    // A step in passing carries the hops it covers, for its stage to list.
    flow: flowSteps(outline).map((h, i, all) => ({ stage: hopStage(ctx, h, i, all.filter((x) => !x.passing).length, outline), id: h.id, from: h.from, to: h.to, label: h.passing ? esc(h.label) : inline(h.label), story: h.story ? inline(h.story) : null, sub: h.sub ? inline(h.sub) : null, via: h.via ?? null, layer: h.layer, proof: h.proof ?? null, stop: h.stop ?? null, lane: h.lane, laneTitle: h.laneTitle, actTitle: h.actTitle ?? null, actIndex: h.actIndex ?? null, num: h.num ?? null, ...(h.passing ? { passing: true, hops: h.hops.map((x) => ({ id: x.id, from: x.from, to: x.to, via: x.via, label: inline(x.label), story: x.story ? inline(x.story) : null, stop: x.stop ?? null })) } : {}) })),
  };
}

// The script every voice reads. With a recording (narrate.mjs), each line
// names its clip, published beside the page under the same relative path.
function narrationData(outline, recorded) {
  const voice = recorded ? { model: recorded.model, voice: recorded.voice, instructions: recorded.instructions } : NARRATOR;
  const have = new Set(recorded?.clips ?? []);
  const segments = narrationScript(outline, flowSteps(outline)).map((s) => {
    const name = clipName(voice, s.text);
    return { ...s, clip: have.has(name) ? `${recorded.dir}/${name}` : null };
  });
  return { ...voice, recorded: Boolean(recorded), segments };
}

const cjk = (html) => [...new Set(html.match(/[぀-ヿ㐀-鿿]/g) ?? [])].join('');

export function renderPage({ outline, layersDir, scenesSource, narration = null, repo = null }) {
  const scenes = sceneMeta(scenesSource);
  const ctx = buildContext(outline, layersDir, scenes, { read: repo ? makeReader(repo) : null, repo });
  const opening = openingView(ctx, outline);
  const chapters = outline.chapters.map((ch, i) => chapterView(ctx, ch, i + 1)).join('\n');
  const closing = closingView(ctx, outline);
  const rail = railView(ctx, outline);
  const body = shellView(ctx, outline, { opening, chapters, closing, rail });
  const nested = nestedControls(body);
  if (nested.length) throw new Error(`a control nests another, which the browser splits:\n${nested.slice(0, 5).join('\n')}`);
  const bare = bareStopLinks(body);
  if (bare.length) throw new Error(`${bare.length} stop links name no title:\n${bare.slice(0, 5).join('\n')}`);
  const outside = catalogProblems(body);
  if (outside.length) throw new Error(`the page draws what no component defines (kits/components.md):\n${outside.slice(0, 8).join('\n')}`);
  if (repo) {
    // The file view builds its links in the page, from the same rows.
    for (const ch of outline.chapters) {
      const l = ctx.layers.get(ch.layer);
      for (const f of ctx.fileViews.get(ch.id)?.files ?? []) ctx.links.add(`${f.s === 'D' ? l.base : l.head}:${f.p}`);
    }
    const missing = missingLinks(repo, [...ctx.links]);
    if (missing.length) throw new Error(`${missing.length} GitHub links name a path their commit lacks:\n${missing.slice(0, 5).join('\n')}`);
  }
  const data = JSON.stringify(runtimeData(outline, ctx, narration)).replace(/</g, '\\u003c');
  const font = existsSync(MONOCRAFT) ? readFileSync(MONOCRAFT).toString('base64') : null;
  // The subset carries every character the page can draw, the confetti's included.
  const jp = cjk(body + runtime('confetti.js'));
  const description = `${outline.title}: an end-to-end review walk of ${outline.layers.length} ${outline.layers.length === 1 ? 'pull request' : 'pull requests'}.`;
  const head = [
    '<meta charset="utf-8">',
    // A live preview or a file on a phone lays out at the device's width,
    // as claude.ai's frame already does.
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(outline.name ?? outline.title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    '<meta name="theme-color" content="#07060b">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap">',
    jp ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap&text=${encodeURIComponent(jp)}">` : '',
    `<style>${font ? `@font-face{font-family:Monocraft;font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${font}) format("woff2")}\n` : ''}${runtime('page.css')}\n${runtime('walkthrough.css')}\n${touchType(`${runtime('page.css')}\n${runtime('walkthrough.css')}`)}</style>`,
    // The script shows one chapter at a time; without it every chapter shows,
    // so the page still reads from top to bottom.
    '<noscript><style>.chapter[hidden],.seq{display:block!important}</style></noscript>',
  ].join('\n');
  const scripts = [
    `<script type="application/json" id="wt-data">${data}</script>`,
    `<script>${runtime('motion.js')}</script>`,
    `<script>${runtime('sound.js')}</script>`,
    `<script>${runtime('search.js')}</script>`,
    `<script>${runtime('confetti.js')}</script>`,
    `<script>${runtime('layers.js')}</script>`,
    `<script>${runtime('keys.js')}</script>`,
    `<script>${runtime('disclose.js')}</script>`,
    `<script>${runtime('trail.js')}</script>`,
    `<script>${runtime('voice.js')}</script>`,
    `<script>${runtime('markup.js')}</script>`,
    scenesSource ? `<script>${scenesSource}</script>` : '',
    `<script>${runtime('walkthrough.js')}</script>`,
    `<script>${runtime('juice.js')}</script>`,
  ].join('\n');
  return `${head}\n${body}\n${scripts}\n`;
}

// Layer colors are exported for scene authors who want the same ramp.
export { layerVar };

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outline || !args.layers || !args.out) {
    console.error('usage: render.mjs --outline <outline.json> --layers <dir> --out <page.html> [--scenes <scenes.js>] [--narration <narration.json>] [--check] [--repo <path>]');
    process.exit(2);
  }
  const outline = JSON.parse(readFileSync(args.outline, 'utf8'));
  if (args.check) {
    const result = check({ outline, layersDir: args.layers, repo: resolve(args.repo || '.') });
    for (const e of result.errors) console.error(`error: ${e}`);
    if (result.errors.length) {
      console.error(`refusing to render: ${result.errors.length} errors`);
      process.exit(1);
    }
  }
  const scenesSource = args.scenes ? readFileSync(args.scenes, 'utf8') : '';
  const narration = args.narration ? JSON.parse(readFileSync(args.narration, 'utf8')) : null;
  const html = renderPage({ outline, layersDir: args.layers, scenesSource, narration, repo: args.repo ? resolve(args.repo) : null });
  writeFileSync(args.out, html);
  console.log(`${args.out}: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
}
