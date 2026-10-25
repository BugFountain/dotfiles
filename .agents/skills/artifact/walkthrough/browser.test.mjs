// What the runtime shows a reader in Chrome: the hunks a whole-file link
// opens on a page that splits one PR into chapters, where a comment on such
// a page pins and reopens, that a wide payload shape scrolls inside its stop,
// and where Back lands a hand-painted page after a reload. Runs where playwright-core and a Chrome resolve (PLAYWRIGHT_CORE,
// CHROMIUM, as page-check.mjs reads them) and skips elsewhere, unless
// ARTIFACT_BROWSER_REQUIRED is set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexRange } from './diff-index.mjs';
import { renderPage } from './render.mjs';

let browser = null;
try {
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
} catch (e) {
  // An agent sets this when running the suite (README, Tests), so a broken
  // install fails the run instead of skipping the browser tests.
  if (process.env.ARTIFACT_BROWSER_REQUIRED) throw e;
}
const skip = browser ? false : 'needs playwright-core and Chrome (PLAYWRIGHT_CORE, CHROMIUM)';
const root = mkdtempSync(join(tmpdir(), 'walkthrough-browser-'));
test.after(async () => {
  await browser?.close();
  rmSync(root, { recursive: true, force: true });
});

// `comments` stands in for claude.ai's comments: it hands the page its
// threads and records where the page places each one's pin.
async function open(file, { comments = false } = {}) {
  const page = await browser.newPage();
  if (comments)
    await page.addInitScript(() => {
      const api = {
        customAnchors: async (h) => {
          window.__shell = h;
          return { placed: (map) => (window.__pins = map), compose: async () => {} };
        },
      };
      window.claude = { use: async (name) => (name === 'comments' ? api : Promise.reject(new Error('off'))) };
    });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`file://${file}`, { waitUntil: 'load' });
  return page;
}

