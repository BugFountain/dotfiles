// Syntax colors for diff lines, and the words that changed between a removed
// line and the added line that replaces it. The row tint, the sign and the
// left rule say what changed; token colors only help the eye parse, so they
// never use the added or removed hues (themes/cyberpunk.md#code).
//
// A token becomes <i class="y?">: yk keyword, ys string, yn number, literal
// or constant, yt type or key, yc comment, and yx a changed word. Painting
// never changes the text: tags only wrap it, so the evidence stays verbatim.

// The same escaping as views.mjs, which imports this file.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const JS = words(`abstract as async await break case catch class const continue debugger declare default delete do else enum export extends
  false finally for from function get if implements import in infer instanceof interface is keyof let module namespace new null of override
  private protected public readonly return satisfies set static super switch this throw true try type typeof undefined unique var void while with yield`);
const RUBY = words(`alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry
  return self super then true undef unless until when while yield private protected public require require_relative include extend raise`);
const PY = words(`False None True and as assert async await break class continue def del elif else except finally for from global if import in is
  lambda nonlocal not or pass raise return try while with yield self`);
const GO = words(`break case chan const continue default defer else fallthrough for func go goto if import interface map package range return
  select struct switch type var nil true false`);
const SQL = words(`select from where and or not null is in insert into values update set delete create table alter add column drop index unique
  primary key foreign references on cascade default constraint if exists as join left right inner outer group by order limit offset returning
  begin commit rollback transaction grant type enum rename to with using check boolean integer int bigint smallint text varchar char uuid jsonb
  json timestamp timestamptz date time serial bigserial numeric decimal real double precision true false concurrently schema extension function
  returns language trigger before after for each row execute procedure do then else end case when`);
const SH = words(`if then else elif fi for while do done case esac function return in export local readonly set unset exit`);
const YAML = words('true false null yes no on off');

// A language is a keyword set and its comment and string forms.
const LANGS = {
  js: { kw: JS, line: '//', block: ['/*', '*/'], quotes: `'"\``, types: true },
  json: { kw: words('true false null'), quotes: '"', keys: true },
  yaml: { kw: YAML, line: '#', quotes: `'"`, keys: true },
  sql: { kw: SQL, line: '--', block: ['/*', '*/'], quotes: `'`, fold: true },
  ruby: { kw: RUBY, line: '#', quotes: `'"`, types: true },
  py: { kw: PY, line: '#', quotes: `'"`, types: true },
  go: { kw: GO, line: '//', block: ['/*', '*/'], quotes: '"`', types: true },
  sh: { kw: SH, line: '#', quotes: `'"` },
  css: { kw: new Set(), block: ['/*', '*/'], quotes: `'"` },
};

export function langOf(path) {
  const base = path.split('/').pop();
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  if (/^Dockerfile/.test(base)) return 'sh';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'java', 'kt', 'swift', 'cs', 'rs', 'c', 'h', 'cpp', 'scss'].includes(ext)) return ext === 'scss' ? 'css' : 'js';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['yml', 'yaml'].includes(ext)) return 'yaml';
  if (ext === 'sql') return 'sql';
  if (['rb', 'rake', 'gemspec', 'erb'].includes(ext) || base === 'Gemfile') return 'ruby';
  if (ext === 'py') return 'py';
  if (ext === 'go') return 'go';
  if (['sh', 'bash', 'zsh', 'env'].includes(ext) || base.startsWith('.env')) return 'sh';
  if (ext === 'css') return 'css';
  if (['md', 'mdx'].includes(ext)) return 'md';
  return null;
}

const IDENT = /[A-Za-z_$][\w$]*[?!]?/y;
const NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?|#[\da-fA-F]{3,8})\b/y;

