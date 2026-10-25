// Pure builders: outline + hunk index -> static HTML. The page reads in full
// without JS; runtime/walkthrough.js enhances the same markup.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { paintBlock, paintHunk } from './syntax.mjs';
import { receiptsOf } from './receipts.mjs';

// The parts the runtime draws too come from runtime/markup.js, run here the
// way a browser runs it, so the prerendered page and the runtime share one
// source for each (kits/components.md).
const shared = {};
vm.runInNewContext(readFileSync(new URL('./runtime/markup.js', import.meta.url), 'utf8'), shared);
export const { WTMarkup } = shared;
export const { navigator, tick, unfinished, esc, keycap, keys, sprite, icon, tag, layerTag, proofTag, SEVERITY, mark, flagSeverity, PROOF_NAME, FLAG_NAME, flagKind } = WTMarkup;

const pad = (v, n) => String(v ?? '').padStart(n, ' ');
export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const plain = (s) => String(s ?? '').replace(/`([^`]+)`/g, '$1');

// Glossary terms in prose. The first use of a term in each scope (a stop, a
// chapter header) links to its definition, which shows on hover and focus.
// A term matches as prose writes it: in any case, with a plural, and with a
// space where the term has a hyphen or the other way round, so "drain" marks
// the term "Drain" and "stand down" marks "Stand-down". A code-like term
// (`trigger.matched`, `commandId`) marks the inline code that spells it, and
// a hyphenated one (`hatchet-lite`, Stand-down) marks either.
export function termMarker(glossary = []) {
  const codeLike = (t) => (/[._:/]/.test(t) && !/\s/.test(t)) || /[a-z][A-Z]/.test(t);
  const hyphened = (t) => t.includes('-') && !/\s/.test(t);
  const fold = (t) => t.toLowerCase().replace(/[-\s]+/g, ' ');
  const words = glossary.filter((g) => !codeLike(g.term)).sort((a, b) => b.term.length - a.term.length);
  const byLower = new Map(words.map((g) => [fold(g.term), g]));
  const code = new Map(glossary.filter((g) => codeLike(g.term) || hyphened(g.term)).map((g) => [g.term, g]));
  const reSrc = words.map((g) => g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]')).join('|');
  const re = reSrc ? new RegExp(`(?<![\\w-])(${reSrc})(e?s)?(?![\\w-])`, 'gi') : null;
  const link = (g, inner) => `<a class="term-ref" href="#t-${slug(g.term)}" data-term="${esc(g.term)}" data-def="${esc(plain(g.def))}">${inner}</a>`;
  return {
    scope: () => ({ seen: new Set(), re, byLower, code, link }),
  };
}

// Prose inside a link or a button marks its terms without links of their own:
// the definition still shows on hover, and the control stays one element.
export const inControl = (T) => T && { ...T, link: (g, inner) => `<span class="term-ref" data-term="${esc(g.term)}" data-def="${esc(plain(g.def))}">${inner}</span>` };

// A link or a button inside another one is invalid, and the parser closes the
// outer one at the inner tag: a branch card splits, and so does an answer mark
// in it. Lists each nesting with the text just before it.
// A stop link with only a number reads as a label, and `17` beside `hop 17
// of 35` names the wrong thing: every stop link carries its title.
export function bareStopLinks(html) {
  return [...html.matchAll(/<a class="to-stop[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => !m[1].includes('class="tt"')).map((m) => m[0].slice(0, 160));
}
export function nestedControls(html) {
  const open = [];
  const found = [];
  for (const m of html.matchAll(/<(\/?)(a|button)\b[^>]*>/gi)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = open.lastIndexOf(tag);
      if (i >= 0) open.length = i;
      continue;
    }
    if (open.length) found.push(`<${tag}> inside <${open.at(-1)}> after "${html.slice(Math.max(0, m.index - 300), m.index).replace(/<[^>]*>/g, '').slice(-60)}"`);
    open.push(tag);
  }
  return found;
}

function markTerms(html, T) {
  if (!T?.re) return html;
  let inLink = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<a[\s>]/i.test(part)) inLink++;
        else if (/^<\/a>/i.test(part)) inLink--;
        return part;
      }
      if (inLink) return part;
      return part.replace(T.re, (m, term) => {
        const g = T.byLower.get(term.toLowerCase().replace(/[-\s]+/g, ' '));
        if (!g || T.seen.has(g.term)) return m;
        T.seen.add(g.term);
        return T.link(g, m);
      });
    })
    .join('');
}

// Markdown-lite: `code`, **bold**, *em*, [text](https://…), "- " bullets and
// "> [!IMPORTANT] " callouts. Escapes first, so model prose never becomes markup.
export function inline(text, T) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = markTerms(s, T);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const c = codes[+i];
    const el = `<code class="inline-code" translate="no">${c}</code>`;
    const g = T?.code.get(c.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    if (!g || T.seen.has(g.term)) return el;
    T.seen.add(g.term);
    return T.link(g, el);
  });
  return s;
}

export function md(text, T) {
  if (!text) return '';
  const blocks = String(text).trim().split(/\n{2,}/);
  return blocks
    .map((b) => {
      const call = /^>\s*\[!(IMPORTANT|WARNING|NOTE)\]\s*([\s\S]*)$/i.exec(b);
      if (call) {
        // A note is the quiet level, in the one word set severity uses.
        const kind = call[1].toLowerCase() === 'note' ? 'info' : call[1].toLowerCase();
        const body = call[2].replace(/^>\s?/gm, '');
        return `<div class="callout ${kind}"><b class="caps">${kind}</b>${inline(body, T)}</div>`;
      }
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''), T)}</li>`).join('')}</ul>`;
      return `<p>${lines.map((l) => inline(l, T)).join('<br>')}</p>`;
    })
    .join('');
}

// A question's answer is a verbatim quote from a stop's prose. The page marks
// the quote, and a link from the question lands on it. The checker and the
// renderer read the same fields in the same order, so the first field that
// holds the quote is the one the page marks.
export function proseFields(s) {
  return [
    ['gist', s.gist],
    ['wake', s.wake?.note],
    ['slowDown', s.slowDown],
    ['detail', s.detail],
    ...(s.flags ?? []).map((f, i) => [`flag.${i}`, f.text]),
    ['decision', s.decision?.question],
    ...(s.decision?.branches ?? []).map((b, i) => [`branch.${i}`, b.outcome]),
    ...(s.untested ?? []).map((u, i) => [`untested.${i}`, u]),
    ['transition', s.transition],
  ].filter(([, t]) => typeof t === 'string' && t);
}