// One PR in two flow chapters: c1 homes inbox.ts, c2 homes its test, and
// each chapter's stop 01 and first takeaway say something of their own.
let split = null;
function splitPage() {
  if (split) return split;
  const repo = join(root, 'repo');
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  mkdirSync(repo);
  git('init', '-q');
  writeFileSync(join(repo, 'inbox.ts'), 'export function record(cmd) {\n  return cmd;\n}\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'inbox.ts'), 'export function record(cmd) {\n  if (seen(cmd.id)) return null;\n  return cmd;\n}\n');
  writeFileSync(join(repo, 'inbox.spec.ts'), "it('drops a redelivered command', () => {});\n");
  git('add', '.');
  git('commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  const layers = join(root, 'layers');
  mkdirSync(join(layers, 'l1'), { recursive: true });
  writeFileSync(join(layers, 'l1', 'hunks.json'), JSON.stringify({ layer: 'l1', base, head, files: indexRange({ repo, base, head }).files }));
  const chapter = (id, hunk, flag, takeaway) => ({
    id,
    layer: 'l1',
    title: `Flow ${id}`,
    gist: 'The inbox drops a command it has seen.',
    intent: 'Drop duplicates.',
    entry: 'A message arrives.',
    takeaways: [{ text: takeaway, severity: 'info' }],
    stops: [{ id: `${id}-s1`, title: 'Record the command', gist: 'The consumer records the command.', kind: 'core', frame: { file: 'inbox.ts', symbol: 'record', line: 1 }, wake: { via: 'call' }, stack: [{ symbol: 'record', changed: true }], detail: 'A seen command returns null.', anchors: [{ hunk, role: 'home', label: 'Drops a seen command.' }], proof: [], flags: [flag], transition: '' }],
    housekeeping: [],
    everythingElse: [],
    qa: [],
    selfCheck: [],
    claims: [],
  });
  const outline = {
    version: 1,
    kind: 'pr',
    title: 'Inbox',
    repo: 'acme/app',
    intro: { intent: 'Drop duplicates.', before: 'Duplicates ran twice.', after: 'Duplicates stop at the inbox.', takeaways: [{ text: 'One.', severity: 'info' }] },
    layers: [{ id: 'l1', pr: 9510, title: 'Inbox', base, head }],
    spine: { lanes: [{ id: 'runtime', title: 'Runtime' }], hops: [] },
    chapters: [chapter('c1', 'inbox.ts#h1', { type: 'dormant', text: 'Nothing calls it yet.' }, 'Only the consumer records commands.'), chapter('c2', 'inbox.spec.ts#h1', { type: 'interim', text: 'The test stands in for the consumer.' }, 'Only the test checks duplicates.')],
  };
  const file = join(root, 'split.html');
  writeFileSync(file, renderPage({ outline, layersDir: layers, scenesSource: '' }));
  split = { file, head, outline, layers };
  return split;
}

test("a whole-file link in a PR's first chapter opens the file with its hunks", { skip }, async () => {
  const page = await open(splitPage().file);
  await page.evaluate(() => (location.hash = '#c1'));
  await page.waitForTimeout(300);
  const href = await page.getAttribute('#c1 figure.hunk[data-hunk="inbox.ts#h1"] a.file-link', 'href');
  await page.click('#c1 figure.hunk[data-hunk="inbox.ts#h1"] a.file-link');
  await page.waitForTimeout(600);
  const i = href.split('/').pop();
  const shown = await page.evaluate((id) => document.getElementById(id)?.querySelectorAll('.fv-body figure.hunk').length ?? -1, `c1-f${i}`);
  assert.equal(shown, 1);
  await page.close();
});

// A split PR repeats a stop's number in each chapter; a comment reopens on
// the copy its anchor names.
test("a flag comment on a split PR reopens on the chapter whose flag it names", { skip }, async () => {
  const page = await open(splitPage().file, { comments: true });
  await page.waitForFunction(() => window.__shell);
  await page.evaluate(() => window.__shell.threads([{ id: 'flag', anchor: '#9510 stop 01 flag: interim behavior' }]));
  await page.evaluate(() => window.__shell.reveal('flag'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('.chapter:not([hidden])')?.dataset.chapter), 'c2');
  await page.close();
});

// A comment on one chapter's takeaway or flag pins only while that chapter
// shows, never on the other chapter's copy in the same place.
test("a split PR's takeaway and flag comments pin only on the chapter they name", { skip }, async () => {
  const page = await open(splitPage().file, { comments: true });
  await page.waitForFunction(() => window.__shell);
  const pins = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__shell.threads([{ id: 'take', anchor: '#9510 takeaway 1: Only the test checks duplicates.' }, { id: 'flag', anchor: '#9510 stop 01 flag: interim behavior' }]));
    await page.waitForTimeout(200);
    return page.evaluate(() => Object.keys(window.__pins ?? {}).sort());
  };
  assert.deepEqual(await pins('#c2'), ['flag', 'take']);
  assert.deepEqual(await pins('#c1'), []);
  await page.close();
});

// A split PR draws a file's header in each chapter's file view; a comment's
// pin stands on the copy in view.
test("a whole-file comment pins on the header in a later chapter's file view", { skip }, async () => {
  const { file, head } = splitPage();
  const page = await open(file, { comments: true });
  await page.waitForFunction(() => window.__shell);
  await page.evaluate(() => (location.hash = '#c2/files/0'));
  await page.waitForTimeout(400);
  await page.evaluate((anchor) => window.__shell.threads([{ id: 'file', anchor }]), `#9510@${head.slice(0, 7)} inbox.ts whole file`);
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => window.__pins?.file));
  await page.close();
});

