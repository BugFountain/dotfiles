#!/usr/bin/env node
// Verifies a walkthrough outline against the real diff before it renders.
// Fail-closed: an invented hunk, an unhomed hunk, a frame whose symbol is not
// at the cited line, or a dangling stop reference is an error, not a warning.
//
// Usage:
//   node check.mjs --outline <outline.json> --layers <dir> [--repo <path>] [--json]
//   node check.mjs --chapter <chapter.json> --layer <id> --layers <dir> [--repo <path>] [--json]
//
// <dir>/<layer>/hunks.json comes from diff-index.mjs. A chapter file holds
// { chapter, hops?, glossary?, scenes? } for one layer, as an extractor writes it.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindOf, parseArgs } from './diff-index.mjs';
import { inline, proseFields, quoteProblem, slug, termMarker, withBriefDefs } from './views.mjs';
import { makeResolver, receiptsOf } from './receipts.mjs';
import { GLYPH } from './catalog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA = JSON.parse(readFileSync(join(here, 'outline.schema.json'), 'utf8'));

// ---------------------------------------------------------------------------
// A JSON Schema subset: the keywords outline.schema.json uses, nothing else.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function matchesType(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

export function validate(value, schema, root = SCHEMA, path = '$', errors = []) {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root);
    return validate(value, target, root, path, errors);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join('|')}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if ('const' in schema && value !== schema.const) errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: ${value.length} chars, max ${schema.maxLength}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: ${value.length} chars, min ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: at most ${schema.maxItems} items`);
    value.forEach((item, i) => {
      const s = schema.prefixItems?.[i] ?? schema.items;
      if (s) validate(item, s, root, `${path}[${i}]`, errors);
    });
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      const s = schema.properties?.[key];
      if (s) validate(v, s, root, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown property ${key}`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Layers: hunk index and head-side file reads.

export function loadLayer(layersDir, id) {
  const file = join(layersDir, id, 'hunks.json');
  if (!existsSync(file)) throw new Error(`no hunk index for layer ${id} at ${file}`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const hunks = new Map();
  const files = new Map();
  for (const f of data.files) {
    // An index written before a kind rule changed still reads by today's rules.
    f.kind = kindOf(f.path);
    // Git writes a type change, such as a symlink that becomes a file, as two
    // sections under one path and one set of hunk ids; the second would hide the first.
    if (files.has(f.path)) throw new Error(`duplicate file path in layer ${id}: ${f.path}`);
    files.set(f.path, f);
    for (const h of f.hunks) {
      h.file = f.path;
      hunks.set(h.id, h);
    }
  }
  return { id, base: data.base, head: data.head, files, hunks };
}

// A revision as a full sha, so an index made from a ref or a short sha
// compares with the outline's; one the repository lacks stays as written.
function commitOf(repo, rev) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return String(rev ?? '');
  }
}

export function hunkRange(h) {
  if (h.newLines > 0) return [h.newStart, h.newStart + h.newLines - 1];
  return [h.oldStart, h.oldStart + Math.max(h.oldLines, 1) - 1];
}