// Why a quote cannot be marked in its field, or null. A quote that cuts a code
// span or an emphasis in half would split the markup around it.
export function quoteProblem(text, quote) {
  if (typeof quote !== 'string' || quote.length < 12 || quote.length > 240) return 'a quote is 12 to 240 characters';
  if (/\n/.test(quote)) return 'a quote stays inside one line';
  if (/^\s*(?:[-*>])\s/.test(quote)) return 'a quote starts after a bullet or callout marker';
  const at = text.indexOf(quote);
  if (at < 0) return 'the quote is not in the stop prose';
  const before = text.slice(0, at);
  const odd = (t, ch) => (t.split(ch).length - 1) % 2 === 1;
  if (odd(quote, '`') || odd(before, '`')) return 'the quote cuts a code span';
  // `inline` lifts code spans out before it reads emphasis, so an asterisk in
  // code is text, and bold pairs close apart from em pairs.
  const cuts = (t) => {
    const bare = t.replace(/`[^`]*`/g, '');
    return odd(bare, '**') || odd(bare.replaceAll('**', ''), '*');
  };
  if (cuts(quote) || cuts(before)) return 'the quote cuts an emphasis';
  return null;
}

// Marks go in as control characters before the markdown pass and come out as
// <mark> after it, so escaping and term links never see them.
export function withMarks(text, marks, table) {
  const ranges = marks
    .map((m) => ({ at: text.indexOf(m.quote), m }))
    .filter((r) => r.at >= 0)
    .map(({ at, m }) => [at, at + m.quote.length, [m.id]])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] < last[1]) {
      last[1] = Math.max(last[1], r[1]);
      last[2].push(...r[2]);
    } else merged.push(r);
  }
  let out = text;
  for (const [a, b, ids] of merged.reverse()) out = `${out.slice(0, a)}\u0001${table.push(ids) - 1}\u0002${out.slice(a, b)}\u0003${out.slice(b)}`;
  return out;
}
export const unmark = (html, table) =>
  html.replace(/\u0001(\d+)\u0002/g, (_, k) => `<mark class="answer" data-answer="${esc(table[+k].join(' '))}">`).replace(/\u0003/g, '</mark>');

// A control shows its icon or its word, never a keycap beside it: it names
// its keys in `aria-keyshortcuts`, which the page's peek shows on hover and
// on keyboard focus (keys.js), and the keys sheet lists them.
export function layerVar(ctx, id) {
  const i = ctx.layerIndex.get(id);
  return i === undefined ? 'var(--mute)' : `var(--l${(i % 10) + 1})`;
}

// Most important first, everywhere a set of marks shows: badges, flags,
// takeaways. Source order holds inside a severity.
export const bySeverity = (list, sev = (x) => x.severity) => list.map((x, i) => ({ x, i })).sort((a, b) => SEVERITY.indexOf(sev(a.x)) - SEVERITY.indexOf(sev(b.x)) || a.i - b.i).map(({ x }) => x);

// A GitHub link opens the file at the commit that holds the lines it names:
// the layer's head for new lines, its base for lines the layer removes, so a
// deleted file never links to a head that lacks it.
const blob = (ctx, layerId, path, a, b, side = 'new') => {
  const l = ctx.layers.get(layerId);
  if (!l) return '#';
  const sha = side === 'old' ? l.base : l.head;
  ctx.links?.add(`${sha}:${path}`);
  const range = a ? `#L${a}${b && b !== a ? `-L${b}` : ''}` : '';
  return `https://github.com/${ctx.repo}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}${range}`;
};

function hunkRange(h) {
  if (h.newLines > 0) return [h.newStart, h.newStart + h.newLines - 1];
  return [h.oldStart, h.oldStart + Math.max(h.oldLines, 1) - 1];
}

// A machine-written line (a compacted snapshot, a minified fixture) can carry
// megabytes. Past LONG characters a line shows a window: around the first
// difference when a removed line pairs with an added one, else its start. The
// row after it says which characters it shows.
const LONG = 4000;
const CONTEXT = 160;
const SPAN = 1200;

function windowOf(text, start, end) {
  return { text: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`, cut: [start, end, text.length] };
}

export function cutLines(lines) {
  const out = lines.map((l) => ({ l, text: l[1], cut: null }));
  for (let i = 0; i < out.length; ) {
    if (out[i].l[0] !== '-') {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j].l[0] === '-') j++;
    let k = j;
    while (k < out.length && out[k].l[0] === '+') k++;
    for (let p = 0; p < Math.min(j - i, k - j); p++) {
      const a = out[i + p];
      const b = out[j + p];
      if (a.text.length <= LONG && b.text.length <= LONG) continue;
      const min = Math.min(a.text.length, b.text.length);
      let pre = 0;
      while (pre < min && a.text[pre] === b.text[pre]) pre++;
      let suf = 0;
      while (suf < min - pre && a.text[a.text.length - 1 - suf] === b.text[b.text.length - 1 - suf]) suf++;
      for (const r of [a, b]) {
        const start = Math.max(0, pre - CONTEXT);
        const end = Math.min(r.text.length, Math.max(r.text.length - suf, pre) + CONTEXT, start + CONTEXT * 2 + SPAN);
        Object.assign(r, windowOf(r.text, start, end));
      }
    }
    i = Math.max(k, i + 1);
  }
  for (const r of out) if (!r.cut && r.text.length > LONG) Object.assign(r, windowOf(r.text, 0, SPAN));
  return out;
}

const count = (n) => n.toLocaleString('en-US');

// A diff longer than `long` rows shows its first `keep` and folds the rest,
// unless a focus already picks what it shows.
export const FOLD = { long: 60, keep: 40 };

// One element per diff row. data-g holds the two line numbers and data-s the
// sign of an added or removed line; CSS draws both, the sign in the line's
// color. A row the reader does not see at first wears `o`: it sits outside
// the focus, or past the first rows of a long diff. Returns the markup with
// what it shows at first, the rows in view and the folded runs between them,
// and how many rows it has under its header.
export function hunkRows(h, { focus, only, fold = true } = {}) {
  const inFocus = (l) => {
    if (!focus) return true;
    const n = l[3] ?? l[2];
    return n !== null && n >= focus[0] && n <= focus[1];
  };
  const rows = [];
  // A cut line shows a window of a machine-written line, so it keeps plain text.
  const painted = paintHunk(h.lines, h.file);
  for (const [i, { l, text, cut }] of cutLines(h.lines).entries()) {
    const [t, , o, n] = l;
    if (only && !inFocus(l)) continue;
    const cls = t === '+' ? 'a' : t === '-' ? 'd' : t === '\\' ? 'nl' : 'c';
    const mark = focus && inFocus(l) ? 'f' : focus && !only ? 'o' : '';
    rows.push({ cls, mark, g: `${pad(o, 4)} ${pad(n, 4)}`, sign: t === '+' || t === '-' ? t : '', body: cut ? esc(text) : painted[i] });
    if (cut) rows.push({ cls: 'nl cut', mark, g: `${pad('', 4)} ${pad('', 4)}`, sign: '', body: `line cut: characters ${count(cut[0] + 1)}–${count(cut[1])} of ${count(cut[2])} shown; the full line is on GitHub` });
  }
  if (fold && !focus && rows.length > FOLD.long) for (const r of rows.slice(FOLD.keep)) r.mark = 'o';
  let folds = 0;
  rows.forEach((r, i) => r.mark === 'o' && rows[i - 1]?.mark !== 'o' && folds++);
  const row = (r) => `<div class="ln ${r.cls}${r.mark ? ` ${r.mark}` : ''}" data-g="${r.g}"${r.sign ? ` data-s="${r.sign}"` : ''}>${r.body}</div>`;
  const html = [`<div class="ln h" data-g="${pad('', 4)} ${pad('', 4)}">${esc(h.header)}</div>`, ...rows.map(row)].join('');
  return { html, shown: 1 + rows.filter((r) => r.mark !== 'o').length, folds, n: rows.length };
}

const hasCut = (h) => h.lines.some((l) => l[1].length > LONG);

// The file header carries what a reader needs to move from this hunk: a
// caret that folds the diff, the file on GitHub, the whole file's diff in the
// file view, and a link to the file's tests there.

// A hunk's lines say where they sit in words a reader needs no key for:
// `L120–134 at #9489`, or `before #9489` for lines the PR removes. The title
// holds the whole meaning: line numbers in the file at that commit, and the
// diff copied verbatim.
function rangeLabel(ctx, layerId, side, lo, hi) {
  const l = ctx.layers.get(layerId);
  const pr = ctx.layerLabel(layerId);
  const at = side === 'old' ? `before ${pr}` : `at ${pr}`;
  const sha = (side === 'old' ? l?.base : l?.head)?.slice(0, 7) ?? '';
  const title = `lines ${lo} to ${hi} of this file ${side === 'old' ? `before ${pr}, at its base` : `at ${pr}'s head`}${sha ? ` ${sha}` : ''}; the diff is git diff -U3, copied verbatim`;
  return `<span class="rng peekable" data-peek="${esc(title)}" tabindex="0">L${lo}–${hi} ${esc(at)}</span>`;
}

export function hunkFigure(ctx, layerId, h, { label, focus, role = 'home', kind = 'verbatim-u3', stopId, excerptOf } = {}) {
  const [lo, hi] = focus ?? hunkRange(h);
  const side = h.newLines > 0 ? 'new' : 'old';
  const l = ctx.layers.get(layerId);
  const cut = hasCut(h);
  if (cut) kind = 'verbatim-cut';
  const fileCh = ctx.homeChapter?.(layerId, h.id);
  const file = ctx.fileRow?.(fileCh, h.file);
  const tests = file && file.t !== 'test' ? file.tests.length : 0;
  const oldPath = ctx.index.get(layerId)?.files.get(h.file)?.oldPath ?? h.file;
  const bits = [
    `<button type="button" class="hunk-fold" aria-expanded="true" aria-label="fold this diff">${icon('caret')}</button>`,
    side === 'old'
      ? `<a class="path" href="${blob(ctx, layerId, oldPath, lo, hi, 'old')}" target="_blank" rel="noopener" translate="no" title="open on GitHub before this PR">${esc(h.file)}</a>`
      : `<a class="path" href="${blob(ctx, layerId, h.file, lo, hi)}" target="_blank" rel="noopener" translate="no" title="open on GitHub at the head">${esc(h.file)}</a>`,
    rangeLabel(ctx, layerId, side, lo, hi),
    `<span class="churn"><span class="p">+${h.adds}</span> <span class="m">−${h.dels}</span></span>`,
    cut ? tag('long lines cut', { attrs: 'data-cut' }) : '',
    '<span class="sp"></span>',
    excerptOf ? `<a class="excerpt-of" href="#${esc(excerptOf)}">excerpt · full hunk at ${esc(ctx.stopNum(excerptOf) ?? excerptOf)}</a>` : '',
    tests ? `<a class="to-tests" href="#${esc(fileCh)}/files/${file.tests[0]}">${icon('test')}${tests} ${tests === 1 ? 'test' : 'tests'}</a>` : '',
    file && file.of === null ? `<a class="file-link" href="#${esc(fileCh)}/files/${file.i}">whole file</a>` : '',
  ].join('');
  // The rows wait as text beside their block until the page needs them, and
  // the block holds the height they take (walkthrough.css draws both): code
  // is most of a review page, and the document keeps only what a reader can
  // reach. esc() turns every `<` of code into `&lt;`, so no row closes the script.
  const rows = hunkRows(h, { focus, only: role === 'excerpt' && Boolean(focus), fold: role !== 'excerpt' });
  if (rows.html.includes('</script')) throw new Error(`hunk ${h.id}: its rows would close their script`);
  // The longest line, in characters, lets the page tell a wide block before
  // it lays the block out.
  const cols = Math.max(h.header.length, ...cutLines(h.lines).map((r) => r.text.replace(/\t/g, '  ').length));
  return `<figure class="panel hunk evidence" style="--rows:${rows.shown};--folds:${rows.folds}${label ? ';--head:56px' : ''}" data-hunk="${esc(h.id)}" data-layer="${esc(layerId)}" data-path="${esc(h.file)}" data-role="${role}" data-evidence-kind="${kind}" data-base="${l?.base ?? ''}" data-head="${l?.head ?? ''}"${focus ? ` data-focus="${focus[0]}-${focus[1]}"` : ''}${stopId ? ` data-stop="${esc(stopId)}"` : ''}>
<figcaption class="hunk-meta">${bits}${label ? `<span class="label">${inline(label)}</span>` : ''}</figcaption>
<div class="code mini-diff" translate="no" data-cols="${cols}" data-n="${rows.n}" data-lazy></div><script type="text/x-lines">${rows.html}</script></figure>`;
}

function fileHunks(ctx, layerId, path, label) {
  const f = ctx.index.get(layerId)?.files.get(path);
  if (!f) return '';
  if (!f.hunks.length) return `<p class="local-note">${f.binary ? 'binary file' : 'no text hunks (mode or rename only)'}</p>`;
  return f.hunks.map((h) => hunkFigure(ctx, layerId, h, { label: h === f.hunks[0] ? label : '' })).join('');
}

const VIA = { call: 'call', http: 'http', kafka: 'kafka', hatchet: 'hatchet', db: 'db', timer: 'timer', browser: 'browser', webhook: 'webhook', cli: 'cli', queue: 'queue', mcp: 'mcp', deploy: 'deploy', config: 'config', test: 'test', other: 'other' };
// Who completes a flag, in the words of a flag box's tag and the ledgers.
const completer = (ctx, f) => (f.completedBy ? ctx.layerLabel(f.completedBy) : flagKind(f) === 'dead' ? 'nothing calls it' : f.type === 'outside-stack' ? 'outside the stack' : null);

// Table: every table on the page, from one renderer in one wrapper. The
// wrapper scrolls a wide table sideways and takes focus, so a keyboard scrolls
// it too; `label` names it for a screen reader. `head` holds each header's
// markup and `rows` the body's <tr> rows.
// Diagram legend: one line of keys under a diagram. A line key shows an
// arrow's stroke, a swatch a dot's proof, and a bare key a sentence.
export const legendItems = (items) => items.map((x) => `<span>${x.line ? `<i class="line ${x.line}"></i>` : x.swatch ? `<i class="swatch ${x.swatch}"></i>` : ''}${esc(x.label)}</span>`).join('');

export function tableView({ head, rows, cls = '', label, wrap = '', style = '' }) {
  return `<div class="scroll${wrap ? ` ${wrap}` : ''}" tabindex="0" role="region" aria-label="${esc(label)}"${style ? ` style="${style}"` : ''}><table class="table${cls ? ` ${cls}` : ''}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function stopNumbering(ch) {
  const nums = new Map();
  let n = 0;
  let sub = 0;
  let last = 0;
  for (const s of ch.stops) {
    if (!s.branch) {
      n++;
      last = n;
      sub = 0;
      nums.set(s.id, String(n).padStart(2, '0'));
    } else {
      sub++;
      nums.set(s.id, `${String(last).padStart(2, '0')}${String.fromCharCode(96 + Math.min(sub, 26))}`);
    }
  }
  return nums;
}

// The call stack that led here, outermost first. Frames this layer changes
// carry its color; the rest are the code the change runs inside. A deep stack
// shows its last four frames and folds the outer ones.
function trailView(ctx, s) {
  const frames = s.stack ?? [];
  if (!frames.length) return '';
  const fold = Math.max(0, frames.length - 4);
  const items = frames
    .map((f, i) => {
      const cls = ['fr', f.changed ? 'changed' : '', i === frames.length - 1 ? 'current' : '', i < fold ? 'outer' : ''].filter(Boolean).join(' ');
      const where = f.layer === 'base' || !f.layer ? ctx.layerLabel('base') : `added in ${ctx.layerLabel(f.layer)}`;
      return `<li class="${cls}" style="--c:${f.layer === 'base' || !f.layer ? 'var(--mute)' : layerVar(ctx, f.layer)}" data-peek="${esc(`${f.file ? `${f.file} · ` : ''}${where}${f.changed ? ' · changed here' : ''}`)}" tabindex="0"><code class="peekable" translate="no">${esc(f.symbol)}</code>${i < frames.length - 1 ? icon('caret') : ''}</li>`;
    })
    .join('');
  return `<ol class="trail" aria-label="call stack, outermost frame first">${fold ? `<li class="fr more">${tag(`+${fold} outer`, { kind: 'count', attrs: 'data-trail-more aria-expanded="false"' })}${icon('caret')}</li>` : ''}${items}</ol>`;
}

// What each badge on a stop's head means, shown on hover or focus: the page's
// own words for DOMAIN.md's Flag, Slow down, Untested and Branch.
export const BADGE_MEANS = {
  dormant: 'Code this PR adds before its caller: a later PR in the stack calls it, and the flag below names that PR.',
  dead: 'Code nothing calls, in this PR or any later one: only its tests reach it.',
  'producer-only': 'Something this PR sends or writes that nothing reads yet. The flag below names the PR that adds the reader.',
  interim: 'Behavior a later PR replaces or changes. The flag below names that PR.',
  'inverted-order': 'This PR needs a later PR to work: the prerequisite sits above it in the stack.',
  'outside-stack': 'This change depends on work outside the stack, such as another PR or a ticket.',
  slow: 'One of the few stops in this PR where the risk sits. Read it closely.',
  untested: 'Branches of this code that no test reaches, listed under untested below.',
  branch: 'A stop the flow reaches only on this outcome of the decision above it.',
};

function badgesView(s, branchLabel, caveats = []) {
  const list = [];
  for (const f of s.flags ?? []) if (f.status !== 'dropped') list.push({ severity: flagSeverity(f), html: `${icon('flag')}${esc(FLAG_NAME[flagKind(f)])}`, term: FLAG_NAME[flagKind(f)], means: BADGE_MEANS[flagKind(f)] });
  if (s.slowDown) list.push({ severity: 'important', html: 'slow down', term: 'slow down', means: BADGE_MEANS.slow });
  if ((s.untested ?? []).length) list.push({ severity: 'important', html: `${s.untested.length} untested`, term: 'untested', means: BADGE_MEANS.untested });
  if (s.branch) list.push({ severity: 'info', html: `branch · ${esc(branchLabel ?? s.branch)}`, term: 'branch', means: BADGE_MEANS.branch });
  if (!list.length && !caveats.length) return '';
  return `<div class="badges">${bySeverity(list)
    .map((b) => mark(b.severity, b.html, `tabindex="0" data-term="${esc(b.term)}" data-def="${esc(b.means)}"`))
    .join('')}${caveats.map(caveatMark).join('')}</div>`;
}

function stopView(ctx, ch, s, num) {
  const layerId = ch.layer;
  const T = ctx.terms.scope();
  const c = layerVar(ctx, layerId);
  const idx = ctx.index.get(layerId);
  const hunk = (id) => idx?.hunks.get(id);
  const br = s.branch ? ch.stops.flatMap((x) => x.decision?.branches ?? []).find((x) => x.id === s.branch) : null;

  // Answer quotes, each marked in the first field that holds it.
  const table = [];
  const byField = new Map();
  for (const q of ctx.looks?.get(s.id) ?? []) {
    const hit = proseFields(s).find(([, t]) => !quoteProblem(t, q.quote));
    if (hit) byField.set(hit[0], [...(byField.get(hit[0]) ?? []), q]);
  }
  const M = (field, text) => (byField.has(field) ? withMarks(text, byField.get(field), table) : text);

  // How this frame was reached, after the stack: the caller's name only when
  // the trail does not already end on it.
  const caller = s.wake.caller;
  const frames = s.stack ?? [];
  const callerShown = caller && frames.length > 1 && frames[frames.length - 2].symbol === caller.symbol;
  // The call site's lens shows its lines in place; the link opens GitHub.
  const lens = caller?.file ? ctx.lensFor?.(layerId, caller.file, caller.line) : null;
  const wake = `<p class="wake"><span class="via">via ${esc(VIA[s.wake.via] ?? s.wake.via)}</span>${caller && !callerShown ? ` from <code class="sym" translate="no">${esc(caller.symbol)}</code>` : ''}${caller?.file ? ` <a class="loc" href="${blob(ctx, layerId, caller.file, caller.line)}" target="_blank" rel="noopener" translate="no"${lens ? ` data-lens="${esc(lens)}"` : ' title="the call site on GitHub"'}>${esc(caller.file.split('/').pop())}${caller.line ? `:${caller.line}` : ''}</a>` : ''}${s.wake.note ? `<span class="note"> · ${inline(M('wake', s.wake.note), T)}</span>` : ''}</p>`;

  // A payload with a shape opens it in place; one without is plain text.
  const shape = (label, p) => {
    if (!p) return `<span class="io"><b>${label}</b><span class="keyline">nothing</span></span>`;
    if (!p.shape) return `<span class="io"><b>${label}</b><span>${inline(p.label)}</span></span>`;
    return `<details class="disclose io"><summary>${icon('caret')}<b>${label}</b><span class="io-l">${inline(p.label)}</span></summary><pre class="code-block" translate="no">${paintBlock(p.shape, 'ts')}</pre></details>`;
  };
  const payload = s.payload && (s.payload.in || s.payload.out) ? `<div class="payload">${shape('in', s.payload.in)}<span class="to" aria-hidden="true">→</span>${shape('out', s.payload.out)}</div>` : '';

  const gist = inline(M('gist', s.gist), T);
  // The badge above names the callout, so the callout carries only its reason.
  const slow = s.slowDown ? `<p class="callout important slowdown"><span class="sr">slow down: </span>${inline(M('slowDown', s.slowDown), T)}</p>` : '';
  const detail = md(M('detail', s.detail), T);

  // Each `file:line` receipt in the evidence opens its lens: the lines at
  // the head of the layer the clause names, with that layer's additions
  // marked. A receipt that names no file stays text.
  const receipts = (text) => {
    let out = '';
    let at = 0;
    for (const r of receiptsOf(text, layerId)) {
      const path = ctx.resolveRef?.(r.layer, r.ref);
      const lensKey = path ? ctx.lensFor?.(r.layer, path, r.line) : null;
      if (!lensKey) continue;
      out += `${inline(text.slice(at, r.start))}<a class="loc" href="${blob(ctx, r.layer, path, r.line)}" target="_blank" rel="noopener" translate="no" data-lens="${esc(lensKey)}">${esc(text.slice(r.start, r.end))}</a>`;
      at = r.end;
    }
    return out + inline(text.slice(at));
  };
  // The stop's badges name its flags, so a box repeats the name only when
  // the stop has two, and its tag says who completes it. The evidence
  // behind a flag opens on request.
  const named = (s.flags ?? []).filter((f) => f.status !== 'dropped').length > 1;
  const flags = bySeverity(s.flags ?? [], (f) => (f.status === 'dropped' ? 'info' : flagSeverity(f)))
    .map((f) => {
      const sev = f.status === 'dropped' ? 'dropped' : flagSeverity(f);
      const kind = flagKind(f);
      const done = f.completedBy ? xref(`#c${f.completedBy}`, '', `${esc(ctx.layerLabel(f.completedBy))} completes it`) : tag(unfinished(f, ctx.layers.size === 1));
      const name = named || f.status === 'dropped' ? `<span>${icon('flag')}${esc(FLAG_NAME[kind])}</span>` : '';
      // An open flag names the caveat that says when and where it closes;
      // the marker previews that caveat and opens its card.
      const closes = f.caveat && f.status !== 'dropped' ? caveatsOn(ctx, [s.id]).filter((x) => x.c.id === f.caveat).map(caveatMark).join('') : '';
      return `<div class="callout box ${sev} flag-box" data-flag="${esc(kind)}"><div class="ft caps">${name}${done}${closes}${f.status === 'dropped' ? tag('dropped') : ''}</div><p>${inline(M(`flag.${s.flags.indexOf(f)}`, f.text), T)}</p>${f.evidence ? `<details class="disclose ev-d"><summary>${icon('caret')}evidence</summary><div class="ev" translate="no">${receipts(f.evidence)}</div></details>` : ''}</div>`;
    })
    .join('');

  // Branch cards only: the main path is the next stop, one line below them.
  const nextMain = ch.stops.slice(ch.stops.indexOf(s) + 1).find((x) => !x.branch);
  const nums = ctx.nums;
  const decision = s.decision
    ? `<div class="callout box decision" data-decision="${esc(s.id)}"><div class="q">${inline(M('decision', s.decision.question), T)}</div><div class="opts">${s.decision.branches
        .map((b, i) => {
          const first = ch.stops.find((x) => x.branch === b.id);
          return `<a href="#${esc(first?.id ?? s.id)}" data-branch="${esc(b.id)}"><span class="bl">${esc(b.label)}</span>${b.outcome ? `<span class="outcome">${inline(M(`branch.${i}`, b.outcome), inControl(T))}</span>` : ''}${first ? `<span class="go">${esc(nums.get(first.id) ?? '')} ↓</span>` : ''}</a>`;
        })
        .join('')}</div>${nextMain ? `<p class="otherwise">otherwise ${stopLink(ctx, nextMain.id, { num: nums.get(nextMain.id) })}</p>` : ''}</div>`
    : '';

  const labelled = s.anchors.length > 1;
  const anchors = s.anchors
    .map((a) => {
      const h = hunk(a.hunk);
      if (!h) return '';
      const homeStop = a.role === 'excerpt' ? ctx.homeOf.get(`${layerId}|${a.hunk}`) : null;
      return hunkFigure(ctx, layerId, h, { label: labelled ? a.label : '', focus: a.focus, role: a.role, stopId: s.id, excerptOf: homeStop });
    })
    .join('');

  const proof = (s.proof ?? []).length
    ? `<h4 class="sub">proved by</h4><div class="proofs">${s.proof
        .map((p) => {
          let body = '';
          if (p.hunk && hunk(p.hunk)) body = hunkFigure(ctx, layerId, hunk(p.hunk), { focus: p.focus, role: p.role, kind: 'verbatim-u3', stopId: s.id });
          else if (p.file) body = fileHunks(ctx, layerId, p.file, '');
          return `<details class="disclose proof-d"><summary>${icon('caret')}${icon('test')}<span translate="no">${esc(p.name)}</span>${p.covers ? `<span class="cv">· ${esc(p.covers)}</span>` : ''}</summary>${body}</details>`;
        })
        .join('')}</div>`
    : '';
  const untested = (s.untested ?? []).length ? `<h4 class="sub">untested</h4><ul class="callout important untested">${s.untested.map((u, i) => `<li>${inline(M(`untested.${i}`, u), T)}</li>`).join('')}</ul>` : '';
  const margin = (s.margin ?? []).length
    ? `<h4 class="sub">beside</h4>${s.margin
        .map((m) => {
          let body = '';
          if (m.hunk && hunk(m.hunk)) body = hunkFigure(ctx, layerId, hunk(m.hunk), { focus: m.focus, role: m.role, stopId: s.id });
          else if (m.file) body = fileHunks(ctx, layerId, m.file, '');
          return `<details class="disclose margin-d"><summary>${icon('caret')}<b class="caps">${esc(m.kind)}</b>${inline(m.label)}</summary>${body}</details>`;
        })
        .join('')}`
    : '';
  const scene = s.scene ? ctx.sceneSlot(s.scene, s.id) : '';

  return unmark(`<li class="panel ground stop${s.branch ? ' branch' : ''}" id="${esc(s.id)}" data-stop="${esc(s.id)}" data-chapter="${esc(ch.id)}" data-num="${esc(num)}" style="--c:${c}" tabindex="-1" aria-label="${esc(`stop ${num}: ${plain(s.title)}`)}">
<div class="stop-head"><span class="stop-num">${esc(num)}</span><div class="stop-hd">${badgesView(s, br?.label, caveatsOn(ctx, [s.id]))}<h3 class="stop-title">${inline(s.title)}</h3><p class="stop-gist">${gist}</p></div><button type="button" class="btn outline reopen" data-act="reopen" aria-expanded="false">show</button></div>
<div class="stop-body"><div class="ctx">${trailView(ctx, s)}${wake}${payload}</div>${slow}<div class="detail prose">${detail}</div>${flags}${decision}${scene}${anchors ? `<h4 class="sub">evidence</h4>${anchors}` : ''}${proof}${untested}${margin}${s.transition ? `<p class="transition">${inline(M('transition', s.transition), T)}</p>` : ''}</div>
<div class="stop-actions"><button type="button" class="btn outline" data-act="review" aria-pressed="false" aria-keyshortcuts="x">mark reviewed</button><button type="button" class="btn text" data-act="comment">comment</button></div>
</li>`, table);
}

// The brief: the few ideas every later section uses, each defined once and
// folded under the intent. Folded, it shows its title, who should open it and
// the ideas' names, each a link that opens it on that idea. Its text marks no
// terms, since it is where they are defined.
export function briefView(brief, hops = []) {
  if (!brief?.items?.length) return '';
  const hopOf = new Map(hops.map((h) => [h.id, h]));
  const link = (l) => (l.href.startsWith('#') ? `<a href="${esc(l.href)}">${inline(l.label)}</a>` : `<a href="${esc(l.href)}" target="_blank" rel="noopener">${inline(l.label)}</a>`);
  const links = (x) => [...(hopOf.has(x.hop) ? [{ label: `hop · ${hopOf.get(x.hop).from} → ${hopOf.get(x.hop).to}`, href: `#${x.hop}` }] : []), ...(x.links ?? [])];
  const item = (x) => `<li id="brief-${esc(x.id)}"><b class="brief-term">${esc(x.term)}</b><div class="prose">${md(x.text)}</div>${links(x).length ? `<p class="brief-links keyline">→ ${links(x).map(link).join(' · ')}</p>` : ''}</li>`;
  return `<div class="brief"><details class="disclose ref brief-d" id="brief"><summary>${icon('caret')}<span class="rt">${inline(brief.title)}</span><span class="brief-sum">${inline(brief.summary)}${brief.skip ? ` <span class="brief-skip">${inline(brief.skip)}</span>` : ''}</span></summary><div class="ref-b"><ol class="brief-items">${brief.items.map(item).join('')}</ol>${brief.closing ? `<div class="prose brief-close">${md(brief.closing)}</div>` : ''}</div></details><p class="brief-terms keyline">${brief.items.map((x) => `<a href="#brief-${esc(x.id)}">${esc(x.term)}</a>`).join('<span aria-hidden="true"> · </span>')}</p></div>`;
}

// A glossary term a brief item names links to the item. The item's own idea,
// and a term with no def of its own, takes the item's text, so the hover and
// the glossary say what the brief says; a narrower term keeps its own def.
export function withBriefDefs(outline) {
  const owner = new Map((outline.brief?.items ?? []).flatMap((x) => (x.glossary ?? []).map((t) => [t.toLowerCase(), x])));
  return (outline.glossary ?? []).map((g) => {
    const x = owner.get(g.term.toLowerCase());
    if (!x) return g;
    const own = x.term.toLowerCase() === g.term.toLowerCase() || !g.def;
    return { ...g, def: own ? x.text : g.def, brief: x.id };
  });
}

function takeawaysView(list, T) {
  if (!list?.length) return '';
  return `<ul class="takeaways">${bySeverity(list)
    .map((t) => `<li>${mark(t.severity, esc(t.severity))}<span>${inline(t.text, T)}</span></li>`)
    .join('')}</ul>`;
}

// The files no stop opens, each with its whole diff one click away, and a
// control that opens them all. Only a file nothing explains says so.
function housekeepingView(ctx, ch) {
  const rows = [...ch.housekeeping.map((h) => ['', h]), ...ch.everythingElse.map((h) => ['everything else', h])];
  if (!rows.length) return '';
  const n = rows.length;
  return `<h2 class="mark" id="hk-${esc(ch.id)}">not in the walk <em>${n} ${n === 1 ? 'file' : 'files'} · glue, docs, fixtures and generated files</em></h2><div class="hk" data-hk><div class="hk-bar"><button type="button" class="btn outline" data-act="open-all" aria-expanded="false">open all ${n}</button></div>${rows
    .map(([kind, h]) => {
      const f = ctx.index.get(ch.layer)?.files.get(h.file);
      return `<details class="disclose margin-d" data-path="${esc(h.file)}"><summary>${icon('caret')}${kind ? `<b class="caps">${esc(kind)}</b>` : ''}<span translate="no" class="mono">${esc(h.file)}</span> · ${inline(h.label)} <span class="keyline">+${f?.adds ?? 0} −${f?.dels ?? 0}</span></summary>${fileHunks(ctx, ch.layer, h.file, '')}</details>`;
    })
    .join('')}</div>`;
}

// A stop link names where it goes: the stop's number and title, and its PR
// when the link sits outside that PR's chapter, since two PRs both have a
// stop 07. A link from a question carries the id of its answer quote, so the
// jump lands on the sentence that answers it. render.mjs refuses a stop link
// without its title.
export function stopLink(ctx, id, { num, look } = {}) {
  const title = ctx.stopTitle?.(id);
  const layer = ctx.stopLayer?.(id);
  const pr = layer && layer !== ctx.here && ctx.layers?.size > 1 ? `${ctx.layerLabel(layer)} · ` : '';
  return `<a class="to-stop" href="#${esc(id)}"${look ? ` data-look="${esc(look)}"` : ''}${layer ? ` style="--c:${layerVar(ctx, layer)}"` : ''}><b>${esc(pr)}${esc(num ?? ctx.stopNum?.(id) ?? id)}</b>${title ? ` <span class="tt">${inline(title)}</span>` : ''}</a>`;
}
// Every other cross-reference is the same link: a quiet label, then the
// name of what it opens, underlined. A link that leaves the page for GitHub
// adds an arrow out; one to a file carries its lens.
export function xref(href, label, name, { ext = false, attrs = '' } = {}) {
  return `<a class="to-stop xref" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}${attrs ? ` ${attrs}` : ''}>${label ? `<b>${label}</b> ` : ''}<span class="tt">${name}</span>${ext ? icon('external') : ''}</a>`;
}

// The answer waits behind a toggle, so the reader tries the question first.
// Open, it quotes the sentences that answer it, each with the stop it comes
// from; a stop that answers without a quotable sentence is listed after them.
// A caveat is a decision the change makes knowingly imperfect. Its card
// sits in the reference, and a marker on every stop and hop it names opens
// it where the decision shows, so a reader never reopens what is known.
export const CAVEAT_ICON = icon('caveat');
// A caveat marks every stop and hop its `where` names, and every stop whose
// open flag links it, since that flag stays open past the change.
export function caveatMarks(outline) {
  const at = new Map();
  (outline.caveats ?? []).forEach((c, i) => {
    for (const id of caveatWhere(outline, c)) at.set(id, [...(at.get(id) ?? []), { c, n: i + 1 }]);
  });
  return at;
}
export function caveatWhere(outline, c) {
  const flagged = outline.chapters.flatMap((ch) => ch.stops.filter((s) => (s.flags ?? []).some((f) => f.status !== 'dropped' && f.caveat === c.id)).map((s) => s.id));
  return [...new Set([...c.where, ...flagged])];
}
// The caveats a stop or a hop carries, each once, in the order the list gives them.
export function caveatsOn(ctx, ids) {
  const seen = new Map();
  for (const id of ids) for (const x of ctx.caveatsAt?.get(id) ?? []) seen.set(x.c.id, x);
  return [...seen.values()].sort((a, b) => a.n - b.n);
}
export const caveatMark = ({ c, n }) => `<a class="cav-mark" href="#cav-${esc(c.id)}" data-caveat="${esc(c.id)}" aria-label="${esc(`caveat ${n}: ${plain(c.title)}`)}">${CAVEAT_ICON}caveat ${n}</a>`;
// The tip holds the code as it ships, so a caveat's code and plan link there.
function tipLink(ctx, ref) {
  const tip = [...ctx.layers.keys()].at(-1);
  const [path, anchor] = ref.split('#');
  let line = null;
  if (anchor && ctx.read) {
    const lines = ctx.read(ctx.layers.get(tip).head, path) ?? [];
    const re = new RegExp(`\\b${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const k = lines.findIndex((t) => re.test(t));
    if (k >= 0) line = k + 1;
  }
  // A doc's heading anchor finds the heading it slugs from, so the lens opens there.
  if (anchor && !line && ctx.read) {
    const lines = ctx.read(ctx.layers.get(tip).head, path) ?? [];
    const slug = (t) => t.replace(/^#+\s*/, '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
    const k = lines.findIndex((t) => /^#+\s/.test(t) && slug(t) === anchor);
    if (k >= 0) line = k + 1;
  }
  const url = blob(ctx, tip, path, line);
  return { url: line || !anchor ? url : `${url}#${anchor}`, path, anchor, line, layer: tip };
}
// Every link on a caveat's card is the one cross-reference link: a stop, a
// hop, the code at the tip with its lens, and the plan.
function caveatCard(ctx, { c, n }, T) {
  const where = (ctx.caveatWhere?.(c) ?? c.where).map((id) => (ctx.stopNum?.(id) ? stopLink(ctx, id) : xref(`#${id}`, esc(ctx.hopNum?.(id) ?? 'hop'), esc(ctx.hopName?.(id) ?? id))));
  const lensed = (l) => {
    const key = l.line ? ctx.lensFor?.(l.layer, l.path, l.line) : null;
    return key ? `data-lens="${esc(key)}" translate="no"` : 'translate="no"';
  };
  const code = (c.code ?? []).map((ref) => {
    const l = tipLink(ctx, ref);
    return xref(l.url, 'code', `${esc(l.path.split('/').pop())}${l.anchor ? ` · ${esc(l.anchor)}` : ''}`, { ext: true, attrs: lensed(l) });
  });
  const planned = c.planned.href ? { url: c.planned.href } : tipLink(ctx, c.planned.path);
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<article class="caveat" id="cav-${esc(c.id)}" data-caveat="${esc(c.id)}"><h4 class="cav-title"><span class="cav-n">${CAVEAT_ICON}caveat ${n}</span>${inline(c.title, T)}</h4><dl class="cav-rows">${row('did', inline(c.did, T))}${row('why now', inline(c.why, T))}${row('cost', inline(c.cost, T))}${row('fix', inline(c.fix, T))}${row('planned', xref(planned.url, '', inline(c.planned.label), { ext: true, attrs: planned.path ? lensed(planned) : '' }))}</dl><p class="cav-where"><span class="cav-k">where</span>${[...where, ...code].join('<span aria-hidden="true"> · </span>')}</p></article>`;
}
// The same caveat, compact, for its peek and its touch sheet: the title, what
// the code does in its first sentence, and the fix with where it is planned.
// A reader who hovers a marker learns the decision and its way out, not only
// the problem.
const firstSentence = (text) => String(text ?? '').split(/(?<=[.!?])\s+(?=[A-Z`])/)[0];
export function caveatPeek({ c, n }) {
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<div class="caveat compact"><p class="cav-title"><span class="cav-n">${CAVEAT_ICON}caveat ${n}</span>${inline(c.title)}</p><dl class="cav-rows">${row('did', inline(firstSentence(c.did)))}${row('fix', `${inline(c.fix)} <span class="cav-plan">planned: ${inline(c.planned.label)}</span>`)}</dl></div>`;
}
function caveatsBody(ctx, outline, T) {
  const all = (outline.caveats ?? []).map((c, i) => ({ c, n: i + 1 }));
  return all.length ? `<div class="caveats">${all.map((x) => caveatCard(ctx, x, T)).join('')}</div>` : '';
}

function qaItem(ctx, ch, q, i, { box, num }) {
  const looks = q.look ?? [];
  const id = `${esc(ch.id)}-${i}`;
  const look = `${ch.id}-qa-${i}`;
  const rows = q.stops.flatMap((s) => {
    const quotes = looks.filter((l) => l.stop === s);
    if (!quotes.length) return [`<li class="also">${stopLink(ctx, s, { num: num(s) })}</li>`];
    return quotes.map((l) => `<li><q>${inline(l.quote)}</q>${stopLink(ctx, s, { num: num(s), look })}</li>`);
  });
  return `<li data-qa="${id}"><input type="checkbox" id="${box}-${id}"><label for="${box}-${id}">${inline(q.question)}</label><details class="disclose qa-ans"><summary>${icon('caret')}answer</summary><ul>${rows.join('')}</ul></details></li>`;
}

function qaView(ctx, ch, nums) {
  if (!ch.qa.length) return '';
  return `<ul class="qa">${ch.qa.map((q, i) => qaItem(ctx, ch, q, i, { box: 'qa', num: (id) => nums.get(id) })).join('')}</ul>`;
}

// The card turns; the stop link sits outside the button, so it stays a link.
function selfCheckView(ctx, ch) {
  if (!ch.selfCheck.length) return '';
  return `<h2 class="mark">self-check cards <em>turn a card to see the answer</em></h2><div class="cards">${ch.selfCheck
    .map((c, i) => `<div class="card"><button type="button" aria-pressed="false"><span class="panel face front"><b class="caps">question</b><span class="qt">${inline(c.question)}</span></span><span class="panel face back"><b class="caps">answer</b><span class="qt">${inline(c.answer.replace(/\s*\n+\s*/g, ' '))}</span></span></button><p class="card-go">${stopLink(ctx, c.stop, { look: c.quote ? `${ch.id}-sc-${i}` : null })}</p></div>`)
    .join('')}</div>`;
}

export function chapterView(ctx, ch, n) {
  const layer = ctx.layers.get(ch.layer);
  const c = layerVar(ctx, ch.layer);
  const nums = stopNumbering(ch);
  ctx.nums = nums;
  ctx.here = ch.layer;
  const T = ctx.terms.scope();
  const fileCount = ctx.fileViews?.get(ch.id)?.files.length ?? 0;
  const meta = [
    layer?.url ? xref(layer.url, '', `#${esc(layer.pr ?? layer.id)} on GitHub`, { ext: true }) : '',
    layer?.ticket ? (layer.ticketUrl ? xref(layer.ticketUrl, '', esc(layer.ticket), { ext: true }) : esc(layer.ticket)) : '',
    layer ? `<span class="sha" translate="no">base ${esc(layer.base.slice(0, 11))} → head ${esc(layer.head.slice(0, 11))}</span>` : '',
    tag(`0 / ${ch.stops.length} reviewed`, { attrs: 'data-chapter-progress' }),
  ].join('');
  const ba = ch.before || ch.after ? `<div class="panel split beforeafter"><div class="b"><b class="caps">before</b>${inline(ch.before ?? '', T)}</div><div class="a"><b class="caps">after</b>${inline(ch.after ?? '', T)}</div></div>` : '';
  const skipped = ch.housekeeping.length + ch.everythingElse.length;
  const tabs = `<nav class="views" aria-label="views of this PR"><a class="tab" href="#${esc(ch.id)}" data-view="walk" aria-current="page">the walk <span>${ch.stops.length} stops</span></a><a class="tab" href="#${esc(ch.id)}/files" data-view="files">every file <span>${fileCount} files</span></a>${skipped ? `<a class="skip-to" href="#hk-${esc(ch.id)}">${skipped} ${skipped === 1 ? 'file' : 'files'} not in the walk</a>` : ''}<button type="button" class="btn outline fold-all" data-act="fold-all" aria-expanded="true" aria-keyshortcuts="z"><span>fold every diff</span></button></nav>`;
  return `<section class="chapter" id="${esc(ch.id)}" data-chapter="${esc(ch.id)}" data-layer="${esc(ch.layer)}" style="--c:${c}" tabindex="-1" hidden>
<header class="ch-head"><div class="kicker">chapter ${String(n).padStart(2, '0')} · ${esc(ctx.layerLabel(ch.layer))}</div><h1>${inline(ch.title)}</h1><p class="gist">${inline(ch.gist, T)}</p><div class="ch-meta">${meta}</div><div class="intent prose">${md(ch.intent, T)}</div>${ba}${takeawaysView(ch.takeaways, T)}<p class="callout entry"><b class="caps">entry</b>${inline(ch.entry, T)}</p>${tabs}</header>
<div class="walk-view" data-walk>
<h2 class="mark">the walk <em>each stop is a frame waking up, in the order the code runs</em></h2>
<ol class="stops">${ch.stops.map((s) => stopView(ctx, ch, s, nums.get(s.id))).join('')}</ol>
${housekeepingView(ctx, ch)}
${selfCheckView(ctx, ch)}
${ch.qa.length ? `<h2 class="mark">questions on this PR <em>try each one, then open its answer</em></h2>${qaView(ctx, ch, nums)}` : ''}
</div>
<div class="files-view" data-files="${esc(ch.id)}" hidden><p class="keyline">The file view builds when you open it.</p></div>
</section>`;
}

