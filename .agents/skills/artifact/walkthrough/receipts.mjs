// Receipts: the `file:line` references a verifier writes in a flag's
// evidence, parsed and resolved to a path at the head of the layer that
// holds each line.

import { execFileSync } from 'node:child_process';

// A receipt is a `file:line` in a verifier's evidence. Its layer is the last
// PR number its clause names, `(5983)`, `at 5983` or `in 5983`, else the
// layer the evidence belongs to. Clauses split at semicolons.
const REF = /(?<![\w/.-])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z]{1,6}):(\d+)/g;
export function receiptsOf(text, fallbackLayer) {
  const out = [];
  let offset = 0;
  for (const clause of String(text ?? '').split(';')) {
    const named = [...clause.matchAll(/\((\d{3,6})\)|\b(?:at|in)\s+#?(\d{3,6})\b/g)].at(-1);
    const layer = named ? named[1] ?? named[2] : fallbackLayer;
    for (const m of clause.matchAll(REF)) out.push({ start: offset + m.index, end: offset + m.index + m[0].length, ref: m[1], line: Number(m[2]), layer });
    offset += clause.length + 1;
  }
  return out;
}

// A receipt's file by its path at the layer's head: the path as written, a
// changed file of that layer that ends with it, or the one file in the tree
// that does. Two candidates resolve to none.
export function makeResolver(repo, layers, changedOf) {
  const trees = new Map();
  const treeOf = (sha) => {
    if (!trees.has(sha)) {
      let paths = [];
      try {
        paths = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '--name-only', sha], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
      } catch {
        paths = [];
      }
      trees.set(sha, { all: paths, set: new Set(paths) });
    }
    return trees.get(sha);
  };
  return (layerId, ref) => {
    const l = layers.get(layerId);
    if (!l) return null;
    const tree = treeOf(l.head);
    if (tree.set.has(ref)) return ref;
    const tail = `/${ref}`;
    const changed = (changedOf(layerId) ?? []).filter((p) => p.endsWith(tail));
    if (changed.length === 1) return changed[0];
    const hits = tree.all.filter((p) => p.endsWith(tail));
    return hits.length === 1 ? hits[0] : null;
  };
}
