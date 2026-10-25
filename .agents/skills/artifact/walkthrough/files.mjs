// Every changed file of a layer, in a reading order. The walk shows the code
// that decides each stop; this view shows all of it, so a reader can read a
// PR end to end. Two orders: from the stored data up (schema, data access,
// logic, entry points, UI), or from the entry down, in the order the walk's
// stops run. Tests ride on the file they cover.

// Bottom-up tiers. The index's kind decides first, then the path; the first
// match wins, so a frontend's `*.constants.ts` reads as UI, not a contract.
export const TIERS = [
  { id: 'storage', label: 'stored data', test: (p, k) => k === 'migration' || /(^|\/)src\/drizzle\/|(^|\/)db\/(migrate|schema)|schema\.rb$|\.sql$|schema\.prisma$|\.model\.[cm]?[jt]s$/.test(p) },
  { id: 'docs', label: 'docs', test: (p, k) => k === 'docs' },
  { id: 'generated', label: 'generated and lockfiles', test: (p, k) => k === 'generated' },
  { id: 'ops', label: 'config, CI and scripts', test: (p, k) => k === 'ci' || /(^|\/)(package\.json|tsconfig[^/]*\.json|\.env[^/]*|Dockerfile[^/]*)$|\.config\.[cm]?[jt]s$|(^|\/)(helm|scripts?|tools)\//.test(p) },
  { id: 'ui', label: 'UI', test: (p, k) => k === 'i18n' || /\.(tsx|jsx|vue|svelte|css|scss)$|(^|\/)(frontends|components|pages)\//.test(p) },
  { id: 'data', label: 'data access', test: (p) => /\.(repo|repository|dao)(\.types)?\.[cm]?[jt]s$|(^|\/)repositories\//.test(p) },
  { id: 'contract', label: 'contracts and types', test: (p) => /\.(types|dto|contracts?|constants|errors|keys|names|schemas?)\.[cm]?[jt]s$|-names\.[cm]?[jt]s$|\.d\.ts$|(^|\/)packages\/cdc-contracts\//.test(p) },
  { id: 'wiring', label: 'wiring', test: (p) => /\.module\.[cm]?[jt]s$|(^|\/)index\.[cm]?[jt]s$|(^|\/)(registry|executor|interface)\.[cm]?[jt]s$/.test(p) },
  { id: 'entry', label: 'entry points', test: (p) => /\.(controller|consumer|gateway|cli|command|handler)\.[cm]?[jt]s$|(^|\/)(controllers|routes|bin)\/|(^|\/)main\.[cm]?[jt]s$/.test(p) },
  { id: 'logic', label: 'logic', test: () => true },
];
// Reading order from the bottom: logic sits between contracts and wiring.
const RANK = ['storage', 'contract', 'data', 'logic', 'wiring', 'entry', 'ui', 'ops', 'docs', 'generated'];
export const tierRank = (id) => RANK.indexOf(id);

export function tierOf(path, kind) {
  return TIERS.find((t) => t.test(path, kind)).id;
}

// A test's subject is the changed file it exercises: `x.service.spec.ts` covers
// `x.service.ts`, `__tests__/x.test.ts` covers `../x.ts`, `spec/a/x_spec.rb`
// covers `app/a/x.rb`. Falls back to a unique basename match in the layer.
export function subjectOf(testPath, paths) {
  const set = new Set(paths);
  const stem = testPath.replace(/\.(e2e[.-])?(spec|test)(\.e2e)?(?=\.[cm]?[jt]sx?$)/, '').replace(/_spec\.rb$/, '.rb');
  const candidates = [stem, stem.replace(/\/__tests__\//, '/'), stem.replace(/(^|\/)spec\//, '$1app/'), stem.replace(/(^|\/)(test|tests|e2e)\//, '$1src/')];
  for (const c of candidates) if (c !== testPath && set.has(c)) return c;
  const base = stem.split('/').pop();
  const same = paths.filter((p) => p !== testPath && p.split('/').pop() === base);
  return same.length === 1 ? same[0] : null;
}

// Stored data first when the layer changes it: a schema costs the most to
// change later, so every layer above it follows from it. Otherwise the entry
// first, in the order the walk runs.
export function defaultOrder(files) {
  const stored = files.filter((f) => f.tier === 'storage' && f.kind !== 'test').length;
  return stored
    ? { order: 'storage', reason: `This PR changes stored data in ${stored} ${stored === 1 ? 'file' : 'files'}, so the reading starts there: a schema costs the most to change later, and the code above it follows from it.` }
    : { order: 'entry', reason: 'This PR changes no stored data, so the reading follows the request from where it enters, in the order the walk runs.' };
}

// files: the layer's index files; firstStop(path) and homeOf(hunkId) come from
// the outline. Returns plain data for the page.
export function filesOf(files, { firstStop, homeOf }) {
  const paths = files.map((f) => f.path);
  const rows = files.map((f) => ({
    p: f.path,
    s: f.status,
    a: f.adds,
    d: f.dels,
    k: f.kind,
    b: f.binary || !f.hunks.length ? (f.binary ? 'binary file' : 'no text hunks (mode or rename only)') : '',
    n: f.hunks.length,
    t: f.kind === 'test' ? 'test' : tierOf(f.path, f.kind),
    first: firstStop(f.path),
    homes: f.hunks.map((h) => homeOf(h.id) ?? ''),
    tests: [],
    of: null,
  }));
  const at = new Map(rows.map((r, i) => [r.p, i]));
  for (const r of rows) {
    if (r.t !== 'test') continue;
    const subject = subjectOf(r.p, paths.filter((p) => rows[at.get(p)].t !== 'test'));
    if (subject === null) continue;
    r.of = at.get(subject);
    rows[r.of].tests.push(at.get(r.p));
  }
  const { order, reason } = defaultOrder(rows.map((r) => ({ tier: r.t, kind: r.k })));
  return { order, reason, files: rows };
}

// Groups for one order. Storage: tiers bottom-up, deepest stop first inside a
// tier. Entry: one group per stop that first cites a file, in walk order,
// then the files no stop cites, by tier. Tests with a subject ride on it.
export function groupsOf(view, order, stopLabel) {
  const own = view.files.map((f, i) => ({ f, i })).filter(({ f }) => f.of === null);
  const byTier = (list) =>
    RANK.map((t) => ({ key: t, label: TIERS.find((x) => x.id === t).label, items: list.filter(({ f }) => f.t === t) }))
      .concat([{ key: 'test', label: 'tests with no changed subject', items: list.filter(({ f }) => f.t === 'test') }])
      .filter((g) => g.items.length);
  if (order === 'storage') {
    return byTier(own).map((g) => ({ ...g, items: [...g.items].sort((a, b) => (b.f.first ?? -1) - (a.f.first ?? -1) || a.f.p.localeCompare(b.f.p)).map(({ i }) => i) }));
  }
  const cited = own.filter(({ f }) => f.first !== null && f.t !== 'test').sort((a, b) => a.f.first - b.f.first || a.f.p.localeCompare(b.f.p));
  const groups = [];
  for (const { f, i } of cited) {
    const last = groups.at(-1);
    if (last && last.stop === f.first) last.items.push(i);
    else groups.push({ key: `s${f.first}`, stop: f.first, label: stopLabel(f.first), items: [i] });
  }
  const rest = own.filter(({ f }) => f.first === null || f.t === 'test');
  return groups.concat(byTier(rest).map((g) => ({ ...g, key: `rest-${g.key}`, label: `not in the walk · ${g.label}`, items: g.items.map(({ i }) => i) })));
}