// Every hop as a list, grouped like the map: read top to bottom, it is the story.
// A step in passing lists its hops under its own row.
function lanesView(ctx, outline) {
  const groups = flowGroups(outline, flowSteps(outline));
  const story = Boolean(outline.spine.acts?.length);
  const item = (h, step = true) =>
    `<li class="hop"${step ? ` data-hop="${esc(h.id)}"` : ''} style="--c:${layerVar(ctx, h.layer)}"><a href="#${esc(h.stop ?? '')}"><span class="ft" translate="no"><b>${esc(h.from)}</b> → <b>${esc(h.to)}</b></span><span class="lb"><span class="tt">${inline(h.story ?? h.label)}</span>${layerTag(ctx.layerLabel(h.layer), layerVar(ctx, h.layer))}${proofTag(h.proof)}</span></a></li>`;
  return `<div class="lanes${story ? ' story' : ''}" style="--lanes:${story ? 1 : Math.min(groups.length, 3)}">${groups
    .map(
      (g) => `<section class="panel lane" data-lane="${esc(g.id)}"><h3 class="kicker">${esc(g.title)}</h3>${g.gist ? `<p class="lg">${inline(g.gist)}</p>` : ''}<ol class="hops">${g.items
        .map(({ h }) =>
          h.passing
            ? `<li class="hop passing" data-hop="${esc(h.id)}" style="--c:var(--mute)"><span class="ft" translate="no">${esc(h.label)}</span><span class="lb">${esc(passingName(ctx, h))}</span><ol class="hops">${h.hops.map((x) => item(x, false)).join('')}</ol></li>`
            : item(h),
        )
        .join('')}</ol></section>`,
    )
    .join('')}</div>`;
}

