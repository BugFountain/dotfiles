#!/usr/bin/env node
// What a page does, checked in Chrome at desktop and phone widths. On a
// hand-painted page, each key page.js gives the reader and what it changed.
// On a review page, every key its keys sheet lists pressed as a keyboard
// types it, a jump to another chapter and back by `b` and by the browser's
// Back, and the rule both kinds of page share: what peeks or answers a click
// looks interactive at rest, and nothing inert wears that look.
//
//   PLAYWRIGHT_CORE=<path to playwright-core> node walkthrough/page-check.mjs page.html
//
// Each line reads `ok` or `FAIL` with what the page showed; an act the page
// has nothing for, such as `t` without a glossary, reads `skip`.
import path from 'node:path';
import { unknownClasses } from './catalog.mjs';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node walkthrough/page-check.mjs page.html');
  process.exit(2);
}
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core'));
} catch {
  console.error('page-check.mjs drives Chrome through playwright-core: set PLAYWRIGHT_CORE to its entry file, or run where it resolves.');
  process.exit(2);
}
const url = `file://${path.resolve(file)}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
let failed = 0;
const line = (state, name, detail = '') => console.log(`${state.padEnd(4)} ${name}${detail ? ` · ${detail}` : ''}`);
const check = (name, pass, detail) => {
  if (!pass) failed++;
  line(pass ? 'ok' : 'FAIL', name, detail);
};

async function open(width, height, { touch = false } = {}) {
  const ctx = await browser.newContext(touch ? { viewport: { width, height }, hasTouch: true, isMobile: true } : { viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Web fonts come from another host; the check reads the page, not the network.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const current = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.wtp-cur');
    return c ? { id: c.id, part: c.dataset.part, open: c.open ?? null } : null;
  });
const press = async (page, key, wait = 350) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
};

// Interactive looks interactive, both ways (kits/interactivity.md): each
// element the page's runtime peeks from or answers a click on (WTTriggers)
// shows an underline or a border at rest, or is a native control, and no
// element outside them wears the peek's dotted underline.
const auditTriggers = (page) =>
  page.evaluate(() => {
    const T = window.WTTriggers;
    if (!T) return null;
    const sel = [T.peek, T.sheet, T.click].filter(Boolean).join(', ');
    const shown = (el) => el.checkVisibility({ visibilityProperty: true }) && !el.closest('.overlay:not(.show)');
    const marked = (p) => {
      const cs = getComputedStyle(p);
      const edge = ['Top', 'Right', 'Bottom', 'Left'].some((k) => cs[`border${k}Style`] !== 'none' && parseFloat(cs[`border${k}Width`]) > 0);
      return cs.textDecorationLine.includes('underline') || edge || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0);
    };
    const looks = (el) => el.matches('button, summary, input, select, textarea') || [el, ...el.querySelectorAll('.tt, .peekable, .sq-num, .sq-label')].some(marked);
    const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}"`;
    const triggers = [...document.querySelectorAll(sel)].filter(shown);
    const plain = triggers.filter((el) => !looks(el)).map(name);
    const scope = [...document.querySelectorAll('.chapter:not([hidden]) *, [data-page] *, .hdr *, .navi *')].filter(shown);
    const inert = scope
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (!(cs.textDecorationLine.includes('underline') && cs.textDecorationStyle === 'dotted')) return false;
        // Only the element that sets the line counts, not text that inherits it.
        if (el.parentElement && getComputedStyle(el.parentElement).textDecorationLine.includes('underline') && getComputedStyle(el.parentElement).textDecorationStyle === 'dotted') return false;
        return !el.closest(`a[href], button, summary, ${sel}`);
      })
      .map(name);
    return { triggers: triggers.length, plain: [...new Set(plain)], inert: [...new Set(inert)] };
  });