// Tokens of one line. `state` carries an open block comment or template
// string from the line before; a hunk that opens inside a JSDoc block shows
// its ` * ` lines as comment.
export function tokenize(text, lang, state = null) {
  const L = LANGS[lang];
  if (lang === 'md') return { tokens: markdown(text), state: null };
  if (lang === 'diagram') return { tokens: drawing(text), state: null };
  if (!L) return { tokens: [], state: null };
  const out = [];
  let i = 0;
  let st = state;
  const n = text.length;
  if (!st && L.block && /^\s*\*(\s|\/|$)/.test(text)) st = 'block';
  while (i < n) {
    if (st === 'block') {
      const end = text.indexOf(L.block[1], i);
      const e = end < 0 ? n : end + L.block[1].length;
      out.push({ s: i, e, k: 'yc' });
      i = e;
      if (end >= 0) st = null;
      continue;
    }
    if (st && st.startsWith('q')) {
      const q = st[1];
      const e = closeQuote(text, i, q);
      out.push({ s: i, e: e < 0 ? n : e, k: 'ys' });
      i = e < 0 ? n : e;
      if (e >= 0) st = null;
      continue;
    }
    const c = text[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (L.line && text.startsWith(L.line, i) && (lang !== 'yaml' || i === 0 || /\s/.test(text[i - 1]))) {
      out.push({ s: i, e: n, k: 'yc' });
      break;
    }
    if (L.block && text.startsWith(L.block[0], i)) {
      st = 'block';
      continue;
    }
    if (L.quotes.includes(c)) {
      const e = closeQuote(text, i + 1, c);
      const end = e < 0 ? n : e;
      const key = L.keys && /^\s*:/.test(text.slice(end));
      out.push({ s: i, e: end, k: key ? 'yt' : 'ys' });
      // Only a template string runs on to the next line.
      if (e < 0 && c === '`') st = 'q`';
      i = end;
      continue;
    }
    NUM.lastIndex = i;
    const num = /[\d#]/.test(c) && (i === 0 || !/[\w$]/.test(text[i - 1])) ? NUM.exec(text) : null;
    if (num) {
      out.push({ s: i, e: i + num[0].length, k: 'yn' });
      i += num[0].length;
      continue;
    }
    if (c === '@' && L.types) {
      IDENT.lastIndex = i + 1;
      const m = IDENT.exec(text);
      if (m) {
        out.push({ s: i, e: i + 1 + m[0].length, k: 'yk' });
        i += 1 + m[0].length;
        continue;
      }
    }
    IDENT.lastIndex = i;
    const id = /[A-Za-z_$]/.test(c) ? IDENT.exec(text) : null;
    if (id) {
      const w = id[0];
      const e = i + w.length;
      const bare = w.replace(/[?!]$/, '');
      if (L.kw.has(L.fold ? bare.toLowerCase() : w) || L.kw.has(bare)) out.push({ s: i, e: L.kw.has(w) ? e : i + bare.length, k: 'yk' });
      else if (L.keys && /^\s*:/.test(text.slice(e)) && (lang !== 'yaml' || /^\s*(-\s+)?$/.test(text.slice(0, i)))) out.push({ s: i, e, k: 'yt' });
      else if (/^[A-Z][A-Z0-9]*_[A-Z0-9_]+$|^[A-Z]{2,}[0-9]*$/.test(bare)) out.push({ s: i, e: i + bare.length, k: 'yn' });
      else if (L.types && /^[A-Z][a-z0-9]/.test(bare)) out.push({ s: i, e: i + bare.length, k: 'yt' });
      i = e;
      continue;
    }
    i++;
  }
  return { tokens: out, state: st };
}

function closeQuote(text, i, q) {
  for (let j = i; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === q) return j + 1;
  }
  return -1;
}

// Markdown stays prose: a heading reads as a keyword, inline code as a
// string, and the rest keeps the text color.
function markdown(text) {
  if (/^\s{0,3}#{1,6}\s/.test(text)) return [{ s: 0, e: text.length, k: 'yk' }];
  const out = [];
  for (const m of text.matchAll(/`[^`]+`/g)) out.push({ s: m.index, e: m.index + m[0].length, k: 'ys' });
  return out;
}

// A drawing in text: its lines and arrows take the comment color, so the
// words between them read first. A code name, a quote and a number take the
// colors code gives them, and a word in capitals reads as a keyword. A plain
// word keeps the text color.
const SKETCH = /([\u2190-\u21ff\u2500-\u25ff]+|-+>|<-+|=>)|('[^']*'|"[^"]*")|(`[^`]+`)|(#\d+\b|\b\d[\d,.]*\b)|(@?[A-Za-z_$][\w$]*(?:[.:-][A-Za-z_$][\w$]*)*(?:\(\))?)/g;
function drawing(text) {
  const out = [];
  for (const m of text.matchAll(SKETCH)) {
    const [w, line, quote, code, num] = m;
    const s = m.index;
    const k = line ? 'yc' : quote ? 'ys' : code ? 'yt' : num ? 'yn' : codeName(w);
    if (k) out.push({ s, e: s + w.length, k });
  }
  return out;
}
function codeName(w) {
  if (/^[0-9a-f]{7,40}$/.test(w) && /\d/.test(w)) return 'yn';
  if (w.startsWith('@')) return 'yk';
  if (/[_.:(]|[a-z][A-Z]|[A-Z][a-z]+[A-Z0-9]|-.*-/.test(w)) return 'yt';
  if (/^[A-Z]{2,}$/.test(w)) return 'yk';
  return '';
}

// The words that differ between a removed line and the added line that
// replaces it, as [start, end) ranges on each side. Lines that share too
// little get no marks: a rewritten line reads better whole. A run of
// punctuation is one piece, so `==` to `===` marks the whole operator.
const PIECE = /\w+|\s+|[^\w\s]+/g;
export function wordDiff(a, b) {
  const pa = [...a.matchAll(PIECE)];
  const pb = [...b.matchAll(PIECE)];
  if (!pa.length || !pb.length || pa.length * pb.length > 160_000) return null;
  const n = pa.length;
  const m = pb.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i * (m + 1) + j] = pa[i][0] === pb[j][0] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  const keepA = new Uint8Array(n);
  const keepB = new Uint8Array(m);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (pa[i][0] === pb[j][0]) {
      keepA[i++] = 1;
      keepB[j++] = 1;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
    else j++;
  }
  const ranges = (pieces, keep) => {
    const out = [];
    pieces.forEach((p, k) => {
      if (keep[k] || !p[0].trim()) return;
      const s = p.index;
      const e = s + p[0].length;
      const last = out.at(-1);
      // Changed words joined by a space read as one change.
      if (last && /^\s*$/.test((pieces === pa ? a : b).slice(last[1], s))) last[1] = e;
      else out.push([s, e]);
    });
    return out;
  };
  const shared = [...keepA].reduce((sum, k, i) => sum + (k && pa[i][0].trim() ? pa[i][0].length : 0), 0);
  const size = Math.max(a.replace(/\s/g, '').length, b.replace(/\s/g, '').length);
  if (!size || shared / size < 0.4) return null;
  return [ranges(pa, keepA), ranges(pb, keepB)];
}

// The line's HTML: its text escaped, each token and changed word wrapped.
export function paint(text, tokens = [], marks = []) {
  if (!tokens.length && !marks.length) return esc(text);
  const n = text.length;
  const kind = new Array(n).fill('');
  for (const t of tokens) for (let i = t.s; i < t.e && i < n; i++) kind[i] = t.k;
  const hit = new Uint8Array(n);
  for (const [s, e] of marks) for (let i = s; i < e && i < n; i++) hit[i] = 1;
  let out = '';
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && kind[j] === kind[i] && hit[j] === hit[i]) j++;
    const cls = [kind[i], hit[i] ? 'yx' : ''].filter(Boolean).join(' ');
    const seg = esc(text.slice(i, j));
    out += cls ? `<i class="${cls}">${seg}</i>` : seg;
    i = j;
  }
  return out;
}

// Every line of a hunk painted, with each side's comment and template state
// carried in its own order, and word marks on each removed line paired with
// the added line that follows it in the same change.
export function paintHunk(lines, path) {
  const lang = langOf(path);
  const marks = new Map();
  for (let i = 0; i < lines.length; ) {
    if (lines[i][0] !== '-') {
      i++;
      continue;
    }
    const dels = [];
    while (i < lines.length && lines[i][0] === '-') dels.push(i++);
    const adds = [];
    while (i < lines.length && lines[i][0] === '+') adds.push(i++);
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const [a, b] = [lines[dels[k]][1], lines[adds[k]][1]];
      if (a.length > 1000 || b.length > 1000) continue;
      const d = wordDiff(a, b);
      if (!d) continue;
      marks.set(dels[k], d[0]);
      marks.set(adds[k], d[1]);
    }
  }
  let oldSt = null;
  let newSt = null;
  return lines.map(([t, text], i) => {
    if (t === '\\') return esc(text);
    const st = t === '-' ? oldSt : newSt;
    const { tokens, state } = lang && text.length <= 1000 ? tokenize(text, lang, st) : { tokens: [], state: null };
    if (t === '-') oldSt = state;
    else if (t === '+') newSt = state;
    else oldSt = newSt = state;
    return paint(text, tokens, marks.get(i) ?? []);
  });
}

// A block of code or a drawing outside a diff, painted line by line, each
// line's comment and template state carried to the next. `text`, or a
// language the tokenizer lacks, stays plain.
export function paintBlock(text, lang) {
  const L = lang === 'ts' ? 'js' : lang;
  let st = null;
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      if (line.length > 1000) return esc(line);
      const r = tokenize(line, L, st);
      st = r.state;
      return paint(line, r.tokens);
    })
    .join('\n');
}