// The whole flow in reading order. With acts, the story sets the order and
// each hop carries its act; without them, lane by lane.
export function flowHops(outline) {
  const laneTitle = new Map(outline.spine.lanes.map((l) => [l.id, l.title]));
  const acts = outline.spine.acts;
  if (acts?.length) {
    const byId = new Map(outline.spine.hops.map((h) => [h.id, h]));
    return acts.flatMap((a, ai) => a.hops.map((id) => byId.get(id)).filter(Boolean).map((h) => ({ ...h, laneTitle: laneTitle.get(h.lane) ?? h.lane, act: a.id, actTitle: a.title, actIndex: ai })));
  }
  return outline.spine.lanes.flatMap((lane) => outline.spine.hops.filter((h) => h.lane === lane.id).map((h) => ({ ...h, laneTitle: lane.title })));
}

// The flow as the player steps it. Each hop a layer adds is a step of its
// own; each run of hops from before the stack, inside one act, passes as one
// step that names the hops it covers, so the story spends its time on the
// stack's hops and mentions the rest in passing.
export function flowSteps(outline) {
  const steps = [];
  let num = 0;
  for (const h of flowHops(outline)) {
    const last = steps.at(-1);
    if (h.layer !== 'base') steps.push({ ...h, num: ++num });
    else if (last?.passing && (last.act ?? last.lane) === (h.act ?? h.lane)) {
      last.hops.push(h);
      last.to = h.to;
      last.label = hopChain(last.hops);
    } else steps.push({ id: `pass-${h.id}`, passing: true, hops: [h], from: h.from, to: h.to, label: hopChain([h]), layer: 'base', lane: h.lane, laneTitle: h.laneTitle, act: h.act, actTitle: h.actTitle, actIndex: h.actIndex });
  }
  return steps;
}
// The components a run of hops passes: `A → B → C` while each hop starts
// where the one before it ends, a comma where one does not.
export const hopChain = (hops) => hops.map((h, k) => (k && hops[k - 1].to === h.from ? ` → ${h.to}` : `${k ? ', ' : ''}${h.from} → ${h.to}`)).join('');
const passingName = (ctx, h) => `in passing · ${h.hops.length} ${h.hops.length === 1 ? 'hop' : 'hops'} ${ctx.layerLabel('base')}`;
// An act drawn as a sequence diagram. Its components stand across the top,
// grouped by system in the outline's order and, inside a system, in the
// order the story first reaches them. A lifeline runs under each head; each hop is a row in story order, an
// arrow from the caller's lifeline to the callee's with what travels written
// above it. Time reads downward and every arrow has a row of its own, so no
// label covers another arrow. A crowded act staggers its heads over two
// tiers, which gives each name half a column more on either side. Columns are
// shares of the figure's width, so the act fills its box; the figure never
// narrows below the width at which every name and label fits.
export const SQ = { row: 30, pass: 20, char: 6.6, labelChar: 6.6, sysChar: 6.1, line: 13, col: 84, colTight: 64, stagger: 8, roomy: 160, room: 800, gutter: 24 };
const hopText = (h) => `${VIA[h.via] ?? h.via} · ${plain(h.label)}`;
export function seqLayout(systems, hops) {
  const lane = new Map();
  systems.forEach((sys, i) => sys.nodes.forEach((n) => lane.set(n, i)));
  const seen = [...new Set(hops.flatMap((h) => (h.hops ?? [h]).flatMap((x) => [x.from, x.to])))];
  const first = new Map(seen.map((n, i) => [n, i]));
  const at = (n) => lane.get(n) ?? systems.length;
  const cols = [...seen].sort((a, b) => at(a) - at(b) || first.get(a) - first.get(b));
  const col = new Map(cols.map((n, i) => [n, i]));
  const n = cols.length;
  const tiers = n >= SQ.stagger ? 2 : 1;
  const colMin = tiers === 2 ? SQ.colTight : SQ.col;
  // Names wrap for the column a desktop gives them; a narrower screen scrolls
  // the figure instead of squeezing a name out of its box. A staggered head
  // spans a column and a half, a quarter less at either edge of the figure.
  const room = Math.max(colMin, Math.min(SQ.roomy, SQ.room / Math.max(1, n)));
  const heads = cols.map((name, i) => {
    const l = at(name);
    const span = tiers === 1 ? 1 : i === 0 || i === n - 1 ? 1.25 : 1.5;
    return { name, lane: l, span, sys: systems[l]?.title ?? (systems.length ? 'other' : ''), tier: tiers === 2 ? i % 2 : 0, lines: wrapLabel(name, Math.max(6, Math.floor((room * span * 0.92 - 10) / SQ.char))) };
  });
  // A system's title sits over its run of heads and wraps to that run's width,
  // with `&` for `and` where the band is narrow; spaced capitals take about 6.1
  // units a letter.
  const groups = [];
  heads.forEach((h, i) => (groups.at(-1)?.lane === h.lane ? (groups.at(-1).end = i) : groups.push({ lane: h.lane, start: i, end: i, title: h.sys })));
  for (const gr of groups) gr.lines = gr.title ? wrapLabel(gr.title.replace(/ and /g, ' & ').toUpperCase(), Math.max(4, Math.floor(((gr.end - gr.start + 1) * room * 0.92 - 8) / SQ.sysChar))) : [];
  const colNeed = Math.max(
    ...heads.map((h) => (Math.max(0, ...h.lines.map((x) => x.length)) * SQ.char + 10) / (0.92 * h.span)),
    ...groups.map((gr) => (Math.max(0, ...gr.lines.map((x) => x.length)) * SQ.sysChar + 8) / (0.92 * (gr.end - gr.start + 1))),
  );
  const rows = hops.map((h) => ({ from: col.get(h.from), to: col.get(h.to), text: h.passing ? `in passing · ${h.label}` : hopText(h), segs: h.hops?.map((x) => [col.get(x.from), col.get(x.to)]) }));
  const labelMax = Math.max(0, ...rows.map((r) => r.text.length)) * SQ.labelChar;
  const headsWidth = Math.ceil(n * Math.max(colMin, colNeed));
  const minWidth = Math.max(headsWidth, Math.ceil(labelMax + SQ.gutter + 8));
  return { cols, col, tiers, heads, groups, rows, minWidth, headsWidth };
}

// A label wraps at spaces, then after dots and dashes, to fit its box.
function wrapLabel(name, max) {
  const words = name.split(' ').flatMap((w) => (w.length <= max ? [w] : w.split(/(?<=[.\-/])/)));
  const lines = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + (/[.\-/]$/.test(last) ? '' : ' ') + w).length <= max) lines[lines.length - 1] = last + (/[.\-/]$/.test(last) ? '' : ' ') + w;
    else lines.push(w);
  }
  return lines;
}

// How a hop's caller behaves decides its line: it waits for the answer, it
// moves on, or the hop sets something up before the flow runs.
const WAITS = new Set(['call', 'http', 'db', 'mcp', 'cli', 'browser']);
const SETUP = new Set(['deploy', 'config', 'test', 'other']);
const waitKind = (via) => (WAITS.has(via) ? 'waits' : SETUP.has(via) ? 'setup' : 'async');