const reportTriggers = (a, where) => {
  if (!a) return line('skip', `${where}: interactive looks interactive`, 'the page names no WTTriggers');
  check(`${where}: every peek or click target looks interactive at rest`, a.plain.length === 0, `${a.triggers} targets${a.plain.length ? `; plain: ${a.plain.slice(0, 6).join(' | ')}` : ''}`);
  check(`${where}: nothing inert wears the peek's underline`, a.inert.length === 0, a.inert.slice(0, 6).join(' | '));
};

async function reviewPage() {
  const { ctx, page, errors } = await open(1440, 900);
  reportTriggers(await auditTriggers(page), 'opening');
  // Every key the keys sheet lists, pressed as a keyboard types it: Shift
  // for `?`. A key acts when the page takes it (its default prevented) or
  // when something on the page changes.
  const listed = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-overlay="help"] .key')].map((k) => k.dataset.key))]);
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener('keydown', (e) => window.__keys.push({ key: e.key, taken: e.defaultPrevented }));
  });
  const SHIFTED = new Set([...'~!@#$%^&*()_+{}|:"<>?']);
  const PRESS = { ' ': 'Space', '?': 'Shift+Slash' };
  const state = () => page.evaluate(() => [location.hash, Math.round(scrollY), document.querySelector('.overlay.show')?.dataset.overlay ?? '', [...document.querySelectorAll('[aria-pressed="true"]')].length, document.querySelector('.st-pos')?.textContent ?? '', document.querySelector('.stop.current')?.id ?? ''].join('|'));
  const dead = [];
  for (const k of listed) {
    if (k === 'r' && !(await page.evaluate(() => document.querySelector('.chapter:not([hidden]) .scene')))) continue;
    await page.evaluate(() => document.querySelector('[data-flow]')?.focus());
    const before = await state();
    await page.evaluate(() => (window.__keys.length = 0));
    await page.keyboard.press(PRESS[k] ?? (SHIFTED.has(k) ? `Shift+${k}` : k));
    await page.waitForTimeout(250);
    const taken = await page.evaluate(() => window.__keys.some((x) => x.taken));
    if (!taken && (await state()) === before) dead.push(k);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (location.hash = '#c-open'));
    await page.waitForTimeout(250);
  }
  check('every key the keys sheet lists acts, as typed', dead.length === 0, `${listed.length} keys${dead.length ? `; dead: ${dead.join(' ')}` : ''}`);
  // A jump into another chapter and back, by `b` and by the browser.
  const trip = async (back) => {
    await page.evaluate(() => (location.hash = '#c-open'));
    await page.waitForTimeout(400);
    // The stage names the stop of a hop the stack adds.
    for (let n = 0; n < 12 && !(await page.evaluate(() => document.querySelector('[data-flow-stage] a.to-stop:not(.xref)'))); n++) {
      await page.click('[data-act="flow-next"]');
      await page.waitForTimeout(120);
    }
    const link = await page.evaluate(() => {
      const a = [...document.querySelectorAll('#c-open a.to-stop:not(.xref)')].find((x) => x.checkVisibility({ visibilityProperty: true }));
      if (!a) return null;
      a.scrollIntoView({ block: 'center' });
      document.querySelector('[data-check-link]')?.removeAttribute('data-check-link');
      a.setAttribute('data-check-link', '');
      return a.getAttribute('href');
    });
    if (!link) return null;
    await page.waitForTimeout(300);
    const y0 = await page.evaluate(() => Math.round(scrollY));
    await page.click('[data-check-link]');
    await page.waitForTimeout(900);
    const away = await page.evaluate(() => document.querySelector('.chapter:not([hidden])')?.id);
    await back();
    await page.waitForTimeout(900);
    const y1 = await page.evaluate(() => Math.round(scrollY));
    const home = await page.evaluate(() => document.querySelector('.chapter:not([hidden])')?.id);
    return { link, away, home, y0, y1 };
  };
  for (const [name, back] of [['b', () => page.keyboard.press('b')], ['the browser\'s Back', () => page.goBack()]]) {
    const t = await trip(back);
    if (!t) line('skip', `${name} returns from a jump`, 'the opening links no stop');
    else check(`${name} returns from a jump into another chapter to the spot it left`, t.home === 'c-open' && Math.abs(t.y1 - t.y0) < 40, `${t.link}: ${t.y0} → ${t.away} → ${t.home} ${t.y1}`);
  }
  await page.evaluate(() => (location.hash = '#c-open'));
  await page.waitForTimeout(300);
  const ch = await page.evaluate(() => document.querySelector('.chapter[data-layer]')?.id);
  if (ch) {
    await page.evaluate((id) => (location.hash = `#${id}`), ch);
    await page.waitForTimeout(600);
    reportTriggers(await auditTriggers(page), 'a PR');
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  const phone = await open(390, 844, { touch: true });
  const fit = await phone.page.evaluate(() => ({ meta: Boolean(document.querySelector('meta[name="viewport"]')), wide: document.documentElement.scrollWidth > innerWidth }));
  check('on a phone the page lays out at the device width and never scrolls sideways', fit.meta && !fit.wide, JSON.stringify(fit));
  check('no page errors on a phone', phone.errors.length === 0, phone.errors.join(' | '));
  await phone.ctx.close();
}