// A hand-painted page with an opening, a chapter and a close, each a screen tall.
// A hand-painted page with the kit inlined in the order kits/interactivity.md
// gives; `body` replaces its three plain parts.
function handPainted(name = 'hand', body = null) {
  const runtime = (f) => readFileSync(new URL(`./runtime/${f}`, import.meta.url), 'utf8');
  const part = (id, kind, next) => `<section id="${id}" data-part="${kind}" style="min-height:120vh"><h2>${id}</h2>${next ? `<a href="#${next}">on to ${next}</a>` : ''}</section>`;
  const file = join(root, `${name}.html`);
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><style>${runtime('page.css')}</style><main data-page="t">${body ?? part('opening', 'head', 'ch1') + part('ch1', 'item', 'close') + part('close', 'item')}</main>${['layers.js', 'markup.js', 'keys.js', 'disclose.js', 'trail.js', 'page.js'].map((f) => `<script>${runtime(f)}</script>`).join('')}`,
  );
  return file;
}

// One group under a long title, its two items each holding a fold.
const LONG = 'How the command consumer records incoming messages and avoids processing duplicate deliveries';
const grouped = (title = LONG) =>
  handPainted(
    'grouped',
    `<section data-part="head" id="top"><h1>t</h1></section><details data-part="group" id="g" open><summary>${title}</summary>${['g1', 'g2'].map((id) => `<section data-part="item" id="${id}"><h3>${id}</h3><details id="${id}-d" open><summary>more</summary><p>detail</p></details></section>`).join('')}</details>`,
  );

test("a payload shape wider than the stop scrolls inside the stop on a phone, and with the arrows", { skip }, async () => {
  const { outline, layers } = splitPage();
  const wide = structuredClone(outline);
  wide.chapters[0].stops[0].payload = { in: { label: 'Command', shape: `{ id: string; ${'field: string; '.repeat(20)}}` }, out: { label: 'nothing' } };
  const file = join(root, 'payload.html');
  writeFileSync(file, renderPage({ outline: wide, layersDir: layers, scenesSource: '' }));
  const page = await open(file);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`file://${file}#c1`);
  const box = await page.evaluate(() => {
    const d = document.querySelector('.payload details.io');
    d.open = true;
    const pre = d.querySelector('.code-block');
    return { stop: pre.closest('.stop-body').getBoundingClientRect().right, pre: pre.getBoundingClientRect().right, scrolls: pre.scrollWidth > pre.clientWidth };
  });
  assert.ok(box.pre <= box.stop + 0.5, `the shape ends at ${box.pre}px, past the stop at ${box.stop}px`);
  assert.ok(box.scrolls, 'the shape scrolls inside its block');
  // The runtime makes the block a Tab stop once it measures it wide.
  const pre = page.locator('.payload .code-block');
  const stop = await pre.evaluate((el) => new Promise((done) => (function wait(n) { el.tabIndex === 0 || !n ? done(el.tabIndex) : setTimeout(wait, 20, n - 1); })(50)));
  assert.equal(stop, 0, 'the wide shape is a Tab stop');
  const before = await page.evaluate(() => location.hash);
  await pre.focus();
  await page.keyboard.press('ArrowRight');
  // The browser's own arrow scroll is smooth, so it lands over a few frames.
  const after = await pre.evaluate((el) => new Promise((done) => (function wait(n) { el.scrollLeft > 0 || !n ? done({ hash: location.hash, left: el.scrollLeft }) : setTimeout(wait, 20, n - 1); })(50)));
  await page.close();
  assert.equal(after.hash, before, 'ArrowRight on the shape stays on its stop');
  assert.ok(after.left > 0, 'ArrowRight scrolls the shape');
});

test("a hand-painted page's navigator keeps every control on screen under a long group title", { skip }, async () => {
  for (const [width, title] of [[700, LONG], [1000, `${LONG}, ${LONG}`]]) {
    const file = grouped(title);
    const page = await open(file);
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`file://${file}#g1`);
    await page.waitForFunction(() => document.querySelector('[data-navi] [data-where]')?.textContent.includes('avoids'));
    const off = await page.evaluate(() => [...document.querySelectorAll('[data-navi] .nb:not([hidden])')].map((b) => ({ act: b.dataset.act, r: b.getBoundingClientRect() })).filter(({ r }) => r.left < 0 || r.right > innerWidth).map(({ act }) => act));
    await page.close();
    assert.deepEqual(off, [], `controls off screen at ${width}px`);
  }
});

