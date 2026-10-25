#!/usr/bin/env node
// The page's speed, checked. Each interaction a reader makes runs on a fresh
// page while Chrome traces the page's main thread, a few times over, and the
// median of each measure meets its budget or the check fails.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> node walkthrough/perf.mjs page.html [--runs 3] [--json out.json] [scenario ...]
//
// Measures, in milliseconds on the page's main thread:
//   inp   the slowest input from the event to the next paint (Event Timing);
//   task  the longest task;
//   busy  every task added up;
//   jank  the tasks long enough to drop a frame (over 33 ms).
// Budgets hold in headless Chrome, whose software raster costs more than a
// laptop's GPU; a page that meets them here feels instant there.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const runs = Number(opt('--runs', '3'));
const jsonOut = opt('--json', null);
const [file, ...only] = args;
if (!file) {
  console.error('usage: node walkthrough/perf.mjs page.html [--runs 3] [--json out.json] [scenario ...]');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core'));
} catch {
  console.error('perf.mjs drives Chrome through playwright-core: set PLAYWRIGHT_CORE to its entry file, or run where it resolves.');
  process.exit(2);
}
const url = `file://${path.resolve(file)}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });

// Every input from here on reports how long it took to paint.
const EVENTS = `window.wtPerf = { events: [] };
new PerformanceObserver((l) => { for (const e of l.getEntries()) window.wtPerf.events.push({ name: e.name, at: e.startTime, d: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });`;

const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'];

async function openPage(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(EVENTS);
  // Web fonts come from another host; the check measures the page, not the network.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
  if (hash !== null) {
    await page.goto(url + hash, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
  }
  return { ctx, page };
}

// A click lands where the element is, so the driver resolves nothing while
// the trace runs: its selector engine on a DOM this size costs more than the page.
async function pointAt(page, find, arg) {
  const el = await page.evaluateHandle(find, arg);
  return el.evaluate((e) => {
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 };
  });
}

async function traced(page, act, windowMs) {
  await browser.startTracing(page, { categories: CATS });
  await page.evaluate(() => performance.mark('perf-start'));
  await act();
  await page.waitForTimeout(windowMs);
  await page.evaluate(() => performance.mark('perf-end'));
  const buf = await browser.stopTracing();
  const since = await page.evaluate(() => performance.getEntriesByName('perf-start').at(-1).startTime);
  const events = await page.evaluate((t) => window.wtPerf.events.filter((e) => e.at >= t), since);
  return measure(JSON.parse(buf.toString('utf8')).traceEvents, events);
}

function measure(trace, inputs) {
  const start = trace.find((e) => e.name === 'perf-start');
  const end = trace.find((e) => e.name === 'perf-end');
  if (!start || !end) throw new Error('the trace lost its marks');
  const tasks = trace.filter((e) => e.pid === start.pid && e.tid === start.tid && e.name === 'RunTask' && e.ph === 'X' && e.ts >= start.ts && e.ts <= end.ts);
  const ms = tasks.map((e) => e.dur / 1000);
  return {
    inp: Math.max(0, ...inputs.map((e) => e.d)),
    task: Math.max(0, ...ms),
    busy: ms.reduce((a, b) => a + b, 0),
    jank: ms.filter((d) => d > 33).length,
  };
}

async function loadRun() {
  const { ctx, page } = await openPage(null);
  await browser.startTracing(page, { categories: CATS });
  await page.goto(`${url}#c-open`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const buf = await browser.stopTracing();
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
  const trace = JSON.parse(buf.toString('utf8')).traceEvents;
  // The page's own renderer is the one that parsed its HTML.
  const parse = trace.find((e) => e.name === 'ParseHTML');
  const tasks = trace.filter((e) => parse && e.pid === parse.pid && e.tid === parse.tid && e.name === 'RunTask' && e.ph === 'X').map((e) => e.dur / 1000);
  await ctx.close();
  return { fcp, task: Math.max(0, ...tasks), busy: tasks.reduce((a, b) => a + b, 0), jank: tasks.filter((d) => d > 33).length };
}

// What the page holds, read once: its PR chapters from the most stops to the
// fewest, how many acts its flow tells, and a word from its glossary.
async function survey() {
  const { ctx, page } = await openPage('#c-open');
  const facts = await page.evaluate(() => ({
    prs: [...document.querySelectorAll('.chapter')]
      .filter((c) => c.querySelector('[data-walk]'))
      .map((c) => ({ id: c.dataset.chapter, stops: c.querySelectorAll('.stop').length }))
      .sort((a, b) => b.stops - a.stops)
      .map((c) => c.id),
    acts: document.querySelectorAll('[data-seqs] .seq').length,
    hops: document.querySelectorAll('.flow-map .dot').length,
    answers: document.querySelectorAll('#c-close .qa-ans a.to-stop').length,
    term: document.querySelector('#c-close .gloss .term')?.dataset.term ?? '',
    // A hand-painted page walks through page.js instead (kits/interactivity.md, Hand-painted pages).
    kitItems: document.querySelector('[data-page]') ? document.querySelectorAll('[data-page] [data-part="item"]').length : 0,
  }));
  await ctx.close();
  return facts;
}
const pageFacts = await survey();
const pr = (i) => `#${pageFacts.prs[i % pageFacts.prs.length]}`;

// Each scenario opens its page, sets up, and times one act, or says why the
// page has nothing to time. A chapter nobody has opened yet is the costliest
// to land in, so every run lands in a chapter the page has not shown.
const SCENARIOS = {
  load: { budget: { fcp: 1500, task: 150, busy: 900 }, run: loadRun },
  land: {
    budget: { inp: 100, task: 70, jank: 2 },
    skip: () => !pageFacts.answers && 'the close links no stop',
    async run(i) {
      const { ctx, page } = await openPage('#c-close');
      await page.evaluate(() => document.querySelectorAll('#c-close .qa-ans').forEach((d) => (d.open = true)));
      await page.waitForTimeout(300);
      const at = await pointAt(page, (k) => { const all = [...document.querySelectorAll('#c-close .qa-ans a.to-stop')].filter((a) => a.checkVisibility()); return all[k % all.length]; }, i);
      await page.waitForTimeout(400);
      const r = await traced(page, () => page.mouse.click(at.x, at.y), 1500);
      await ctx.close();
      return r;
    },
  },
  chapter: {
    budget: { inp: 80, task: 50, jank: 1 },
    skip: () => !pageFacts.prs.length && 'no PR chapter',
    async run(i) {
      const { ctx, page } = await openPage(pr(i));
      const r = await traced(page, () => page.keyboard.press(']'), 1200);
      await ctx.close();
      return r;
    },
  },
  stop: {
    budget: { inp: 64, task: 40, jank: 0 },
    skip: () => !pageFacts.prs.length && 'no PR chapter',
    async run() {
      const { ctx, page } = await openPage(pr(0));
      await page.keyboard.press('k');
      await page.waitForTimeout(800);
      const r = await traced(
        page,
        async () => {
          for (let n = 0; n < 3; n++) {
            await page.keyboard.press('k');
            await page.waitForTimeout(500);
          }
        },
        300,
      );
      await ctx.close();
      return r;
    },
  },
  hop: {
    budget: { inp: 64, task: 25, jank: 0 },
    skip: () => pageFacts.hops < 5 && 'the flow has under five hops',
    async run() {
      const { ctx, page } = await openPage('#c-open');
      const at = await pointAt(page, () => document.querySelector('.flow-map .dot[data-hop-i="1"]'));
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(1200);
      const r = await traced(
        page,
        async () => {
          for (let n = 0; n < 3; n++) {
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(700);
          }
        },
        300,
      );
      await ctx.close();
      return r;
    },
  },
  slide: {
    budget: { inp: 64, task: 33, jank: 0 },
    skip: () => pageFacts.acts < 2 && 'the flow tells one act',
    async run(i) {
      const { ctx, page } = await openPage('#c-open');
      // The last hop of an act, so the next step slides the act diagram.
      const last = await page.evaluate((k) => {
        const figs = [...document.querySelectorAll('[data-seqs] .seq')];
        const f = figs[k % (figs.length - 1)];
        return Math.max(...[...f.querySelectorAll('.sq-row')].map((r) => Number(r.dataset.hopI)));
      }, i);
      const at = await pointAt(page, (h) => document.querySelector(`.flow-map .dot[data-hop-i="${h}"]`), last);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(1600);
      const r = await traced(page, () => page.keyboard.press('ArrowRight'), 1200);
      await ctx.close();
      return r;
    },
  },
  files: {
    // The view's first files lay out over a frame or two as they arrive,
    // with nothing moving on screen to stutter.
    budget: { inp: 100, task: 60, jank: 2 },
    skip: () => !pageFacts.prs.length && 'no PR chapter',
    async run(i) {
      const { ctx, page } = await openPage(pr(i));
      const r = await traced(page, () => page.keyboard.press('d'), 1500);
      await ctx.close();
      return r;
    },
  },
  scroll: {
    budget: { task: 33, jank: 0 },
    skip: () => !pageFacts.prs.length && 'no PR chapter',
    async run() {
      const { ctx, page } = await openPage(pr(0));
      await page.mouse.move(700, 450);
      const r = await traced(
        page,
        async () => {
          for (let n = 0; n < 30; n++) {
            await page.mouse.wheel(0, 240);
            await page.waitForTimeout(16);
          }
        },
        600,
      );
      await ctx.close();
      return r;
    },
  },
  search: {
    budget: { inp: 40, task: 20, jank: 0 },
    skip: () => pageFacts.term.length < 3 && 'no glossary',
    async run() {
      const { ctx, page } = await openPage(pr(0));
      await page.keyboard.press('t');
      await page.waitForTimeout(600);
      // A term's first letters with one slip, the way a reader types.
      const word = pageFacts.term.replace(/[^a-z]/gi, '').slice(0, 6);
      const r = await traced(page, () => page.keyboard.type(`${word.slice(0, 3)}${word.slice(4)}`, { delay: 120 }), 600);
      await ctx.close();
      return r;
    },
  },
  part: {
    budget: { inp: 64, task: 40, jank: 0 },
    skip: () => pageFacts.kitItems < 3 && 'no page.js parts',
    async run() {
      const { ctx, page } = await openPage('');
      await page.keyboard.press('k');
      await page.waitForTimeout(800);
      const r = await traced(
        page,
        async () => {
          for (let n = 0; n < 3; n++) {
            await page.keyboard.press('k');
            await page.waitForTimeout(500);
          }
        },
        300,
      );
      await ctx.close();
      return r;
    },
  },
  mark: {
    budget: { inp: 64, task: 40, jank: 0 },
    skip: () => pageFacts.kitItems < 3 && 'no page.js parts',
    async run() {
      const { ctx, page } = await openPage('');
      await page.evaluate(() => localStorage.clear());
      // Step onto the first item, where x marks.
      for (let n = 0; n < 12; n++) {
        if (await page.evaluate(() => document.querySelector('.wtp-cur')?.dataset.part === 'item')) break;
        await page.keyboard.press('k');
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(500);
      const r = await traced(page, () => page.keyboard.press('x'), 800);
      await ctx.close();
      return r;
    },
  },
  sheet: {
    budget: { inp: 64, task: 40, jank: 0 },
    skip: () => pageFacts.kitItems < 3 && 'no page.js parts',
    async run() {
      const { ctx, page } = await openPage('');
      const r = await traced(page, () => page.keyboard.press('?'), 500);
      await ctx.close();
      return r;
    },
  },
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const results = {};
let failed = 0;
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (only.length && !only.includes(name)) continue;
  const why = sc.skip?.();
  if (why) {
    console.log(`skip ${name.padEnd(8)} ${why}`);
    continue;
  }
  const all = [];
  for (let i = 0; i < runs; i++) all.push(await sc.run(i));
  const med = Object.fromEntries(Object.keys(all[0]).map((k) => [k, median(all.map((r) => r[k]))]));
  results[name] = { median: med, runs: all, budget: sc.budget };
  const over = Object.entries(sc.budget).filter(([k, b]) => med[k] > b);
  failed += over.length ? 1 : 0;
  const shown = Object.entries(med)
    .map(([k, v]) => `${k} ${Math.round(v)}${sc.budget[k] !== undefined ? `/${sc.budget[k]}` : ''}`)
    .join('  ');
  console.log(`${over.length ? 'FAIL' : 'ok  '} ${name.padEnd(8)} ${shown}${over.length ? `  · over: ${over.map(([k]) => k).join(', ')}` : ''}`);
}
await browser.close();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
console.log(failed ? `${failed} over budget` : 'every interaction within budget');
process.exit(failed ? 1 : 0);