async function handPainted() {
  {
    const { ctx, page, errors } = await open(1280, 860);
    const facts = await page.evaluate(() => ({
      booted: document.documentElement.classList.contains('wtp'),
      items: document.querySelectorAll('[data-page] [data-part="item"]').length,
      terms: document.querySelectorAll('[data-page] [data-term]').length,
      glossary: JSON.parse(document.getElementById('wt-glossary')?.textContent || '[]'),
    }));
    check('page.js runs', facts.booted, `${facts.items} items, ${facts.terms} marked terms`);
    // The page draws only the catalog's parts (kits/components.md): an author's
    // own class is chrome the theme does not define.
    const classes = await page.evaluate(() => [...document.querySelectorAll('[data-page] [class], [data-page][class]')].flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/)));
    const outside = unknownClasses(classes);
    check('every class on the page is in the catalog', !outside.length, outside.length ? outside.join(' ') : `${new Set(classes).size} classes`);

    await press(page, 'k');
    const first = await current(page);
    check('k lands on the first part', Boolean(first), JSON.stringify(first));
    let item = first;
    for (let n = 0; n < 20 && item?.part !== 'item'; n++) {
      await press(page, 'k', 250);
      item = await current(page);
    }
    check('k steps to an item and opens it', item?.part === 'item' && item.open !== false, JSON.stringify(item));

    await press(page, 'x', 500);
    const marked = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return el && { reviewed: el.classList.contains('wtp-reviewed'), folded: el.open === false || el.tagName !== 'DETAILS' };
    }, item?.id);
    check('x marks the item and folds it', marked?.reviewed && marked.folded, JSON.stringify(marked));
    const next = await current(page);
    check('x moves on', next && next.id !== item.id, JSON.stringify(next));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    check('a mark survives a reload', await page.evaluate((id) => document.getElementById(id)?.classList.contains('wtp-reviewed'), item?.id));

    await press(page, '?', 200);
    check('? opens the keys', await page.evaluate(() => Boolean(document.querySelector('.overlay [aria-label="keys"]'))));
    await press(page, 'Escape', 200);
    check('esc closes them', await page.evaluate(() => !document.querySelector('.overlay')));

    if (facts.glossary.length) {
      const term = facts.glossary[0].term;
      await press(page, 't', 200);
      await page.keyboard.type(term.split(/\s+/)[0].slice(0, 5));
      await page.waitForTimeout(150);
      const top = await page.evaluate(() => document.querySelector('.wtp-terms dt')?.textContent);
      check('t filters the glossary', Boolean(top), top);
      await press(page, 'Escape', 150);
      check('esc leaves the glossary', await page.evaluate(() => !document.querySelector('.overlay')));
    } else line('skip', 't opens the glossary', 'the page has no #wt-glossary');

    if (facts.terms) {
      const at = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-page] [data-term]')].find((x) => x.checkVisibility());
        if (!t) return null;
        t.scrollIntoView({ block: 'center' });
        const r = t.getBoundingClientRect();
        return { x: r.left + 4, y: r.top + r.height / 2, term: t.dataset.term };
      });
      if (at) {
        await page.mouse.move(at.x - 30, at.y - 30);
        await page.mouse.move(at.x, at.y, { steps: 3 });
        await page.waitForTimeout(150);
        const peek = await page.evaluate(() => {
          const k = document.querySelector('.tip');
          return k && !k.hidden ? k.textContent : null;
        });
        check('a term shows its definition', Boolean(peek?.startsWith(at.term)), (peek ?? '').slice(0, 60));
      } else line('skip', 'a term shows its definition', 'no marked term is on screen');
    } else line('skip', 'a term shows its definition', 'the page marks no term');

    const link = await page.evaluate(() => {
      const a = [...document.querySelectorAll('[data-page] a[href^="#"]')].find((x) => x.checkVisibility() && x.getAttribute('href').length > 1 && document.getElementById(x.getAttribute('href').slice(1)));
      if (!a) return null;
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      return { x: r.left + 4, y: r.top + r.height / 2, to: a.getAttribute('href').slice(1) };
    });
    if (link) {
      const y0 = await page.evaluate(() => scrollY);
      await page.mouse.click(link.x, link.y);
      await page.waitForTimeout(900);
      // The target's head lands just under the bar that sticks to the top.
      const landed = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const bar = document.querySelector('.wtp-bar')?.getBoundingClientRect().bottom ?? 0;
        return { below: Math.round(el.getBoundingClientRect().top - bar), open: el.tagName === 'DETAILS' ? el.open : true, back: !document.querySelector('.backpill').hidden };
      }, link.to);
      check('a link opens and lands on its target, under the bar', landed.open && landed.below >= 0 && landed.below < 40 && landed.back, JSON.stringify(landed));
      await press(page, 'b', 900);
      const y1 = await page.evaluate(() => scrollY);
      check('b returns to where the link started', Math.abs(y1 - y0) < 60, `${y0} → ${y1}`);
    } else line('skip', 'a link lands on its target', 'no in-page link');

    if (await page.evaluate(() => Boolean(window.WTSound))) {
      await press(page, 'm', 100);
      check('m turns sound on', await page.evaluate(() => window.WTSound.enabled === true));
    } else line('skip', 'm turns sound on', 'sound.js is not inlined');
    await press(page, 'c', 100);
    const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
    check('c says where comments open, off claude.ai', /claude\.ai/.test(toast), toast);

    const group = await page.evaluate(() => document.querySelector('.wtp-cur')?.closest('[data-part="group"]')?.id ?? null);
    if (group) {
      await press(page, 'z', 200);
      const folds = await page.evaluate((id) => [...document.getElementById(id).querySelectorAll('details')].map((d) => d.open), group);
      check('z folds or opens the group', folds.length > 0 && (folds.every(Boolean) || !folds.some(Boolean)), `${group}: ${folds.length} folds`);
    } else line('skip', 'z folds the group', 'the current part sits in no group');
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(390, 844);
    await press(page, 'k');
    const fit = await page.evaluate(() => {
      const r = document.querySelector('.navi').getBoundingClientRect();
      return { gap: Math.round(innerWidth - r.right), wide: document.documentElement.scrollWidth > innerWidth };
    });
    check('on a phone the navigator keeps its gutter and the page never scrolls sideways', fit.gap >= 16 && !fit.wide, JSON.stringify(fit));
    check('no page errors on a phone', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(1280, 860);
    reportTriggers(await auditTriggers(page), 'the page');
    await ctx.close();
  }
}

const probe = await open(1280, 860);
const kind = await probe.page.evaluate(() => (document.querySelector('[data-wt]') ? 'review' : 'page'));
await probe.ctx.close();
if (kind === 'review') await reviewPage();
else await handPainted();
await browser.close();
console.log(failed ? `${failed} failed` : 'every act did what it says');
process.exit(failed ? 1 : 0);