export function makeReader(repo) {
  const cache = new Map();
  return (sha, path) => {
    const key = `${sha}:${path}`;
    if (!cache.has(key)) {
      try {
        const text = execFileSync('git', ['-C', repo, 'show', key], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
        cache.set(key, text.split('\n'));
      } catch {
        cache.set(key, null);
      }
    }
    return cache.get(key);
  };
}

// Identifier tokens a reader would grep for: `InboxRepository.record()` -> record, InboxRepository.
export function symbolTokens(symbol) {
  const bare = symbol.replace(/\(.*$/s, '').replace(/[<>[\]{}]/g, ' ');
  const tokens = bare.split(/[^A-Za-z0-9_$]+/).filter((t) => t.length >= 3);
  return tokens.reverse();
}

function nearLine(lines, line, tokens, window, matches = (text, t) => text.includes(t)) {
  if (!lines) return false;
  const lo = Math.max(0, line - 1 - window);
  const hi = Math.min(lines.length - 1, line - 1 + window);
  for (let i = lo; i <= hi; i++) if (tokens.some((t) => matches(lines[i], t))) return true;
  return false;
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A call names the symbol followed by `(` or `<`, reaches it through `.`, or
// constructs it; a definition line (function, arrow, method head) is not a call.
export function isCall(text, token) {
  const t = reEsc(token);
  if (!new RegExp(`(^|[^\\w$])${t}\\s*(\\?\\.)?[(<]|\\.${t}\\b(?!\\s*=[^=>])|new\\s+${t}\\b`).test(text)) return false;
  const definition = new RegExp(`function\\s*\\*?\\s*${t}\\b|\\b${t}\\s*[:=]\\s*(async\\s+)?(\\(|function|<)|^\\s*((public|private|protected|static|async|override|readonly|get|set)\\s+)*${t}\\s*(<[^>]*>)?\\([^)]*\\)\\s*(:\\s*[^{=]+)?\\{\\s*$`);
  return !definition.test(text);
}

// ---------------------------------------------------------------------------
// Semantic checks.

// A line read aloud or shown on the stage never names the page's own
// structure: a listener hears what happens, not "act two" or "our story".
const FRAME_WORDS = /\b(act (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)|in \w+ acts|(?:this|our|the) story|chapters?|episodes?|podcast|audiobook)\b/i;

function lintFrame(text, where, warnings) {
  const hit = FRAME_WORDS.exec(text ?? '');
  if (hit) warnings.push(`voice: ${where} says "${hit[1]}"; say what happens, not how the page is built`);
}

// A section title names what the section holds. A title built from the
// reader's act or an ask (`questions a reviewer asks twice`, `what to know
// first`, `things to check`) says what to do with the section, not what is
// in it (WRITING.md, Section titles).
const TITLE_AS_ACT = /^(?:the\s+)?(?:questions?\b.*\b(?:you|we|reviewers?|readers?|asks?|asked)\b|things\s+(?:to|you)\b|what\s+(?:you|to|we)\b|how\s+(?:to|you)\b|before\s+you\b|can\s+you\b|check\s+(?:it|this|these)\b|try\b|start\s+here\b|read\s+(?:this|me|first)\b)/i;
export function lintTitle(title, where, warnings) {
  const t = String(title ?? '').replace(/`/g, '').trim();
  if (TITLE_AS_ACT.test(t)) warnings.push(`title: ${where} "${t}" describes the reader's act or an ask; name what the section holds`);
}

const PROSE_BANNED = /\b(elegant|elegantly|robust|seamless|seamlessly|simply|critically|importantly|crucial|leverage[sd]?|powerful)\b/i;

export function lintProse(text, where, warnings) {
  if (!text) return;
  // An emoji or a pictograph in prose renders in a system font at its own
  // size and baseline; the page draws icons, and the prose says the word.
  const glyph = GLYPH.exec(text);
  if (glyph) warnings.push(`${where}: "${glyph[0]}" is an emoji or a pictograph; say the word, and let the page draw its icons`);
  if (/—|\s--\s/.test(text)) warnings.push(`${where}: em-dash in prose; use a comma, a colon or a new sentence`);
  const banned = PROSE_BANNED.exec(text);
  if (banned) warnings.push(`${where}: "${banned[1]}" is a verdict or filler word`);
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.replace(/`[^`]*`/g, 'x').split(/\s+/).filter(Boolean).length;
    if (words > 32) warnings.push(`${where}: a ${words}-word sentence; keep sentences under 25 words`);
  }
}

// The words a line says, for comparing two lines: lowercased, with markup,
// backticks and function words dropped and a plural's s folded.
const FUNCTION_WORDS = new Set(
  'the a an and or but nor of to in on at by for from with into onto out off up its it is are was were be been being as that this these those than then so not only one two when while which who whom what how each every per via also their there here them they our your has have had does did can may must will would'.split(' '),
);
function contentWords(text) {
  return new Set(
    String(text ?? '')
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2 && !FUNCTION_WORDS.has(w))
      .map((w) => w.replace(/(?<=[a-z]{3})s$/, '')),
  );
}

// The share of a subtitle's words that its title already says. A subtitle
// shorter than three words is too short to judge, so it scores 0.
export function subtitleOverlap(title, sub) {
  const said = contentWords(title);
  const words = contentWords(sub);
  if (words.size < 3) return 0;
  let shared = 0;
  for (const w of words) if (said.has(w)) shared += 1;
  return shared / words.size;
}
export const SUBTITLE_OVERLAP_LIMIT = 0.4;

export function checkChapter(chapter, layer, ctx) {
  const { errors, warnings, read, homes, stopIds } = ctx;
  const where = `chapter ${chapter.id}`;
  const count = (key, label) => {
    homes.set(key, [...(homes.get(key) ?? []), label]);
  };

  const branches = new Map();
  for (const s of chapter.stops) {
    if (stopIds.has(s.id)) errors.push(`${where}: duplicate stop id ${s.id}`);
    stopIds.set(s.id, chapter.id);
    for (const b of s.decision?.branches ?? []) branches.set(b.id, s.id);
  }

  const citeHunk = (id, role, focus, label) => {
    const h = layer.hunks.get(id);
    if (!h) {
      errors.push(`${label}: hunk ${id} is not in layer ${layer.id}`);
      return;
    }
    if (role === 'home') count(`${layer.id}|${id}`, label);
    if (focus) {
      const [lo, hi] = hunkRange(h);
      if (focus[0] > focus[1] || focus[0] < lo || focus[1] > hi) errors.push(`${label}: focus ${focus[0]}-${focus[1]} outside ${id} lines ${lo}-${hi}`);
    }
  };
  const citeFile = (path, label) => {
    const f = layer.files.get(path);
    if (!f) {
      errors.push(`${label}: file ${path} is not changed in layer ${layer.id}`);
      return;
    }
    count(`${layer.id}|file:${path}`, label);
    for (const h of f.hunks) count(`${layer.id}|${h.id}`, label);
  };

  for (const s of chapter.stops) {
    const at = `${where} stop ${s.id}`;
    for (const [i, a] of s.anchors.entries()) citeHunk(a.hunk, a.role, a.focus, `${at} anchor ${i + 1}`);
    for (const [i, p] of (s.proof ?? []).entries()) {
      if (p.hunk) citeHunk(p.hunk, p.role, p.focus, `${at} proof ${i + 1}`);
      else if (p.file && p.role === 'home') citeFile(p.file, `${at} proof ${i + 1}`);
      else if (!p.file) errors.push(`${at} proof ${i + 1}: cite a hunk or a file`);
    }
    for (const [i, m] of (s.margin ?? []).entries()) {
      if (m.hunk) citeHunk(m.hunk, m.role, m.focus, `${at} margin ${i + 1}`);
      else if (m.file && m.role === 'home') citeFile(m.file, `${at} margin ${i + 1}`);
      else if (!m.file) errors.push(`${at} margin ${i + 1}: cite a hunk or a file`);
    }

    // The frame is the stop's claim about which code wakes; hold it to the head.
    const lines = read(layer.head, s.frame.file);
    if (!lines) errors.push(`${at}: frame file ${s.frame.file} does not exist at ${layer.head.slice(0, 11)}`);
    else if (!nearLine(lines, s.frame.line, symbolTokens(s.frame.symbol), 6))
      errors.push(`${at}: frame symbol ${s.frame.symbol} is not near ${s.frame.file}:${s.frame.line}`);

    const c = s.wake.caller;
    if (c?.file && c.line) {
      const callerLines = read(layer.head, c.file);
      if (!callerLines) errors.push(`${at}: caller file ${c.file} does not exist at ${layer.head.slice(0, 11)}`);
      else if (s.wake.via === 'call') {
        if (!nearLine(callerLines, c.line, symbolTokens(s.frame.symbol).slice(0, 1), 3, isCall))
          errors.push(`${at}: ${c.file}:${c.line} does not call ${s.frame.symbol} (checked ±3 lines for a call)`);
      } else if (!nearLine(callerLines, c.line, symbolTokens(c.symbol), 4)) {
        warnings.push(`${at}: producer ${c.symbol} is not near ${c.file}:${c.line}`);
      }
    }

    const last = s.stack[s.stack.length - 1];
    if (last && symbolTokens(last.symbol)[0] !== symbolTokens(s.frame.symbol)[0])
      warnings.push(`${at}: the last stack frame (${last.symbol}) should be the stop's frame (${s.frame.symbol})`);

    if (s.branch && !branches.has(s.branch)) errors.push(`${at}: branch ${s.branch} has no decision in this chapter`);
    for (const f of s.flags ?? []) {
      if (f.completedBy && !ctx.layerIds.has(f.completedBy)) errors.push(`${at}: flag completedBy ${f.completedBy} is not a layer`);
      if (f.type !== 'outside-stack' && f.type !== 'inverted-order' && f.completedBy && ctx.layerOrder.get(f.completedBy) <= ctx.layerOrder.get(layer.id))
        errors.push(`${at}: a ${f.type} flag must be completed by a later layer, not ${f.completedBy}`);
      // A PR that joins the stack after the flag was written makes the flag
      // stale: its work now lands in a layer, not outside the stack.
      if (f.type === 'outside-stack')
        for (const [, n] of `${f.text} ${f.evidence ?? ''}`.matchAll(/#(\d+)/g))
          if (ctx.layerPrs.has(n)) warnings.push(`${at}: an outside-stack flag names #${n}, which is a layer of this stack; drop the flag or say what still lies outside`);
    }
    lintProse(s.gist, `${at} gist`, warnings);
    lintProse(s.detail, `${at} detail`, warnings);
    lintProse(s.transition, `${at} transition`, warnings);
    if (/[.!?]\s+\S/.test(s.gist.trim())) warnings.push(`${at}: gist should be one sentence`);
  }

  for (const [id, stop] of branches) if (!chapter.stops.some((s) => s.branch === id)) errors.push(`${where}: decision at ${stop} names branch ${id} but no stop takes it`);
  for (const h of chapter.housekeeping) citeFile(h.file, `${where} housekeeping`);
  for (const h of chapter.everythingElse) citeFile(h.file, `${where} everythingElse`);
  lintProse(chapter.gist, `${where} gist`, warnings);
  lintProse(chapter.intent, `${where} intent`, warnings);
}

// Every receipt in a flag's evidence names a file its layer's head holds and
// a line inside it; the page links each one to its lens and shows the rest
// as plain text.
function checkReceipts(outline, ctx, repo, layerFor) {
  const layers = new Map(outline.layers.map((l) => [l.id, l]));
  const resolveRef = makeResolver(repo, layers, (id) => (layers.has(id) ? [...layerFor(id).files.keys()] : []));
  const loose = [];
  let all = 0;
  for (const ch of outline.chapters)
    for (const s of ch.stops)
      for (const f of s.flags ?? []) {
        if (f.status === 'dropped' || !f.evidence) continue;
        for (const r of receiptsOf(f.evidence, ch.layer)) {
          all++;
          const path = resolveRef(r.layer, r.ref);
          const lines = path ? ctx.read(layers.get(r.layer).head, path) : null;
          if (!lines || r.line > lines.length) loose.push(`${s.id} ${r.ref}:${r.line} at ${r.layer}`);
        }
      }
  if (loose.length) ctx.warnings.push(`receipts: ${loose.length} of ${all} evidence receipts name no line at their layer's head, so the page shows them as text: ${loose.slice(0, 4).join(', ')}`);
}

function checkRefs(outline, ctx) {
  const { errors, warnings, stopIds } = ctx;
  const has = (id, where) => {
    if (!stopIds.has(id)) errors.push(`${where}: no stop ${id}`);
  };
  // An answer quote must be marked verbatim in the stop it names, or the jump
  // from the question lands on the stop with nothing to look at.
  const stopById = new Map(outline.chapters.flatMap((ch) => ch.stops.map((s) => [s.id, s])));
  const quoteAt = (stopId, quote, where) => {
    const s = stopById.get(stopId);
    if (!s) return;
    const problems = proseFields(s).map(([, t]) => quoteProblem(t, quote));
    if (problems.includes(null)) return;
    const why = problems.find((p) => p !== 'the quote is not in the stop prose') ?? 'the quote is not in the stop prose';
    errors.push(`${where}: ${why} (${stopId}: "${String(quote).slice(0, 60)}")`);
  };
  let questions = 0;
  let quoted = 0;
  for (const ch of outline.chapters) {
    for (const s of ch.stops) for (const ref of s.see ?? []) has(ref, `stop ${s.id} see`);
    ch.qa.forEach((q, i) => {
      for (const ref of q.stops) has(ref, `chapter ${ch.id} qa`);
      questions++;
      if (q.look?.length) quoted++;
      for (const l of q.look ?? []) {
        if (!q.stops.includes(l.stop)) errors.push(`chapter ${ch.id} qa ${i}: a look names ${l.stop}, which the question does not link`);
        quoteAt(l.stop, l.quote, `chapter ${ch.id} qa ${i}`);
      }
    });
    ch.selfCheck.forEach((c, i) => {
      has(c.stop, `chapter ${ch.id} selfCheck`);
      if (c.quote) quoteAt(c.stop, c.quote, `chapter ${ch.id} card ${i}`);
    });
    for (const c of ch.claims) {
      for (const ref of c.stops) has(ref, `chapter ${ch.id} claim`);
      if (c.state === 'later' && !c.completedBy) errors.push(`chapter ${ch.id} claim "${c.text.slice(0, 40)}…": a later claim names completedBy`);
      if (c.state !== 'later' && c.completedBy) errors.push(`chapter ${ch.id} claim "${c.text.slice(0, 40)}…": only a later claim names completedBy`);
      if (c.completedBy && !ctx.layerIds.has(c.completedBy)) errors.push(`chapter ${ch.id} claim: completedBy ${c.completedBy} is not a layer`);
    }
  }
  const lanes = new Set(outline.spine?.lanes?.map((l) => l.id) ?? []);
  for (const h of outline.spine?.hops ?? []) {
    if (!ctx.layerIds.has(h.layer) && h.layer !== 'base') errors.push(`hop ${h.id}: layer ${h.layer} is not a layer, nor base`);
    if (lanes.size && !lanes.has(h.lane)) errors.push(`hop ${h.id}: lane ${h.lane} is not a lane`);
    if (h.stop) has(h.stop, `hop ${h.id}`);
  }
  // The whole flow as a story: every hop in exactly one act, each with its line.
  const acts = outline.spine?.acts;
  if (acts) {
    const hopIds = new Set((outline.spine.hops ?? []).map((h) => h.id));
    const placed = new Map();
    for (const a of acts) {
      if (a.lane && lanes.size && !lanes.has(a.lane)) errors.push(`act ${a.id}: lane ${a.lane} is not a lane`);
      for (const id of a.hops) {
        if (!hopIds.has(id)) errors.push(`act ${a.id}: no hop ${id}`);
        else if (placed.has(id)) errors.push(`hop ${id} sits in acts ${placed.get(id)} and ${a.id}`);
        else placed.set(id, a.id);
      }
    }
    for (const id of hopIds) if (!placed.has(id)) errors.push(`hop ${id} sits in no act`);
    const untold = (outline.spine.hops ?? []).filter((h) => !h.story);
    if (untold.length) warnings.push(`story: ${untold.length} of ${hopIds.size} hops have no story line`);
    for (const h of outline.spine.hops ?? []) if (h.story) lintProse(h.story, `hop ${h.id} story`, warnings);
    for (const h of outline.spine.hops ?? []) lintFrame(h.story, `hop ${h.id}'s story line`, warnings);
    for (const a of acts) lintFrame(a.title, `act ${a.id}'s title`, warnings);
    for (const a of acts) lintTitle(a.title, `act ${a.id}'s title`, warnings);
    lintFrame(outline.spine.narration?.intro, "the narration's intro", warnings);
    lintFrame(outline.spine.narration?.outro, "the narration's outro", warnings);
    // The stage shows a hop's own subtitle, or else its stop's gist. Either
    // says what the story line leaves out, and no two hops show the same one.
    const shown = new Map();
    for (const h of outline.spine.hops ?? []) {
      if (h.sub) lintProse(h.sub, `hop ${h.id} sub`, warnings);
      const sub = h.sub ?? stopById.get(h.stop)?.gist;
      if (!sub) continue;
      const share = subtitleOverlap(h.story ?? h.label, sub);
      if (share >= SUBTITLE_OVERLAP_LIMIT) warnings.push(`story: hop ${h.id}'s subtitle repeats ${Math.round(share * 100)}% of its story line; give it a sub that names the code or the reason`);
      const key = sub.replace(/\s+/g, ' ').trim();
      if (shown.has(key)) warnings.push(`story: hops ${shown.get(key)} and ${h.id} show the same subtitle; give one a sub of its own`);
      else shown.set(key, h.id);
    }
  }
  // The systems: each component in one system, and each name a hop's end.
  const systems = outline.spine?.systems;
  if (systems) {
    const ends = new Set((outline.spine.hops ?? []).flatMap((h) => [h.from, h.to]));
    const home = new Map();
    for (const sys of systems)
      for (const n of sys.nodes) {
        if (home.has(n)) errors.push(`component ${n} sits in systems ${home.get(n)} and ${sys.id}`);
        else home.set(n, sys.id);
        if (!ends.has(n)) warnings.push(`systems: ${sys.id} names ${n}, which no hop starts or ends at`);
      }
    const loose = [...ends].filter((n) => !home.has(n));
    if (loose.length) warnings.push(`systems: ${loose.length} components sit in no system, so the act diagram puts them under other: ${loose.slice(0, 5).join(', ')}`);
  }
  for (const t of outline.glossary ?? []) if (t.stop) has(t.stop, `term ${t.term}`);
  checkBrief(outline, ctx);
  checkCaveats(outline, ctx);
  // A reference entry holds something to look up and links only hops that exist.
  const hopSet = new Set((outline.spine?.hops ?? []).map((h) => h.id));
  if ((outline.layers?.length ?? 0) > 1 && !(outline.reference ?? []).some((r) => r.opening)) warnings.push('release plan: a stack carries an `opening` reference entry, shown after the layers, that lists each PR in merge order, what must hold before it merges, what to watch once it deploys, and how to roll it back');
  for (const r of outline.reference ?? []) lintTitle(r.title, `reference ${r.id}'s title`, warnings);
  if (outline.brief) lintTitle(outline.brief.title, "the brief's title", warnings);
  for (const r of outline.reference ?? []) {
    if (!r.text && !r.picture && !r.compare && !r.model && !r.table && !r.faq?.length && !r.caveats) errors.push(`reference ${r.id}: no text, picture, model, table or answers`);
    for (const id of r.hops ?? []) if (!hopSet.has(id)) errors.push(`reference ${r.id}: no hop ${id}`);
    for (const row of r.table?.rows ?? []) if (row.length !== r.table.head.length) errors.push(`reference ${r.id}: a row has ${row.length} cells for ${r.table.head.length} columns`);
    if (r.model) checkModel(r, new Set((outline.layers ?? []).map((l) => l.id)), errors);
    lintProse(r.text, `reference ${r.id}`, warnings);
    lintProse(r.after, `reference ${r.id}`, warnings);
    for (const f of r.faq ?? []) lintProse(f.a, `reference ${r.id} answer`, warnings);
  }
  if (quoted < questions) warnings.push(`answers: ${questions - quoted} of ${questions} questions quote no answer, so their links land on the stop head`);
}

// The brief defines each of its ideas once: a glossary term either has a
// def or a brief item that names it, and every link and hop in the brief
// lands on something the page draws.
function checkBrief(outline, { errors, stopIds }) {
  const items = outline.brief?.items ?? [];
  const ids = new Set();
  const owner = new Map();
  for (const x of items) {
    if (ids.has(x.id)) errors.push(`brief: item ${x.id} appears twice`);
    ids.add(x.id);
    for (const t of x.glossary ?? []) {
      if (owner.has(t.toLowerCase())) errors.push(`brief: items ${owner.get(t.toLowerCase())} and ${x.id} both define ${t}`);
      owner.set(t.toLowerCase(), x.id);
    }
  }
  const terms = new Set((outline.glossary ?? []).map((t) => t.term.toLowerCase()));
  for (const [t, id] of owner) if (!terms.has(t)) errors.push(`brief: item ${id} defines ${t}, which the glossary lacks`);
  for (const t of outline.glossary ?? []) if (!t.def && !owner.has(t.term.toLowerCase())) errors.push(`term ${t.term}: needs a def, or a brief item that names it`);
  if (!items.length) return;
  const hopIds = new Set((outline.spine?.hops ?? []).map((h) => h.id));
  for (const x of items) if (x.hop && !hopIds.has(x.hop)) errors.push(`brief: item ${x.id} names no hop ${x.hop}`);
  const targets = new Set(['c-open', 'c-close', 'brief', ...stopIds.keys(), ...outline.chapters.map((ch) => ch.id), ...(outline.reference ?? []).map((r) => r.id), ...(outline.spine?.hops ?? []).map((h) => h.id), ...[...ids].map((id) => `brief-${id}`), ...(outline.glossary ?? []).map((t) => `t-${slug(t.term)}`)]);
  for (const x of items) for (const l of x.links ?? []) if (l.href.startsWith('#') && !targets.has(l.href.slice(1))) errors.push(`brief: item ${x.id} links ${l.href}, which the page does not draw`);
}

// A caveat says why it stands, the fix and where the fix is planned, so a
// reader who meets it has nothing left to work out, and it lands on stops
// and hops the page draws.
function checkCaveats(outline, { errors, warnings, stopIds }) {
  const list = outline.caveats ?? [];
  const slots = (outline.reference ?? []).filter((r) => r.caveats);
  if (slots.length > 1) errors.push(`caveats: ${slots.length} reference entries mark where the caveats draw; keep one`);
  if (slots.length && !list.length) errors.push(`reference ${slots[0].id}: marks where the caveats draw, and the outline has none`);
  const hopIds = new Set((outline.spine?.hops ?? []).map((h) => h.id));
  const seen = new Set();
  for (const c of list) {
    const at = `caveat ${c.id}`;
    if (seen.has(c.id)) errors.push(`${at}: appears twice`);
    seen.add(c.id);
    for (const k of ['did', 'why', 'cost', 'fix']) if (!String(c[k] ?? '').trim()) errors.push(`${at}: says nothing for ${k}`);
    if (!String(c.planned?.label ?? '').trim() || !(c.planned?.path || c.planned?.href)) errors.push(`${at}: planned needs a label and a path or href to where the fix is planned`);
    for (const id of c.where ?? []) if (!stopIds.has(id) && !hopIds.has(id)) errors.push(`${at}: names ${id}, which is no stop or hop the page draws`);
    for (const k of ['did', 'why', 'cost', 'fix']) lintProse(c[k], `${at} ${k}`, warnings);
  }
  // A flag or a claim that nothing in the change completes stays open past
  // it, so a caveat records when and where it closes, and it links it.
  for (const ch of outline.chapters)
    for (const s of ch.stops)
      for (const f of s.flags ?? []) {
        if (f.status === 'dropped') continue;
        const at = `${s.id}: ${f.type} flag`;
        if (f.caveat && !seen.has(f.caveat)) errors.push(`${at} links caveat ${f.caveat}, which the outline lacks`);
        else if (!f.completedBy && !f.caveat) errors.push(`${at} is open and no layer completes it: link the caveat that records when and where it closes (caveat: "<id>")`);
      }
  // An open claim outlives the change the same way.
  for (const ch of outline.chapters)
    (ch.claims ?? []).forEach((c, i) => {
      const at = `chapter ${ch.id} claim ${i} "${c.text.slice(0, 40)}…"`;
      if (c.caveat && !seen.has(c.caveat)) errors.push(`${at} links caveat ${c.caveat}, which the outline lacks`);
      else if (c.state === 'open' && !c.caveat) errors.push(`${at} is open and no layer completes it: link the caveat that records when and where it closes (caveat: "<id>")`);
    });
}

// ---------------------------------------------------------------------------
// Reading order and words: what a newcomer meets before it is defined, a word
// that carries two meanings, and numbers a reader cannot check.

function openingProse(o) {
  const out = [];
  const add = (where, t) => typeof t === 'string' && t && out.push([where, t]);
  add('the intent', o.intro?.intent);
  add('the before line', o.intro?.before);
  add('the after line', o.intro?.after);
  (o.intro?.takeaways ?? []).forEach((t, i) => add(`takeaway ${i + 1}`, t.text));
  for (const h of o.spine?.hops ?? []) for (const k of ['label', 'story', 'sub']) add(`hop ${h.id}`, h[k]);
  for (const l of o.layers ?? []) for (const k of ['order', 'note']) add(`layer ${l.id}`, l[k]);
  for (const r of o.reference ?? []) {
    for (const t of [r.text, r.after, ...(r.faq ?? []).flatMap((f) => [f.q, f.a]), ...(r.table?.rows ?? []).flat()]) add(`reference ${r.id}`, t);
  }
  return out;
}

function chapterProse(o) {
  const out = [];
  for (const ch of o.chapters ?? []) {
    for (const t of [ch.gist, ch.intent, ch.before, ch.after, ch.entry, ...(ch.takeaways ?? []).map((x) => x.text), ...ch.qa.map((q) => q.question), ...ch.claims.map((c) => c.text)]) if (typeof t === 'string' && t) out.push([`chapter ${ch.id}`, t]);
    for (const st of ch.stops) for (const [, t] of proseFields(st)) out.push([`stop ${st.id}`, t]);
  }
  return out;
}

const COUNT_WORD = '(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)';
const COUNT = new RegExp(`(?<![#\\w.,])(${COUNT_WORD})\\s+([\\w-]+)(?:\\s+([a-z][a-z-]*s)\\b)?`, 'gi');
const UNITS = /^(?:hours|minutes|seconds|days|weeks|months|years|milliseconds|ms|times|percent|bytes|kb|mb|gb)$/i;
const INTERIM = /\b(through|from|until|since)\s+#\d+/i;
export const ACT_HOPS_LIMIT = 12;

function checkReading(outline, { warnings }) {
  const glossary = withBriefDefs(outline);
  const marker = termMarker(glossary);
  const termsIn = (text) => {
    const T = marker.scope();
    inline(text, T);
    return [...T.seen];
  };
  const opening = openingProse(outline).map(([where, text]) => [where, text, termsIn(text)]);
  const chapters = chapterProse(outline).map(([where, text]) => [where, text, termsIn(text)]);

  // The intro, before and after lines and takeaways reach the reader before
  // any section explains a word, so the brief defines what they use or they
  // say it in plain words. Sections below mark their own terms.
  const early = new Map();
  const intro = opening.filter(([where]) => /^(the |takeaway )/.test(where));
  for (const [where, , terms] of intro) for (const t of terms) if (!early.has(t)) early.set(t, where);
  if (outline.brief) {
    const briefed = new Set(glossary.filter((g) => g.brief).map((g) => g.term));
    const loose = [...early].filter(([t]) => !briefed.has(t));
    if (loose.length) warnings.push(`brief: ${loose.length} glossary terms appear in the intro and takeaways and the brief defines none of them: ${loose.map(([t, w]) => `${t} (${w})`).join(', ')}; define each in the brief or say it in plain words`);
  } else if (outline.kind === 'stack' && early.size >= 5) warnings.push(`brief: the intro and takeaways use ${early.size} glossary terms and the page has no brief; add one that defines the ideas every section uses`);

  // A term prose writes often but the page rarely marks is written some other
  // way: in code, in another case, or under another name.
  const all = [...opening, ...chapters];
  for (const g of glossary) {
    const re = new RegExp(`(?<![\\w-])${g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]')}(?:e?s)?(?![\\w-])`, 'gi');
    const seen = all.reduce((n, [, text]) => n + (text.match(re)?.length ?? 0), 0);
    const marked = all.filter(([, , terms]) => terms.includes(g.term)).length;
    if (seen >= 10 && marked < 2) warnings.push(`terms: "${g.term}" appears ${seen} times but marks ${marked}; write it in prose as the glossary spells it, or rename the entry to the word prose uses`);
  }

  // One word, one meaning (WRITING.md, Words): a compound that names a part of
  // its head word ("heal" and "Heal child") is one concept; a definition that
  // must say "not the <word>" is the sign the word names two.
  const words = (t) => t.toLowerCase().split(/[\s-]+/);
  const plain = glossary.filter((g) => !/[._:/`]/.test(g.term) && !/[a-z][A-Z]/.test(g.term));
  const disowns = (g, w) => new RegExp(`\\bnot (?:the|a|an) ${w}\\b`, 'i').test(g.def ?? '');
  for (const g of plain) {
    if (words(g.term).length !== 1) continue;
    const w = words(g.term)[0];
    const kin = plain.filter((x) => words(x.term).length > 1 && (words(x.term)[0] === w || words(x.term).at(-1) === w) && (disowns(x, w) || disowns(g, w))).map((x) => x.term);
    if (kin.length) warnings.push(`terms: "${g.term}" and ${kin.map((k) => `"${k}"`).join(', ')} share the word "${w}"; if they name two things, give one a new word`);
  }

  // The flow tells the stack's tip; what holds only for a while belongs to
  // its chapter and the release plan.
  for (const h of outline.spine?.hops ?? [])
    for (const k of ['story', 'sub']) {
      const hit = INTERIM.exec(h[k] ?? '');
      if (hit) warnings.push(`story: hop ${h.id}'s ${k} says "${hit[0]}"; the flow tells the tip, so say what holds there and leave the interim to its chapter`);
    }
  for (const a of outline.spine?.acts ?? []) if (a.hops.length > ACT_HOPS_LIMIT) warnings.push(`story: act ${a.id} holds ${a.hops.length} hops; split it at ${ACT_HOPS_LIMIT} or fewer so its diagram reads`);

  // A picture's label names a commit the reader can find: a layer's base or head.
  const shas = (outline.layers ?? []).flatMap((l) => [l.base, l.head]).filter(Boolean);
  for (const r of outline.reference ?? [])
    for (const label of [r.compare?.before?.label, r.compare?.after?.label])
      for (const [sha] of String(label ?? '').matchAll(/\b[0-9a-f]{7,40}\b/g))
        if (/\d/.test(sha) && /[a-f]/.test(sha) && !shas.some((x) => x.startsWith(sha))) warnings.push(`reference ${r.id}: label "${label}" cites ${sha}, which is no layer's base or head`);

  // A count in a takeaway goes stale when the list it counts changes; name the list.
  (outline.intro?.takeaways ?? []).forEach((t, i) => {
    const hit = [...t.text.matchAll(COUNT)].find(([, , first, second]) => !UNITS.test(first) && (/[a-z]s$/i.test(first) || second));
    if (hit) warnings.push(`takeaway ${i + 1} counts "${hit[0].trim()}"; name the items instead, so the line cannot go stale`);
  });
}

// A domain model's arrows join only entities it draws, each entity once, and
// every mark names the PR that makes it, one the outline holds.
function checkModel(r, layerIds, errors) {
  const ids = new Set();
  for (const e of r.model.entities) {
    if (ids.has(e.id)) errors.push(`reference ${r.id}: entity ${e.id} appears twice`);
    ids.add(e.id);
  }
  const marked = (x, what) => {
    if (x.mark && !x.layer) errors.push(`reference ${r.id}: ${what} is ${x.mark} but names no layer`);
    else if (x.layer && !x.mark) errors.push(`reference ${r.id}: ${what} names layer ${x.layer} but no mark`);
    else if (x.layer && !layerIds.has(x.layer)) errors.push(`reference ${r.id}: ${what} marks layer ${x.layer}, which the outline lacks`);
  };
  for (const e of r.model.entities) marked(e, `entity ${e.id}`);
  for (const x of r.model.relations) {
    for (const end of [x.from, x.to]) if (!ids.has(end)) errors.push(`reference ${r.id}: relation ${x.from} ${x.label} ${x.to} names ${end}, which the chart lacks`);
    marked(x, `relation ${x.from} ${x.label} ${x.to}`);
  }
}

// Every hunk has exactly one home; a file without hunks has exactly one file-level home.
function checkCoverage(layer, ctx) {
  const { errors, homes } = ctx;
  let homed = 0;
  for (const [id] of layer.hunks) {
    const h = homes.get(`${layer.id}|${id}`) ?? [];
    if (h.length === 0) errors.push(`layer ${layer.id}: hunk ${id} has no home`);
    else if (h.length > 1) errors.push(`layer ${layer.id}: hunk ${id} has ${h.length} homes (${h.join('; ')})`);
    else homed++;
  }
  for (const [path, f] of layer.files) {
    if (f.hunks.length) continue;
    const h = homes.get(`${layer.id}|file:${path}`) ?? [];
    if (h.length !== 1) errors.push(`layer ${layer.id}: file ${path} has no hunks and needs exactly one file-level home (has ${h.length})`);
  }
  return { layer: layer.id, hunks: layer.hunks.size, homed, files: layer.files.size };
}

export function check({ outline, chapterFile, layerId, layersDir, repo }) {
  const errors = [];
  const warnings = [];
  const ctx = { errors, warnings, homes: new Map(), stopIds: new Map(), read: makeReader(repo), layerIds: new Set(), layerOrder: new Map(), layerPrs: new Set() };
  let doc;
  if (outline) {
    errors.push(...validate(outline, SCHEMA));
    doc = outline;
    outline.layers.forEach((l, i) => {
      ctx.layerIds.add(l.id);
      ctx.layerOrder.set(l.id, i);
      if (l.pr) ctx.layerPrs.add(String(l.pr));
    });
  } else {
    const chapterSchema = SCHEMA.$defs.chapter;
    const own = chapterFile.chapters ?? [chapterFile.chapter];
    for (const [i, ch] of own.entries()) errors.push(...validate(ch, chapterSchema, SCHEMA, chapterFile.chapters ? `$.chapters[${i}]` : '$.chapter'));
    for (const [i, hop] of (chapterFile.hops ?? []).entries()) errors.push(...validate(hop, SCHEMA.$defs.hop, SCHEMA, `$.hops[${i}]`));
    for (const [i, t] of (chapterFile.glossary ?? []).entries()) errors.push(...validate(t, SCHEMA.$defs.term, SCHEMA, `$.glossary[${i}]`));
    doc = { chapters: own, spine: { lanes: [], hops: chapterFile.hops ?? [] }, glossary: chapterFile.glossary ?? [] };
    for (const id of chapterFile.layerOrder ?? [layerId]) {
      ctx.layerOrder.set(id, ctx.layerOrder.size);
      ctx.layerIds.add(id);
      if (/^\d+$/.test(id)) ctx.layerPrs.add(id);
    }
  }
  if (errors.length) return { errors, warnings, coverage: [] };

  const layers = new Map();
  const layerFor = (id) => {
    if (!layers.has(id)) {
      const layer = loadLayer(layersDir, id);
      // The page copies hunks from the index and links the outline's commits.
      const cited = outline?.layers.find((l) => l.id === id);
      for (const side of cited ? ['base', 'head'] : []) {
        const [a, b] = [commitOf(repo, layer[side]), commitOf(repo, cited[side])];
        if (!(a && b && (a.startsWith(b) || b.startsWith(a)))) errors.push(`layer ${id}: hunks.json indexes ${side} ${String(layer[side]).slice(0, 11)}, but the outline cites ${cited[side].slice(0, 11)}; index the outline's range`);
      }
      layers.set(id, layer);
    }
    return layers.get(id);
  };
  for (const ch of doc.chapters) {
    if (outline && !ctx.layerIds.has(ch.layer)) {
      errors.push(`chapter ${ch.id}: layer ${ch.layer} is not in layers`);
      continue;
    }
    checkChapter(ch, layerFor(ch.layer), ctx);
  }
  checkRefs(doc, ctx);
  if (outline) checkReceipts(outline, ctx, repo, layerFor);
  if (outline) checkReading(outline, ctx);
  const coverage = [...new Set(doc.chapters.map((c) => c.layer))].filter((id) => ctx.layerIds.has(id)).map((id) => checkCoverage(layerFor(id), ctx));
  if (outline) for (const l of outline.layers) if (!doc.chapters.some((c) => c.layer === l.id)) errors.push(`layer ${l.id} has no chapter`);
  return { errors, warnings, coverage };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.layers || (!args.outline && !(args.chapter && args.layer))) {
    console.error('usage: check.mjs --outline <file> --layers <dir> [--repo <path>]\n       check.mjs --chapter <file> --layer <id> --layers <dir> [--repo <path>]');
    process.exit(2);
  }
  const repo = resolve(args.repo || '.');
  const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const result = args.outline
    ? check({ outline: load(args.outline), layersDir: args.layers, repo })
    : check({ chapterFile: load(args.chapter), layerId: args.layer, layersDir: args.layers, repo });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const e of result.errors) console.log(`error: ${e}`);
    for (const w of result.warnings) console.log(`warn:  ${w}`);
    for (const c of result.coverage) console.log(`coverage ${c.layer}: ${c.homed}/${c.hunks} hunks homed across ${c.files} files`);
    console.log(result.errors.length ? `FAIL: ${result.errors.length} errors, ${result.warnings.length} warnings` : `OK: ${result.warnings.length} warnings`);
  }
  process.exit(result.errors.length ? 1 : 0);
}
