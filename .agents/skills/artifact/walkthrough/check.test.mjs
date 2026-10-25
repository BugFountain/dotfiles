// The checker is the gate between an agent's outline and a published page:
// it must accept an outline that homes every hunk and reject one that drops a
// hunk, invents one, or cites a frame that is not at its line. The renderer is
// the second gate: it refuses a page the browser would parse apart, and it
// lights a call site's own line in its lens. Runs
// against a real two-commit git repository, indexed by diff-index.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexRange } from './diff-index.mjs';
import { check, lintProse, lintTitle, loadLayer, validate } from './check.mjs';
import { missingLinks, renderPage } from './render.mjs';

const root = mkdtempSync(join(tmpdir(), 'walkthrough-check-'));
const repo = join(root, 'repo');
const layers = join(root, 'layers');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();

mkdirSync(repo);
git('init', '-q');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'test');
writeFileSync(join(repo, 'inbox.ts'), ['export function record(cmd) {', '  return cmd;', '}', ''].join('\n'));
git('add', '.');
git('commit', '-qm', 'base');
const base = git('rev-parse', 'HEAD');
writeFileSync(join(repo, 'inbox.ts'), ['export function record(cmd) {', '  if (seen(cmd.id)) return null;', '  return cmd;', '}', '', 'export function consume(msg) {', '  return record(msg);', '}', ''].join('\n'));
writeFileSync(join(repo, 'inbox.spec.ts'), ["it('drops a redelivered command', () => {});", ''].join('\n'));
git('add', '.');
git('commit', '-qm', 'head');
const head = git('rev-parse', 'HEAD');

const { files } = indexRange({ repo, base, head });
mkdirSync(join(layers, 'l1'), { recursive: true });
writeFileSync(join(layers, 'l1', 'hunks.json'), JSON.stringify({ layer: 'l1', base, head, files }));

const hunkOf = (path) => files.find((f) => f.path === path).hunks[0].id;
const outline = () => ({
  version: 1,
  kind: 'pr',
  title: 'Inbox',
  repo: 'acme/app',
  intro: {
    intent: 'Drop duplicates.',
    before: 'Duplicates ran twice.',
    after: 'Duplicates stop at the inbox.',
    takeaways: [
      { text: 'One.', severity: 'info' },
      { text: 'Two.', severity: 'info' },
      { text: 'Three.', severity: 'important' },
    ],
  },
  layers: [{ id: 'l1', title: 'Inbox', base, head }],
  spine: { lanes: [{ id: 'runtime', title: 'Runtime' }], hops: [] },
  chapters: [
    {
      id: 'c1',
      layer: 'l1',
      title: 'Inbox',
      gist: 'The inbox drops a command it has seen.',
      intent: 'Drop duplicates.',
      entry: 'A message arrives.',
      stops: [
        {
          id: 'c1-s1',
          title: 'Record the command',
          gist: 'The consumer records the command first.',
          kind: 'core',
          frame: { file: 'inbox.ts', symbol: 'record', line: 1 },
          wake: { via: 'call', caller: { file: 'inbox.ts', symbol: 'consume', line: 7 } },
          stack: [
            { symbol: 'consume', changed: true },
            { symbol: 'record', changed: true },
          ],
          detail: 'A seen command returns null.',
          anchors: [{ hunk: hunkOf('inbox.ts'), role: 'home', label: 'Drops a seen command.' }],
          proof: [{ hunk: hunkOf('inbox.spec.ts'), role: 'home', name: 'drops a redelivered command' }],
          transition: '',
        },
      ],
      housekeeping: [],
      everythingElse: [],
      qa: [],
      selfCheck: [],
      claims: [],
    },
  ],
});
const run = (o) => check({ outline: o, layersDir: layers, repo });

test.after(() => rmSync(root, { recursive: true, force: true }));

test('accepts an outline that homes every hunk', () => {
  const result = run(outline());
  assert.deepEqual(result.errors, []);
  assert.equal(result.coverage[0].homed, result.coverage[0].hunks);
});

