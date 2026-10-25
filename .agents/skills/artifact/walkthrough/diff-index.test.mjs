import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexRange, kindOf, parsePatch } from './diff-index.mjs';
import { churnOf } from './views.mjs';

// One path per rule, so a rule that stops matching fails by name.
const KINDS = {
  test: [
    'apps/fountain-ai/src/orders/orders.service.spec.ts',
    'apps/fountain-ai/test/orders.e2e.spec.ts',
    'apps/fountain-ai/test/orders.e2e-spec.ts',
    'apps/wx-system/frontends/wx-ui/src/Button.test.tsx',
    'apps/fountain-ai/src/talent-agents/.agents/skills/artifact/walkthrough/views.test.mjs',
    'apps/hire-ui/packages/recruiter-ui/app/__tests__/Board.jsx',
    'apps/hire-ui/packages/recruiter-ui/app/__mocks__/api.js',
    'apps/fountain-ai/test/fixtures/plan.json',
    'apps/hire/spec/models/applicant_spec.rb',
    'apps/lorgnette/pkg/scan/scan_test.go',
  ],
  generated: [
    'apps/fountain-ai/drizzle/meta/0042_snapshot.json',
    'apps/fountain-ai/drizzle/meta/_journal.json',
    'apps/fountain-ai/package-lock.json',
    'apps/hire/Gemfile.lock',
    'apps/hire/swagger/internal_api/fountain.yaml',
    'apps/hire-ui/packages/api-clients/monolith/src/api.ts',
    'apps/hire/sig/generated/app/models/applicant.rbs',
    'apps/hire-go/i18n/translations/compiled/es.json',
    '.claude/skills/pool-error-triage/tool/shared-processes.generated.ts',
    'apps/wx-system/frontends/wx-ui/src/__snapshots__/Button.test.tsx.snap',
  ],
  migration: ['apps/fountain-ai/drizzle/0042_add_orders.sql'],
  ci: ['apps/fountain-ai/docker-compose.test.yaml'],
  i18n: ['apps/wx-system/frontends/wx-ui/src/i18n/translations/en-US.json'],
  impl: ['apps/fountain-ai/src/orders/orders.service.ts', 'apps/fountain-ai/src/testing-utils/contest.ts'],
};

test('classifies each test, generated and hand-written path by its rule', () => {
  for (const [kind, paths] of Object.entries(KINDS)) for (const p of paths) assert.equal(kindOf(p), kind, p);
});

test("splits a layer's churn into code, tests and generated lines", () => {
  const file = (path, adds, dels) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,${dels} +1,${adds} @@\n${'-x\n'.repeat(dels)}${'+y\n'.repeat(adds)}`;
  const files = parsePatch(
    [file('src/a.ts', 3, 1), file('src/a.spec.ts', 5, 2), file('drizzle/meta/0001_snapshot.json', 40, 0), file('drizzle/0001_add.sql', 4, 0), file('README.md', 2, 1)].join(''),
  );
  assert.deepEqual(churnOf(files), {
    code: { adds: 9, dels: 2 },
    test: { adds: 5, dels: 2 },
    generated: { adds: 40, dels: 0 },
  });
});

// The file view reads `status`, `oldPath` and `binary` from these headers; a
// rename read as a modify shows the reviewer a file that never existed.
test('reads added, deleted, renamed and binary files from their headers', () => {
  const patch = [
    'diff --git a/new.ts b/new.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/new.ts',
    '@@ -0,0 +1 @@',
    '+export const a = 1;',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-export const b = 2;',
    'diff --git a/old/name.ts b/new/name.ts',
    'similarity index 91%',
    'rename from old/name.ts',
    'rename to new/name.ts',
    'diff --git a/logo.png b/logo.png',
    'Binary files a/logo.png and b/logo.png differ',
    '',
  ].join('\n');
  const got = parsePatch(patch).map(({ path, oldPath, status, binary, similarity, hunks }) => ({ path, oldPath, status, binary, similarity, hunks: hunks.length }));
  assert.deepEqual(got, [
    { path: 'new.ts', oldPath: null, status: 'A', binary: false, similarity: null, hunks: 1 },
    { path: 'gone.ts', oldPath: 'gone.ts', status: 'D', binary: false, similarity: null, hunks: 1 },
    { path: 'new/name.ts', oldPath: 'old/name.ts', status: 'R', binary: false, similarity: 91, hunks: 0 },
    { path: 'logo.png', oldPath: 'logo.png', status: 'M', binary: true, similarity: null, hunks: 0 },
  ]);
});

// Git ends a ---/+++ name that holds a space with a tab, and C-quotes a name
// that holds a tab or a quote; an index that keeps either names a file the
// repository lacks.
test('reads paths with spaces, tabs and quotes as the repository names them', () => {
  const repo = mkdtempSync(join(tmpdir(), 'walkthrough-paths-'));
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
    git('init', '-q');
    for (const name of ['space name.ts', 'tab\tname.ts', 'old name.ts', 'quo"te.sh']) writeFileSync(join(repo, name), 'a\n');
    git('add', '.');
    git('commit', '-qm', 'a');
    const base = git('rev-parse', 'HEAD');
    for (const name of ['space name.ts', 'tab\tname.ts']) writeFileSync(join(repo, name), 'b\n');
    git('mv', 'old name.ts', 'new\tname.ts');
    chmodSync(join(repo, 'quo"te.sh'), 0o755);
    git('add', '.');
    git('commit', '-qm', 'b');
    const got = indexRange({ repo, base, head: git('rev-parse', 'HEAD') }).files.map(({ path, oldPath, status }) => ({ path, oldPath, status }));
    assert.deepEqual(got, [
      { path: 'new\tname.ts', oldPath: 'old name.ts', status: 'R' },
      { path: 'quo"te.sh', oldPath: 'quo"te.sh', status: 'M' },
      { path: 'space name.ts', oldPath: 'space name.ts', status: 'M' },
      { path: 'tab\tname.ts', oldPath: 'tab\tname.ts', status: 'M' },
    ]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  // With core.quotePath on, git writes a non-ASCII byte as an octal escape.
  const [f] = parsePatch(['diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"', '--- "a/caf\\303\\251.ts"', '+++ "b/caf\\303\\251.ts"', '@@ -1 +1 @@', '-a', '+b', ''].join('\n'));
  assert.equal(f.path, 'café.ts');
});

// A ref moves; the index keeps the commits it read, so a later commit on the
// branch cannot pass for the range that was indexed.
test('stores the base and head it indexed as full shas', () => {
  const repo = mkdtempSync(join(tmpdir(), 'walkthrough-refs-'));
  try {
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
    git('init', '-q');
    for (const text of ['a\n', 'b\n']) {
      writeFileSync(join(repo, 'a.ts'), text);
      git('add', '.');
      git('commit', '-qm', text);
    }
    const out = join(repo, 'out');
    execFileSync(process.execPath, [new URL('./diff-index.mjs', import.meta.url).pathname, '--base', 'HEAD~1', '--head', 'HEAD', '--out', out, '--repo', repo]);
    const { base, head } = JSON.parse(readFileSync(join(out, 'hunks.json'), 'utf8'));
    assert.deepEqual([base, head], [git('rev-parse', 'HEAD~1'), git('rev-parse', 'HEAD')]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