function seqView(ctx, outline, groups, hops) {
  const systems = outline.spine.systems ?? [];
  const f = (v) => Math.round(v * 100) / 100;
  const figs = groups.map((g) => {
    const L = seqLayout(systems, g.items.map(({ h }) => h));
    const n = L.cols.length;
    const cx = (c) => f(((c + 0.5) / n) * 100);
    const titleH = Math.max(0, ...L.groups.map((gr) => gr.lines.length)) * 11;
    const boxH = (hd) => hd.lines.length * SQ.line + 12;
    const tierH = [0, 1].map((t) => Math.max(0, ...L.heads.filter((hd) => hd.tier === t).map(boxH)));
    const tierTop = [titleH + (titleH ? 6 : 0), titleH + (titleH ? 6 : 0) + tierH[0] + 6];
    const headsEnd = L.tiers === 2 ? tierTop[1] + tierH[1] : tierTop[0] + tierH[0];
    const y0 = headsEnd + 12;
    // A step in passing takes a short row, so the stack's hops keep the room.
    const tops = [];
    let H = y0;
    for (const { h } of g.items) {
      tops.push(H);
      H += h.passing ? SQ.pass : SQ.row;
    }
    H += 6;
    const colors = [...new Set(g.items.map(({ h }) => layerVar(ctx, h.layer)))];
    const mk = (c) => `sq-${esc(g.id)}-${colors.indexOf(c)}`;
    const markers = colors.map((c) => `<marker id="${mk(c)}" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="sq-tip" d="M0,1 L10,5 L0,9 z" style="--c:${c}"/></marker>`).join('');
    const bands = systems.length
      ? L.groups.map((gr, k) => `<rect class="sq-sys${k % 2 ? ' alt' : ''}" x="${f((gr.start / n) * 100)}%" y="0" width="${f(((gr.end - gr.start + 1) / n) * 100)}%" height="${headsEnd + 5}"/>${gr.lines.length ? `<text class="sq-sysname" x="${f(((gr.start + gr.end + 1) / 2 / n) * 100)}%" y="10" text-anchor="middle">${gr.lines.map((ln, k2) => `<tspan x="${f(((gr.start + gr.end + 1) / 2 / n) * 100)}%" dy="${k2 ? 11 : 0}">${esc(ln)}</tspan>`).join('')}</text>` : ''}`).join('')
      : '';
    // A head and its lifeline form one group, so the pair moves as one when
    // the next act slides the head into its new place.
    const life = (hd, i) => `<line class="sq-life" x1="${cx(i)}%" x2="${cx(i)}%" y1="${tierTop[hd.tier] + tierH[hd.tier]}" y2="${H - 4}"/>`;
    const heads = L.heads
      .map((hd, i) => {
        const half = ((L.tiers === 2 ? 1.5 : 1) / 2 / n) * 100;
        const left = Math.max(0, (i + 0.5) / n * 100 - half);
        const right = Math.min(100, (i + 0.5) / n * 100 + half);
        const hh = tierH[hd.tier];
        const bh = boxH(hd);
        const lines = hd.lines.map((ln, k) => `<tspan x="50%" dy="${k ? SQ.line : 0}">${esc(ln)}</tspan>`).join('');
        return `<g class="sq-hd">${life(hd, i)}<svg class="sq-p" data-node="${esc(hd.name)}" x="${f(left)}%" y="${tierTop[hd.tier]}" width="${f(right - left)}%" height="${hh}" overflow="visible"><rect class="sq-box" x="3%" y="${hh - bh}" width="94%" height="${bh}"/><text class="sq-name" x="50%" y="${hh - bh + 15}" text-anchor="middle">${lines}</text></svg></g>`;
      })
      .join('');
    const rows = g.items
      .map(({ h, i }, k) => {
        const r = L.rows[k];
        const top = tops[k];
        if (h.passing) {
          const at = [...new Set(r.segs.flat())];
          const mid = f((cx(Math.min(...at)) + cx(Math.max(...at))) / 2);
          const segs = r.segs.filter(([a, b]) => a !== b).map(([a, b]) => `<line class="sq-pass" x1="${cx(a)}%" y1="${top + 15}" x2="${cx(b)}%" y2="${top + 15}"/>`).join('');
          const ends = at.map((c2) => `<circle class="sq-pass-at" cx="${cx(c2)}%" cy="${top + 15}" r="2"/>`).join('');
          return `<g class="sq-row passing" data-hop-i="${i}"><rect class="sq-band" x="0" y="${top}" width="100%" height="${SQ.pass}"/><text class="sq-label" x="${mid}%" y="${top + 10}" text-anchor="middle" data-mid="${mid}"><tspan class="sq-via">in passing</tspan> · ${esc(h.label)}</text>${segs}${ends}</g>`;
        }
        const ya = top + 21;
        const c = layerVar(ctx, h.layer);
        const x1 = cx(r.from);
        const x2 = cx(r.to);
        const self = r.from === r.to;
        const [via, ...rest] = r.text.split(' · ');
        const label = `<text class="sq-label" x="${self ? x1 : f((x1 + x2) / 2)}%" y="${top + 12}"${self ? ' dx="26"' : ' text-anchor="middle"'} data-mid="${self ? '' : f((x1 + x2) / 2)}"><tspan class="sq-via">${esc(via)}</tspan> · ${esc(rest.join(' · '))}</text>`;
        const arrow = self
          ? `<svg class="sq-loop" x="${x1}%" y="${top + 11}" width="1" height="1" overflow="visible"><path class="sq-arrow" d="M0,2 h20 v10 h-18" marker-end="url(#${mk(c)})"/></svg>`
          : `<line class="sq-arrow" x1="${x1}%" y1="${ya}" x2="${x2}%" y2="${ya}" data-x1="${x1}" data-x2="${x2}" marker-end="url(#${mk(c)})"/>`;
        return `<g class="sq-row ${waitKind(h.via)}" data-hop-i="${i}" data-from="${esc(h.from)}" data-to="${esc(h.to)}" style="--c:${c}"><rect class="sq-band" x="0" y="${top}" width="100%" height="${SQ.row}"/><text class="sq-num" x="4" y="${top + 12}">${h.num}</text>${label}${arrow}</g>`;
      })
      .join('');
    const count = g.items.reduce((k, { h }) => k + (h.hops?.length ?? 1), 0);
    const label = `${g.title}: ${count} ${count === 1 ? 'hop' : 'hops'} across ${n} components`;
    return `<figure class="seq" data-act="${esc(g.id)}" aria-label="${esc(label)}"><svg class="sq-svg" width="100%" height="${H}" style="--minw:${L.minWidth}px;--minw-heads:${L.headsWidth}px" aria-hidden="true"><defs>${markers}</defs>${bands}${heads}<g class="sq-rows">${rows}</g></svg></figure>`;
  });
  // Direct labels carry most of the meaning; the key names the two encodings
  // left: how the caller behaves, and whose hop it is.
  const layers = new Set(hops.filter((h) => h.layer !== 'base').map((h) => h.layer));
  const whose = [layers.size > 1 ? 'color: the PR that adds the hop' : '', hops.some((h) => h.layer === 'base') ? `gray, in passing: ${ctx.layerLabel('base')}` : ''].filter(Boolean).join(' · ');
  // The key stands open beside the diagram; a phone folds it under one line
  // (walkthrough.js), since it would outgrow the act it explains.
  const legend = `<details class="disclose sq-legend" data-legend open><summary>${icon('caret')}how to read the arrows</summary><p class="legend">${legendItems([{ line: 'waits', label: 'the caller waits' }, { line: 'async', label: 'it moves on' }, { line: 'setup', label: 'set up before it runs' }, ...(whose ? [{ label: whose }] : [])])}</p></details>`;
  return `<div class="panel ground seqs" data-seqs><div class="seqs-scroll">${figs.join('')}</div>${legend}</div>`;
}

// The groups the map and the list show: the story's acts, or the lanes.
function flowGroups(outline, hops) {
  if (outline.spine.acts?.length) return outline.spine.acts.map((a, ai) => ({ id: a.id, title: `${ai + 1} · ${a.title}`, lane: a.lane, items: hops.map((h, i) => ({ h, i })).filter(({ h }) => h.act === a.id) }));
  return outline.spine.lanes.map((l) => ({ id: l.id, title: l.title, gist: l.gist, items: hops.map((h, i) => ({ h, i })).filter(({ h }) => h.lane === l.id) }));
}

// One hop on the stage: the story's beat first, then what the stop says. The
// act's diagram under the stage draws the hop, so the stage draws nothing.
// Hops count the stack's own; a step in passing takes no number. The page
// shows the first hop as it loads, and the runtime shows every hop from this
// same markup (`stage` in the page's data).
//
// Under the words one footer says, part by part, what the page holds about
// the hop, each part named: `code`, the PR and the stop that does it; `proof`,
// its proof level; `unfinished`, a flag and who completes it; `caveat`; and
// `explained in`, each reference entry that explains it.
export function hopStage(ctx, h, i, n, outline = {}) {
  const head = h.actTitle ? `${h.actIndex + 1} · ${h.actTitle}` : h.laneTitle;
  const cav = caveatsOn(ctx, [h.id, h.stop, ...(h.hops ?? []).flatMap((x) => [x.id, x.stop])].filter(Boolean)).map(caveatMark).join('');
  const ids = h.hops?.map((x) => x.id) ?? [h.id];
  const refs = (outline.reference ?? []).filter((r) => (r.hops ?? []).some((id) => ids.includes(id))).map((r) => xref(`#${r.id}`, '', inline(r.title)));
  const part = (k, v) => (v ? `<div><dt class="caps">${k}</dt><dd>${v}</dd></div>` : '');
  const sep = '<span aria-hidden="true"> · </span>';
  const foot = (parts) => `<dl class="st-foot">${parts.join('')}</dl>`;
  if (h.passing)
    return `<div class="st-top caps"><span class="st-lane">${esc(head)}</span><span class="st-pos">in passing</span></div><p class="st-label st-pass">${esc(h.label)}</p><ol class="st-hops">${h.hops.map((x) => `<li><b>${esc(x.from)} → ${esc(x.to)}</b> · ${esc(VIA[x.via] ?? x.via)} · ${inline(x.label)}${x.stop ? ` ${stopLink(ctx, x.stop)}` : ''}${x.story ? `<span>${inline(x.story)}</span>` : ''}</li>`).join('')}</ol>${foot([part('code', esc(ctx.layerLabel('base'))), part('caveat', cav), part('explained in', refs.join(sep))])}`;
  const stop = h.stop ? ctx.stop?.(h.stop) : null;
  const c = layerVar(ctx, h.layer);
  const sub = h.sub ? inline(h.sub) : stop ? inline(stop.gist) : '';
  const code = stop
    ? `<a class="to-stop" href="#${esc(h.stop)}" style="--c:${c}"><b>${esc(ctx.layerLabel(h.layer))} · ${esc(ctx.stopNum?.(h.stop) ?? '')}</b> <span class="tt">${inline(stop.title)}</span></a>`
    : layerTag(ctx.layerLabel(h.layer), c);
  const flags = (stop?.flags ?? [])
    .filter((f) => f.status !== 'dropped')
    .map((f) => mark(flagSeverity(f), `${esc(FLAG_NAME[flagKind(f)] ?? f.type)} · ${esc(f.completedBy ? `${ctx.layerLabel(f.completedBy)} completes it` : unfinished(f, ctx.layers.size === 1))}`));
  return `<div class="st-top caps"><span class="st-lane">${esc(head)}</span><span class="st-pos">hop ${h.num} of ${n}</span></div><p class="st-label">${inline(h.story ?? h.label)}</p><p class="st-what"><b>${esc(h.from)} → ${esc(h.to)}</b> · ${esc(VIA[h.via] ?? h.via)} · ${inline(h.label)}</p><p class="st-gist">${sub}</p>${foot([part('code', code), part('proof', proofTag(h.proof)), part('unfinished', flags.join(sep)), part('caveat', cav), part('explained in', refs.join(sep))])}`;
}

// A control that steps or marks shows an icon; its keys peek from aria-keyshortcuts.
const NAV_ICON = { prev: icon('prev'), next: icon('next'), check: icon('check'), play: icon('play', 'data-play'), pause: icon('pause', 'data-pause hidden'), voiceOn: icon('sound', 'data-on hidden'), voiceOff: icon('sound-off', 'data-off') };

// The whole flow, disclosed progressively: a fixed-height stage tells one hop
// at a time over its act's sequence diagram, so the words and the picture
// share one screen; a map of squares indexes every hop, and the full list
// waits behind one click.
function flowView(ctx, outline) {
  const hops = flowSteps(outline);
  if (!hops.length) return '';
  const own = hops.filter((h) => !h.passing).length;
  const passed = hops.reduce((n, h) => n + (h.hops?.length ?? 0), 0);
  const groups = flowGroups(outline, hops);
  const rows = groups
    .map((g) => {
      const dots = g.items
        .map(({ h, i }) => {
          if (h.passing) return `<a class="dot passing" href="#c-open" data-hop-i="${i}" aria-label="${esc(`${passingName(ctx, h)}: ${h.label}`)}"></a>`;
          return `<a class="dot pf-${esc(h.proof)}" href="#${esc(h.stop ?? 'c-open')}" data-hop-i="${i}" style="--c:${layerVar(ctx, h.layer)}" aria-label="${esc(`hop ${h.num}: ${h.from} to ${h.to}, ${plain(h.story ?? h.label)}, ${ctx.layerLabel(h.layer)}, ${PROOF_NAME[h.proof] ?? h.proof}`)}"></a>`;
        })
        .join('');
      return `<div class="flow-row" data-lane="${esc(g.id)}"><span class="lane-name caps${outline.spine.acts?.length ? ' act-name' : ''}">${esc(g.title)}</span><span class="dots">${dots}</span></div>`;
    })
    .join('');
  const seqs = seqView(ctx, outline, groups, hops);
  return `<div class="flow" data-flow tabindex="-1" role="group" aria-label="the whole flow">
<div class="flow-main"><div class="flow-head"><div class="flow-bar"><button type="button" class="btn outline" data-act="flow-play" aria-keyshortcuts="Space">${NAV_ICON.play}${NAV_ICON.pause}<span>play</span></button><button type="button" class="btn outline" data-act="flow-listen" aria-pressed="false" aria-label="listen: off" aria-keyshortcuts="l" hidden>${NAV_ICON.voiceOn}${NAV_ICON.voiceOff}<span>listen</span></button><button type="button" class="btn outline" data-act="flow-prev" aria-label="previous hop" aria-keyshortcuts="ArrowLeft">${NAV_ICON.prev}</button><button type="button" class="btn outline" data-act="flow-next" aria-label="next hop" aria-keyshortcuts="ArrowRight">${NAV_ICON.next}</button><span class="keyline"><span class="k-idle">${own} hops${passed ? ` · ${passed} more in passing` : ''} · pick any square</span><span class="k-live">the arrows step the hops · escape gives them back</span></span><button type="button" class="btn outline voice-pick" data-act="voice" aria-expanded="false" aria-controls="wt-voice" hidden>voice · <span data-voice-name>…</span></button></div>
<div class="panel voice-panel" id="wt-voice" data-voice-panel hidden></div>
<div class="panel flow-stage" data-flow-stage aria-live="polite">${hopStage(ctx, hops[0], 0, own, outline)}</div></div>${seqs}
<div class="flow-index"><div class="flow-map">${rows}</div><p class="legend">${legendItems([{ swatch: 'tested', label: 'a test reaches it' }, { swatch: 'assembled', label: 'code only' }, { swatch: 'recorded', label: 'a recorded run shows it' }])}</p>
<details class="disclose flow-list"><summary>${icon('caret')}every hop as a list <span class="keyline">${own + passed}</span></summary>${lanesView(ctx, outline)}</details></div></div>
</div>`;
}

