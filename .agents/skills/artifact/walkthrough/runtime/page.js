/* Page: the review page's reading grammar on a hand-painted page. window.WTPage.
   The same keys, words and cues as a review page (kits/interactivity.md,
   "Hand-painted pages"): k and j step, the arrows read, x marks, z folds,
   m turns sound on, c comments, t opens the glossary, b goes back, ? lists it all.
   Markup it reads:
     <main data-page="<key>">       the page; <key> names its stored state
     data-part="head"               a heading the arrows land on
     data-part="group"              a run of items under one head, usually a <details>
     data-part="item"               what the reader marks reviewed
     data-title="…"                 the name the navigator shows, when the heading's own text is too long
     <details id="…">               a fold; with an id, this browser remembers it
     <span data-term="Name">        a term the glossary defines
     #wt-glossary                   a JSON script element holding [{ "term", "def" }]
   markup.js, layers.js, keys.js and trail.js load before it, and so do
   sound.js, confetti.js and search.js; each of the last three it lacks only
   turns its feature off. Without this file the page still reads top to bottom. */
(function () {
  'use strict';

  const root = document.querySelector('[data-page]');
  if (!root) return;
  const S = window.WTSound ?? null;
  const C = window.WTConfetti ?? null;
  const Q = window.WTSearch ?? null;
  const L = window.WTLayers;
  // The review page's own keycaps and icons, so a control looks the same on both kinds of page.
  const { esc, keycap, keys, icon, sprite, tag, navigator, tick } = window.WTMarkup;
  // The icons point at one symbol sheet; a page that has none takes the kit's.
  if (!document.getElementById('wt-i-test')) document.body.insertAdjacentHTML('afterbegin', sprite());
  const K = window.WTKeys;
  const T = window.WTTrail;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = () => (reduced() ? 'auto' : 'smooth');
  // A definition's code names sit in backticks, as the glossary writes them.
  const prose = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const cue = (name) => {
    if (name) S?.play(name);
  };

  // ---------------------------------------------------------------- storage
  const KEY = `wtp:${root.dataset.page}:`;
  const load = (k, d) => {
    try {
      const v = localStorage.getItem(KEY + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(KEY + k, JSON.stringify(v));
    } catch {
      /* private mode: this visit keeps it */
    }
  };

  // ------------------------------------------------------------------ parts
  const parts = [...root.querySelectorAll('[data-part]')];
  const items = parts.filter((p) => p.dataset.part === 'item');
  const kind = (p) => p?.dataset.part;
  const groupOf = (p) => (kind(p) === 'group' ? p : (p?.parentElement?.closest('[data-part="group"]') ?? null));
  const itemsOf = (group) => items.filter((i) => group.contains(i));
  const head = (p) => (p.tagName === 'DETAILS' ? (p.querySelector(':scope > summary') ?? p) : p);
  const titleOf = (p) => {
    if (p.dataset.title) return p.dataset.title;
    const h = head(p);
    return (h.querySelector('.gt, .t, h2, h3')?.textContent ?? h.textContent).replace(/\s+/g, ' ').trim();
  };
  const idOf = (p) => p.id || `p${parts.indexOf(p)}`;
  for (const p of parts) {
    const h = head(p);
    if (h.tagName !== 'SUMMARY' && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  }

  // A fold this file opens or closes plays no cue; only the reader's own does.
  const quiet = new WeakSet();
  const setOpen = (d, open) => {
    if (d.open === open) return;
    quiet.add(d);
    d.open = open;
  };
  const openAround = (el) => {
    for (let d = el.parentElement; d && d !== document.body; d = d.parentElement) if (d.tagName === 'DETAILS') setOpen(d, true);
  };

  // ------------------------------------------------------------------ toast
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.setAttribute('data-uncommentable', '');
  document.body.append(toastEl);
  let toastTimer = 0;
  function toast(text, ms = 2800) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  const pair = (a, b) => keys(keycap(a), keycap(b));

  // ---------------------------------------------------------- current part
  // The current part changes only on an act: a key, a click inside a part, a
  // link. Scrolling never moves it.
  let cur = -1;
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  // Keys land where the reader is: from the current part while it shows, and
  // from the part under the reading line once the reader scrolls it away.
  function anchor() {
    if (cur >= 0 && onScreen(parts[cur])) return cur;
    let at = -1;
    for (let i = 0; i < parts.length; i++) {
      const r = parts[i].getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.top <= innerHeight * 0.25) at = i;
      else break;
    }
    return at;
  }
  function land(i, { sound = 'step', focus = true, scroll = true } = {}) {
    const p = parts[i];
    if (!p) return;
    openAround(p);
    if (p.tagName === 'DETAILS' && kind(p) !== 'head') setOpen(p, true);
    parts[cur]?.classList.remove('wtp-cur');
    cur = i;
    p.classList.add('wtp-cur');
    if (scroll) p.scrollIntoView({ block: 'start', behavior: behavior() });
    if (focus) head(p).focus({ preventScroll: true });
    if (p.id) {
      try {
        history.replaceState(history.state, '', `#${p.id}`);
      } catch {
        /* a sandboxed frame may refuse; the page still moves */
      }
    }
    cue(sound);
    paintNav();
  }
  const soundFor = (p) => (kind(p) === 'item' ? 'step' : 'turn');
  function go(dir) {
    const from = anchor();
    // j inside a long part first returns to that part's top.
    if (dir < 0 && from >= 0 && parts[from].getBoundingClientRect().top < -8) {
      land(from, { sound: 'step' });
      return;
    }
    const i = from + dir;
    if (i < 0 || i >= parts.length) return;
    land(i, { sound: soundFor(parts[i]) });
  }
  // The arrows read: through a part taller than the screen a screen at a
  // time, then on to the next part's head, silently while the reader stays put.
  function read(dir) {
    const i = anchor();
    const p = parts[i];
    if (p && dir > 0) {
      const r = p.getBoundingClientRect();
      const next = parts[i + 1]?.getBoundingClientRect();
      const nearNext = next && next.height > 0 && next.top < innerHeight * 0.2;
      if (r.bottom > innerHeight && !nearNext) {
        scrollBy({ top: innerHeight * 0.8, behavior: behavior() });
        return;
      }
    }
    if (p && dir < 0) {
      const r = p.getBoundingClientRect();
      if (r.top < -8) {
        scrollBy({ top: Math.max(r.top - 12, -innerHeight * 0.8), behavior: behavior() });
        return;
      }
    }
    go(dir);
  }

  // ------------------------------------------------------------------ marks
  const marks = new Set(load('marks', []));
  const done = (p) => marks.has(idOf(p));
  function paintMark(p) {
    const h = head(p);
    const mark = h.querySelector(':scope > [data-wtp-done]');
    if (done(p) && !mark) h.insertAdjacentHTML('beforeend', tag('reviewed', { attrs: 'data-wtp-done' }));
    else if (!done(p) && mark) mark.remove();
    p.classList.toggle('wtp-reviewed', done(p));
  }
  function paintProgress(group) {
    const all = itemsOf(group);
    if (!all.length) return;
    const n = all.filter(done).length;
    const h = head(group);
    let el = h.querySelector(':scope > .wtp-prog');
    if (!el) {
      el = document.createElement('span');
      el.className = 'wtp-prog';
      h.append(el);
    }
    el.textContent = n ? `${n} of ${all.length} reviewed` : '';
  }
  const groups = parts.filter((p) => kind(p) === 'group');
  function paintMarks() {
    items.forEach(paintMark);
    groups.forEach(paintProgress);
    paintNav();
  }
  // x marks the item and moves on; on a marked item it takes the mark off.
  function mark() {
    const i = anchor();
    const p = parts[i];
    if (!p) return;
    if (kind(p) !== 'item') {
      go(1);
      return;
    }
    const id = idOf(p);
    if (marks.has(id)) {
      marks.delete(id);
      save('marks', [...marks]);
      paintMarks();
      cue('unmark');
      return;
    }
    marks.add(id);
    save('marks', [...marks]);
    if (p.tagName === 'DETAILS') setOpen(p, false);
    paintMarks();
    const group = groupOf(p);
    if (items.every(done)) {
      cue('finale');
      C?.finale();
      toast('Every item is reviewed.');
    } else if (group && itemsOf(group).every(done)) {
      cue('chapter');
      C?.burst();
    } else cue('reviewed');
    if (i + 1 < parts.length) land(i + 1, { sound: null });
  }

  // ------------------------------------------------------------------ folds
  const folds = load('folds', {});
  const initial = new Map();
  for (const d of root.querySelectorAll('details')) {
    initial.set(d, d.open);
    if (d.id && d.id in folds) setOpen(d, folds[d.id]);
  }
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (d.tagName !== 'DETAILS') return;
      if (d.id) {
        folds[d.id] = d.open;
        save('folds', folds);
      }
      if (quiet.has(d)) quiet.delete(d);
      else cue(d.open ? 'unfold' : 'fold');
      paintFold();
    },
    true,
  );
  // z folds every fold of the current group, or opens them all when none is open.
  function foldAll() {
    const group = groupOf(parts[anchor()]) ?? root;
    const ds = [...group.querySelectorAll('details')];
    if (!ds.length) return;
    const anyOpen = ds.some((d) => d.open);
    ds.forEach((d) => setOpen(d, !anyOpen));
    cue(anyOpen ? 'fold' : 'unfold');
    paintFold();
  }
  // The fold control says what a press does next, for the group z folds. A
  // repaint on arrival names the landed part's group: the page has not
  // scrolled to it yet, so anchor() still finds the part it left.
  function paintFold(group = groupOf(parts[anchor()]) ?? root) {
    const b = nav.querySelector('[data-act="fold"]');
    const open = [...group.querySelectorAll('details')].some((d) => d.open);
    b.setAttribute('aria-expanded', String(open));
    b.setAttribute('aria-label', open ? 'fold the group' : 'open the group');
    b.querySelector('[data-in]').toggleAttribute('hidden', !open);
    b.querySelector('[data-out]').toggleAttribute('hidden', open);
  }

  // -------------------------------------------------------------- navigator
  document.body.insertAdjacentHTML('beforeend', navigator({ label: 'page navigator', fold: 'fold the group', foldHidden: false }));
  const nav = document.body.lastElementChild;
  nav.setAttribute('data-uncommentable', '');
  // The tools the review page's header holds; the peek names each one's key.
  const bar = document.createElement('div');
  bar.className = 'wtp-bar';
  bar.setAttribute('data-uncommentable', '');
  bar.innerHTML = `<div class="wtp-tools"><button type="button" class="btn outline" data-tool="terms" aria-label="glossary" aria-keyshortcuts="t" hidden>${icon('glossary')}<span class="tl">terms</span><span class="count"></span></button><button type="button" class="btn outline" data-tool="comment" aria-pressed="false" aria-label="comment mode" aria-keyshortcuts="c"><span class="tl">comment</span></button><button type="button" class="btn outline" data-tool="sound" aria-pressed="false" aria-label="Turn sound on" aria-keyshortcuts="m">${icon('sound', 'data-on hidden')}${icon('sound-off', 'data-off')}</button><button type="button" class="btn outline" data-tool="keys" aria-label="keyboard shortcuts" aria-keyshortcuts="?"><span class="tl">keys</span></button></div>`;
  root.before(bar);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    const tool = b.dataset.tool;
    if (tool === 'terms') sheet ? closeSheet() : glossarySheet();
    else if (tool === 'comment') toggleComments();
    else if (tool === 'sound') sound();
    else if (tool === 'keys') sheet ? closeSheet() : keySheet();
  });
  function paintTools() {
    const on = Boolean(S?.enabled);
    const sb = bar.querySelector('[data-tool="sound"]');
    sb.setAttribute('aria-pressed', String(on));
    sb.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    sb.querySelector('[data-on]').toggleAttribute('hidden', !on);
    sb.querySelector('[data-off]').toggleAttribute('hidden', on);
    bar.querySelector('[data-tool="comment"]').setAttribute('aria-pressed', String(commenting));
  }

  function paintNav() {
    const p = parts[cur];
    const where = nav.querySelector('[data-where]');
    const ticks = nav.querySelector('[data-ticks]');
    const group = p ? groupOf(p) : null;
    const list = group ? itemsOf(group) : [];
    const at = list.indexOf(p);
    const name = !p ? '' : group ? titleOf(group) : titleOf(p);
    where.innerHTML = name ? `${esc(name)}${group && at >= 0 ? ` · <b>${at + 1}</b>/${list.length}` : ''}` : '';
    ticks.innerHTML = list.map((x) => tick({ id: parts.indexOf(x), title: titleOf(x), done: done(x), on: x === p })).join('');
    ticks.hidden = !list.length;
    nav.querySelector('[data-act="review"]').setAttribute('aria-pressed', String(Boolean(p && done(p))));
    paintFold(p ? (group ?? root) : undefined);
  }
  nav.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tk]');
    if (t) {
      land(Number(t.dataset.tk));
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'top') scrollTo({ top: 0, behavior: behavior() });
    else if (act === 'bottom') scrollTo({ top: document.documentElement.scrollHeight, behavior: behavior() });
    else if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'fold') foldAll();
    else if (act === 'review') mark();
  });

  // ----------------------------------------------------------------- sheets
  // One sheet at a time: the keys, or the glossary. A sheet is a layer, so a
  // press on the ground around it or Escape closes it.
  let sheet = null;
  function openSheet(html, label) {
    closeSheet(true);
    sheet = document.createElement('div');
    sheet.className = 'overlay show';
    sheet.setAttribute('data-uncommentable', '');
    sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div>`;
    document.body.append(sheet);
    L.open(sheet.firstElementChild, { close: () => closeSheet() });
    sheet.firstElementChild.focus();
    cue('open');
    return sheet.firstElementChild;
  }
  function closeSheet(silent = false) {
    if (!sheet) return false;
    const dialog = sheet.firstElementChild;
    sheet.remove();
    sheet = null;
    L.closed(dialog);
    if (!silent) cue('close');
    return true;
  }
  // A reset asks on its own button, says what it clears, and acts on a second
  // press within four seconds; the frame shows no confirm().
  function twoPress(btn, ask, act) {
    const label = btn.textContent;
    let armed = 0;
    btn.addEventListener('click', () => {
      if (armed && Date.now() - armed < 4000) {
        armed = 0;
        btn.textContent = label;
        act();
        return;
      }
      armed = Date.now();
      btn.textContent = ask();
      setTimeout(() => {
        if (armed && Date.now() - armed >= 4000) {
          armed = 0;
          btn.textContent = label;
        }
      }, 4100);
    });
  }
  function keySheet() {
    const row = (keys, what) => `<li><span class="keys">${keys}</span><span>${what}</span></li>`;
    const el = openSheet(
      `<h2>keys</h2><ul class="wtp-keylist">${[
        row(pair('k', 'ArrowRight'), 'the next part'),
        row(pair('j', 'ArrowLeft'), 'the part before, or the top of a long one'),
        row(`${keycap('ArrowDown')}${keycap('ArrowUp')}`, 'read on or back, a screen at a time through a long part'),
        row(`${keycap('Home')}${keycap('End')}`, 'the top or the bottom of the page'),
        row(keycap('x'), 'mark the item reviewed and move on, or take its mark off'),
        row(keycap('z'), 'fold or open every fold of the group'),
        row(keycap('m'), `sound ${S?.enabled ? 'off' : 'on'}`),
        comments ? row(keycap('c'), 'comment: your next click places the comment') : '',
        glossary.length ? row(keycap('t'), 'the glossary') : '',
        row(keycap('b'), 'back to where a link started'),
        row(keycap('Escape'), 'close what is open'),
      ].join('')}</ul><div class="wtp-resets"><button type="button" class="btn outline" data-reset="folds">reset every fold</button><button type="button" class="btn outline" data-reset="marks">clear every review mark</button></div>`,
      'keys',
    );
    twoPress(
      el.querySelector('[data-reset="folds"]'),
      () => `reset ${Object.keys(folds).length} folds? press again`,
      () => {
        for (const k of Object.keys(folds)) delete folds[k];
        save('folds', folds);
        for (const [d, open] of initial) setOpen(d, open);
        toast('Every fold is back to how the page opens.');
      },
    );
    twoPress(
      el.querySelector('[data-reset="marks"]'),
      () => `clear ${marks.size} ticks? press again`,
      () => {
        marks.clear();
        save('marks', []);
        paintMarks();
        toast('Every review mark is cleared.');
      },
    );
  }

  // --------------------------------------------------------------- glossary
  let glossary = [];
  try {
    glossary = JSON.parse(document.getElementById('wt-glossary')?.textContent ?? '[]');
  } catch {
    glossary = [];
  }
  const defOf = new Map(glossary.map((g) => [g.term.toLowerCase(), g]));
  if (glossary.length) {
    const tb = bar.querySelector('[data-tool="terms"]');
    tb.hidden = false;
    tb.querySelector('.count').textContent = String(glossary.length);
  }
  for (const t of root.querySelectorAll('[data-term]')) if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
  function glossarySheet() {
    if (!glossary.length) return;
    const el = openSheet(`<h2>glossary</h2><input type="search" class="wtp-filter" placeholder="filter the terms" aria-label="filter the terms" autocomplete="off"><dl class="wtp-terms"></dl>`, 'glossary');
    const list = el.querySelector('.wtp-terms');
    const input = el.querySelector('input');
    const paint = () => {
      const q = input.value.trim();
      const ranked = q ? glossary.map((g, i) => ({ g, i, s: Q ? Q.score(q, g.term, g.def) : (`${g.term} ${g.def}`.toLowerCase().includes(q.toLowerCase()) ? 1 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i) : glossary.map((g, i) => ({ g, i }));
      list.innerHTML = ranked.map(({ g }) => `<dt>${esc(g.term)}</dt><dd>${prose(g.def)}</dd>`).join('') || '<dd>No term fits those words.</dd>';
    };
    input.addEventListener('input', paint);
    paint();
    input.focus();
  }

  // ------------------------------------------------------------------ peeks
  // A term shows its definition, and an in-page link what it opens, when the
  // pointer moves onto it or focus lands on it.
  const peek = document.createElement('div');
  peek.className = 'tip';
  peek.setAttribute('role', 'tooltip');
  peek.hidden = true;
  document.body.append(peek);
  let peekFor = null;
  function showPeek(el, html) {
    peekFor = el;
    peek.innerHTML = html;
    peek.hidden = false;
    const r = el.getBoundingClientRect();
    const w = Math.min(320, innerWidth - 32);
    peek.style.maxWidth = `${w}px`;
    const left = Math.max(16, Math.min(r.left, innerWidth - w - 16));
    const below = r.bottom + 8 + peek.offsetHeight < innerHeight;
    peek.style.left = `${left}px`;
    peek.style.top = `${below ? r.bottom + 6 : r.top - peek.offsetHeight - 6}px`;
  }
  function hidePeek() {
    if (peek.hidden) return false;
    peek.hidden = true;
    peekFor = null;
    return true;
  }
  function peekHtml(el) {
    if (el.dataset.term) {
      const g = defOf.get(el.dataset.term.toLowerCase());
      return g ? `<b>${esc(g.term)}</b> ${prose(g.def)}` : null;
    }
    const id = el.getAttribute('href')?.slice(1);
    const target = id && document.getElementById(id);
    if (!target) return null;
    const part = target.closest('[data-part]') ?? target;
    const text = (head(part).querySelector('.a')?.textContent ?? '').trim();
    return text ? esc(text) : null;
  }
  // What peeks; page-check.mjs holds each to a look that says so at rest.
  const PEEKS = '[data-page] [data-term], [data-page] a[href^="#"]';
  window.WTTriggers = Object.freeze({ peek: PEEKS, sheet: '', click: '' });
  const peekable = (t) => t.closest?.('[data-term], a[href^="#"]');
  const peekOn = (e) => {
    const el = peekable(e.target);
    if (!el || el === peekFor || !root.contains(el)) return;
    const html = peekHtml(el);
    if (html) showPeek(el, html);
  };
  const peekOff = (e) => {
    if (peekFor && !peekFor.contains(e.relatedTarget)) hidePeek();
  };
  // A pointer that did not move never opens a peek, so a key move that
  // scrolls a term under it leaves nothing for Escape to close first.
  root.addEventListener('pointermove', peekOn);
  root.addEventListener('pointerout', peekOff);
  root.addEventListener('focusin', peekOn);
  root.addEventListener('focusout', peekOff);
  addEventListener('scroll', hidePeek, { passive: true });

  // ------------------------------------------------------------ link landing
  // Following an in-page link opens what holds its target, lands on it with a
  // pulse, and goes on the trail (trail.js): Back, `b` and the back control
  // return to the exact spot, with the folds as they were.
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'backpill';
  back.hidden = true;
  back.setAttribute('data-uncommentable', '');
  back.textContent = 'back';
  back.setAttribute('aria-keyshortcuts', 'b');
  document.body.append(back);
  // A control names its keys in the same peek, on hover and on keyboard focus.
  const keysOn = (e) => {
    const b = e.target.closest?.('[aria-keyshortcuts]');
    if (!b || b === peekFor || (e.type === 'focusin' && !b.matches(':focus-visible'))) return;
    const html = K.hint(b);
    if (html) showPeek(b, html);
  };
  for (const el of [bar, nav, back]) {
    el.addEventListener('pointermove', keysOn);
    el.addEventListener('focusin', keysOn);
    el.addEventListener('pointerout', peekOff);
    el.addEventListener('focusout', peekOff);
  }
  const trail = T.create({
    snapshot: () => ({ y: scrollY, cur, open: [...root.querySelectorAll('details[open]')] }),
    restore(p) {
      const html = document.documentElement;
      html.classList.add('snap');
      const open = new Set(p.open);
      root.querySelectorAll('details[open]').forEach((d) => open.has(d) || setOpen(d, false));
      p.open.forEach((d) => setOpen(d, true));
      parts[cur]?.classList.remove('wtp-cur');
      cur = p.cur;
      parts[cur]?.classList.add('wtp-cur');
      paintNav();
      scrollTo({ top: p.y, behavior: 'auto' });
      requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('snap')));
      back.hidden = !trail.last();
      cue('return');
    },
  });
  function arrive(el) {
    openAround(el);
    if (el.tagName === 'DETAILS') setOpen(el, true);
    const part = el.closest('[data-part]');
    if (part) {
      parts[cur]?.classList.remove('wtp-cur');
      cur = parts.indexOf(part);
      part.classList.add('wtp-cur');
      paintNav();
    }
    el.scrollIntoView({ block: 'start', behavior: behavior() });
    const lit = el.tagName === 'DETAILS' ? head(el) : el;
    lit.classList.remove('wtp-lit');
    void lit.offsetWidth;
    lit.classList.add('wtp-lit');
    (el.tagName === 'DETAILS' ? head(el) : el).focus?.({ preventScroll: true });
  }
  const goBack = () => trail.back();
  back.addEventListener('click', goBack);

  // ---------------------------------------------------------------- comments
  let comments = null;
  let commenting = false;
  let ringed = null;
  const use = window.claude?.use?.bind(window.claude);
  if (use) {
    Promise.resolve(use('comments'))
      .then((c) => {
        comments = c ?? null;
      })
      .catch(() => {
        comments = null;
      });
  }
  const COMMENTABLE = 'li, p, tr, summary, h1, h2, h3, pre, figure, blockquote, dt, dd, .tag, [data-part]';
  const spotOf = (t) => {
    const el = t.closest?.(COMMENTABLE);
    return el && root.contains(el) && !el.closest('[data-uncommentable]') ? el : null;
  };
  function ring(el) {
    ringed?.removeAttribute('data-wtp-ring');
    ringed = el;
    el?.setAttribute('data-wtp-ring', '');
  }
  function commentMode(on) {
    commenting = on;
    document.documentElement.classList.toggle('wtp-commenting', on);
    if (!on) ring(null);
    paintTools();
    cue('toggle');
    toast(on ? 'Click what the comment is about. c or esc leaves.' : 'Comment mode is off.');
  }
  function toggleComments() {
    if (!comments) {
      toast('Comments open where the page runs on claude.ai.');
      return;
    }
    commentMode(!commenting);
  }
  root.addEventListener('pointerover', (e) => {
    if (commenting) ring(spotOf(e.target));
  });
  root.addEventListener(
    'click',
    (e) => {
      if (!commenting) return;
      const spot = spotOf(e.target);
      if (!spot) return;
      e.preventDefault();
      e.stopPropagation();
      commentMode(false);
      comments.openComposer({ element: spot }).catch((err) => {
        if (err?.code === 'unavailable') {
          comments = null;
          toast('Comments are off for this page.');
        }
      });
    },
    true,
  );

  // ------------------------------------------------------------------ clicks
  root.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (a) {
      const id = a.getAttribute('href').slice(1);
      const el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      trail.jump(`#${id}`);
      back.hidden = false;
      hidePeek();
      arrive(el);
      cue('step');
      return;
    }
    // A press inside a part makes it the current one.
    const part = e.target.closest?.('[data-part]');
    if (part && root.contains(part)) {
      const i = parts.indexOf(part);
      if (i !== cur) {
        parts[cur]?.classList.remove('wtp-cur');
        cur = i;
        part.classList.add('wtp-cur');
        paintNav();
      }
    }
  });
  // A hash the trail did not make, typed or from an older entry, lands too.
  addEventListener('hashchange', () => {
    if (trail.popped(location.hash)) return;
    // No fragment is the opening, where a visit without one starts; the trail
    // keeps the browser from restoring its scroll.
    if (location.hash.length <= 1) {
      parts[cur]?.classList.remove('wtp-cur');
      cur = -1;
      paintNav();
      scrollTo({ top: 0, behavior: behavior() });
      return;
    }
    const el = document.getElementById(location.hash.slice(1));
    if (el) arrive(el);
  });

  // -------------------------------------------------------------------- keys
  function closeTop() {
    return hidePeek() || L.closeTop() || (commenting && (commentMode(false), true));
  }
  function sound() {
    if (!S) return;
    S.unlock?.();
    S.setEnabled(!S.enabled);
    if (S.enabled) cue('toggle');
    paintTools();
    toast(S.enabled ? 'Sound is on.' : 'Sound is off.');
  }
  document.addEventListener('keydown', (e) => {
    const k = e.defaultPrevented ? null : K.keyOf(e);
    if (!k) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"]')) {
      if (k === 'Escape') {
        if (!L.closeTop()) t.blur();
        e.preventDefault();
      }
      return;
    }
    if (k === 'Escape') {
      if (closeTop()) e.preventDefault();
      return;
    }
    // An open sheet keeps the keys for its own scrolling.
    if (sheet && k !== '?' && k !== 't') return;
    // A table or a code block wider than its column scrolls with the arrows.
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && t.closest?.('pre, .scroll, [data-scroll]')) return;
    const once = (fn) => {
      if (!e.repeat) fn();
    };
    switch (k) {
      case 'k':
      case 'ArrowRight':
        go(1);
        break;
      case 'j':
      case 'ArrowLeft':
        go(-1);
        break;
      case 'ArrowDown':
        read(1);
        break;
      case 'ArrowUp':
        read(-1);
        break;
      case 'Home':
        scrollTo({ top: 0, behavior: behavior() });
        break;
      case 'End':
        scrollTo({ top: document.documentElement.scrollHeight, behavior: behavior() });
        break;
      case 'x':
        once(mark);
        break;
      case 'z':
        once(foldAll);
        break;
      case 'm':
        once(sound);
        break;
      case 'c':
        once(toggleComments);
        break;
      case 't':
        once(() => (sheet ? closeSheet() : glossarySheet()));
        break;
      case 'b':
        once(goBack);
        break;
      case '?':
        once(() => (sheet ? closeSheet() : keySheet()));
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // -------------------------------------------------------------------- boot
  paintMarks();
  paintTools();
  const start = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (start) {
    openAround(start);
    if (start.tagName === 'DETAILS') setOpen(start, true);
    const part = start.closest('[data-part]');
    if (part) {
      cur = parts.indexOf(part);
      part.classList.add('wtp-cur');
    }
    start.scrollIntoView({ block: 'start' });
    paintNav();
  }
  document.documentElement.classList.add('wtp');
  window.WTPage = { parts: parts.length, items: items.length };
})();
