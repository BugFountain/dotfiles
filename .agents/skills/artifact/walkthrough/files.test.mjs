// The file view is a reader's route through every changed file. A test left
// unpaired shows as its own file far from the code it covers, and a schema
// change read after its controller hides the one change that is hard to undo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filesOf, groupsOf, subjectOf } from './files.mjs';

const file = (path, kind = 'impl') => ({ path, status: 'M', adds: 1, dels: 0, kind, binary: false, hunks: [{ id: `${path}#h1` }] });

test('pairs each test with the file it covers', () => {
  const paths = ['src/inbox/inbox.repo.ts', 'src/inbox/inbox.repo.e2e.spec.ts', 'src/a/b.service.ts', 'src/a/__tests__/b.service.test.ts', 'src/c/other.spec.ts'];
  assert.equal(subjectOf('src/inbox/inbox.repo.e2e.spec.ts', paths), 'src/inbox/inbox.repo.ts');
  assert.equal(subjectOf('src/a/__tests__/b.service.test.ts', paths), 'src/a/b.service.ts');
  assert.equal(subjectOf('src/c/other.spec.ts', paths), null);
});

test('reads a PR that changes stored data from the schema up, and one that does not from the entry', () => {
  const firstStop = (p) => ({ 'src/x/x.controller.ts': 0, 'src/x/x.repo.ts': 2 })[p] ?? null;
  const withMigration = filesOf([file('src/x/x.controller.ts'), file('src/x/x.repo.ts'), file('drizzle/0001_x.sql', 'migration')], { firstStop, homeOf: () => '' });
  assert.equal(withMigration.order, 'storage');
  assert.deepEqual(groupsOf(withMigration, 'storage', String).map((g) => g.key), ['storage', 'data', 'entry']);
  const without = filesOf([file('src/x/x.repo.ts'), file('src/x/x.controller.ts')], { firstStop, homeOf: () => '' });
  assert.equal(without.order, 'entry');
  assert.deepEqual(groupsOf(without, 'entry', String).flatMap((g) => g.items.map((i) => without.files[i].p)), ['src/x/x.controller.ts', 'src/x/x.repo.ts']);
});