// What each PR leaves for a later PR, and what it finishes for an earlier
// one, sit on the PR's own row: a count per PR, and the flags behind it one
// click away.
function debtsView(ctx, outline) {
  const leaves = new Map();
  const finishes = new Map();
  const add = (m, k, x) => (m.get(k) ?? m.set(k, []).get(k)).push(x);
  for (const ch of outline.chapters)
    for (const s of ch.stops)
      for (const f of s.flags ?? []) {
        if (f.status === 'dropped') continue;
        const x = { f, from: ch.layer, stop: s.id };
        add(leaves, ch.layer, x);
        if (f.completedBy) add(finishes, f.completedBy, x);
      }
  const who = (x) => completer(ctx, x.f) ?? 'no PR yet';
  // Counts read in stack order, with what no PR in the stack finishes last.
  const rank = (k) => {
    const i = outline.layers.findIndex((l) => ctx.layerLabel(l.id) === k);
    return i < 0 ? outline.layers.length + (k === 'outside the stack' ? 0 : 1) : i;
  };
  const tally = (list, key) => {
    const n = new Map();
    for (const x of list) n.set(key(x), (n.get(key(x)) ?? 0) + 1);
    return [...n]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([k, c]) => `${esc(k)} ×${c}`)
      .join(' · ');
  };
  // Two flags of one type on one stop read as one row with a count.
  const rows = (list) => {
    const m = new Map();
    for (const x of list) {
      const k = `${x.stop}|${flagKind(x.f)}|${x.f.completedBy ?? ''}`;
      if (m.has(k)) m.get(k).n++;
      else m.set(k, { ...x, n: 1 });
    }
    return [...m.values()];
  };
  const times = (x) => (x.n > 1 ? ` ×${x.n}` : '');
  const block = (label, list, key, item) =>
    `<details class="disclose debt"><summary>${icon('caret')}${label} <span class="keyline">${tally(list, key)}</span></summary><ul>${rows(list).map(item).join('')}</ul></details>`;
  return (layerId) => {
    const out = leaves.get(layerId) ?? [];
    const got = finishes.get(layerId) ?? [];
    if (!out.length && !got.length) return '';
    return `<div class="debts">${out.length ? block(`leaves ${out.length} for later`, out, who, (x) => `<li>${stopLink(ctx, x.stop)}<span class="keyline">${x.f.type === 'outside-stack' ? esc(who(x)) : `${esc(FLAG_NAME[flagKind(x.f)])} · ${esc(who(x))}`}${times(x)}</span>${x.f.caveat ? caveatsOn(ctx, [x.stop]).filter((y) => y.c.id === x.f.caveat).map(caveatMark).join('') : ''}</li>`) : ''}${got.length ? block(`finishes ${got.length} from earlier`, got, (x) => ctx.layerLabel(x.from), (x) => `<li>${layerTag(ctx.layerLabel(x.from), layerVar(ctx, x.from))}${stopLink(ctx, x.stop)}<span class="keyline">${esc(FLAG_NAME[flagKind(x.f)])}${times(x)}</span></li>`) : ''}</div>`;
  };
}

// A layer's changed lines by kind (diff-index.mjs `kindOf`): tests and
// generated files apart from the code, so a layer whose size is mostly specs
// or a regenerated client reads as the review it is.
export function churnOf(files) {
  const c = { code: { adds: 0, dels: 0 }, test: { adds: 0, dels: 0 }, generated: { adds: 0, dels: 0 } };
  for (const f of files) {
    const b = c[f.kind] ?? c.code;
    b.adds += f.adds;
    b.dels += f.dels;
  }
  return c;
}

export function openingView(ctx, outline) {
  ctx.here = null;
  const i = outline.intro;
  const T = ctx.terms.scope();
  const totals = outline.layers.reduce(
    (a, l) => {
      const idx = ctx.index.get(l.id);
      if (!idx) return a;
      for (const f of idx.files.values()) {
        a.paths.add(f.path);
        a.adds += f.adds;
        a.dels += f.dels;
      }
      return a;
    },
    { paths: new Set(), adds: 0, dels: 0 },
  );
  const maxChurn = Math.max(
    ...outline.layers.map((l) => {
      const idx = ctx.index.get(l.id);
      return idx ? [...idx.files.values()].reduce((s, f) => s + f.adds + f.dels, 0) : 0;
    }),
    1,
  );
  const debts = debtsView(ctx, outline);
  const churns = new Map(outline.layers.map((l) => [l.id, churnOf(ctx.index.get(l.id)?.files.values() ?? [])]));
  const lines = (b) => b.adds + b.dels;
  const bar = (cls, n) => (n ? `<i class="${cls}" style="--share:${n / maxChurn}"></i>` : '');
  const layers = outline.layers
    .map((l) => {
      const { code, test, generated } = churns.get(l.id);
      const ch = outline.chapters.find((c) => c.layer === l.id);
      const more = [lines(test) ? `<span class="n-t">${icon('test')}tests ${count(lines(test))}</span>` : '', lines(generated) ? `<span class="n-g">generated ${count(lines(generated))}</span>` : ''].filter(Boolean).join(' · ');
      return `<li style="--c:${layerVar(ctx, l.id)}">${layerTag(ctx.layerLabel(l.id), '', { dot: true })}<div class="tt"><a class="layer-go" href="#${esc(ch?.id ?? '')}">${inline(ch?.title ?? l.title)}</a><p>${inline(ch?.gist ?? '')}</p>${l.order ? `<p class="order"><b class="caps">why here</b>${inline(l.order)}</p>` : ''}${l.note ? `<p class="note">${inline(l.note)}</p>` : ''}${debts(l.id)}</div><div class="churn-w"><div class="churn" aria-hidden="true">${bar('p', code.adds)}${bar('m', code.dels)}${bar('t', lines(test))}${bar('g', lines(generated))}</div><div class="churn-n">+${count(code.adds)} −${count(code.dels)}${more ? `<span class="churn-more">${more}</span>` : ''}</div></div></li>`;
    })
    .join('');
  const has = (k) => [...churns.values()].some((c) => lines(c[k]));
  const churnKey = `<p class="keyline churn-key" aria-hidden="true"><span><i class="p"></i>code added</span><span><i class="m"></i>code removed</span>${has('test') ? '<span><i class="t"></i>tests</span>' : ''}${has('generated') ? '<span><i class="g"></i>generated</span>' : ''}</p>`;
  return `<section class="chapter" id="c-open" data-chapter="c-open" tabindex="-1" hidden>
<header class="ch-head"><div class="kicker">${esc(outline.kind === 'stack' ? `${outline.layers.length}-PR stack` : 'pull request')} · ${esc(outline.repo)}</div><h1>${inline(outline.title)}</h1><div class="intent prose">${md(i.intent, T)}</div><div class="panel split beforeafter"><div class="b"><b class="caps">before</b>${inline(i.before, T)}</div><div class="a"><b class="caps">after</b>${inline(i.after, T)}</div></div>${briefView(outline.brief, outline.spine.hops)}${takeawaysView(i.takeaways, T)}
<p class="keyline howto">press ${keycap('?')} for every key</p>
<p class="keyline">${count(totals.paths.size)} files changed${outline.layers.length > 1 ? ` across ${outline.layers.length} PRs` : ''} · +${count(totals.adds)} −${count(totals.dels)} lines</p></header>
${referenceView(ctx, outline, T, { part: 'overview' })}
<h2 class="mark" tabindex="-1">the whole flow</h2>
<div data-flow-dock>${flowView(ctx, outline)}</div>
${outline.layers.length > 1 ? `<h2 class="mark" tabindex="-1">the layers</h2>
${churnKey}<ol class="layers">${layers}</ol>` : ''}
${referenceView(ctx, outline, T, { part: 'opening' })}
${referenceView(ctx, outline, T)}
</section>`;
}

// What a reader looks up while walking: each entry folds under its title, and
// a fold with a table or a picture scrolls on its own when wider than the column.
// An opening entry, such as the release plan, stands open after the layers,
// because a reviewer acts on it before merging and judges its rows once the
// layers say what each PR does.
// A picture takes the colors of what it holds, and a pair of pictures stands
// side by side, before and tip, when both fit the column. A domain model draws
// as a chart, and its table of every entity folds under it.
// The reference in three places. `overview`: the domain model and the
// answers to the questions the change raises, right after the opening's
// head, since they show fastest what changes, before the flow walks it.
// `opening`: the release plan, after the layers. `rest`: everything else.
export const inOverview = (r) => !r.opening && !r.caveats && Boolean(r.model || r.faq?.length);
function referenceView(ctx, outline, T, { part = 'rest' } = {}) {
  const opening = part === 'opening';
  const place = (r) => (r.opening ? 'opening' : inOverview(r) ? 'overview' : 'rest');
  const refs = (outline.reference ?? []).filter((r) => place(r) === part);
  const slot = (outline.reference ?? []).find((r) => r.caveats);
  const cavId = slot?.id ?? 'caveats';
  const hasCaveats = Boolean(outline.caveats?.length);
  // The known caveats draw at the entry that marks their place, else last;
  // the release plan points at them once.
  if (part === 'rest' && hasCaveats && !slot) refs.push({ id: cavId, title: 'known caveats', caveats: true });
  if (!refs.length) return '';
  const table = (t, name) => tableView({ head: t.head.map((h) => inline(h, T)), rows: t.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, T)}</td>`).join('')}</tr>`).join(''), label: name });
  const pic = (text, lang, name) => `<div class="scroll" tabindex="0" role="region" aria-label="${esc(name)}"><pre class="code-block ref-pic" translate="no">${paintBlock(text, lang ?? 'diagram')}</pre></div>`;
  const pair = (r) => {
    const { before, after } = r.compare;
    const wide = Math.max(...[before, after].flatMap((p) => p.picture.split('\n').map((l) => l.length))) > PANE_CHARS;
    return `<div class="panel split beforeafter ref-pair${wide ? ' stack' : ''}"><div class="b"><b class="caps">${inline(before.label, T)}</b>${pic(before.picture, r.lang, plain(before.label))}</div><div class="a"><b class="caps">${inline(after.label, T)}</b>${pic(after.picture, r.lang, plain(after.label))}</div></div>`;
  };
  const fold = (r) => `<details class="disclose ref ref-more"><summary>${icon('caret')}<span class="rt">every entity in detail</span><span class="keyline">${r.table.rows.length}</span></summary>${table(r.table, plain(r.title))}</details>`;
  const toCaveats = opening && hasCaveats ? `<p class="keyline cav-link">${xref(`#${cavId}`, '', 'known caveats')}: what the change leaves imperfect on purpose, and where each fix is planned.</p>` : '';
  const entry = (r, k) =>
    `<details class="disclose ref${r.caveats ? ' ref-caveats' : ''}" id="${esc(r.id)}"${opening || (part === 'overview' && r.model) ? ' open' : ''}><summary>${icon('caret')}<span class="rt">${inline(r.title, T)}</span></summary><div class="ref-b">${r.text ? `<div class="prose">${md(r.text, T)}</div>` : ''}${r.caveats ? caveatsBody(ctx, outline, T) : ''}${r.model ? modelView(ctx, r) : ''}${r.picture ? pic(r.picture, r.lang, plain(r.title)) : ''}${r.compare ? pair(r) : ''}${r.table ? (r.model ? fold(r) : table(r.table, plain(r.title))) : ''}${r.faq?.length ? `<dl class="faq">${r.faq.map((f) => `<dt>${inline(f.q, T)}</dt><dd class="prose">${md(f.a, T)}</dd>`).join('')}</dl>` : ''}${r.after ? `<div class="prose">${md(r.after, T)}</div>` : ''}${k === 0 ? toCaveats : ''}</div></details>`;
  return `<h2 class="mark" tabindex="-1">${{ overview: 'what changes', opening: 'merge and release', rest: 'reference' }[part]}</h2>
<div class="refs">${refs.map(entry).join('')}</div>`;
}
// Two panes of this many code characters fit the column side by side.
const PANE_CHARS = 52;

