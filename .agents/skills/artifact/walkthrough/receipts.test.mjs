// A receipt's lens opens the file at the head of the layer its clause names;
// a receipt read under the wrong layer shows the reviewer the wrong commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeResolver, receiptsOf } from './receipts.mjs';

test('reads each receipt under the layer its own clause names', () => {
  const text = 'worker.service.ts:50 registers only the skeleton (4080); command.handler.ts:115 calls pinAndDispatch, which reaches interpreter.service.ts:401 runNoWait (5983); SDK 1.26.2 has no receipt; graph.spec.ts:28 at 4421; .rwx/build.yml:405 in 4442';
  const got = receiptsOf(text, '9999').map((r) => [r.ref, r.line, r.layer, text.slice(r.start, r.end)]);
  assert.deepEqual(got, [
    ['worker.service.ts', 50, '4080', 'worker.service.ts:50'],
    ['command.handler.ts', 115, '5983', 'command.handler.ts:115'],
    ['interpreter.service.ts', 401, '5983', 'interpreter.service.ts:401'],
    ['graph.spec.ts', 28, '4421', 'graph.spec.ts:28'],
    ['.rwx/build.yml', 405, '4442', '.rwx/build.yml:405'],
  ]);
  assert.deepEqual(
    receiptsOf('only a.repo.ts:9 here', '4156').map((r) => r.layer),
    ['4156'],
  );
});

// A receipt names a file by a short path; the lens must open that one file,
// and a short path two files share opens none rather than the wrong one.
test('resolves a receipt by exact path, then the layer\'s changed file, then a unique suffix', () => {
  const repo = mkdtempSync(join(tmpdir(), 'walkthrough-receipts-'));
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
    git('init', '-q');
    for (const f of ['src/a/worker.ts', 'src/b/worker.ts', 'src/c/graph.ts']) {
      mkdirSync(join(repo, dirname(f)), { recursive: true });
      writeFileSync(join(repo, f), '');
    }
    git('add', '.');
    git('commit', '-qm', 'tree');
    const layers = new Map([['4080', { head: git('rev-parse', 'HEAD') }]]);
    const changed = { '4080': ['src/b/worker.ts'] };
    const resolve = makeResolver(repo, layers, (id) => changed[id]);
    assert.equal(resolve('4080', 'src/c/graph.ts'), 'src/c/graph.ts');
    assert.equal(resolve('4080', 'graph.ts'), 'src/c/graph.ts');
    assert.equal(resolve('4080', 'worker.ts'), 'src/b/worker.ts');
    changed['4080'] = [];
    assert.equal(resolve('4080', 'worker.ts'), null);
    assert.equal(resolve('9999', 'graph.ts'), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
