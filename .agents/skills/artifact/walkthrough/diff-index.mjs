#!/usr/bin/env node
// Indexes one diff range into files and hunks with stable ids. An outline
// cites evidence by hunk id, and render.mjs copies the diff text from this
// index, so no model ever retypes a hunk.
//
// Usage:
//   node diff-index.mjs --base <sha> --head <sha> --out <dir> [--repo <path>] [--layer <id>]
//
// Writes <dir>/patch.diff, <dir>/hunks.json and <dir>/index.md.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key.slice(2)] = true;
    else {
      out[key.slice(2)] = next;
      i++;
    }
  }
  return out;
}

// Paths a reviewer reads as tests, migrations, docs, generated output or CI
// glue. The kind orders the index and splits a layer's churn bar; the outline
// decides each file's home. A hand-written migration is reviewed like code, so
// only drizzle's snapshots and journal under `meta/` count as generated, and a
// `*.test.yaml` is environment config, not a test.
export function kindOf(path) {
  if (/(^|\/)(drizzle\/meta|sig\/generated|swagger|translations\/compiled)\/|^apps\/hire-ui\/packages\/api-clients\/|(^|\/)(package-lock\.json|pnpm-lock\.yaml)$|\.lock$|\.snap$|\.generated\.[^/]+$/.test(path)) return 'generated';
  if (/\.(spec|test|e2e-spec)\.(?!ya?ml$)[a-z]+$|_(spec|test)\.[a-z]+$|(^|\/)(__tests__|__mocks__|__fixtures__|test|tests|spec|e2e|fixtures)\//.test(path)) return 'test';
  if (/(^|\/)(drizzle|migrations?)\/.*\.sql$|\/migrations?\//.test(path)) return 'migration';
  if (/\.mdx?$/.test(path)) return 'docs';
  if (/(^|\/)translations\/|\/i18n\//.test(path)) return 'i18n';
  if (/^\.rwx\/|^\.github\/|Dockerfile|\.ya?ml$|\.sh$|(^|\/)scripts?\//.test(path)) return 'ci';
  return 'impl';
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

// Git C-quotes a path that holds a tab, a newline, a quote or a backslash, or,
// with core.quotePath on, a non-ASCII byte, which it writes as an octal escape.
const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
function unquote(p) {
  if (!(p.length > 1 && p.startsWith('"') && p.endsWith('"'))) return p;
  const bytes = [];
  for (let i = 1; i < p.length - 1; i++) {
    if (p[i] !== '\\') {
      const c = String.fromCodePoint(p.codePointAt(i));
      bytes.push(...Buffer.from(c));
      i += c.length - 1;
    } else if (/^[0-7]{3}$/.test(p.slice(i + 1, i + 4))) {
      bytes.push(parseInt(p.slice(i + 1, i + 4), 8));
      i += 3;
    } else bytes.push(ESCAPES[p[++i]] ?? p.charCodeAt(i));
  }
  return Buffer.from(bytes).toString('utf8');
}

// A ---/+++ name: git ends one that holds a space with a tab.
function stripPrefix(p) {
  const name = unquote(p.replace(/\t$/, ''));
  if (name === '/dev/null') return null;
  return name.replace(/^[ab]\//, '');
}

// The two names of a `diff --git` line, either of them quoted. A quoted name
// escapes every quote it holds, so the last ` "` opens a quoted second name.
function gitPaths(rest) {
  if (rest.startsWith('"')) {
    let end = 1;
    while (end < rest.length && rest[end] !== '"') end += rest[end] === '\\' ? 2 : 1;
    if (rest[end + 1] === ' ') return [stripPrefix(rest.slice(0, end + 1)), stripPrefix(rest.slice(end + 2))];
  } else if (rest.endsWith('"')) {
    const at = rest.lastIndexOf(' "');
    if (at > 0) return [stripPrefix(rest.slice(0, at)), stripPrefix(rest.slice(at + 1))];
  }
  const m = /^a\/(.+) b\/(.+)$/.exec(rest);
  return m ? [m[1], m[2]] : [null, rest];
}

// Parses `git diff` unified output into files with numbered hunks.
export function parsePatch(patch) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  const lines = patch.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      hunk = null;
      const [oldPath, path] = gitPaths(line.slice(11));
      file = {
        path,
        oldPath,
        status: 'M',
        binary: false,
        similarity: null,
        hunks: [],
      };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'A';
      else if (line.startsWith('deleted file mode')) file.status = 'D';
      else if (line.startsWith('rename from ')) {
        file.oldPath = unquote(line.slice(12));
        file.status = 'R';
      } else if (line.startsWith('rename to ')) file.path = unquote(line.slice(10));
      else if (line.startsWith('similarity index ')) file.similarity = parseInt(line.slice(17), 10);
      else if (line.startsWith('--- ')) {
        const p = stripPrefix(line.slice(4));
        if (p) file.oldPath = p;
      } else if (line.startsWith('+++ ')) {
        const p = stripPrefix(line.slice(4));
        if (p) file.path = p;
      } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
    }
    const h = HUNK_HEADER.exec(line);
    if (h) {
      hunk = {
        n: file.hunks.length + 1,
        oldStart: +h[1],
        oldLines: h[2] === undefined ? 1 : +h[2],
        newStart: +h[3],
        newLines: h[4] === undefined ? 1 : +h[4],
        section: h[5] || '',
        header: line,
        lines: [],
        adds: 0,
        dels: 0,
      };
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const t = line[0];
    if (t === '+') {
      hunk.lines.push(['+', line.slice(1), null, newLine++]);
      hunk.adds++;
    } else if (t === '-') {
      hunk.lines.push(['-', line.slice(1), oldLine++, null]);
      hunk.dels++;
    } else if (t === ' ') {
      hunk.lines.push([' ', line.slice(1), oldLine++, newLine++]);
    } else if (t === '\\') {
      hunk.lines.push(['\\', line.slice(1), null, null]);
    } else if (line === '' && i === lines.length - 1) {
      // trailing newline of the patch
    } else {
      // A new header or noise ends the hunk.
      hunk = null;
    }
  }
  for (const f of files) {
    if (f.status === 'A') f.oldPath = null;
    f.kind = kindOf(f.path);
    f.adds = f.hunks.reduce((s, h) => s + h.adds, 0);
    f.dels = f.hunks.reduce((s, h) => s + h.dels, 0);
    for (const h of f.hunks) h.id = `${f.path}#h${h.n}`;
  }
  return files;
}

function firstChange(h) {
  const l = h.lines.find(([t, text]) => (t === '+' || t === '-') && text.trim());
  if (!l) return '';
  const text = l[1].trim();
  return `${l[0]} ${text.length > 90 ? text.slice(0, 87) + '…' : text}`;
}

export function renderIndex(files, meta) {
  const adds = files.reduce((s, f) => s + f.adds, 0);
  const dels = files.reduce((s, f) => s + f.dels, 0);
  const hunks = files.reduce((s, f) => s + f.hunks.length, 0);
  const out = [];
  out.push(`# Layer ${meta.layer ?? ''} · ${meta.base.slice(0, 11)} → ${meta.head.slice(0, 11)}`);
  out.push('');
  out.push(`${files.length} files · ${hunks} hunks · +${adds} −${dels}`);
  out.push('');
  out.push('Cite evidence by hunk id. A file without hunks (binary, mode-only) takes a file-level home.');
  out.push('');
  out.push('| file | status | +/− | kind | hunks |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const f of files) {
    const st = f.status === 'R' ? `R ${f.oldPath}` : f.status;
    out.push(`| ${f.path} | ${st}${f.binary ? ' binary' : ''} | +${f.adds}/−${f.dels} | ${f.kind} | ${f.hunks.length} |`);
  }
  out.push('');
  out.push('## Hunks');
  for (const f of files) {
    out.push('');
    out.push(`### ${f.path} (${f.status}, ${f.kind})`);
    if (!f.hunks.length) out.push('- no hunks: cite the file path in a file-level home');
    for (const h of f.hunks) {
      const where = h.section ? ` ${h.section}` : '';
      out.push(`- \`${h.id}\` ${h.header.replace(/ @@.*/, ' @@')}${where} · +${h.adds} −${h.dels} · ${firstChange(h)}`);
    }
  }
  out.push('');
  return out.join('\n');
}

export function indexRange({ repo, base, head }) {
  const git = (...a) =>
    execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...a], {
      encoding: 'utf8',
      maxBuffer: 1 << 30,
    });
  // A ref moves; the index names the commits it read.
  const [from, to] = [base, head].map((rev) => git('rev-parse', '--verify', `${rev}^{commit}`).trim());
  const patch = git('diff', '-M', '--no-color', '--no-ext-diff', '--unified=3', from, to);
  return { base: from, head: to, patch, files: parsePatch(patch) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base || !args.head || !args.out) {
    console.error('usage: diff-index.mjs --base <sha> --head <sha> --out <dir> [--repo <path>] [--layer <id>]');
    process.exit(2);
  }
  const repo = resolve(args.repo || '.');
  const { base, head, patch, files } = indexRange({ repo, base: args.base, head: args.head });
  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'patch.diff'), patch);
  const meta = { layer: args.layer ?? null, base, head };
  writeFileSync(join(args.out, 'hunks.json'), JSON.stringify({ ...meta, files }));
  writeFileSync(join(args.out, 'index.md'), renderIndex(files, meta));
  const hunks = files.reduce((s, f) => s + f.hunks.length, 0);
  console.log(`${args.layer ?? ''} ${files.length} files, ${hunks} hunks -> ${args.out}`);
}