// The domain model as a chart: each entity a box, each relation an arrow from
// the owner or the actor to what it owns or starts. Ranks run down the arrows,
// and an arrow that would close a cycle points up instead. Inside a rank, a
// box sits by the boxes it joins above and below, so few arrows cross and the
// same model always draws the same chart. An arrow that skips a rank passes
// between the boxes of the ranks it crosses, never through one.
export const DM = { name: 7, line: 6.1, tag: 6, label: 6.4, padX: 12, minW: 92, row: 13, padY: 8, gapX: 30, gapY: 66, pass: 12, margin: 10, port: 12, labelH: 13 };
export function modelLayout(entities, relations) {
  const known = new Set(entities.map((e) => e.id));
  const rels = relations.map((r, k) => ({ ...r, k })).filter((r) => known.has(r.from) && known.has(r.to) && r.from !== r.to);
  // An arrow into a box on the current search path closes a cycle; it ranks reversed.
  const outs = new Map(entities.map((e) => [e.id, []]));
  for (const r of rels) outs.get(r.from).push(r);
  const seen = new Map();
  const visit = (v) => {
    seen.set(v, 1);
    for (const r of outs.get(v)) {
      if (seen.get(r.to) === 1) r.back = true;
      else if (!seen.has(r.to)) visit(r.to);
    }
    seen.set(v, 2);
  };
  for (const e of entities) if (!seen.has(e.id)) visit(e.id);
  for (const r of rels) [r.up, r.down] = r.back ? [r.to, r.from] : [r.from, r.to];
  const rank = new Map(entities.map((e) => [e.id, 0]));
  for (let pass = 0, moved = true; moved && pass <= entities.length; pass++) {
    moved = false;
    for (const r of rels)
      if (rank.get(r.up) + 1 > rank.get(r.down)) {
        rank.set(r.down, rank.get(r.up) + 1);
        moved = true;
      }
  }
  // A box nothing points into sits just above its highest child.
  for (const e of entities) {
    if (rels.some((r) => r.down === e.id)) continue;
    const kids = rels.filter((r) => r.up === e.id).map((r) => rank.get(r.down));
    if (kids.length) rank.set(e.id, Math.min(...kids) - 1);
  }
  const rowsN = 1 + (entities.some((e) => e.line) ? 1 : 0) + (entities.some((e) => e.tag) ? 1 : 0);
  const boxH = DM.padY * 2 + DM.row * rowsN;
  const V = new Map();
  entities.forEach((e, i) => {
    const w = Math.max(DM.minW, Math.ceil(Math.max(e.name.length * DM.name, (e.line ?? '').length * DM.line, (e.tag ?? '').length * DM.tag) + DM.padX * 2));
    V.set(e.id, { id: e.id, rank: rank.get(e.id), w, key: i });
  });
  // An arrow that skips ranks passes each one through a point of its own.
  for (const r of rels) {
    r.chain = [r.up];
    for (let k = rank.get(r.up) + 1; k < rank.get(r.down); k++) {
      const id = `\u0000${r.k}:${k}`;
      V.set(id, { id, rank: k, w: DM.pass, key: V.get(r.up).key + 0.5, pass: true });
      r.chain.push(id);
    }
    r.chain.push(r.down);
  }
  const top = Math.max(0, ...[...V.values()].map((v) => v.rank));
  const R = Array.from({ length: top + 1 }, () => []);
  for (const v of V.values()) R[v.rank].push(v);
  const pos = new Map();
  const index = () => R.forEach((row) => row.forEach((v, i) => pos.set(v.id, i)));
  R.forEach((row) => row.sort((a, b) => a.key - b.key));
  index();
  const segs = rels.flatMap((r) => r.chain.slice(1).map((b, i) => ({ r, i, a: r.chain[i], b })));
  const above = new Map();
  const below = new Map();
  for (const s of segs) {
    below.set(s.a, [...(below.get(s.a) ?? []), s.b]);
    above.set(s.b, [...(above.get(s.b) ?? []), s.a]);
  }
  const crossings = () => {
    let n = 0;
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const [p, q] = [segs[i], segs[j]];
        if (V.get(p.a).rank === V.get(q.a).rank && (pos.get(p.a) - pos.get(q.a)) * (pos.get(p.b) - pos.get(q.b)) < 0) n++;
      }
    return n;
  };
  const bary = (id, nb) => {
    const list = nb.get(id);
    return list?.length ? list.reduce((s, n) => s + pos.get(n), 0) / list.length : pos.get(id);
  };
  let best = R.map((row) => [...row]);
  let fewest = crossings();
  for (let it = 0; it < 8 && fewest > 0; it++) {
    const down = it % 2 === 0;
    const ks = [...R.keys()];
    for (const k of down ? ks.slice(1) : ks.reverse().slice(1)) {
      const b = new Map(R[k].map((v) => [v.id, bary(v.id, down ? above : below)]));
      R[k].sort((p, q) => b.get(p.id) - b.get(q.id));
      R[k].forEach((v, i) => pos.set(v.id, i));
    }
    const n = crossings();
    if (n < fewest) {
      fewest = n;
      best = R.map((row) => [...row]);
    }
  }
  best.forEach((row, k) => (R[k] = row));
  index();
  // Each box moves toward the boxes it joins, keeping its rank's order and a
  // gap on either side: the mean of a left-packed and a right-packed pass
  // keeps every gap both passes keep.
  const cx = new Map();
  for (const row of R) row.reduce((x, v) => (cx.set(v.id, x + v.w / 2), x + v.w + DM.gapX), 0);
  const sep = (a, b) => (a.w + b.w) / 2 + (a.pass || b.pass ? DM.gapX / 2 : DM.gapX);
  const settle = (row, want) => {
    const l = [...want];
    for (let i = 1; i < row.length; i++) l[i] = Math.max(l[i], l[i - 1] + sep(row[i - 1], row[i]));
    const r = [...want];
    for (let i = row.length - 2; i >= 0; i--) r[i] = Math.min(r[i], r[i + 1] - sep(row[i], row[i + 1]));
    row.forEach((v, i) => cx.set(v.id, (l[i] + r[i]) / 2));
  };
  const mean = (id, nb) => {
    const list = nb.get(id);
    return list?.length ? list.reduce((s, n) => s + cx.get(n), 0) / list.length : cx.get(id);
  };
  for (let it = 0; it < 6; it++) {
    const down = it % 2 === 0;
    const ks = [...R.keys()];
    for (const k of down ? ks.slice(1) : ks.reverse().slice(1)) settle(R[k], R[k].map((v) => mean(v.id, down ? above : below)));
  }
  const left = Math.min(...[...V.values()].map((v) => cx.get(v.id) - v.w / 2));
  for (const v of V.values()) cx.set(v.id, cx.get(v.id) - left + DM.margin);
  const yOf = (k) => DM.margin + k * (boxH + DM.gapY);
  const H = yOf(top) + boxH + DM.margin;
  // Arrows leaving or entering one box spread along its edge, in the order of
  // the boxes at their other ends.
  const port = new Map();
  const spread = (id, list, end) => {
    const v = V.get(id);
    if (v.pass) return list.forEach((s) => port.set(`${end}${segs.indexOf(s)}`, 0));
    const step = Math.min(DM.port, (v.w - 16) / Math.max(1, list.length));
    list.forEach((s, i) => port.set(`${end}${segs.indexOf(s)}`, (i - (list.length - 1) / 2) * step));
  };
  for (const id of V.keys()) {
    spread(id, segs.filter((s) => s.a === id).sort((p, q) => cx.get(p.b) - cx.get(q.b)), 'o');
    spread(id, segs.filter((s) => s.b === id).sort((p, q) => cx.get(p.a) - cx.get(q.a)), 'i');
  }
  const edges = rels.map((r) => {
    const pts = segs
      .filter((s) => s.r === r)
      .flatMap((s) => {
        const n = segs.indexOf(s);
        return [
          { x: cx.get(s.a) + port.get(`o${n}`), y: yOf(V.get(s.a).rank) + boxH },
          { x: cx.get(s.b) + port.get(`i${n}`), y: yOf(V.get(s.b).rank) },
        ];
      });
    // A label sits on the arrow near whichever end it shares with fewer
    // arrows: under a box many arrows leave, near the box it points to.
    const fan = segs.filter((s) => s.a === r.up).length > segs.filter((s) => s.b === r.down).length;
    const [a, b] = fan ? pts.slice(-2) : pts.slice(0, 2);
    const t = fan ? 0.62 : 0.38;
    const at = { x: a.x + (b.x - a.x) * (3 * (1 - t) * t * t + t * t * t), y: a.y + (b.y - a.y) * t };
    return { k: r.k, from: r.from, to: r.to, back: Boolean(r.back), gap: Math.round(a.y), near: fan ? -1 : 1, pts: r.back ? pts.reverse() : pts, at, w: (r.text ?? r.label ?? '').length * DM.label + 8 };
  });
  // Labels in one gap take the first of three rows, stepping away from the
  // box they sit by, where they cover no other label, and slide right past
  // the last one when every row is taken.
  const placed = [];
  for (const e of [...edges].sort((p, q) => p.gap - q.gap || p.at.x - q.at.x)) {
    const hits = (y) => placed.filter((o) => o.gap === e.gap && Math.abs(o.y - y) < DM.labelH && Math.abs(o.x - e.at.x) < (o.w + e.w) / 2 + 4);
    const y = [0, 1, 2].map((d) => e.at.y + d * e.near * DM.labelH).find((yy) => !hits(yy).length);
    e.label = y === undefined ? { y: e.at.y, x: Math.max(...hits(e.at.y).map((o) => o.x + (o.w + e.w) / 2 + 4)) } : { y, x: e.at.x };
    placed.push({ gap: e.gap, y: e.label.y, x: e.label.x, w: e.w });
  }
  // A label past either edge widens the chart; nothing is clipped.
  const shift = Math.max(0, DM.margin - Math.min(...edges.map((e) => e.label.x - e.w / 2)));
  for (const e of edges) {
    e.label.x += shift;
    for (const pt of e.pts) pt.x += shift;
  }
  const boxes = new Map(entities.map((e) => [e.id, { x: cx.get(e.id) - V.get(e.id).w / 2 + shift, y: yOf(rank.get(e.id)), w: V.get(e.id).w, h: boxH, rank: rank.get(e.id) }]));
  const W = Math.ceil(Math.max(...[...boxes.values()].map((b) => b.x + b.w), ...edges.map((e) => e.label.x + e.w / 2)) + DM.margin);
  return { W, H, boxH, rows: rowsN, boxes, edges, ranks: R.map((row) => row.filter((v) => !v.pass).map((v) => v.id)), crossings: fewest };
}

// A mark names what the stack does to a piece and the PR that does it, in
// words, so the chart reads without its colors; the PR's color repeats it.
const MARK_WORD = { new: 'new', changed: 'changed' };
function modelView(ctx, r) {
  const tag = (x) => (x.mark && x.layer ? `${MARK_WORD[x.mark]} ${ctx.layerLabel(x.layer)}` : '');
  const ents = r.model.entities.map((e) => ({ ...e, tag: tag(e) }));
  const rels = r.model.relations.map((x) => ({ ...x, tag: tag(x), text: tag(x) ? `${x.label} · ${tag(x)}` : x.label }));
  const L = modelLayout(ents, rels);
  const f = (v) => Math.round(v * 10) / 10;
  const colorOf = (x) => (x.tag ? layerVar(ctx, x.layer) : 'var(--mute)');
  const colors = [...new Set(rels.map(colorOf))];
  const mk = (c) => `dm-${esc(r.id)}-${colors.indexOf(c)}`;
  const markers = colors.map((c) => `<marker id="${mk(c)}" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="sq-tip" d="M0,1 L10,5 L0,9 z" style="--c:${c}"/></marker>`).join('');
  // Across a gap an arrow bends on a curve; through a rank it skips, it runs straight.
  const pathOf = (pts) => pts.slice(1).reduce((d, b, i) => {
    const a = pts[i];
    const my = (a.y + b.y) / 2;
    return d + (i % 2 ? ` L${f(b.x)},${f(b.y)}` : ` C${f(a.x)},${f(my)} ${f(b.x)},${f(my)} ${f(b.x)},${f(b.y)}`);
  }, `M${f(pts[0].x)},${f(pts[0].y)}`);
  const edges = L.edges
    .map((e) => {
      const x = rels[e.k];
      const c = colorOf(x);
      return `<g class="dm-rel ${x.mark ?? 'same'}" style="--c:${c}"><path class="sq-arrow" d="${pathOf(e.pts)}" marker-end="url(#${mk(c)})"/></g>`;
    })
    .join('');
  const labels = L.edges
    .map((e) => {
      const x = rels[e.k];
      return `<text class="sq-label" x="${f(e.label.x)}" y="${f(e.label.y + 3.5)}" text-anchor="middle" style="--c:${colorOf(x)}">${esc(x.label)}${x.tag ? `<tspan class="sq-via"> · </tspan><tspan class="dm-tag">${esc(x.tag)}</tspan>` : ''}</text>`;
    })
    .join('');
  const nodes = ents
    .map((e) => {
      const b = L.boxes.get(e.id);
      const lines = [[e.name, 'sq-name'], [e.line, 'dm-line'], [e.tag, 'dm-tag']].filter(([t]) => t);
      const y0 = b.y + (b.h - DM.row * lines.length) / 2 + DM.row - 3;
      const text = lines.map(([t, cls], i) => `<text class="${cls}" x="${f(b.x + b.w / 2)}" y="${f(y0 + i * DM.row)}" text-anchor="middle">${esc(t)}</text>`).join('');
      return `<g class="dm-node ${e.mark ?? 'same'}" style="--c:${colorOf(e)}"><rect class="sq-box" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"/>${text}</g>`;
    })
    .join('');
  const count = (list, m) => list.filter((x) => x.mark === m && x.tag).length;
  const [nNew, nChanged] = ['new', 'changed'].map((m) => count(ents, m) + count(rels, m));
  const label = `The domain model: ${ents.length} entities joined by ${rels.length} relations; the stack adds ${nNew} of these pieces and changes ${nChanged}.`;
  const key = [nNew ? 'tinted: new in the PR it names' : '', nChanged ? 'outlined in color: changed by it' : '', `gray: ${ctx.layerLabel('base')}`, 'arrows run from the owner or the actor'].filter(Boolean);
  return `<figure class="dm"><div class="scroll" tabindex="0" role="region" aria-label="${esc(label)}"><svg class="dm-svg" viewBox="0 0 ${L.W} ${L.H}" width="${L.W}" height="${L.H}" style="--w:${L.W}px" role="img" aria-label="${esc(label)}"><defs>${markers}</defs><g>${edges}</g><g>${nodes}</g><g>${labels}</g></svg></div><figcaption class="legend">${legendItems(key.map((label) => ({ label })))}</figcaption></figure>`;
}

// A stack's close gathers every chapter's questions, claims and flags; one
// PR's close keeps only what its chapter does not already show, and names it
// as a PR, so no row says `layer` or `stack` about a single change.
export function closingView(ctx, outline) {
  ctx.here = null;
  const many = outline.layers.length > 1;
  const nums = new Map();
  for (const ch of outline.chapters) for (const [id, n] of stopNumbering(ch)) nums.set(id, `${ctx.layerLabel(ch.layer)}·${n}`);
  const qa = outline.chapters
    .filter((ch) => ch.qa.length && outline.chapters.length > 1)
    .map((ch) => `<h3 class="sub">${esc(ctx.layerLabel(ch.layer))} · ${inline(ch.title)}</h3><ul class="qa">${ch.qa.map((q, i) => qaItem(ctx, ch, q, i, { box: 'qz', num: (id) => ctx.stopNum(id) })).join('')}</ul>`)
    .join('');
  // A long ledger off screen skips layout at about its height, from its rows.
  const nClaims = outline.chapters.reduce((n, ch) => n + ch.claims.length, 0);
  // An open row names the caveat that says when and where it closes; its
  // marker previews the caveat and opens its card.
  const cavN = new Map((outline.caveats ?? []).map((c, i) => [c.id, { c, n: i + 1 }]));
  const closesAt = (id) => (id && cavN.has(id) ? ` ${caveatMark(cavN.get(id))}` : '');
  const nFlags = outline.chapters.reduce((n, ch) => n + ch.stops.reduce((m, s) => m + (s.flags?.length ?? 0), 0), 0);
  const claims = outline.chapters
    .flatMap((ch) => ch.claims.map((c, i) => ({ ch, c, i })))
    .map(({ ch, c, i }) => `<tr data-claim="${esc(ch.id)}-${i}">${many ? `<td>${layerTag(ctx.layerLabel(ch.layer), layerVar(ctx, ch.layer))}</td>` : ''}<td>${inline(c.text)}</td><td class="${c.state}">${c.state === 'complete' ? (many ? 'complete in this layer' : 'complete in this PR') : c.state === 'open' ? (many ? 'open: no layer in this stack completes it' : 'open: this PR does not complete it') : `completed by ${esc(ctx.layerLabel(c.completedBy))}`}${closesAt(c.caveat)}</td><td>${c.stops.map((id) => `<a href="#${esc(id)}">${esc(nums.get(id) ?? id)}</a>`).join(' ')}</td><td>${(c.tests ?? []).map(esc).join('<br>')}</td></tr>`)
    .join('');
  // Kept flags first, grouped by the layer that completes them (work outside
  // the stack last); dropped candidates after them, so the ledger shows why.
  const rank = (f) => (f.status === 'dropped' ? 2e3 : 0) + (f.completedBy ? ctx.layerIndex.get(f.completedBy) ?? 999 : 1e3);
  const flags = outline.chapters
    .flatMap((ch) => ch.stops.flatMap((s) => (s.flags ?? []).map((f) => ({ ch, s, f }))))
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map(({ ch, s, f }) => `<tr><td>${layerTag(ctx.layerLabel(ch.layer), layerVar(ctx, ch.layer))}</td><td>${esc(FLAG_NAME[flagKind(f)])}</td><td>${inline(f.text)}</td><td>${esc(completer(ctx, f) ?? 'no layer')}${f.status !== 'dropped' ? closesAt(f.caveat) : ''}</td><td>${esc(f.status ?? 'candidate')}</td><td><a href="#${esc(s.id)}">${esc(nums.get(s.id))}</a></td></tr>`)
    .join('');
  const coverage = outline.layers
    .map((l) => {
      const idx = ctx.index.get(l.id);
      if (!idx) return '';
      const rows = [...idx.files.values()]
        .map((f) => {
          const homes = new Set(f.hunks.map((h) => ctx.homeOf.get(`${l.id}|${h.id}`)).filter(Boolean));
          const fileHome = ctx.homeOf.get(`${l.id}|file:${f.path}`);
          const disp = ctx.dispositionOf(l.id, f);
          const where = [...new Set([...homes, fileHome].filter(Boolean))].map((id) => `<a href="#${esc(id)}">${esc(nums.get(id) ?? (id.startsWith('hk-') ? 'not in the walk' : id))}</a>`).join(' ');
          const cut = f.hunks.some(hasCut);
          return `<tr data-path="${esc(f.path)}" data-disposition="${esc(disp)}" data-coverage="${cut ? 'partial' : 'full'}" data-churn="${f.adds + f.dels}"><td class="path" translate="no">${esc(f.path)}</td><td>${esc(f.status)}</td><td>${esc(disp)}</td><td>${cut ? 'partial · long lines cut' : 'full'}</td><td>${f.hunks.length}</td><td>+${count(f.adds)} −${count(f.dels)}</td><td>${where}</td></tr>`;
        })
        .join('');
      const layerHunks = [...idx.files.values()].flatMap((f) => f.hunks);
      const full = layerHunks.filter((h) => !hasCut(h)).length;
      const statement = `evidence coverage: ${full} of ${layerHunks.length} hunks shown in full (${layerHunks.length ? Math.floor((full / layerHunks.length) * 100) : 100}%)${full < layerHunks.length ? `, ${layerHunks.length - full} with long lines cut` : ''}`;
      const ch = outline.chapters.find((c) => c.layer === l.id);
      const skipped = ch ? ch.housekeeping.length + ch.everythingElse.length : 0;
      return `<details class="disclose margin-d"><summary>${icon('caret')}<b class="caps">${esc(ctx.layerLabel(l.id))}</b><span class="coverage">${statement}</span> · ${idx.files.size} files${skipped ? `, ${skipped} not in the walk` : ''}</summary>${tableView({ head: ['file', 'status', 'review', 'coverage', 'hunks', 'churn', 'home'], rows, cls: 'ledger file-index', label: `every file of ${ctx.layerLabel(l.id)}` })}</details>`;
    })
    .join('');
  const bios = (outline.biographies ?? [])
    .map((b) => {
      const touched = new Set(b.entries.map((e) => e.layer));
      return `<details class="disclose panel ground bio"><summary>${icon('caret')}<span translate="no">${esc(b.file)}</span><span class="dots" aria-label="${esc(`changed in ${outline.layers.filter((l) => touched.has(l.id)).map((l) => ctx.layerLabel(l.id)).join(', ')}`)}">${outline.layers.map((l) => `<i class="${touched.has(l.id) ? 'on' : ''}" style="--c:${layerVar(ctx, l.id)}"></i>`).join('')}</span></summary><ol>${b.entries.map((e) => `<li>${layerTag(ctx.layerLabel(e.layer), layerVar(ctx, e.layer))} ${inline(e.summary)}</li>`).join('')}</ol></details>`;
    })
    .join('');
  return `<section class="chapter" id="c-close" data-chapter="c-close" tabindex="-1" hidden>
<header class="ch-head"><div class="kicker">close</div><h1>Questions, claims and coverage</h1></header>
<h2 class="mark" tabindex="-1">the whole flow</h2><p class="keyline">When every stop has a tick, it plays here once more.</p><div data-flow-dock></div>
${qa ? `<h2 class="mark" tabindex="-1">every question <em>try each one, then open its answer</em></h2>${qa}` : ''}
${claims ? `<h2 class="mark" tabindex="-1">claim ledger</h2>${tableView({ head: [...(many ? ['layer'] : []), 'claim', 'state', 'stops', 'tests'], rows: claims, cls: `ledger claim-ledger${many ? '' : ' one'}`, label: 'claim ledger', wrap: 'long claims', style: `--n:${nClaims}` })}` : ''}
${flags ? `<h2 class="mark" tabindex="-1">only makes sense later</h2>${tableView({ head: ['layer', 'type', 'flag', 'completed by', 'status', 'stop'], rows: flags, cls: 'ledger flags', label: 'flags that make sense later', wrap: 'long flags', style: `--n:${nFlags}` })}` : ''}
${many ? `<h2 class="mark" tabindex="-1">files several PRs change</h2>${bios || '<p class="keyline">No file changes in more than one layer.</p>'}` : ''}
<h2 class="mark" tabindex="-1">glossary</h2><details class="disclose gloss-fold"><summary>${icon('caret')}${(outline.glossary ?? []).length} terms</summary>${glossaryView(ctx, outline)}</details>
<h2 class="mark" tabindex="-1">coverage ledger</h2>${coverage}
</section>`;
}