test("a hand-painted page's fold control follows the group's folds, from z and from a click", { skip }, async () => {
  const file = grouped();
  const page = await open(file);
  await page.goto(`file://${file}#g1`);
  await page.waitForFunction(() => document.querySelector('.wtp-cur')?.id === 'g1');
  const state = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-navi] [data-act="fold"]');
      return { expanded: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'), unfoldShown: !b.querySelector('[data-out]').hasAttribute('hidden'), open: [...document.querySelectorAll('#g details')].some((d) => d.open) };
    });
  assert.deepEqual(await state(), { expanded: 'true', label: 'fold the group', unfoldShown: false, open: true });
  await page.keyboard.press('z');
  assert.deepEqual(await state(), { expanded: 'false', label: 'open the group', unfoldShown: true, open: false });
  await page.click('[data-navi] [data-act="fold"]');
  assert.deepEqual(await state(), { expanded: 'true', label: 'fold the group', unfoldShown: false, open: true });
  await page.close();
});

test("a hand-painted page's fold control shows the group a link lands in", { skip }, async () => {
  const item = (id, open, link = '') => `<section data-part="item" id="${id}" style="min-height:120vh"><h3>${id}</h3>${link}<details id="${id}-d"${open ? ' open' : ''}><summary>more</summary><p>detail</p></details></section>`;
  const file = handPainted(
    'two-groups',
    `<section data-part="head" id="top"><h1>t</h1></section><details data-part="group" id="ga" open><summary>Group A</summary>${item('a1', true, '<a href="#b1">on to b1</a>')}</details><details data-part="group" id="gb" open><summary>Group B</summary>${item('b1', false)}</details>`,
  );
  const page = await open(file);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`file://${file}#a1`);
  await page.waitForFunction(() => document.querySelector('.wtp-cur')?.id === 'a1');
  await page.click('#a1 a');
  await page.waitForFunction(() => document.querySelector('.wtp-cur')?.id === 'b1');
  const b = await page.evaluate(() => {
    const el = document.querySelector('[data-navi] [data-act="fold"]');
    return { expanded: el.getAttribute('aria-expanded'), label: el.getAttribute('aria-label') };
  });
  await page.close();
  assert.deepEqual(b, { expanded: 'false', label: 'open the group' });
});

test('Back to the empty fragment after a reload returns a hand-painted page to its opening', { skip }, async () => {
  const page = await open(handPainted());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#opening a');
  await page.click('#ch1 a');
  await page.reload({ waitUntil: 'load' });
  await page.goBack();
  await page.waitForTimeout(200);
  await page.goBack();
  await page.waitForTimeout(200);
  const at = await page.evaluate(() => ({ hash: location.hash, cur: document.querySelector('.wtp-cur')?.id ?? null, y: Math.round(scrollY) }));
  assert.deepEqual(at, { hash: '', cur: null, y: 0 });
  await page.close();
});

// With ARTIFACT_BROWSER_REQUIRED set, a browser that fails to launch must
// fail the suite rather than skip it.
test('fails, not skips, when the browser is required and does not launch', { skip: process.env.WALKTHROUGH_CHILD && 'inside its own run' }, () => {
  const env = { ...process.env, ARTIFACT_BROWSER_REQUIRED: '1', PLAYWRIGHT_CORE: join(root, 'no-playwright.mjs'), WALKTHROUGH_CHILD: '1' };
  // The runner marks its own children; this run reports for itself.
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', new URL(import.meta.url).pathname], { env, encoding: 'utf8' });
  assert.notEqual(run.status, 0, run.stdout);
});