test('rejects a hunk with no home', () => {
  const o = outline();
  o.chapters[0].stops[0].proof = [];
  assert.match(run(o).errors.join('\n'), /inbox\.spec\.ts#h1 has no home/);
});

test('rejects an invented hunk id', () => {
  const o = outline();
  o.chapters[0].stops[0].anchors.push({ hunk: 'inbox.ts#h9', role: 'excerpt', label: 'x' });
  assert.match(run(o).errors.join('\n'), /inbox\.ts#h9 is not in layer l1/);
});

// A symlink that becomes a regular file must not drop its deletion from coverage.
test('refuses an index with two sections for one path', () => {
  const tc = join(root, 'typechange');
  const tgit = (...a) => execFileSync('git', ['-C', tc, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  mkdirSync(tc);
  tgit('init', '-q');
  writeFileSync(join(tc, 'target.ts'), 'a\n');
  symlinkSync('target.ts', join(tc, 'link'));
  tgit('add', '.');
  tgit('commit', '-qm', 'link');
  const from = tgit('rev-parse', 'HEAD');
  unlinkSync(join(tc, 'link'));
  writeFileSync(join(tc, 'link'), 'export const x = 1;\n');
  tgit('add', '.');
  tgit('commit', '-qm', 'file');
  const to = tgit('rev-parse', 'HEAD');
  const dir = join(root, 'typechange-layers');
  mkdirSync(join(dir, 'tc'), { recursive: true });
  writeFileSync(join(dir, 'tc', 'hunks.json'), JSON.stringify({ layer: 'tc', base: from, head: to, files: indexRange({ repo: tc, base: from, head: to }).files }));
  assert.throws(() => loadLayer(dir, 'tc'), /duplicate file path in layer tc: link/);
});

// The page copies hunks from the index and links the outline's commits; an
// index of another range shows code those links never reach.
test("rejects an index whose range is not the outline layer's", () => {
  const o = outline();
  o.layers[0].head = head.slice(0, 11);
  assert.deepEqual(run(o).errors, []);
  o.layers[0].head = base;
  assert.match(run(o).errors.join('\n'), new RegExp(`layer l1: hunks.json indexes head ${head.slice(0, 11)}, but the outline cites ${base.slice(0, 11)}`));
});

test('rejects a frame that is not at its line', () => {
  const o = outline();
  o.chapters[0].stops[0].frame.line = 40;
  assert.match(run(o).errors.join('\n'), /frame symbol record is not near inbox\.ts:40/);
});

test('rejects a call site that does not call the frame', () => {
  const o = outline();
  o.chapters[0].stops[0].wake.caller.line = 2;
  o.chapters[0].stops[0].frame = { file: 'inbox.ts', symbol: 'consume', line: 6 };
  assert.match(run(o).errors.join('\n'), /does not call consume/);
});

test('rejects an answer quote the stop prose does not hold', () => {
  const o = outline();
  o.chapters[0].qa = [{ question: 'What does a seen command return?', stops: ['c1-s1'], look: [{ stop: 'c1-s1', quote: 'A seen command returns null.' }] }];
  assert.deepEqual(run(o).errors, []);
  o.chapters[0].qa[0].look[0].quote = 'A seen command returns undefined.';
  assert.match(run(o).errors.join('\n'), /qa 0: the quote is not in the stop prose/);
});

test('warns when an outside-stack flag names a PR that is now a layer', () => {
  const o = outline();
  o.layers[0].pr = 4242;
  o.chapters[0].stops[0].flags = [{ type: 'outside-stack', text: 'The schema lands with #4242, which is not merged.' }];
  assert.match(run(o).warnings.join('\n'), /outside-stack flag names #4242, which is a layer/);
  o.chapters[0].stops[0].flags[0].text = 'The schema lands with #7, which is not merged.';
  assert.doesNotMatch(run(o).warnings.join('\n'), /outside-stack flag names/);
});

test('reads an answer quote the way the page renders its markup', () => {
  const o = outline();
  o.chapters[0].stops[0].detail = 'A seen command returns null. A retry key such as `cmd-*` matches **every** redelivery.';
  o.chapters[0].qa = [{ question: 'Which keys match?', stops: ['c1-s1'], look: [{ stop: 'c1-s1', quote: 'A retry key such as `cmd-*` matches' }] }];
  assert.deepEqual(run(o).errors, []);
  o.chapters[0].qa[0].look[0].quote = 'such as `cmd-*` matches **every';
  assert.match(run(o).errors.join('\n'), /qa 0: the quote cuts an emphasis/);
});

test('renders a glossary term inside a branch card without nesting a link', () => {
  const o = outline();
  o.glossary = [{ term: 'Inbox row', def: 'The stored copy of a command.' }];
  o.chapters[0].stops[0].decision = { question: 'Has the inbox seen the command?', branches: [{ id: 'seen', label: 'Seen', outcome: 'The inbox row exists, so the command returns null.' }] };
  const html = renderPage({ outline: o, layersDir: layers, scenesSource: '' });
  assert.match(html, /data-branch="seen">.*?<span class="term-ref" data-term="Inbox row"/);
});

test('gives a call site a lens of its lines at the head, marking the lines the layer adds', () => {
  const page = renderPage({ outline: outline(), layersDir: layers, scenesSource: '', repo });
  const lens = JSON.parse(/<script type="application\/json" id="wt-data">([\s\S]*?)<\/script>/.exec(page)[1]).lens['l1|inbox.ts|7'];
  assert.equal(lens.lines[lens.at - lens.from], '  return record(msg);');
  assert.deepEqual(lens.added, [5, 6, 7, 8]);
  assert.match(page, /<a class="loc"[^>]*data-lens="l1\|inbox\.ts\|7"/);
  assert.doesNotMatch(renderPage({ outline: outline(), layersDir: layers, scenesSource: '' }), /data-lens=/);
});

// A single PR may take one chapter per flow; each chapter keeps its own file
// order, and a hunk's whole-file link opens the chapter that homes it.
test('gives each chapter of one layer its own file view and links a hunk to its home chapter', () => {
  const o = outline();
  const c2 = structuredClone(o.chapters[0]);
  c2.id = 'c2';
  c2.stops[0].id = 'c2-s1';
  c2.stops[0].anchors = [{ hunk: hunkOf('inbox.spec.ts'), role: 'home', label: 'The test.' }];
  c2.stops[0].proof = [];
  o.chapters[0].stops[0].proof = [];
  o.chapters.push(c2);
  const page = renderPage({ outline: o, layersDir: layers, scenesSource: '' });
  const { files } = JSON.parse(/<script type="application\/json" id="wt-data">([\s\S]*?)<\/script>/.exec(page)[1]);
  const row = (ch, path) => files[ch].files.find((f) => f.p === path);
  assert.equal(row('c1', 'inbox.ts').first, 0);
  assert.equal(row('c2', 'inbox.ts').first, null);
  assert.equal(row('c2', 'inbox.spec.ts').first, 0);
  const i = files.c1.files.findIndex((f) => f.p === 'inbox.ts');
  assert.match(page, new RegExp(`data-hunk="inbox\\.ts#h1"[^]*?<a class="file-link" href="#c1/files/${i}">`));
});

test('finds a link target whose path holds a newline, and only the missing one', () => {
  const nl = join(root, 'newline');
  const ngit = (...a) => execFileSync('git', ['-C', nl, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  mkdirSync(nl);
  ngit('init', '-q');
  writeFileSync(join(nl, 'new\nline.ts'), 'a\n');
  ngit('add', '.');
  ngit('commit', '-qm', 'nl');
  const at = ngit('rev-parse', 'HEAD');
  assert.deepEqual(missingLinks(nl, [`${at}:new\nline.ts`, `${at}:gone.ts`]), [`${at}:gone.ts`]);
});

test('warns when a hop subtitle repeats its story line or another hop shows the same one', () => {
  const o = outline();
  const hop = (id, story) => ({ id, lane: 'runtime', from: 'Consumer', to: 'Inbox', label: 'a command', via: 'call', layer: 'l1', stop: 'c1-s1', proof: 'tested', story });
  o.spine.hops = [hop('h1', 'The consumer records the command first, before it acts.'), hop('h2', 'A redelivered command stops at the inbox.')];
  o.spine.acts = [{ id: 'a1', title: 'Arrive', hops: ['h1', 'h2'] }];
  const warnings = run(o).warnings.join('\n');
  assert.match(warnings, /hop h1's subtitle repeats 100% of its story line/);
  assert.doesNotMatch(warnings, /hop h2's subtitle repeats/);
  assert.match(warnings, /hops h1 and h2 show the same subtitle/);
  o.spine.hops[0].sub = '`record` inserts the row under a unique `command_id`';
  o.spine.hops[1].sub = '`consume` returns null for a seen command';
  assert.doesNotMatch(run(o).warnings.join('\n'), /subtitle/);
});

test('rejects a reference entry that names a missing hop or a short table row', () => {
  const o = outline();
  o.reference = [{ id: 'ref-inbox', title: 'the inbox', table: { head: ['key', 'why'], rows: [['command_id', 'one row per delivery'], ['tenant']] }, hops: ['h9'] }];
  const errors = run(o).errors.join('\n');
  assert.match(errors, /reference ref-inbox: no hop h9/);
  assert.match(errors, /reference ref-inbox: a row has 1 cells for 2 columns/);
  o.reference[0].table.rows.pop();
  o.reference[0].hops = [];
  assert.deepEqual(run(o).errors, []);
});

test('rejects a domain model arrow to an entity the chart lacks and a mark on a layer the outline lacks', () => {
  const o = outline();
  o.reference = [
    {
      id: 'model',
      title: 'the domain model',
      model: {
        entities: [{ id: 'command', name: 'command' }, { id: 'inbox', name: 'inbox row', mark: 'new', layer: 'l1' }],
        relations: [{ from: 'command', to: 'inbox', label: 'lands in', mark: 'new', layer: 'l1' }],
      },
    },
  ];
  assert.deepEqual(run(o).errors, []);
  o.reference[0].model.relations.push({ from: 'inbox', to: 'outbox', label: 'feeds' });
  o.reference[0].model.entities[1].layer = 'l2';
  const errors = run(o).errors.join('\n');
  assert.match(errors, /reference model: relation inbox feeds outbox names outbox, which the chart lacks/);
  assert.match(errors, /reference model: entity inbox marks layer l2, which the outline lacks/);
});

test('validate rejects a string shorter than the schema’s minLength', () => {
  const schema = { type: 'string', minLength: 12 };
  assert.deepEqual(validate('too short', schema), ['$: 9 chars, min 12']);
  assert.deepEqual(validate('a string past the minimum', schema), []);
});

const brief = () => ({
  title: 'what to know first',
  summary: 'New here? Open this.',
  skip: 'Skip it if you can say why a duplicate stops.',
  items: [{ id: 'inbox', term: 'Inbox', text: 'The table that records each command before the consumer acts.', links: [{ label: 'record the command', href: '#c1-s1' }], glossary: ['Inbox'] }],
  closing: 'The code starts at the first stop.',
});

test('a glossary term the brief defines shows the brief text and links to it', () => {
  const o = outline();
  o.brief = brief();
  o.glossary = [{ term: 'Inbox', def: 'A table.', stop: 'c1-s1' }];
  o.chapters[0].stops[0].detail = 'A seen command returns null, and the Inbox keeps it.';
  assert.deepEqual(run(o).errors, []);
  const html = renderPage({ outline: o, layersDir: layers, scenesSource: '' });
  assert.match(html, /<li id="brief-inbox">/);
  assert.match(html, /id="t-inbox"[^]*?<span class="def">The table that records each command before the consumer acts\.<\/span> <a class="to-brief" href="#brief-inbox">/);
  assert.match(html, /data-term="Inbox" data-def="The table that records each command before the consumer acts\."/);
});

test('rejects a brief link or hop that lands nowhere, and a term with neither a def nor a brief item', () => {
  const o = outline();
  o.brief = brief();
  o.brief.items[0].links.push({ label: 'gone', href: '#c1-s9' });
  o.brief.items[0].hop = 'h9';
  o.brief.items[0].glossary.push('Outbox');
  o.glossary = [{ term: 'Inbox' }, { term: 'Seen' }];
  const errors = run(o).errors.join('\n');
  assert.match(errors, /brief: item inbox links #c1-s9, which the page does not draw/);
  assert.match(errors, /brief: item inbox names no hop h9/);
  assert.match(errors, /brief: item inbox defines outbox, which the glossary lacks/);
  assert.match(errors, /term Seen: needs a def, or a brief item that names it/);
  assert.doesNotMatch(errors, /term Inbox:/);
});

// The words and the reading order a newcomer meets.
const withFlow = (o) => {
  const hop = (id, story, sub) => ({ id, lane: 'runtime', from: 'Consumer', to: 'Inbox', label: 'a command', via: 'call', layer: 'l1', stop: 'c1-s1', proof: 'tested', story, sub });
  o.spine.hops = Array.from({ length: 13 }, (_, i) => hop(`h${i}`, `Step ${i} of the command reaches the inbox table.`, `sub number ${i} names \`record\` line ${i}`));
  o.spine.acts = [{ id: 'a1', title: 'Arrive', hops: o.spine.hops.map((h) => h.id) }];
  return o;
};

test('warns on a term the intro uses before the brief defines it, not on one a section below uses, and on a stack page with no brief', () => {
  const o = outline();
  o.glossary = [{ term: 'Inbox', def: 'The table.' }, { term: 'Seen set', def: 'Ids already handled.' }];
  o.intro.intent = 'The inbox drops a command in the seen set.';
  o.brief = brief();
  const w = run(o).warnings.join('\n');
  assert.match(w, /brief: 1 glossary terms appear in the intro and takeaways and the brief defines none of them: Seen set \(the intent\)/);
  o.intro.intent = 'The inbox takes a command.';
  o.reference = [{ id: 'r1', title: 'r', text: 'The seen set holds handled ids.' }];
  assert.doesNotMatch(run(o).warnings.join('\n'), /brief: \d+ glossary terms/);
  delete o.brief;
  o.kind = 'stack';
  o.glossary.push(...['Alpha', 'Beta', 'Gamma'].map((term) => ({ term, def: 'x' })));
  o.intro.after = 'Alpha, beta and gamma stop at the inbox and the seen set.';
  assert.match(run(o).warnings.join('\n'), /brief: the intro and takeaways use \d+ glossary terms and the page has no brief/);
});

test('warns on a term prose writes ten times but the page marks once', () => {
  const o = outline();
  o.glossary = [{ term: 'recordId', def: 'The id of a record.' }];
  o.chapters[0].stops[0].detail = `${'The recordid moves on. '.repeat(10)}`;
  o.intro.intent = 'Each `recordId` is kept.';
  assert.match(run(o).warnings.join('\n'), /terms: "recordId" appears 11 times but marks 1/);
});

test('warns on two glossary terms that share a word', () => {
  const o = outline();
  o.glossary = [{ term: 'Drain', def: 'Applies events.' }, { term: 'Drain notification', def: 'What NOTIFY sends, not the drain itself.' }, { term: 'Heal', def: 'Runs owed work.' }, { term: 'Heal child', def: 'The task that runs the heal.' }, { term: 'Event claim', def: 'x' }, { term: 'Step-start claim', def: 'y' }, { term: 'Inbox', def: 'z' }];
  const w = run(o).warnings.join('\n');
  assert.match(w, /terms: "Drain" and "Drain notification" share the word "drain"/);
  assert.doesNotMatch(w, /"Heal child"|"Event claim"|"Inbox"/);
});

test('warns on interim wording in the flow and on an act past twelve hops', () => {
  const o = withFlow(outline());
  o.spine.hops[2].story = 'Through #4242 the consumer writes the row itself.';
  const w = run(o).warnings.join('\n');
  assert.match(w, /story: hop h2's story says "Through #4242"/);
  assert.match(w, /story: act a1 holds 13 hops; split it at 12 or fewer/);
  o.spine.acts = [{ id: 'a1', title: 'Arrive', hops: o.spine.hops.slice(0, 12).map((h) => h.id) }, { id: 'a2', title: 'Land', hops: ['h12'] }];
  assert.doesNotMatch(run(o).warnings.join('\n'), /holds \d+ hops/);
});

test("warns on a picture label citing a commit that is no layer's base or head", () => {
  const o = outline();
  const picture = (label) => ({ label, picture: 'a -> b' });
  o.reference = [{ id: 'old-new', title: 'old against new', compare: { before: picture(`base ${base.slice(0, 7)}`), after: picture('tip 1234abc') } }];
  const w = run(o).warnings.join('\n');
  assert.match(w, /reference old-new: label "tip 1234abc" cites 1234abc, which is no layer's base or head/);
  assert.doesNotMatch(w, new RegExp(base.slice(0, 7)));
});

test('warns on a takeaway that counts instead of naming, and not on a duration', () => {
  const o = outline();
  o.intro.takeaways[0].text = 'Three merges need a production check first.';
  o.intro.takeaways[1].text = 'An execution quiet for 6 hours fails as stalled.';
  o.intro.takeaways[2].text = 'Two BullMQ jobs go away.';
  const w = run(o).warnings.join('\n');
  assert.match(w, /takeaway 1 counts "Three merges"/);
  assert.match(w, /takeaway 3 counts "Two BullMQ jobs"/);
  assert.doesNotMatch(w, /takeaway 2 counts/);
});

const caveat = () => ({
  id: 'seen-in-memory',
  title: 'The seen set lives in memory',
  did: 'The inbox keeps the ids it has seen in process memory.',
  why: 'One pod consumes the topic today.',
  cost: 'A restart forgets the ids, so a redelivery after it runs twice.',
  fix: 'Keep the ids in a table keyed by command id.',
  planned: { label: 'the inbox plan', path: 'inbox.ts#consume' },
  where: ['c1-s1'],
  code: ['inbox.ts#consume'],
});

test('rejects a caveat without a reason or a planned fix, or one that names a stop the page lacks', () => {
  const o = outline();
  o.caveats = [caveat()];
  assert.deepEqual(run(o).errors, []);
  o.caveats[0].why = ' ';
  o.caveats[0].planned = { label: 'later' };
  o.caveats[0].where = ['c1-s9'];
  const errors = run(o).errors.join('\n');
  assert.match(errors, /caveat seen-in-memory: says nothing for why/);
  assert.match(errors, /caveat seen-in-memory: planned needs a label and a path or href/);
  assert.match(errors, /caveat seen-in-memory: names c1-s9, which is no stop or hop the page draws/);
});

test('rejects a repeated caveat id, a blank did, cost or fix, and a caveats slot that is doubled or empty', () => {
  const o = outline();
  const slot = (id) => ({ id, title: `known caveats ${id}`, caveats: true });
  o.reference = [slot('cav-a')];
  assert.match(run(o).errors.join('\n'), /reference cav-a: marks where the caveats draw, and the outline has none/);
  o.caveats = [caveat(), { ...caveat(), did: '', cost: ' ', fix: '' }];
  o.reference = [slot('cav-a'), slot('cav-b')];
  const errors = run(o).errors.join('\n');
  assert.match(errors, /caveat seen-in-memory: appears twice/);
  for (const k of ['did', 'cost', 'fix']) assert.match(errors, new RegExp(`caveat seen-in-memory: says nothing for ${k}`));
  assert.match(errors, /caveats: 2 reference entries mark where the caveats draw; keep one/);
});

test('marks each stop a caveat names and links its card to the code line at the tip', () => {
  const o = outline();
  o.caveats = [caveat()];
  const page = renderPage({ outline: o, layersDir: layers, scenesSource: '', repo });
  assert.match(page, /id="c1-s1"[\s\S]*?<a class="cav-mark" href="#cav-seen-in-memory"/);
  assert.match(page, /<details class="disclose ref ref-caveats" id="caveats">[\s\S]*?<article class="caveat" id="cav-seen-in-memory"/);
  assert.match(page, new RegExp(`<a class="to-stop xref" href="https://github.com/acme/app/blob/${head}/inbox.ts#L6"`));
});

// A plan that lives outside the repo opens as a link out; a code anchor the
// tip no longer holds still opens the file, with the anchor kept for the reader.
test('links an external plan out and keeps an anchor the tip lacks on the file link', () => {
  const o = outline();
  o.caveats = [{ ...caveat(), planned: { label: 'the inbox ticket', href: 'https://linear.app/acme/issue/INB-7' }, code: ['inbox.ts#nowhere'] }];
  const page = renderPage({ outline: o, layersDir: layers, scenesSource: '', repo });
  assert.match(page, /<a class="to-stop xref" href="https:\/\/linear.app\/acme\/issue\/INB-7" target="_blank" rel="noopener">/);
  assert.match(page, new RegExp(`href="https://github.com/acme/app/blob/${head}/inbox.ts#nowhere"`));
});

// The renderer writes words of its own around the outline's: headings, the
// keys sheet, keylines, controls. Those words follow WRITING.md like the
// outline's, and a heading names its content, never the reader's act.
test("the renderer's own words pass the voice rules the outline's do", () => {
  const page = renderPage({ outline: outline(), layersDir: layers, scenesSource: '', repo });
  const body = page.replace(/<(script|style|pre|code)\b[\s\S]*?<\/\1>/g, ' ').replace(/<figure class="hunk[\s\S]*?<\/figure>/g, ' ');
  const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const warnings = [];
  for (const m of body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/g)) lintTitle(text(m[2].replace(/<em>[\s\S]*?<\/em>/g, '')), `heading`, warnings);
  for (const m of body.matchAll(/<(p|dd|em|button|summary|span class="(?:keyline|k-idle|k-live)[^"]*")\b[^>]*>([\s\S]*?)<\/(?:p|dd|em|button|summary|span)>/g)) lintProse(text(m[2]), `chrome text "${text(m[2]).slice(0, 70)}"`, warnings);
  assert.deepEqual(warnings, []);
});