// The glossary lists terms in reading order, grouped by the PR whose stop
// first needs each one, so it reads like the walk. The overlay clones this
// list and adds a filter.
export function glossaryView(ctx, outline) {
  const where = new Map();
  outline.chapters.forEach((ch, ci) => ch.stops.forEach((s, si) => where.set(s.id, { ch, ci, si })));
  const terms = withBriefDefs(outline).map((t, i) => ({ t, i, w: t.stop ? where.get(t.stop) : null }));
  terms.sort((x, y) => (x.w?.ci ?? 1e3) - (y.w?.ci ?? 1e3) || (x.w?.si ?? 0) - (y.w?.si ?? 0) || x.i - y.i);
  const groups = [];
  for (const x of terms) {
    const key = x.w?.ch.id ?? 'stack';
    if (groups.at(-1)?.key !== key) groups.push({ key, ch: x.w?.ch ?? null, items: [] });
    groups.at(-1).items.push(x);
  }
  return `<div class="gloss">${groups
    .map(
      (g) => `<section class="gloss-group" style="--c:${g.ch ? layerVar(ctx, g.ch.layer) : 'var(--mute)'}"><h3 class="sub">${g.ch ? `${esc(ctx.layerLabel(g.ch.layer))} · ${inline(g.ch.title)}` : 'the whole stack'}</h3><dl class="terms">${g.items
        .map(
          ({ t }) =>
            `<div class="term" id="t-${slug(t.term)}" data-slug="${slug(t.term)}" data-term="${esc(t.term)}"><dt translate="no">${t.stop ? `<a class="term-go" href="#${esc(t.stop)}">${esc(t.term)}</a>` : esc(t.term)}</dt><dd><span class="def">${inline(t.def)}</span>${t.brief ? ` <a class="to-brief" href="#brief-${esc(t.brief)}">in the brief</a>` : ''}</dd></div>`,
        )
        .join('')}</dl></section>`,
    )
    .join('')}</div>`;
}

export function railView(ctx, outline) {
  const items = [`<li class="toc-item" data-chapter="c-open"><a class="toc-ch" href="#c-open" data-chapter="c-open"><span class="n">00</span><span class="t">the whole flow</span></a></li>`];
  outline.chapters.forEach((ch) => {
    const nums = stopNumbering(ch);
    const flagged = (s) => ((s.flags ?? []).some((f) => f.status !== 'dropped') ? `<span class="flag" role="img" aria-label="flagged">${icon('flag')}</span>` : '');
    const row = (s) => `<a class="toc-stop${s.branch ? ' branch' : ''}" href="#${esc(s.id)}" data-stop="${esc(s.id)}"><span class="n">${esc(nums.get(s.id))}${icon('check')}</span><span class="t">${esc(s.title)}</span>${flagged(s)}</a>`;
    // Branch stops fold under the stop that decides them.
    const groups = [];
    for (const s of ch.stops) {
      if (s.branch && groups.length) groups.at(-1).branches.push(s);
      else groups.push({ s, branches: [] });
    }
    const stops = groups
      .map(({ s, branches }) =>
        branches.length
          ? `<li class="has-branches">${row(s)}<button type="button" class="btn text toc-more" aria-expanded="false" aria-label="show ${branches.length} branch stops">+${branches.length} ${branches.length === 1 ? 'branch' : 'branches'}</button><ol class="toc-branches">${branches.map((b) => `<li>${row(b)}</li>`).join('')}</ol></li>`
          : `<li>${row(s)}</li>`,
      )
      .join('');
    items.push(
      `<li class="toc-item" data-chapter="${esc(ch.id)}"><a class="toc-ch" href="#${esc(ch.id)}" data-chapter="${esc(ch.id)}" style="--c:${layerVar(ctx, ch.layer)}"><span class="n">${esc(ctx.layerLabel(ch.layer))}</span><span class="t">${esc(ch.title)}</span><svg class="ring" viewBox="0 0 14 14" data-ring="${esc(ch.id)}" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--hair)" stroke-width="2"/><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--c)" stroke-width="2" stroke-dasharray="0 40" transform="rotate(-90 7 7)"/></svg></a><ol class="toc-stops">${stops}</ol><ol class="toc-files" data-toc-files="${esc(ch.id)}"></ol></li>`,
    );
  });
  // The close sits where a number would, like 00: a tick in the rail means reviewed.
  items.push(`<li class="toc-item" data-chapter="c-close"><a class="toc-ch" href="#c-close" data-chapter="c-close"><span class="n">end</span><span class="t">close</span></a></li>`);
  return `<nav aria-label="chapters"><ol class="toc">${items.join('')}</ol></nav>`;
}

// A touch screen has no Escape key, so each sheet carries a close control there.
const SHEET_X = `<button type="button" class="sheet-x" data-act="close-sheet" aria-label="close">${icon('close')}</button>`;

export function helpSheet(outline) {
  const row = (k, text) => `<dt>${k}</dt><dd>${text}</dd>`;
  return `<div class="overlay" data-overlay="help" role="dialog" aria-modal="true" aria-label="keyboard shortcuts"><div class="sheet" tabindex="-1">${SHEET_X}<h2>Every key</h2>
<div class="grp"><h3 class="kicker">move</h3><dl>${row(keys(keycap('j'), keycap('k')), 'previous or next, in the walk or the file view, from anywhere')}${row(keys(keycap('ArrowLeft'), keycap('ArrowRight')), 'the same, unless the flow fills the screen or focus is in it, a scene or a block that scrolls sideways')}${row(keys(keycap('ArrowUp'), keycap('ArrowDown')), 'read up or down by stop, file or section. One taller than the screen scrolls a screen at a time, then the next one opens and takes focus. The flow\'s section hands the arrows to the flow')}${row(keys(keycap('Home'), keycap('End')), 'top or bottom of the page, unless focus is in the flow or a scene')}${outline.chapters.length > 1 ? row(keys(keycap('['), keycap(']')), 'previous or next PR') : ''}${row(keycap('d'), 'switch a PR between its walk and every file')}${row(keycap('z'), 'fold or open every diff in this view')}${row(keycap('b'), 'back to where the last link started')}${row(keys(keycap('g'), keycap('0')), 'back to the whole flow')}</dl></div>
<div class="grp"><h3 class="kicker">review</h3><dl>${row(keycap('x'), 'mark reviewed and move on')}${row(keycap('c'), 'comment mode: your next click places the comment; with lines or text selected, comment on them')}${row(keycap('Escape'), 'close a panel, clear the selection or leave comment mode')}</dl></div>
<div class="grp"><h3 class="kicker">scenes and the flow</h3><dl>${row(keycap(' '), 'play or pause the scene on screen, or the whole flow; a pause keeps its place')}${row(keycap('l'), 'listen on or off, on a page with a voice: while on, play and every step read the hop aloud; a click on a story line reads it again')}${row(keys(keycap('ArrowLeft'), keycap('ArrowRight')), 'step the flow on screen, or the scene that has focus. More than three seconds into a playing hop, ← starts it over, and a second ← goes back a hop')}${row(keys(keycap('Home'), keycap('End')), 'its first or last step')}${row(keycap('Escape'), 'give the arrows back to the page')}${row(keycap('r'), 'replay the scene')}</dl></div>
<div class="grp"><h3 class="kicker">everything else</h3><dl>${row(keycap('t'), 'the glossary, with a filter')}${row(keycap('m'), 'sound on or off')}${row(keycap('?'), 'this sheet')}</dl></div>
<div class="grp"><h3 class="kicker">start over</h3><div class="resets"><button type="button" class="btn outline" data-act="reset-folds" data-ask="open every diff and file as it first was?">reset folds</button><button type="button" class="btn outline" data-act="reset-progress">clear review marks</button><p class="keyline" data-reset-note aria-live="polite"></p></div></div>
<p class="keyline">Shortcuts pause while you type. Scrolling never moves where you are: only a key, a click or a link does.</p></div></div>`;
}

export function shellView(ctx, outline, { opening, chapters, closing, rail }) {
  // The meter counts review progress, so it shows only the chapters with stops.
  const segs = outline.chapters.map((ch) => `<span class="gauge seg" data-chapter="${esc(ch.id)}" style="--c:${layerVar(ctx, ch.layer)}" aria-hidden="true"></span>`).join('');
  return `<a class="skip" href="#main">skip to the walk</a>
${sprite()}
<div class="wt" data-wt>
<header class="hdr"><button type="button" class="btn outline icon-only rail-toggle" data-act="rail" aria-label="chapters" aria-expanded="false">${icon('menu')}</button><div class="brand"><span class="kicker">review walk | 手順</span><strong>${inline(outline.name ?? outline.title)}</strong></div>
<div class="meter" data-meter>${segs}<span class="meter-label" data-meter-label>0 reviewed</span></div>
<div class="tools"><button type="button" class="btn outline" data-act="deck" aria-label="glossary" aria-keyshortcuts="t">${icon('glossary')}<span class="tl">terms</span><span class="count" data-deck-count>${(outline.glossary ?? []).length}</span></button><button type="button" class="btn outline" data-act="comment-mode" aria-pressed="false" aria-label="comment mode" aria-keyshortcuts="c"><span class="tl">comment</span></button><button type="button" class="btn outline" data-act="sound" aria-pressed="false" aria-label="Turn sound on" aria-keyshortcuts="m">${icon('sound', 'data-on hidden')}${icon('sound-off', 'data-off')}<span class="tl">sound</span></button><button type="button" class="btn outline" data-act="help" aria-label="keyboard shortcuts" aria-keyshortcuts="?"><span class="tl">keys</span></button></div></header>
<div class="body" data-body><aside class="rail" data-rail><div class="rail-tools" data-rail-tools><button type="button" class="btn outline" data-act="top">${icon('top')}<span class="tl">page top</span></button><button type="button" class="btn outline" data-act="bottom">${icon('bottom')}<span class="tl">page end</span></button></div>${rail}</aside>
<main class="main" id="main">${opening}${chapters}${closing}<span class="page-end" data-page-end aria-hidden="true"></span></main>
</div>
${navigator({ label: 'step through the walk', where: 'the whole flow', href: '#c-open', menu: true })}
<button type="button" class="backpill" data-back hidden aria-keyshortcuts="b"></button>
<p class="pickpill" data-pick role="status" hidden><span class="pick-mouse">click where the comment goes</span><span class="pick-touch">tap where the comment goes</span><button type="button" class="btn outline pick-stop" data-act="comment-mode">stop</button></p>
<div class="toast" data-toast role="status" aria-live="polite"></div>
<div class="tip" data-tip role="tooltip" id="wt-tip" hidden></div>
<div class="peek-sheet" data-peek-sheet role="dialog" aria-label="what it means" hidden><button type="button" class="ps-x" aria-label="close">${icon('close')}</button><div class="ps-body" aria-live="polite"></div></div>
${helpSheet(outline)}
<div class="overlay" data-overlay="deck" role="dialog" aria-modal="true" aria-label="glossary"><div class="sheet gloss-sheet" tabindex="-1">${SHEET_X}<div class="gloss-top"><h2>Glossary</h2><label class="sr" for="wt-term-filter">filter the terms</label><input type="search" id="wt-term-filter" data-term-filter autocomplete="off" spellcheck="false" placeholder="filter ${(outline.glossary ?? []).length} terms…"><span class="keyline" data-term-count></span></div><p class="keyline">Grouped by the PR that first needs each term. A marked word in the prose shows its definition on hover, on focus or at a tap.</p><div data-deck></div></div></div>
</div>`;
}
