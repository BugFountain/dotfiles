/* Walkthrough behavior. The page is complete without this file; this layer
   adds stepping, review marks, the file view, comments, Ask Claude, sound
   and scenes. Comments are the one shared layer; review progress stays with
   each reader. Capabilities come from window.claude.use() when the page
   runs on claude.ai; elsewhere every feature falls back to this browser.

   Navigation is explicit. The current stop changes only when the reader acts:
   a key, a click on the rail or inside a stop, a link, the address. Scrolling
   never moves it and never plays a sound, and each action plays one cue. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const DATA = JSON.parse($('#wt-data').textContent);
  const M = window.WTMotion;
  const V = window.WTVoice;
  const L = window.WTLayers;
  // The parts views.mjs prerenders too: one source for both (runtime/markup.js).
  const { keycap, icon, tick, tag, FLAG_NAME } = window.WTMarkup;
  const K = window.WTKeys;
  const T = window.WTTrail;
  const S = window.WTSound || { play() {}, hold() {}, setEnabled() {}, unlock() {}, state: () => 'off', onChange() {}, enabled: false };
  document.documentElement.classList.add('js');
  const smooth = () => (M.reduced() ? 'auto' : 'smooth');

  // ---------------------------------------------------------------- storage
  const PREFIX = `wt:${DATA.key}:`;
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(PREFIX + k, JSON.stringify(v));
      } catch {
        /* storage blocked: state lasts this visit */
      }
    },
  };

  // ------------------------------------------------------------------ index
  const chapters = $$('.chapter');
  const chapterIds = chapters.map((c) => c.dataset.chapter);
  const chapterEl = (id) => chapters.find((c) => c.dataset.chapter === id);
  const stopData = new Map();
  const chapterData = new Map();
  for (const ch of DATA.chapters) {
    chapterData.set(ch.id, ch);
    ch.stops.forEach((s, i) => stopData.set(s.id, { ...s, chapter: ch.id, layer: ch.layer, index: i }));
  }
  const layerById = new Map(DATA.layers.map((l) => [l.id, l]));
  const layerByLabel = new Map(DATA.layers.map((l) => [l.label, l]));
  // A single PR may split into one chapter per flow, so a layer can hold several.
  const chaptersOfLayer = (layer) => DATA.chapters.filter((c) => c.layer === layer).map((c) => c.id);
  const allStops = $$('.stop');
  const stopEl = (id) => (id ? document.getElementById(id) : null);
  const stopsOf = (chId) => allStops.filter((s) => s.dataset.chapter === chId);
  const layerLabel = (id) => (id === 'base' ? (DATA.layers.length > 1 ? 'before the stack' : 'before this PR') : layerById.get(id)?.label ?? id);

  // ------------------------------------------------------------------ state
  const state = {
    chapter: null,
    view: 'walk',
    stop: null,
    file: null,
    reviewed: new Set(store.get('reviewed', [])),
    qa: new Set(store.get('qa', [])),
    seen: new Set(store.get('seen', [])),
    order: store.get('order', {}),
    sel: null,
  };
  const remote = { user: null, db: null, uid: null };

  const persist = () => {
    store.set('reviewed', [...state.reviewed]);
    store.set('qa', [...state.qa]);
    store.set('seen', [...state.seen]);
    saveRemoteProgress();
  };

  // ------------------------------------------------------------------ toast
  let toastTimer = 0;
  function toast(html, ms = 2800) {
    const t = fixed('[data-toast]');
    if (!t) return;
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // --------------------------------------------------------------- geometry
  const hdrBottom = () => fixed('.hdr')?.getBoundingClientRect().bottom ?? 52;
  const navTop = () => fixed('[data-navi]')?.getBoundingClientRect().top ?? innerHeight;
  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > hdrBottom() + 24 && r.top < Math.min(innerHeight, navTop()) - 24;
  }
  // A key pressed while the last move still scrolls steps from the stop or
  // file that move chose, never from wherever the scroll has reached, so fast
  // presses never bounce back and forth.
  let navAt = -1e9;
  let scrolledAt = -1e9;
  window.addEventListener('scroll', () => (scrolledAt = performance.now()), { passive: true });
  const moving = () => {
    const now = performance.now();
    return now - navAt < 250 || (now - navAt < 2500 && now - scrolledAt < 150);
  };
  // Scroll anchoring would fight a scroll the page makes on purpose.
  // Scrolls the page makes on purpose run on one spring, so a new target
  // mid-flight bends the motion instead of restarting it: the browser's own
  // smooth scroll jumps a frame when it is interrupted. Scroll anchoring stays
  // off while the spring runs, and the reader's own wheel or touch stops it.
  const glide = { raf: 0, to: 0, pos: 0, vel: 0, last: 0, el: null, block: 'start' };
  // Stops near an instant landing draw for the first time in the frames after
  // it and take their real height; scroll anchoring would then carry the page
  // off the target. Anchoring stays off, and the landing holds its target
  // until the place stops moving.
  let settleRaf = 0;
  function stopSettle() {
    if (!settleRaf) return;
    cancelAnimationFrame(settleRaf);
    settleRaf = 0;
    document.documentElement.style.overflowAnchor = '';
  }
  function settleOn(el, block) {
    stopSettle();
    document.documentElement.style.overflowAnchor = 'none';
    const t0 = performance.now();
    let still = 0;
    const frame = () => {
      settleRaf = 0;
      if (!el.isConnected) return stopSettle();
      const y = clampY(landY(el, block));
      if (Math.abs(y - scrollY) > 1) {
        window.scrollTo(0, y);
        still = 0;
      } else still++;
      if (still >= 3 || performance.now() - t0 > 1500) {
        document.documentElement.style.overflowAnchor = '';
        return;
      }
      settleRaf = requestAnimationFrame(frame);
    };
    settleRaf = requestAnimationFrame(frame);
  }
  function stopGlide() {
    stopSettle();
    glide.el = null;
    if (!glide.raf) return;
    cancelAnimationFrame(glide.raf);
    glide.raf = 0;
    document.documentElement.style.overflowAnchor = '';
  }
  // With an element, the spring follows it while it flies: stops off screen
  // lay out only as they come near, so a target's place can move mid-flight.
  const clampY = (y) => Math.max(0, Math.min(Math.round(y), document.documentElement.scrollHeight - innerHeight));
  function glideTo(y, { instant = false, el = null, block = 'start' } = {}) {
    if (instant || M.reduced()) {
      stopGlide();
      window.scrollTo(0, Math.max(0, Math.round(y)));
      if (el) settleOn(el, block);
      return;
    }
    stopSettle();
    glide.to = clampY(y);
    glide.el = el;
    glide.block = block;
    if (glide.raf) return;
    // A long trip starts one screen short of its target: flying past every
    // stop between would render each one for a frame and drop the rest.
    const far = glide.to - scrollY;
    if (Math.abs(far) > innerHeight * 2.5) window.scrollTo(0, glide.to - Math.sign(far) * innerHeight);
    glide.pos = scrollY;
    glide.vel = 0;
    glide.last = performance.now();
    document.documentElement.style.overflowAnchor = 'none';
    const frame = (now) => {
      const dt = Math.min(0.032, (now - glide.last) / 1000);
      glide.last = now;
      if (glide.el?.isConnected) glide.to = clampY(landY(glide.el, glide.block));
      // Critically damped: no overshoot, about half a second to settle.
      const k = 180;
      glide.vel += (k * (glide.to - glide.pos) - 2 * Math.sqrt(k) * glide.vel) * dt;
      glide.pos += glide.vel * dt;
      if (Math.abs(glide.to - glide.pos) < 0.5 && Math.abs(glide.vel) < 8) {
        window.scrollTo(0, glide.to);
        glide.raf = 0;
        glide.el = null;
        document.documentElement.style.overflowAnchor = '';
        return;
      }
      window.scrollTo(0, glide.pos);
      glide.raf = requestAnimationFrame(frame);
    };
    glide.raf = requestAnimationFrame(frame);
  }
  ['wheel', 'touchstart'].forEach((t) => window.addEventListener(t, stopGlide, { passive: true }));
  window.addEventListener('keydown', (e) => ['PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && stopGlide());
  // Where an element lands: its top under the header, or its middle on screen.
  function landY(el, block = 'start') {
    const r = el.getBoundingClientRect();
    if (block === 'center') return r.top + scrollY - Math.max(hdrBottom() + 12, (innerHeight - r.height) / 2);
    return r.top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || hdrBottom() + 12);
  }

  function holdAnchor(fn) {
    stopGlide();
    const root = document.documentElement;
    root.style.overflowAnchor = 'none';
    try {
      fn();
    } finally {
      requestAnimationFrame(() => (root.style.overflowAnchor = ''));
    }
  }

  // ----------------------------------------------------- chapters and views
  let enterAnim = null;
  // Elements that never change, looked up once: on a page this size each
  // document-wide query walks every hunk.
  const found = new Map();
  const fixed = (sel, all = false, root = document) => {
    if (!found.has(sel)) found.set(sel, all ? $$(sel, root) : $(sel, root));
    return found.get(sel);
  };
  // The page's one-of-a-kind parts, found where they live: in the header, in
  // what floats over the page, in the flow near the opening's top, and at the
  // main column's end. A query of the whole page would walk every chapter.
  const ONE = ['.hdr', '[data-rail]', '[data-navi]', '[data-where]', '[data-ticks]', '[data-navi] [data-act="review"]', '[data-navi] [data-act="fold"]', '[data-toast]', '[data-tip]', '[data-back]', '[data-pick]', '[data-reset-note]', '[data-meter-label]', '[data-flow]', '[data-flow-stage]', '[data-seqs]', '[data-deck]', '[data-term-filter]', '[data-term-count]', '[data-voice-name]', '[data-voice-panel]', '[data-page-end]', '[data-act="reset-folds"]', '[data-act="reset-progress"]', '[data-act="flow-play"]', '[data-act="flow-listen"]', '[data-act="voice"]', '[data-act="sound"]', '[data-peek-sheet]'];
  {
    const wt = $('[data-wt]');
    const roots = [...(wt ? [...wt.children].filter((c) => !c.matches('[data-body]')) : []), $('[data-flow]')].filter(Boolean);
    roots.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const hits = roots.flatMap((r) => [r, ...r.querySelectorAll(ONE.join(', '))]);
    for (const sel of ONE) {
      const el = hits.find((h) => h.matches(sel));
      if (el) found.set(sel, el);
    }
    found.set('[data-rail]', $('[data-rail]'));
    const end = document.getElementById('main')?.lastElementChild;
    if (end?.matches('[data-page-end]')) found.set('[data-page-end]', end);
  }
  // Hiding the part that holds focus makes the browser restyle the whole
  // page on the spot to find focus a new home, so focus leaves first.
  function setHidden(el, hide) {
    if (hide && !el.hidden && el.contains(document.activeElement)) document.activeElement.blur();
    el.hidden = hide;
  }
  function showChapter(id, { view = 'walk', sound = true, top = true, focus = true } = {}) {
    const next = chapterEl(id);
    if (!next) return false;
    const changed = state.chapter !== id;
    if (changed) {
      const from = chapterIds.indexOf(state.chapter);
      // Focus in the chapter that closes would fall to the page's top, so a
      // keyboard reader's next Tab starts in the chapter that opens. The first
      // chapter shown takes none: a page that grabs focus on load pulls it
      // out of the host around the frame.
      const f = document.activeElement;
      const refocus = focus && Boolean(state.chapter) && (!f || f === document.body || Boolean(chapterEl(state.chapter)?.contains(f)));
      // Only the two chapters that change get a write: each write asks the
      // browser to restyle that chapter's whole subtree.
      const prev = chapterEl(state.chapter);
      chapters.forEach((c) => c.hidden !== (c !== next) && setHidden(c, c !== next));
      if (prev) holdLayout(next);
      if (prev) whenIdle(() => shelveRows(prev));
      dockFlow(next);
      // The Web Animations API restarts the slide without reading layout, so
      // the new chapter lays out once, in the next frame, not here.
      if (state.chapter && !M.reduced() && next.animate) {
        const dx = chapterIds.indexOf(id) >= from ? 18 : -18;
        enterAnim?.cancel();
        enterAnim = next.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
      if (state.chapter && sound) S.play('turn');
      if (flow.playing) stopFlow();
      state.chapter = id;
      state.file = null;
      // Opening a chapter is not a change the reader made: it stays in this browser.
      if (!state.seen.has(id)) {
        state.seen.add(id);
        store.set('seen', [...state.seen]);
      }
      enhance(next);
      fillRows(next);
      fixed('.toc-item', true, fixed('[data-rail]')).forEach((li) => li.classList.toggle('on', li.dataset.chapter === id));
      fixed('[data-meter] .seg', true, fixed('.hdr')).forEach((b) => b.classList.toggle('on', b.dataset.chapter === id));
      if (top) glideTo(0, { instant: true });
      setCurrent(null, { sound: false });
      closeRail();
      // Focus waits a frame: focusing now would lay the chapter out before
      // the rest of this change lands, and a stop may take focus then anyway.
      if (refocus) inFrame(null, () => next.contains(document.activeElement) || next.focus({ preventScroll: true }));
    }
    setView(view);
    updateWhere();
    return changed;
  }

  const viewEls = new Map();
  const viewsOf = (ch) => viewEls.get(ch) ?? viewEls.set(ch, { walk: $('[data-walk]', ch), files: $('[data-files]', ch), tabs: $$('.tab[data-view]', ch) }).get(ch);
  function setView(view, { sound = false } = {}) {
    const ch = chapterEl(state.chapter);
    const { walk, files, tabs } = ch ? viewsOf(ch) : {};
    if (!walk || !files) {
      state.view = 'walk';
      return;
    }
    if (view === 'files') buildFiles(ch);
    const was = state.view;
    setHidden(walk, view !== 'walk');
    setHidden(files, view !== 'files');
    if (was !== view) holdLayout(view === 'files' ? files : walk);
    tabs.forEach((t) => (t.dataset.view === view ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
    state.view = view;
    const item = fixed('.toc-item', true, fixed('[data-rail]')).find((li) => li.dataset.chapter === state.chapter);
    item?.classList.toggle('files', view === 'files');
    if (view === 'files') renderRailFiles(state.chapter);
    else state.file = null;
    if (sound && was !== view) S.play('step');
    updateWhere();
    reportPins();
  }

  // A view tab and d both keep the reader in the chapter and land the tabs
  // under the header, so the view they open starts on screen.
  function pickView(view) {
    if (!chapterData.has(state.chapter)) return;
    setView(view, { sound: true });
    toTabs();
    replaceHash(view === 'files' ? `${state.chapter}/files` : state.stop ?? state.chapter);
  }
  const toggleView = () => pickView(state.view === 'files' ? 'walk' : 'files');

  // A view switch lands on the tabs, so the chosen view starts right under them.
  function toTabs() {
    const tabs = $('.views', chapterEl(state.chapter));
    inFrame(
      () => (tabs ? landY(tabs) : 0),
      (y) => glideTo(y, { instant: true, el: tabs }),
    );
  }

  // The address follows the reader in place, and keeps the entry's place in
  // the trail, so Back still returns from it.
  function replaceHash(h) {
    trail.replace(`#${h}`);
  }

  function parseHash(hash) {
    const h = decodeURIComponent((hash || '').replace(/^#/, ''));
    if (!h) return { chapter: 'c-open' };
    const f = /^([\w-]+)\/files(?:\/(\d+))?$/.exec(h);
    if (f && chapterIds.includes(f[1])) return { chapter: f[1], view: 'files', file: f[2] === undefined ? null : Number(f[2]) };
    if (chapterIds.includes(h)) return { chapter: h };
    if (stopData.has(h)) return { stop: h };
    if (h.startsWith('t-')) return { term: h.slice(2) };
    const hop = (DATA.flow ?? []).findIndex((x) => x.id === h || x.hops?.some((y) => y.id === h));
    if (hop >= 0) return { hop };
    return { anchor: h };
  }

  function route(hash, { load = false, aim = null } = {}) {
    const r = parseHash(hash);
    if (r.term) return openDeck(r.term);
    if (r.stop) return goStop(r.stop, { sound: !load, instant: load, target: aim });
    if (r.view === 'files') {
      const changed = showChapter(r.chapter, { view: 'files', sound: !load });
      // A link to a file opens it; stepping with j and k only moves, and a
      // reload lands on the file with the reader's own fold.
      const sec = r.file !== null && !load ? document.getElementById(`${r.chapter}-f${r.file}`) : null;
      if (sec && $('.fv-body', sec)?.hidden) {
        setFile(sec, true);
        saveFolds();
      }
      if (r.file !== null) goFile(r.file, { sound: !load && !changed, instant: load });
      else {
        if (!changed && !load) S.play('step');
        toTabs();
      }
      replaceHash(r.file !== null ? `${r.chapter}/files/${r.file}` : `${r.chapter}/files`);
      return;
    }
    if (r.chapter) {
      const changed = showChapter(r.chapter, { view: 'walk', sound: !load });
      if (!changed) {
        // The chapter's top is a place of its own: no stop is current there.
        setCurrent(null, { sound: false });
        glideTo(0);
        if (!load) S.play('step');
      }
      // A page opened with no address keeps none: a fragment written before
      // the load ends makes the browser focus its target, and the first Tab
      // would then skip the skip link and the header.
      if (!(load && !location.hash)) replaceHash(r.chapter);
      return;
    }
    // A link to a hop, such as one from the brief, shows the hop on the stage
    // and lands on the flow wherever it is docked.
    if (r.hop !== undefined) {
      const changed = !flowHere() && showChapter('c-open', { view: 'walk', sound: !load, top: false });
      stopFlow();
      renderHop(r.hop, { cue: false });
      const flowEl = fixed('[data-flow]');
      if (flowEl) inFrame(() => clampY(landY(flowEl)), (y) => glideTo(y, { instant: load || changed, el: flowEl }));
      return;
    }
    // The spring follows the target: the stops above it lay out only as the
    // page reaches them, so its place settles on the way.
    const target = document.getElementById(r.anchor);
    if (target) {
      // A reference entry, or anything else in a fold, opens before the landing.
      for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
      const ch = target.closest('.chapter');
      const changed = ch ? showChapter(ch.dataset.chapter, { view: target.closest('[data-files]') ? 'files' : 'walk', sound: !load, top: false }) : false;
      inFrame(
        () => clampY(landY(target)),
        (y) => glideTo(y, { instant: load || changed, el: target }),
      );
    }
  }

  // A target inside the stop (the sentence a question points at) lands in the
  // middle of the screen instead of the stop's head.
  function goStop(id, { sound = true, instant = false, target = null } = {}) {
    const el = stopEl(id);
    if (!el) return;
    navAt = performance.now();
    // The stop takes focus below, so the chapter does not take it first.
    const changed = showChapter(el.dataset.chapter, { view: 'walk', sound, top: false, focus: instant });
    openRailBranches(id);
    setCurrent(id, { sound: sound && !changed });
    // The stop lands at the screen's top, so it and the stop under it show
    // their rows on the landing frame.
    const list = stopsOf(el.dataset.chapter);
    const at = list.indexOf(el);
    [el, list[at + 1]].forEach((n) => n && rowsAround(n));
    // A chapter that just opened has nothing on screen to scroll past: it
    // slides in already at the stop.
    // The stop takes focus a frame later, when the page is laid out: focus
    // makes the browser restyle whatever the landing left pending.
    inFrame(
      () => clampY(landY(target ?? el, target ? 'center' : 'start')),
      (y) => {
        glideTo(y, { instant: instant || changed, el: target ?? el, block: target ? 'center' : 'start' });
        if (!instant) requestAnimationFrame(() => el.contains(document.activeElement) || el.focus({ preventScroll: true }));
      },
    );
  }

  // k steps forward and j back, in the order the keys sit. They step from the
  // current stop while it is on screen; once the reader scrolls it away, they
  // step from the reading line under the header, so the next key lands where
  // the reader is, never back where they were.
  function step(delta) {
    if (state.view === 'files' && chapterData.has(state.chapter)) return stepFile(delta);
    const list = stopsOf(state.chapter);
    const line = hdrBottom() + 12;
    const cur = stopEl(state.stop);
    let target = null;
    if (list.length) {
      const fresh = moving();
      if (cur && cur.dataset.chapter === state.chapter && (fresh || inView(cur))) {
        if (!fresh && delta < 0 && cur.getBoundingClientRect().top < line - 80) {
          glideTo(landY(cur), { el: cur });
          S.play('step');
          return;
        }
        target = list[list.indexOf(cur) + delta] ?? null;
      } else if (delta > 0) target = list.find((el) => el.getBoundingClientRect().top > line + 2) ?? null;
      else target = [...list].reverse().find((el) => el.getBoundingClientRect().top < line - 2) ?? null;
      if (target) return goStop(target.dataset.stop);
    }
    const next = chapterIds[chapterIds.indexOf(state.chapter) + delta];
    if (!next) return;
    const stops = stopsOf(next);
    if (stops.length) return goStop((delta > 0 ? stops[0] : stops.at(-1)).dataset.stop);
    route(`#${next}`);
  }

  // ↓ and ↑ read the page the way effect.institute steps its sections, with
  // one difference: a stop can be taller than the screen, so while the stop
  // being read goes on past the edge, a press scrolls on a screen at a time,
  // and the press that finds the next stop's head within reach moves to it
  // like j and k. A chapter without stops reads by its sections the same way:
  // its head, then each marked heading. A section the page lands on takes
  // focus, so Tab goes on from there, and the flow's section gives focus to
  // the flow, so the arrows step its hops. The spring's own target counts as
  // where the page is.
  let readAt = null;
  const sectionsOf = (ch) => [ch.querySelector(':scope > .ch-head'), ...ch.querySelectorAll(':scope > h2.mark')].filter((el) => el?.getClientRects().length);
  // What sits between a section's heading and the next heading.
  function inSection(mark, sel) {
    for (let n = mark.nextElementSibling; n && !n.matches('h2.mark'); n = n.nextElementSibling) {
      const hit = n.matches(sel) ? n : n.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
  function landSection(el) {
    readAt = el;
    // The head is the chapter's top, so landing on it goes all the way up.
    const head = el.matches('.ch-head');
    glideTo(head ? Math.max(0, landY(el.closest('.chapter'))) : landY(el), { el: head ? el.closest('.chapter') : el });
    S.play('step');
    const target = (el.matches('h2.mark') && inSection(el, '[data-flow]')) || (el.matches('.ch-head') ? el.closest('.chapter') : el);
    target?.focus({ preventScroll: true });
  }
  function page(delta) {
    const line = hdrBottom() + 12;
    const floor = Math.min(innerHeight, navTop()) - 12;
    const room = floor - line;
    const shift = glide.raf ? glide.to - scrollY : 0;
    const at = (el, side = 'top') => el.getBoundingClientRect()[side] - shift;
    const files = state.view === 'files' && chapterData.has(state.chapter);
    const ch = chapterEl(state.chapter);
    if (!ch) return step(delta);
    const stops = files ? [] : stopsOf(state.chapter);
    const sections = files || stops.length ? [] : sectionsOf(ch);
    const list = files ? $$(`[data-files="${CSS.escape(state.chapter)}"] .fv-file`) : stops.length ? stops : sections;
    // A section ends where the next one starts, the last one with its chapter.
    const end = (el) => {
      const k = sections.indexOf(el);
      return k < 0 ? at(el, 'bottom') : sections[k + 1] ? at(sections[k + 1]) : at(ch, 'bottom');
    };
    const cur = files ? (state.file === null ? null : document.getElementById(`${state.chapter}-f${state.file}`)) : sections.length ? readAt : stopEl(state.stop);
    const read = (el) => el && list.includes(el) && end(el) > line && at(el) < floor;
    // With no landing yet, the section under the reading line is the one read.
    const reading = read(cur) ? cur : sections.length ? ([...list].reverse().find((el) => at(el) <= line + 24 && end(el) > line) ?? null) : null;
    if (delta > 0) {
      const next = reading ? list[list.indexOf(reading) + 1] : list.find((el) => at(el) > line + 2);
      const rest = (next ? at(next) : at(ch, 'bottom')) - floor;
      if (rest > room * 0.2) return glideTo(scrollY + shift + Math.min(room * 0.8, rest));
      if (next && sections.length) return landSection(next);
      return step(1);
    }
    const here = reading ?? [...list].reverse().find((el) => at(el) < line - 2);
    let over = line - (here ? at(here) : at(ch));
    // Above the first stop sits the chapter's own head, read before leaving.
    if (over <= room * 0.2 && (!here || here === list[0])) over = line - at(ch);
    if (over > room * 0.2 && scrollY + shift > 0) return glideTo(Math.max(0, scrollY + shift - Math.min(room * 0.8, over)));
    const prev = sections.length && here ? list[list.indexOf(here) - 1] : null;
    if (prev) return landSection(prev);
    return step(-1);
  }

  function stepChapter(delta) {
    const next = chapterIds[chapterIds.indexOf(state.chapter) + delta];
    if (next) route(`#${next}`);
  }

  // ------------------------------------------------------------ current stop
  function setCurrent(id, { sound = true } = {}) {
    const prev = state.stop;
    if (prev === id) return;
    state.stop = id;
    stopEl(prev)?.classList.remove('current');
    const el = stopEl(id);
    el?.classList.add('current');
    const rail = fixed('[data-rail]');
    if (rail) $$('.toc-stop.on', rail).forEach((a) => a.classList.remove('on'));
    const item = id && rail ? $(`.toc-stop[data-stop="${CSS.escape(id)}"]`, rail) : null;
    if (item) {
      item.classList.add('on');
      revealInRail(item);
    }
    updateWhere();
    if (!id) return;
    const s = stopData.get(id);
    const before = prev ? stopData.get(prev) : null;
    // The cue follows the nesting the rail shows: into a branch, out of one,
    // or along the same line.
    if (sound) S.play(s.branch && !before?.branch ? 'branch' : !s.branch && before?.branch ? 'return' : 'step');
    wakeTrail(el, before);
    replaceHash(id);
  }

  // The frames this stop adds to the stack the reader just left slide in.
  // The Web Animations API replays a frame's entry without reading layout.
  function wakeTrail(el, before) {
    if (!el || M.reduced()) return;
    const prevSyms = (before?.stack ?? []).map((f) => f.symbol);
    const frames = $$('.trail .fr:not(.more)', el);
    let k = 0;
    while (k < frames.length && k < prevSyms.length && frames[k].textContent === prevSyms[k]) k++;
    frames.forEach((f, i) => {
      if (i < k || !f.animate) return;
      f.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: (i - k) * 50, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    });
  }

  const updateWhere = () => drawWhere();
  // The navigator sits after every chapter, so a query for it walks the
  // whole page; it never changes, so it is looked up once.
  let whereEls = null;
  function drawWhere() {
    whereEls ??= { navi: fixed('[data-navi]'), where: fixed('[data-where]'), rv: fixed('[data-navi] [data-act="review"]'), ticks: fixed('[data-ticks]'), prev: $('[data-act="prev"]', fixed('[data-navi]')), next: $('[data-act="next"]', fixed('[data-navi]')) };
    const { where, rv } = whereEls;
    if (!where) return;
    const ch = chapterData.get(state.chapter);
    drawTicks(ch);
    syncNaviFold();
    rv?.toggleAttribute('disabled', !(state.view === 'walk' && state.stop));
    rv?.setAttribute('aria-pressed', String(Boolean(state.stop && state.reviewed.has(state.stop))));
    // On the flow the arrows step hops, so the place names the hop.
    const hops = !ch && flowOnScreen() ? DATA.flow ?? [] : [];
    whereEls.navi.classList.toggle('flowing', hops.length > 0);
    whereEls.prev?.setAttribute('aria-label', hops.length ? 'previous hop' : 'previous');
    whereEls.next?.setAttribute('aria-label', hops.length ? 'next hop' : 'next');
    if (hops.length) {
      const h = hops[flow.i];
      where.innerHTML = h?.passing ? '<b>in passing</b>' : `hop <b>${h?.num ?? ''}</b> of ${hops.filter((x) => !x.passing).length}`;
      where.setAttribute('href', `#${state.chapter ?? 'c-open'}`);
      where.title = '';
      return;
    }
    if (!ch) {
      where.innerHTML = `<b>${state.chapter === 'c-close' ? 'close' : 'the whole flow'}</b>`;
      where.setAttribute('href', `#${state.chapter ?? 'c-open'}`);
      where.title = '';
      return;
    }
    const label = layerLabel(ch.layer);
    if (state.view === 'files') {
      const n = DATA.files[ch.id]?.files.length ?? 0;
      where.innerHTML = `${esc(label)} · file <b>${state.file === null ? '–' : fileOrder(ch.id).indexOf(state.file) + 1}</b>/${n}`;
      where.setAttribute('href', `#${ch.id}/files${state.file === null ? '' : `/${state.file}`}`);
      where.title = state.file === null ? 'every file' : DATA.files[ch.id].files[state.file].p;
      return;
    }
    const el = stopEl(state.stop);
    where.innerHTML = `${esc(label)} · <b>${el ? esc(el.dataset.num) : '–'}</b>/${ch.stops.length}`;
    where.setAttribute('href', `#${state.stop ?? ch.id}`);
    where.title = el ? stopData.get(state.stop).title : ch.title;
  }

  // The navigator shows the level the reader moves through: a PR's stops as
  // ticks, reviewed ones filled and the current one ringed; the stack's PRs on
  // the opening and the close. A tick is a pointer's shortcut; the keys and the
  // link beside it carry the same place for everyone else.
  function drawTicks(ch) {
    const box = whereEls.ticks;
    if (!box) return;
    const items = ch ? (state.view === 'walk' ? ch.stops.map((s) => ({ id: s.id, href: s.id, branch: Boolean(s.branch), title: `${stopEl(s.id)?.dataset.num ?? ''} ${s.title}`.trim() })) : []) : DATA.chapters.length > 1 ? DATA.chapters.map((c) => ({ id: c.id, href: c.id, branch: false, title: `${layerLabel(c.layer)} ${c.title}` })) : [];
    const sig = items.map((x) => x.id).join(' ');
    if (box.dataset.for !== sig) {
      box.innerHTML = items.map((x) => tick({ id: x.id, href: x.href, branch: x.branch, title: x.title.replace(/`/g, '') })).join('');
      box.dataset.for = sig;
    }
    box.hidden = !items.length;
    for (const a of box.children) {
      const id = a.dataset.tk;
      const done = ch ? state.reviewed.has(id) : (stopsOf(id).length > 0 && stopsOf(id).every((s) => state.reviewed.has(s.dataset.stop)));
      a.classList.toggle('on', ch ? id === state.stop : false);
      a.classList.toggle('done', done);
    }
  }

  // ------------------------------------------------------------------ frame
  // A frame's reads of layout run together before its writes, so it lays out
  // once however many parts ask where things are: a read after a write makes
  // the browser lay the page out again on the spot.
  const frameJobs = [];
  let frameQueued = false;
  function inFrame(read, write) {
    frameJobs.push([read, write]);
    queueFrame();
  }
  function queueFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(runFrame);
  }
  // A chapter or a view that opens skips its layout in the press's own
  // frame, which then paints at once with the old one gone; it lays out in
  // the next frame, and the reads that need it wait with it.
  let revealing = null;
  // The first frame shows what the page opens on, so nothing holds before it.
  let painted = false;
  requestAnimationFrame(() => (painted = true));
  function holdLayout(el) {
    if (!painted) return;
    el.style.contentVisibility = 'hidden';
    revealing ??= { els: new Set(), held: true };
    revealing.els.add(el);
    queueFrame();
  }
  function runFrame() {
    if (revealing?.held) {
      revealing.held = false;
      requestAnimationFrame(runFrame);
      return;
    }
    frameQueued = false;
    revealing?.els.forEach((el) => el.style.removeProperty('content-visibility'));
    revealing = null;
    const jobs = frameJobs.splice(0);
    const seen = jobs.map(([r]) => r?.());
    jobs.forEach(([, w], i) => w?.(seen[i]));
  }

  // ------------------------------------------------------------------- rail
  // Measured a frame after the landing: the landing's frame reads one place
  // and scrolls, while the stops it passes over come into range. A second
  // read there would lay out the stops the page is about to leave.
  function revealInRail(item) {
    const rail = fixed('[data-rail]');
    if (!rail) return;
    requestAnimationFrame(() => inFrame(
      () => [item.getBoundingClientRect(), rail.getBoundingClientRect()],
      ([r, box]) => {
        if (r.top < box.top + 8) rail.scrollTop -= box.top + 8 - r.top + 40;
        else if (r.bottom > box.bottom - 8) rail.scrollTop += r.bottom - box.bottom + 40;
      },
    ));
  }
  function openRailBranches(id) {
    const row = $(`.toc-stop[data-stop="${CSS.escape(id)}"]`, fixed('[data-rail]') ?? document);
    const group = row?.closest('.has-branches');
    if (group && row.classList.contains('branch')) setBranches(group, true);
  }
  function setBranches(group, open) {
    group.classList.toggle('open', open);
    $('.toc-more', group)?.setAttribute('aria-expanded', String(open));
  }
  // On a narrow screen the rail is a drawer over the page, and a layer: a
  // press beside it or Escape closes it.
  // The header opens it, or on a phone the navigator, whose menu stays in
  // reach under the drawer.
  const railButtons = () => [$('[data-act="rail"]', fixed('.hdr') ?? document), $('[data-act="rail"]', fixed('[data-navi]') ?? document)].filter(Boolean);
  function openRail(opener = railButtons()[0]) {
    const rail = fixed('[data-rail]');
    if (!rail) return;
    rail.classList.add('open');
    railButtons().forEach((b) => b.setAttribute('aria-expanded', 'true'));
    L.open(rail, { close: closeRail, opener });
  }
  function closeRail() {
    const rail = fixed('[data-rail]');
    if (!rail?.classList.contains('open')) return false;
    rail.classList.remove('open');
    railButtons().forEach((b) => b.setAttribute('aria-expanded', 'false'));
    L.closed(rail);
    return true;
  }
  // A phone has no room for the header under claude.ai's own bar, which
  // already names the page: the header's tools move into the drawer, and the
  // navigator's menu opens it. The same elements move, so every control keeps
  // its one state.
  // The act's key folds on a phone, where it would outgrow the act; wider,
  // it always stands open and its summary hides.
  function foldLegend() {
    const d = $('[data-legend]', fixed('[data-seqs]') ?? document);
    if (d) d.open = !PHONE.matches;
  }
  function placeTools() {
    foldLegend();
    const tools = $('.tools', fixed('.hdr') ?? document) ?? $('[data-rail-tools] .tools', fixed('[data-rail]') ?? document);
    const slot = $('[data-rail-tools]', fixed('[data-rail]') ?? document);
    const hdr = fixed('.hdr');
    if (!tools || !slot || !hdr) return;
    if (PHONE.matches) slot.prepend(tools);
    else if (tools.parentElement !== hdr) hdr.append(tools);
  }
  const PHONE = matchMedia('(max-width: 560px)');
  PHONE.addEventListener?.('change', placeTools);

  // ---------------------------------------------------------------- reviews
  function nextStopAfter(id) {
    const i = allStops.indexOf(stopEl(id));
    return allStops[i + 1]?.dataset.stop ?? null;
  }
  function toggleReviewed(id, { advance } = {}) {
    if (!id) return toast(`<b>nothing picked</b>${keycap('k')} steps to the first part of this PR.`);
    const on = !state.reviewed.has(id);
    if (on) state.reviewed.add(id);
    else state.reviewed.delete(id);
    applyReviewed(id);
    persist();
    updateProgress();
    const ch = stopEl(id).dataset.chapter;
    const chapterDone = on && stopsOf(ch).every((s) => state.reviewed.has(s.dataset.stop));
    const allDone = on && allStops.every((s) => state.reviewed.has(s.dataset.stop));
    S.play(!on ? 'unmark' : allDone ? 'finale' : chapterDone ? 'chapter' : 'reviewed');
    if (chapterDone && !allDone) {
      toast(`<b>chapter reviewed</b>${esc(chapterData.get(ch)?.title ?? '')}`);
      window.WTConfetti?.burst();
    }
    if (allDone) window.WTConfetti?.finale();
    updateWhere();
    reportPins();
    if (allDone) {
      toast(`<b>${DATA.layers.length > 1 ? 'stack' : 'PR'} reviewed</b>Every stop has a tick. The whole flow plays once more.`, 4200);
      setTimeout(() => playFlow({ finale: true, silentStart: true }), 900);
    } else if (on && advance) {
      const next = nextStopAfter(id);
      if (next) setTimeout(() => goStop(next, { sound: false }), 120);
    }
  }
  // A reset acts on the PR chapter that is open, or on the whole walk from
  // the opening and the close; the key sheet names which.
  function resetScope() {
    const ch = chapterData.get(state.chapter);
    return ch ? { el: chapterEl(ch.id), label: layerLabel(ch.layer), layer: ch.layer, stops: stopsOf(ch.id).map((x) => x.dataset.stop) } : null;
  }
  function labelResets() {
    const sc = resetScope();
    const folds = fixed('[data-act="reset-folds"]');
    const marks = fixed('[data-act="reset-progress"]');
    if (arming) return;
    if (folds) {
      folds.textContent = sc ? `reset ${sc.label}'s folds` : 'reset every fold';
      folds.dataset.ask = sc ? `open every diff and file of ${sc.label} as it first was?` : 'open every diff and file as it first was?';
    }
    if (marks) marks.textContent = sc ? `clear ${sc.label}'s review marks` : 'clear every review mark';
  }
  // The ticks, and on the whole walk the answered questions too, cleared in
  // this browser and in the reader's saved progress, which a later visit
  // would merge back.
  function resetProgress(sc = resetScope()) {
    const was = sc ? sc.stops.filter((id) => state.reviewed.has(id)) : [...state.reviewed];
    was.forEach((id) => state.reviewed.delete(id));
    if (!sc) {
      state.qa.clear();
      state.seen.clear();
      if (state.chapter) state.seen.add(state.chapter);
    }
    was.forEach(applyReviewed);
    applyQa();
    persist();
    updateProgress();
    updateWhere();
    S.play('unmark');
    reportPins();
  }
  // A reset asks once, on the button itself: the first press says what it
  // clears, a second press within four seconds does it.
  let arming = null;
  function disarm() {
    if (!arming) return;
    clearTimeout(arming.timer);
    arming.btn.textContent = arming.label;
    arming.btn.classList.remove('arming');
    arming = null;
  }
  function askReset(btn, run) {
    const note = fixed('[data-reset-note]');
    if (arming?.btn === btn) {
      disarm();
      run();
      const sc = resetScope();
      if (note) note.textContent = btn.dataset.act === 'reset-folds' ? (sc ? `${sc.label}'s folds are back to how they started.` : 'Every fold is back to how it started.') : sc ? `${sc.label}'s review marks are cleared.` : 'Every review mark is cleared.';
      return;
    }
    disarm();
    const sc = resetScope();
    const ticks = sc ? sc.stops.filter((id) => state.reviewed.has(id)).length : state.reviewed.size;
    const answers = sc ? 0 : state.qa.size;
    const question = btn.dataset.ask ?? (sc ? `clear ${ticks} ${ticks === 1 ? 'tick' : 'ticks'} in ${sc.label}?` : `clear ${ticks} ${ticks === 1 ? 'tick' : 'ticks'} and ${answers} ${answers === 1 ? 'answer' : 'answers'}?`);
    arming = { btn, label: btn.textContent, timer: setTimeout(disarm, 4000) };
    btn.textContent = `${question} press again`;
    btn.classList.add('arming');
    if (note) note.textContent = '';
  }
  function applyReviewed(id) {
    const el = stopEl(id);
    if (!el) return;
    const on = state.reviewed.has(id);
    el.classList.toggle('reviewed', on);
    el.classList.remove('open');
    $('.reopen', el)?.setAttribute('aria-expanded', 'false');
    $$('[data-act="review"]', el).forEach((b) => b.setAttribute('aria-pressed', String(on)));
    $(`.toc-stop[data-stop="${CSS.escape(id)}"]`)?.classList.toggle('done', on);
  }
  function updateProgress() {
    let total = 0;
    let done = 0;
    for (const ch of chapters) {
      const stops = stopsOf(ch.dataset.chapter);
      const n = stops.filter((s) => state.reviewed.has(s.dataset.stop)).length;
      total += stops.length;
      done += n;
      const p = stops.length ? n / stops.length : state.seen.has(ch.dataset.chapter) ? 1 : 0;
      const ring = $(`[data-ring="${CSS.escape(ch.dataset.chapter)}"] circle:last-child`, fixed('[data-rail]') ?? document);
      if (ring) ring.setAttribute('stroke-dasharray', `${(p * 34.56).toFixed(2)} 40`);
      const seg = $(`[data-meter] .seg[data-chapter="${CSS.escape(ch.dataset.chapter)}"]`, fixed('.hdr') ?? document);
      if (seg) seg.style.setProperty('--p', p);
      const chip = $('[data-chapter-progress]', ch);
      if (chip) chip.textContent = `${n} / ${stops.length} reviewed`;
    }
    const label = fixed('[data-meter-label]');
    if (label) label.textContent = `${done} / ${total} reviewed`;
  }

  // ------------------------------------------------------------------ folds
  // A long hunk folds its unfocused lines. The fold opens and closes from the
  // same control, and closing from the end keeps the control under the
  // pointer instead of throwing the page upward.
  const enhanced = new WeakSet();
  // A code block, a payload's shape or an act's diagram wider than its
  // column scrolls sideways; as a Tab stop it lets the keyboard scroll it
  // with the arrows. A picture's block inside its `.scroll` never overflows.
  // A named group, not a region: a region per code block would bury the
  // page's landmarks. A table, picture or chart's `.scroll` wrapper is a
  // named region and a Tab stop in its markup (views.mjs, tableView).
  const WIDE = '.code, .code-block, .seqs-scroll, .scroll';
  function markWide(c) {
    markAs(c, c.scrollWidth > c.clientWidth + 1);
  }
  function markAs(c, wide) {
    c.classList.toggle('is-wide', wide);
    if (c.matches('.scroll')) return;
    if (wide) {
      const fig = c.closest('figure');
      c.tabIndex = 0;
      c.setAttribute('role', 'group');
      c.setAttribute('aria-label', c.matches('.seqs-scroll') ? "the act's diagram, wider than the screen" : ['code', fig?.dataset.path, $('.rng', fig ?? c)?.textContent, fig?.dataset.layer ? layerLabel(fig.dataset.layer) : '', c.closest('.io')?.querySelector('summary')?.textContent.trim()].filter(Boolean).join(' '));
    } else if (c.hasAttribute('tabindex')) {
      c.removeAttribute('tabindex');
      c.removeAttribute('role');
      c.removeAttribute('aria-label');
    }
  }
  // A block is measured when it comes near the screen, never all at once:
  // reading every block's width after a chapter opens forces the whole
  // chapter's layout in one frame.
  const nearScreen = new Set();
  const wideIO = window.IntersectionObserver
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              nearScreen.add(e.target);
              markWide(e.target);
            } else nearScreen.delete(e.target);
          }
        },
        { rootMargin: '1200px 0px' },
      )
    : null;
  // The act's diagrams are measured in the first frame, before a keyboard
  // reader tabbing down the opening can reach it, and with that frame's own
  // layout; code blocks wait until they are near, and until then their
  // longest line and the column's width tell a wide one, so every block that
  // scrolls is a Tab stop from the start.
  // A chapter's blocks are estimated in an idle moment. A file's few, which
  // the reader may see next, are estimated as they arrive from the file
  // view's width, read once with a frame's reads and again after a resize.
  const fileWidth = new Map();
  function scrollables(root = document, { soon = false } = {}) {
    for (const c of $$(WIDE, root)) {
      if (wideIO && !c.matches('.seqs-scroll')) wideIO.observe(c);
      else requestAnimationFrame(() => c.closest('[hidden]') || markWide(c));
    }
    if (!wideIO) return;
    const list = soon && root.closest('[data-files]');
    if (list && fileWidth.has(list)) estimateWide(root, fileWidth.get(list));
    else if (list)
      inFrame(
        () => wideWidth(root),
        (width) => {
          if (width > 0) fileWidth.set(list, width);
          estimateWide(root, width);
        },
      );
    else whenIdle(() => estimateWide(root));
  }
  const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 300));
  let charW = 0;
  // A block may sit in a narrower column than the stop's (a branch, a note
  // beside the stop), so the estimate errs toward a Tab stop; the measure
  // near the screen takes back any it gave wrongly.
  function wideWidth(root) {
    const ref = root.matches?.('.stop, .fv-file') ? root : $('.stop, .fv-file', root);
    if (!ref || !ref.isConnected || ref.closest('[hidden]')) return 0;
    if (!charW) {
      const ctx2d = document.createElement('canvas').getContext('2d');
      const code = $('.code', ref);
      ctx2d.font = `${code ? getComputedStyle(code).fontSize : '11.5px'} ${getComputedStyle(document.documentElement).getPropertyValue('--code')}`;
      charW = ctx2d.measureText('0'.repeat(100)).width / 100 || 7;
    }
    return ref.clientWidth * 0.8 - 48;
  }
  function estimateWide(root, width = wideWidth(root)) {
    if (width <= 0) return;
    for (const c of $$('.code[data-cols]', root)) {
      if (nearScreen.has(c)) continue;
      markAs(c, (Number(c.dataset.cols) + 11) * charW + 30 > width);
    }
  }
  // A new width changes what overflows; only the blocks near the screen need
  // a look, and the rest get one when they come near.
  let scrollQueued = false;
  function watchScrollables() {
    window.addEventListener('resize', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        fileWidth.clear();
        nearScreen.forEach(markWide);
      });
    });
  }
  function enhance(root) {
    if (enhanced.has(root)) return;
    enhanced.add(root);
    foldHunks(root);
    watchRows(root);
    scrollables(root);
    restoreHunks(root);
    syncFoldAll(root.closest?.('.chapter') ?? root);
  }
  // The rows a diff hides at first fold into one control per run. The
  // renderer marks the walk's; the file view shows more of every diff, so
  // it marks its own past the first 200 rows of a diff longer than 240.
  function foldHunk(fig) {
    if (fig.dataset.folded || waiting(fig)) return;
    fig.dataset.folded = '1';
    const lines = [...$(':scope > .code', fig).children].filter((l) => l.classList.contains('ln') && !l.classList.contains('h'));
    if (fig.dataset.role === 'file' && lines.length > 240) lines.slice(200).forEach((l) => l.classList.add('o'));
    let run = [];
    const flush = () => {
      if (run.length) makeFold(run);
      run = [];
    };
    for (const l of lines) {
      if (l.classList.contains('o')) run.push(l);
      else flush();
    }
    flush();
  }
  const foldHunks = (root) => $$('figure.hunk', root).forEach(foldHunk);

  // ------------------------------------------------------------- diff rows
  // A diff's rows wait as text beside its block until the block nears the
  // screen or something reads them, and the block holds their height
  // meanwhile (walkthrough.css). Code is most of a review page, so the
  // document carries only the code a reader can reach, and every restyle,
  // layout and query walks that alone.
  const waiting = (fig) => $(':scope > .code[data-lazy]', fig);
  function rowsIn(fig) {
    const code = waiting(fig);
    if (!code) return false;
    code.innerHTML = $(':scope > script[type="text/x-lines"]', fig)?.textContent ?? '';
    delete code.dataset.lazy;
    // The file view shows every row of a diff, focus or not.
    if (fig.dataset.role === 'file') for (const l of code.children) l.classList.remove('o', 'f');
    foldHunk(fig);
    // The block's new width is read with the next frame's other reads; a
    // block that skips rendering keeps its estimate until it nears the screen.
    inFrame(
      () => (code.checkVisibility({ contentVisibilityAuto: true }) ? code.scrollWidth > code.clientWidth + 1 : null),
      (wide) => wide === null || markAs(code, wide),
    );
    return true;
  }
  const rowsAround = (el) => $$('figure.hunk', el).forEach(rowsIn);
  // A stop or a file brings its diffs' rows in a screen before it shows, so
  // a reader never meets a block still waiting; the rest of the chapter
  // arrives in idle moments (fillRows), so no frame parses more than a screen.
  const rowsIO = window.IntersectionObserver
    ? new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            if (e.target.matches('.fv-file') && unfilled(e.target)) fillFile(e.target);
            rowsAround(e.target);
          }),
        { rootMargin: '900px 0px' },
      )
    : null;
  function watchRows(root) {
    for (const code of $$('figure.hunk > .code[data-lazy]', root)) {
      const fig = code.parentElement;
      if (rowsIO) rowsIO.observe(fig.closest('.stop, .fv-file') ?? fig);
      else rowsIn(fig);
    }
  }
  // Find in page reaches only rows in the document, so the open chapter
  // brings the rest of its rows in while the reader reads, a few diffs per
  // idle moment.
  let fillRun = 0;
  function fillRows(ch) {
    const run = ++fillRun;
    const left = $$('figure.hunk > .code[data-lazy]', ch).map((c) => c.parentElement);
    const next = (deadline) => {
      if (run !== fillRun || ch.hidden) return;
      // A few milliseconds at a time, however long the browser offers: a key
      // pressed meanwhile waits for the chunk to end.
      const until = performance.now() + Math.min(8, (deadline?.timeRemaining() ?? 8) - 2);
      while (left.length) {
        rowsIn(left.shift());
        if (performance.now() > until) return whenIdle(next);
      }
    };
    whenIdle(next);
  }
  // A chapter that closes gives its rows back to text, so a long read does
  // not pile every chapter's code into the document.
  function shelveRows(ch) {
    if (!ch.hidden) return;
    for (const code of $$('figure.hunk > .code:not([data-lazy])', ch)) {
      const fig = code.parentElement;
      if (!$(':scope > script[type="text/x-lines"]', fig)) continue;
      if (state.sel?.fig === fig) clearLineSelection();
      code.replaceChildren();
      code.dataset.lazy = '';
      delete fig.dataset.folded;
    }
  }
  function makeFold(group) {
    const n = group.length;
    // A fold row is a disclosure too: its caret turns as it opens.
    const words = (open) => `${icon('caret')}${open ? `hide ${n} line${n > 1 ? 's' : ''}` : `${n} more line${n > 1 ? 's' : ''}`}`;
    const top = document.createElement('button');
    top.type = 'button';
    top.className = 'fold';
    top.setAttribute('aria-expanded', 'false');
    top.innerHTML = words(false);
    const end = document.createElement('button');
    end.type = 'button';
    end.className = 'fold end';
    end.hidden = true;
    end.setAttribute('aria-expanded', 'true');
    end.innerHTML = words(true);
    group[0].before(top);
    group.at(-1).after(end);
    const set = (open, from) => {
      const y0 = from.getBoundingClientRect().top;
      holdAnchor(() => {
        group.forEach((l) => l.classList.toggle('show', open));
        top.innerHTML = words(open);
        top.setAttribute('aria-expanded', String(open));
        end.hidden = !open;
        if (from === end) window.scrollBy(0, top.getBoundingClientRect().top - y0);
      });
      const code = top.closest('.code');
      if (code) markWide(code);
      S.play(open ? 'unfold' : 'fold');
      reportPins();
    };
    top.addEventListener('click', () => set(top.getAttribute('aria-expanded') !== 'true', top));
    end.addEventListener('click', () => set(false, end));
  }
  function unfoldLine(ln) {
    if (!ln.classList.contains('o') || ln.classList.contains('show')) return;
    let b = ln.previousElementSibling;
    while (b && !b.classList.contains('fold')) b = b.previousElementSibling;
    b?.click();
  }

  // ------------------------------------------------------------ diff folds
  // Every diff folds from the caret that leads its header, and this browser
  // remembers each fold, so a reader hides what they have read. Only a fold
  // that differs from its section's default is stored.
  const folds = store.get('fold', {});
  const remembered = (key, dflt) => (key in folds ? folds[key] : dflt);
  function remember(key, open, dflt) {
    if (open === dflt) delete folds[key];
    else folds[key] = open;
  }
  const saveFolds = () => store.set('fold', folds);
  const hunkKey = (fig) => `h:${fig.dataset.role === 'file' ? `${fig.dataset.layer}|file` : fig.dataset.stop ?? ''}|${fig.dataset.hunk}|${fig.dataset.role}`;
  function markHunk(fig, open) {
    fig.classList.toggle('shut', !open);
    // Off screen, a folded diff holds its header's height, not its lines'.
    fig.dataset.tall ??= fig.style.containIntrinsicSize;
    fig.style.containIntrinsicSize = open ? fig.dataset.tall : 'auto 40px';
    const b = $(':scope > figcaption .hunk-fold', fig);
    b?.setAttribute('aria-expanded', String(open));
    b?.setAttribute('aria-label', open ? 'fold this diff' : 'open this diff');
  }
  function setHunk(fig, open) {
    markHunk(fig, open);
    remember(hunkKey(fig), open, true);
  }
  function toggleHunk(btn) {
    const fig = btn.closest('figure.hunk');
    const open = fig.classList.contains('shut');
    setHunk(fig, open);
    saveFolds();
    syncFoldAll(fig.closest('.chapter'));
    S.play(open ? 'unfold' : 'fold');
    reportPins();
  }
  function restoreHunks(root) {
    for (const fig of $$('figure.hunk', root)) if (!remembered(hunkKey(fig), true)) markHunk(fig, false);
  }
  // One control folds or opens every diff of the walk, and `z` presses it.
  function setAllDiffs(btn) {
    const ch = btn.closest('.chapter');
    const open = btn.getAttribute('aria-expanded') !== 'true';
    $$('[data-walk] figure.hunk', ch).forEach((fig) => setHunk(fig, open));
    saveFolds();
    syncFoldAll(ch);
    S.play(open ? 'unfold' : 'fold');
    reportPins();
  }
  function syncFoldAll(ch) {
    const btn = ch && $('[data-act="fold-all"]', ch);
    if (!btn) return;
    const open = $$('[data-walk] figure.hunk', ch).some((fig) => !fig.classList.contains('shut'));
    btn.setAttribute('aria-expanded', String(open));
    $('span', btn).textContent = open ? 'fold every diff' : 'open every diff';
    if (ch.dataset.chapter === state.chapter) syncNaviFold();
  }
  // Every fold of the scope back to its section's default, here and in what
  // this browser keeps: a hunk's key starts with its stop, or with its layer
  // in the file view, and a file's with its layer.
  function resetFolds(sc = resetScope()) {
    const root = sc?.el ?? document;
    const stops = new Set(sc?.stops ?? []);
    const mine = (k) => !sc || k.startsWith(`f:${sc.layer}|`) || k.startsWith(`h:${sc.layer}|file|`) || stops.has(k.slice(2).split('|')[0]);
    for (const k of Object.keys(folds)) if (mine(k)) delete folds[k];
    $$('figure.hunk.shut', root).forEach((fig) => markHunk(fig, true));
    $$('.fv-file', root).forEach((sec) => setFile(sec, sec.dataset.dflt === '1'));
    saveFolds();
    (sc ? [sc.el] : chapters).forEach(syncFoldAll);
    $$('[data-act="files-all"]', root).forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
      $('span', b).textContent = 'open every file';
    });
    syncNaviFold();
    S.play('unfold');
    reportPins();
  }
  // The open PR chapter's fold control: every diff of the walk, or every file
  // of the file view. The navigator mirrors it, so it is in reach anywhere in
  // the chapter, and z presses it.
  function chapterFold() {
    const ch = chapterData.has(state.chapter) ? chapterEl(state.chapter) : null;
    if (!ch) return null;
    return state.view === 'files' ? $('[data-files] [data-act="files-all"]', ch) : $('[data-act="fold-all"]', ch);
  }
  // The navigator sits after every chapter, so its button is looked up once;
  // a stop that lays out as it comes near syncs it too.
  let naviFold;
  function syncNaviFold() {
    const nb = (naviFold ??= fixed('[data-navi] [data-act="fold"]'));
    if (!nb) return;
    const src = chapterFold();
    nb.hidden = !src;
    if (!src) return;
    const open = src.getAttribute('aria-expanded') === 'true';
    nb.setAttribute('aria-expanded', String(open));
    nb.setAttribute('aria-label', $('span', src)?.textContent ?? 'fold');
    $('[data-in]', nb)?.toggleAttribute('hidden', !open);
    $('[data-out]', nb)?.toggleAttribute('hidden', open);
  }
  function foldKey() {
    chapterFold()?.click();
  }

  // ------------------------------------------------------------- file view
  // Every changed file of a PR in reading order. Each hunk already sits once
  // on the page, at its home in the walk; the view clones those, so the page
  // carries one copy of the diff.
  const built = new Set();
  // Each PR numbers the diffs of a file on its own, so an id names a diff
  // only within its PR: a layer's homes are indexed once, across its chapters.
  const homes = new Map();
  function homeFigure(chId, id) {
    const layer = chapterData.get(chId)?.layer;
    if (!homes.has(layer)) {
      const figs = chaptersOfLayer(layer).flatMap((c) => $$('figure.hunk[data-role="home"]', chapterEl(c)));
      homes.set(layer, new Map(figs.filter((f) => f.dataset.layer === layer).map((f) => [f.dataset.hunk, f])));
    }
    return homes.get(layer).get(id) ?? null;
  }
  function cloneHunk(chId, id, home, kind) {
    const src = homeFigure(chId, id);
    if (!src) return null;
    const fig = src.cloneNode(true);
    fig.dataset.role = 'file';
    fig.removeAttribute('data-focus');
    fig.removeAttribute('data-stop');
    fig.removeAttribute('data-folded');
    const oldCap = $('figcaption', fig);
    const rng = $('.rng', oldCap)?.outerHTML ?? '';
    const churn = $('.churn', oldCap)?.outerHTML ?? '';
    const cut = $('[data-cut]', oldCap)?.outerHTML ?? '';
    oldCap?.remove();
    $$('.fold, .sel-fab', fig).forEach((b) => b.remove());
    $$('.ln', fig).forEach((l) => l.classList.remove('o', 'f', 'show', 'sel'));
    // A clone of a diff whose rows still wait holds the file view's height.
    const n = Number($(':scope > .code[data-lazy]', fig)?.dataset.n ?? -1);
    if (n >= 0) {
      fig.style.setProperty('--rows', String(1 + (n > 240 ? 200 : n)));
      fig.style.setProperty('--folds', n > 240 ? '1' : '0');
    }
    const cap = document.createElement('figcaption');
    cap.className = 'hunk-meta';
    const where = home ? homeLink(home, kind) : '';
    cap.innerHTML = `<button type="button" class="hunk-fold" aria-expanded="true" aria-label="fold this diff">${icon('caret')}</button>${rng}${churn}${cut}<span class="sp"></span>${where}`;
    fig.prepend(cap);
    markHunk(fig, remembered(hunkKey(fig), true));
    return fig;
  }
  function homeLink(home, kind) {
    if (home.startsWith('hk-')) return `<a class="home-of" href="#${esc(home)}">not in the walk</a>`;
    const s = stopData.get(home);
    const el = stopEl(home);
    if (!s || !el) return '';
    const rel = kind === 'p' ? '<span class="rel">test ·</span> ' : kind === 'm' ? '<span class="rel">beside ·</span> ' : '';
    return `<a class="home-of to-stop" href="#${esc(home)}">${rel}<b>${esc(el.dataset.num)}</b> <span class="tt">${esc(s.title.replace(/`/g, ''))}</span></a>`;
  }
  const STATUS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'type changed' };
  function fileSection(chId, i) {
    const view = DATA.files[chId];
    const f = view.files[i];
    const layer = chapterData.get(chId).layer;
    const head = layerById.get(layer)?.head ?? '';
    const sec = document.createElement('section');
    const test = f.of !== null;
    sec.className = test ? 'fv-file test' : 'fv-file';
    sec.id = `${chId}-f${i}`;
    sec.tabIndex = -1;
    sec.dataset.fileI = String(i);
    sec.dataset.path = f.p;
    sec.dataset.layer = layer;
    sec.dataset.chapter = chId;
    // The walk's files open; a test, a file the walk skips, a generated file
    // or a long diff starts closed, one click or `open every file` away, and
    // the reader's own fold wins over either.
    const skip = skipped(f);
    const dflt = !(f.a + f.d > 400 || f.t === 'generated' || skip || test);
    sec.dataset.dflt = dflt ? '1' : '0';
    const open = remembered(`f:${layer}|${f.p}`, dflt);
    const name = f.p.split('/').pop();
    const tests = f.tests.length ? `<a class="to-tests" href="#${esc(chId)}/files/${f.tests[0]}">${icon('test')}${f.tests.length} ${f.tests.length === 1 ? 'test' : 'tests'}</a>` : '';
    // A deleted file exists only before this PR, so its link opens the base.
    const gone = f.s === 'D';
    const url = `https://github.com/${DATA.repo}/blob/${gone ? layerById.get(layer)?.base ?? '' : head}/${f.p.split('/').map(encodeURIComponent).join('/')}`;
    sec.innerHTML = `<header class="fv-head"><button type="button" class="fv-toggle" aria-expanded="${open}" aria-label="${open ? 'fold' : 'open'} ${esc(name)}">${icon('caret')}</button>${test ? tag(`${icon('test')}test`, { kind: 'tested' }) : ''}<h4 class="fv-path"><a href="${esc(url)}" target="_blank" rel="noopener" translate="no" title="${gone ? 'open on GitHub before this PR' : 'open on GitHub at the head'}">${esc(f.p)}</a></h4><span class="fv-meta"><span>${esc(STATUS[f.s?.[0]] ?? f.s)}</span><span class="churn"><span class="p">+${f.a}</span> <span class="m">−${f.d}</span></span><span>${f.n} ${f.n === 1 ? 'hunk' : 'hunks'}</span>${test ? `<span translate="no">covers ${esc(view.files[f.of].p.split('/').pop())}</span>` : ''}${skip ? tag('not in the walk') : ''}</span><span class="sp"></span>${tests}</header><div class="fv-body"${open ? '' : ' hidden'}></div>`;
    return sec;
  }
  function fillFile(sec) {
    const body = $('.fv-body', sec);
    if (!body || body.dataset.filled) return;
    body.dataset.filled = '1';
    const chId = sec.dataset.chapter;
    const f = DATA.files[chId].files[Number(sec.dataset.fileI)];
    if (f.b) {
      body.innerHTML = `<p class="local-note">${esc(f.b)}</p>`;
      return;
    }
    for (let k = 0; k < f.n; k++) {
      const fig = cloneHunk(chId, `${f.p}#h${k + 1}`, f.homes[k], f.kinds?.[k]);
      if (fig) body.append(fig);
    }
    foldHunks(body);
    watchRows(sec);
    scrollables(sec, { soon: true });
  }
  function fileOrder(chId) {
    return $$(`[data-files="${CSS.escape(chId)}"] .fv-file`).map((s) => Number(s.dataset.fileI));
  }
  function orderOf(chId) {
    return state.order[chId] ?? DATA.files[chId]?.order ?? 'entry';
  }
  function stopLabel(chId, i) {
    const s = chapterData.get(chId).stops[i];
    const el = stopEl(s.id);
    return `${el?.dataset.num ?? i + 1} · ${s.title}`;
  }
  // Mirrors files.mjs groupsOf: tiers bottom-up for stored data first; stops
  // in walk order, then the rest by tier, for the entry first.
  const RANK = ['storage', 'contract', 'data', 'logic', 'wiring', 'entry', 'ui', 'ops', 'docs', 'generated'];
  const TIER_LABEL = { storage: 'stored data', contract: 'contracts and types', data: 'data access', logic: 'logic', wiring: 'wiring', entry: 'entry points', ui: 'UI', ops: 'config, CI and scripts', docs: 'docs', generated: 'generated and lockfiles', test: 'tests with no changed subject' };
  function groupsOf(chId, order) {
    const view = DATA.files[chId];
    const own = view.files.map((f, i) => ({ f, i })).filter(({ f }) => f.of === null);
    const byTier = (list) =>
      [...RANK, 'test']
        .map((t) => ({ key: t, label: TIER_LABEL[t], items: list.filter(({ f }) => f.t === t) }))
        .filter((g) => g.items.length);
    if (order === 'storage') return byTier(own).map((g) => ({ ...g, items: [...g.items].sort((a, b) => (b.f.first ?? -1) - (a.f.first ?? -1) || a.f.p.localeCompare(b.f.p)).map(({ i }) => i) }));
    const cited = own.filter(({ f }) => f.first !== null && f.t !== 'test').sort((a, b) => a.f.first - b.f.first || a.f.p.localeCompare(b.f.p));
    const groups = [];
    for (const { f, i } of cited) {
      const last = groups.at(-1);
      if (last && last.stop === f.first) last.items.push(i);
      else groups.push({ key: `s${f.first}`, stop: f.first, label: stopLabel(chId, f.first), items: [i] });
    }
    const rest = own.filter(({ f }) => f.first === null || f.t === 'test');
    return groups.concat(byTier(rest).map((g) => ({ ...g, key: `rest-${g.key}`, label: `not in the walk · ${g.label}`, items: g.items.map(({ i }) => i) })));
  }
  const skipped = (f) => f.homes.length > 0 && f.homes.every((h) => String(h).startsWith('hk-'));
  function setFile(sec, open, { soon = false } = {}) {
    const body = $('.fv-body', sec);
    const btn = $('.fv-toggle', sec);
    if (!body || !btn) return;
    remember(`f:${sec.dataset.layer}|${sec.dataset.path}`, open, sec.dataset.dflt === '1');
    if (body.hidden !== open) return;
    if (open && !soon) fillFile(sec);
    body.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', `${open ? 'fold' : 'open'} ${sec.dataset.path.split('/').pop()}`);
  }
  // Every file at once, the long and the skipped ones included.
  function setAllFiles(btn) {
    const list = btn.closest('[data-files]');
    const open = btn.getAttribute('aria-expanded') !== 'true';
    // Every file opens now and fills as fillFiles does, those near the screen first.
    $$('.fv-file', list).forEach((sec) => setFile(sec, open, { soon: true }));
    if (open) fillFiles(list, { now: 0 });
    saveFolds();
    btn.setAttribute('aria-expanded', String(open));
    $('span', btn).textContent = open ? 'close every file' : 'open every file';
    syncNaviFold();
    S.play(open ? 'unfold' : 'fold');
    reportPins();
  }
  function setAllSkipped(btn) {
    const hk = btn.closest('[data-hk]');
    const open = btn.getAttribute('aria-expanded') !== 'true';
    $$('details', hk).forEach((d) => (d.open = open));
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'close all' : `open all ${$$('details', hk).length}`;
    S.play(open ? 'unfold' : 'fold');
    reportPins();
  }
  function buildFiles(ch) {
    const chId = ch.dataset.chapter;
    const host = $('[data-files]', ch);
    const view = DATA.files[chId];
    if (!host || !view || built.has(chId)) return;
    built.add(chId);
    const n = view.files.length;
    const adds = view.files.reduce((s, f) => s + f.a, 0);
    const dels = view.files.reduce((s, f) => s + f.d, 0);
    // Counted like the tabs and the ledger: every file, tests on a badge too.
    const skips = view.files.filter(skipped).length;
    const bar = `<div class="fv-bar"><span class="keyline">the walk opens ${n - skips} of these ${n} files${skips ? `; the ${skips} it skips say ${tag('not in the walk')} and start closed` : ''}</span><button type="button" class="btn outline" data-act="files-all" aria-expanded="false" aria-keyshortcuts="z"><span>open every file</span></button></div>`;
    host.innerHTML = `<div class="fv-top"><h2 class="mark">every file <em>${n} files · +${adds.toLocaleString('en-US')} −${dels.toLocaleString('en-US')}</em></h2><div class="tabs fv-order" role="radiogroup" aria-label="reading order"><button type="button" class="tab" role="radio" data-order="storage">↑ from the stored data</button><button type="button" class="tab" role="radio" data-order="entry">↓ from the entry, in walk order</button></div><p class="fv-why" data-fv-why></p><p class="keyline"><span class="key-hint">${keycap('j')} ${keycap('k')} step through the files. </span>Each test follows the file it covers, closed until you open it.</p>${bar}</div><div class="fv-list" data-fv-list></div>`;
    host._sections = view.files.map((f, i) => fileSection(chId, i));
    arrangeFiles(chId, orderOf(chId));
    fillFiles(host);
  }
  // An open file's diffs are copies of the walk's. The view copies the first
  // few where it opens, a file that nears the screen or that a link lands on
  // at once, and the rest a few milliseconds at a time, so it opens in one
  // frame and find in page still reaches every diff.
  const unfilled = (sec) => {
    const body = $('.fv-body', sec);
    return Boolean(body && !body.hidden && !body.dataset.filled);
  };
  function fillNow(sec) {
    fillFile(sec);
    rowsAround(sec);
  }
  let filesRun = 0;
  function fillFiles(host, { now = 4 } = {}) {
    const run = ++filesRun;
    const left = $$('.fv-file', host).filter(unfilled);
    left.splice(0, now).forEach(fillNow);
    left.forEach((sec) => rowsIO?.observe(sec));
    const next = (deadline) => {
      if (run !== filesRun || host.hidden || host.closest('.chapter')?.hidden) return;
      const until = performance.now() + Math.min(8, (deadline?.timeRemaining() ?? 8) - 2);
      while (left.length) {
        const sec = left.shift();
        if (unfilled(sec)) fillNow(sec);
        if (performance.now() > until) return whenIdle(next);
      }
    };
    whenIdle(next);
  }
  function arrangeFiles(chId, order) {
    const host = $(`[data-files="${CSS.escape(chId)}"]`);
    const list = $('[data-fv-list]', host);
    const view = DATA.files[chId];
    const sections = host._sections;
    list.textContent = '';
    for (const g of groupsOf(chId, order)) {
      const h = document.createElement('h3');
      h.className = 'kicker fv-group';
      h.innerHTML = `${esc(g.label)} <span>${g.items.length} ${g.items.length === 1 ? 'file' : 'files'}</span>`;
      list.append(h);
      for (const i of g.items) {
        list.append(sections[i]);
        for (const t of view.files[i].tests) list.append(sections[t]);
      }
    }
    $$('.fv-order [data-order]', host).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.order === order)));
    const why = $('[data-fv-why]', host);
    if (why) why.textContent = order === view.order ? view.reason : order === 'storage' ? 'Read from the stored data up: schema, data access, logic, entry points, then UI.' : 'Read from where the request enters, in the order the walk runs; files no stop cites come last.';
    if (state.chapter === chId && state.view === 'files') renderRailFiles(chId);
    reportPins();
  }
  function setOrder(chId, order) {
    state.order = { ...state.order, [chId]: order };
    store.set('order', state.order);
    arrangeFiles(chId, order);
    S.play('toggle');
  }
  function renderRailFiles(chId) {
    const box = $(`[data-toc-files="${CSS.escape(chId)}"]`);
    const view = DATA.files[chId];
    if (!box || !view) return;
    box.innerHTML = groupsOf(chId, orderOf(chId))
      .map((g) => {
        const rows = g.items.map((i, k) => {
          const f = view.files[i];
          return `<li${k >= 7 ? ' class="more-row"' : ''}><a class="toc-file" href="#${esc(chId)}/files/${i}" data-file-i="${i}"><span class="t" translate="no">${esc(f.p.split('/').pop())}</span><span class="c"><span class="p">+${f.a}</span>${f.tests.length ? ` <span class="tt" aria-label="${f.tests.length} ${f.tests.length === 1 ? 'test' : 'tests'}">${icon('test')}${f.tests.length}</span>` : ''}</span></a></li>`;
        });
        const more = g.items.length > 7 ? `<li><button type="button" class="btn text toc-more" aria-expanded="false">+${g.items.length - 7} more</button></li>` : '';
        return `<li class="toc-group"><span class="g">${esc(g.label)}</span><ol>${rows.join('')}${more}</ol></li>`;
      })
      .join('');
    markRailFile();
  }
  function markRailFile() {
    $$('.toc-file.on', fixed('[data-rail]') ?? document).forEach((a) => a.classList.remove('on'));
    if (state.file === null) return;
    const a = $(`[data-toc-files="${CSS.escape(state.chapter)}"] .toc-file[data-file-i="${state.file}"]`);
    if (a) {
      a.closest('li')?.classList.remove('more-row');
      a.classList.add('on');
      revealInRail(a);
    }
  }
  function goFile(i, { sound = true, instant = false } = {}) {
    const sec = document.getElementById(`${state.chapter}-f${i}`);
    if (!sec) return;
    state.file = i;
    navAt = performance.now();
    markRailFile();
    updateWhere();
    if (sound) S.play('step');
    replaceHash(`${state.chapter}/files/${i}`);
    // The file takes focus like a stop, so Tab goes on inside it; its diffs
    // show their rows on the landing frame.
    if (unfilled(sec)) fillFile(sec);
    rowsAround(sec);
    inFrame(
      () => clampY(landY(sec)),
      (y) => {
        glideTo(y, { instant, el: sec });
        if (!instant) requestAnimationFrame(() => sec.contains(document.activeElement) || sec.focus({ preventScroll: true }));
      },
    );
  }
  function stepFile(delta) {
    const secs = $$(`[data-files="${CSS.escape(state.chapter)}"] .fv-file`);
    if (!secs.length) return;
    const line = hdrBottom() + 12;
    const cur = state.file === null ? null : document.getElementById(`${state.chapter}-f${state.file}`);
    let target;
    if (cur && (moving() || inView(cur))) target = secs[secs.indexOf(cur) + delta];
    else if (delta > 0) target = secs.find((s) => s.getBoundingClientRect().top > line + 2);
    else target = [...secs].reverse().find((s) => s.getBoundingClientRect().top < line - 2);
    if (target) goFile(Number(target.dataset.fileI));
  }
  function toggleFile(btn) {
    const sec = btn.closest('.fv-file');
    const open = $('.fv-body', sec).hidden;
    setFile(sec, open);
    saveFolds();
    S.play(open ? 'unfold' : 'fold');
    reportPins();
  }

  // --------------------------------------------------------- line selection
  const gutter = (ln) => {
    const g = ln.dataset.g || '';
    const o = parseInt(g.slice(0, 4), 10);
    const n = parseInt(g.slice(5, 9), 10);
    return { old: Number.isNaN(o) ? null : o, new: Number.isNaN(n) ? null : n, sign: ln.dataset.s || ' ' };
  };
  const codeLines = (fig) => {
    rowsIn(fig);
    return $$('.ln', fig).filter((l) => !l.classList.contains('h'));
  };
  function selectLines(fig, a, b) {
    clearLineSelection();
    const lines = codeLines(fig);
    const [i, j] = [lines.indexOf(a), lines.indexOf(b)].sort((x, y) => x - y);
    const picked = lines.slice(i, j + 1);
    picked.forEach((l) => l.classList.add('sel'));
    const nums = picked.map(gutter);
    const side = nums.some((x) => x.new !== null) ? 'new' : 'old';
    const vals = nums.map((x) => x[side]).filter((x) => x !== null);
    if (!vals.length) return clearLineSelection();
    state.sel = { fig, first: picked[0], lines: picked, layer: fig.dataset.layer, path: fig.dataset.path, side, start: Math.min(...vals), end: Math.max(...vals), text: picked.map((l) => `${gutter(l).sign}${l.textContent}`).join('\n') };
    showSelFab(picked.at(-1));
  }
  function clearLineSelection({ text = false } = {}) {
    state.sel?.lines.forEach((l) => l.classList.remove('sel'));
    state.sel = null;
    $('.sel-fab')?.remove();
    if (text) window.getSelection()?.removeAllRanges();
  }
  // A small comment button follows a line selection, so the gesture is
  // findable without the key.
  function showSelFab(ln) {
    $('.sel-fab')?.remove();
    if (!comments.api || comments.off) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn outline sel-fab';
    b.textContent = 'comment';
    b.setAttribute('aria-keyshortcuts', 'c');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      commentOnSelection();
    });
    b.style.top = `${ln.offsetTop}px`;
    ln.closest('.code')?.append(b);
  }

  let anchorLine = null;
  document.addEventListener('click', (e) => {
    if (comments.mode || comments.picking) return;
    const ln = e.target.closest?.('.ln');
    if (!ln || ln.classList.contains('h') || e.target.closest('.sel-fab')) return;
    const box = ln.getBoundingClientRect();
    if (e.clientX - box.left > 96) return;
    const fig = ln.closest('.hunk');
    window.getSelection()?.removeAllRanges();
    if (e.shiftKey && anchorLine && anchorLine.closest('.hunk') === fig) selectLines(fig, anchorLine, ln);
    else {
      anchorLine = ln;
      selectLines(fig, ln, ln);
    }
  });
  document.addEventListener('mouseup', () => {
    if (comments.mode || comments.picking) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const node = s.anchorNode?.parentElement?.closest?.('.ln');
    if (!node) return;
    const fig = node.closest('.hunk');
    const endLn = s.focusNode?.parentElement?.closest?.('.ln') ?? node;
    if (endLn.closest('.hunk') !== fig) return;
    selectLines(fig, node, endLn);
  });

  // ---------------------------------------------------------------- comments
  // Native claude.ai comments. The page names each spot in words a person and
  // Claude can both read ("#5983@9f0fc16 path new L50-57"), and the shell
  // draws every thread. Pins go only where the named spot is on screen; the
  // rest stay in the shell's own list, and opening one brings its spot here.
  const comments = { api: null, anchors: null, mode: false, picking: false, threads: [], off: false };
  const enc = new TextEncoder();
  const bytes = (s) => enc.encode(s).length;
  const clean = (s) =>
    String(s ?? '')
      .replace(/`/g, '')
      .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  function fit(s, max = 128) {
    let t = clean(s);
    if (bytes(t) <= max) return t;
    t = t.slice(0, max);
    while (t && bytes(`${t}…`) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }
  const prOf = (layer) => layerLabel(layer);
  // A hop's anchor names its number among the stack's hops; a step in
  // passing names the components it runs between.
  const hopAnchor = (h) => fit(h.passing ? `flow in passing: ${h.from} → ${h.to}` : `flow hop ${h.num}: ${h.from} → ${h.to}`);
  const shaOf = (layer) => (layerById.get(layer)?.head ?? '').slice(0, 7);
  function lineAnchor(layer, path, side, a, b) {
    const head = `${prOf(layer)}@${shaOf(layer)}`;
    const tail = `${side} L${a}${b !== a ? `-${b}` : ''}`;
    const parts = path.split('/');
    let p = path;
    while (bytes(`${head} ${p} ${tail}`) > 128 && parts.length > 1) {
      parts.shift();
      p = `…/${parts.join('/')}`;
    }
    return `${head} ${p} ${tail}`;
  }
  const stopAnchor = (id) => {
    const s = stopData.get(id);
    return fit(`${prOf(s.layer)} stop ${stopEl(id)?.dataset.num}: ${s.title}`);
  };
  const fileAnchor = (layer, path) => fit(`${prOf(layer)}@${shaOf(layer)} ${path} whole file`);

  // A spot that is none of the named ones anchors by its first words, so a
  // person and Claude can find it again. A text anchor's scope is the part
  // that holds it: a stop, the flow, or a chapter.
  // Inside one report the page holds still, so each element's words are read once.
  let wordsMemo = null;
  const spaced = (el) => {
    const known = wordsMemo?.get(el);
    if (known !== undefined) return known;
    const parts = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) parts.push(c.nodeValue);
        else if (c.nodeType === 1 && !c.matches('.key, script, style, [hidden]')) {
          parts.push(' ');
          walk(c);
          parts.push(' ');
        }
      }
    };
    walk(el);
    const words = clean(parts.join(''));
    wordsMemo?.set(el, words);
    return words;
  };
  const scopeOf = (chapter) => {
    const id = chapter?.dataset.chapter;
    if (id === 'c-open') return 'opening';
    if (id === 'c-close') return 'close';
    return chapterData.has(id) ? prOf(chapterData.get(id).layer) : null;
  };
  // Every element takes a comment. The spot is the nearest block around the
  // pointer that holds words; a label (the uppercase first line of a small
  // box, like "after") gives the box it names, and a wrapper that holds the
  // same words gives itself, so one spot stands for one run of words.
  const inlineish = new Set(['inline', 'contents']);
  const isBlock = (e) => e instanceof HTMLElement && !inlineish.has(getComputedStyle(e).display);
  function captionOf(e) {
    const box = e.parentElement;
    if (!box || box.firstElementChild !== e || getComputedStyle(e).textTransform !== 'uppercase') return null;
    for (let n = box.firstChild; n && n !== e; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return null;
    const own = spaced(e).length;
    const all = spaced(box).length;
    return own <= 24 && all > own + 2 && all <= 400 ? box : null;
  }
  function blockOf(el, root) {
    let spot = null;
    for (let e = el; e && e !== root && root.contains(e); e = e.parentElement) {
      if (isBlock(e) && spaced(e).length >= 3) {
        spot = e;
        break;
      }
    }
    for (let up = spot; up; ) {
      spot = up;
      const box = captionOf(spot);
      const wrap = spot.parentElement;
      up = box && box !== root ? box : wrap && wrap !== root && isBlock(wrap) && spaced(wrap) === spaced(spot) ? wrap : null;
    }
    return spot;
  }
  // A question card comments on its question.
  const cardSpot = (card) => $('.front .qt', card) ?? card;
  // The parts inside a scope that anchor on their own: a chapter's stops and
  // the flow; code lines, which anchor by line.
  const SUB_SCOPES = '.stop, [data-flow]';
  const NO_WORDS = '.code, svg, script, style, .key';
  // Each report lists a scope's spots once: every element that is its own
  // spot, with its words, in page order.
  let spotLists = null;
  function spotsIn(root) {
    const cached = spotLists?.get(root);
    if (cached) return cached;
    const list = [];
    const walk = (n) => {
      for (const e of n.children) {
        if (e.matches(NO_WORDS) || e.matches(SUB_SCOPES)) continue;
        if (e.matches('.card')) {
          const q = cardSpot(e);
          list.push([q, spaced(q)]);
          continue;
        }
        if (blockOf(e, root) === e) list.push([e, spaced(e)]);
        walk(e);
      }
    };
    walk(root);
    spotLists?.set(root, list);
    return list;
  }
  function withSpots(fn) {
    spotLists = new Map();
    wordsMemo = new WeakMap();
    try {
      return fn();
    } finally {
      spotLists = null;
      wordsMemo = null;
    }
  }
  // A text anchor quotes a spot's first 60 bytes. Spots in one scope that
  // quote alike tell apart by their order: the second one's anchor ends in 2.
  const quoted = (words) => fit(words, 60).replace(/…$/, '');
  const textAnchor = (scope, text) => fit(`${scope} text: “${fit(text, 60)}”`);
  function quoteOf(anchor) {
    const m = /“(.+?)…?”(?: (\d+))?$/.exec(anchor);
    return { quote: m?.[1].replace(/…$/, '') ?? '', nth: Number(m?.[2] ?? 1) };
  }
  function numbered(spot) {
    if (!spot.root) return spot;
    const q = quoted(spot.words);
    const i = withSpots(() => spotsIn(spot.root).filter(([, w]) => w.startsWith(q) && quoted(w) === q).findIndex(([e]) => e === spot.at));
    return i > 0 ? { ...spot, anchor: `${spot.anchor} ${i + 1}` } : spot;
  }
  // The spot a quote names; a selection's quote, from inside a block, names
  // the smallest spot that holds it.
  function spotByWords(root, { quote, nth }) {
    if (!root || !quote) return null;
    const list = spotsIn(root);
    const same = list.filter(([, w]) => w.startsWith(quote) && quoted(w) === quote);
    if (same.length) return (same[nth - 1] ?? same[0])[0];
    const first = list.find(([, w]) => w.startsWith(quote));
    if (first) return first[0];
    let best = null;
    for (const [e, w] of list) if (w.includes(quote) && (!best || w.length < best[1].length)) best = [e, w];
    return best?.[0] ?? null;
  }
  function textSpot(el) {
    const flowEl = el.closest('[data-flow]');
    const chapter = el.closest('.chapter');
    const root = flowEl ?? chapter;
    const scope = flowEl ? 'flow' : scopeOf(chapter);
    if (!scope || !root) return null;
    const card = el.closest('.card');
    const block = card && root.contains(card) ? cardSpot(card) : blockOf(el, root);
    if (!block) return null;
    const text = spaced(block);
    return { anchor: textAnchor(scope, text), at: block, label: fit(`${scope} · ${fit(text, 48)}`), detail: fit(text, 500), root, words: text };
  }
  // A diff's header or its @@ line comments on every line the diff shows,
  // and a fold on the lines it hides.
  function rangeSpot(fig, lines, at) {
    if (!fig?.dataset.path || !lines.length) return null;
    const nums = lines.map(gutter);
    const side = nums.some((g) => g.new !== null) ? 'new' : 'old';
    const on = nums.map((g) => g[side]).filter((n) => n !== null);
    if (!on.length) return null;
    const [a, b] = [Math.min(...on), Math.max(...on)];
    const { layer, path } = fig.dataset;
    const span = `L${a}${b !== a ? `-${b}` : ''}`;
    return { anchor: lineAnchor(layer, path, side, a, b), at, label: fit(`${prOf(layer)} · ${path.split('/').pop()} ${side} ${span}`), detail: fit(`at ${shaOf(layer)}: ${lines.map((l) => `${gutter(l).sign}${l.textContent}`).join('\n')}`, 500) };
  }
  function foldSpot(fold) {
    const hid = [];
    const toward = fold.classList.contains('end') ? 'previousElementSibling' : 'nextElementSibling';
    for (let n = fold[toward]; n?.classList.contains('o'); n = n[toward]) hid.push(n);
    return rangeSpot(fold.closest('figure.hunk'), hid, fold);
  }

  // A rail row names the chapter or stop it opens, so its comment reads the
  // same wherever the rail scrolls.
  function railAnchor(row) {
    if (row.matches('.toc-stop')) return fit(`rail: ${stopAnchor(row.dataset.stop)}`);
    if (row.matches('.toc-ch')) {
      const id = row.dataset.chapter;
      if (id === 'c-open') return 'rail: the whole flow';
      if (id === 'c-close') return 'rail: close';
      const ch = chapterData.get(id);
      return fit(`rail: ${prOf(ch?.layer)} ${ch?.title ?? ''}`);
    }
    return fit(`rail: ${spaced(row)}`);
  }
  function railSpot(el) {
    const row = el.closest('a, button') ?? $('.toc-ch', el.closest('.toc-item') ?? el);
    if (!row || !spaced(row)) return null;
    const anchor = railAnchor(row);
    return { anchor, at: row, label: anchor.replace(/^rail: /, 'rail · ') };
  }

  // Every commentable spot: what to call it, and the words that label it.
  function spotFor(el) {
    if (el.closest('[data-rail]')) return railSpot(el);
    const ln = el.closest('.ln:not(.h)');
    if (ln) {
      const fig = ln.closest('.hunk');
      const g = gutter(ln);
      const side = g.new !== null ? 'new' : 'old';
      const n = g[side];
      if (n === null || !fig?.dataset.path) return null;
      return { anchor: lineAnchor(fig.dataset.layer, fig.dataset.path, side, n, n), at: ln, label: fit(`${prOf(fig.dataset.layer)} · ${fig.dataset.path.split('/').pop()} ${side} L${n}`), detail: fit(`${g.sign}${ln.textContent}`, 500) };
    }
    const fold = el.closest('.code .fold');
    const folded = fold && foldSpot(fold);
    if (folded) return folded;
    const head = el.closest('figure.hunk > figcaption, .ln.h');
    const fig = head?.closest('figure.hunk');
    const hunk = fig && rangeSpot(fig, codeLines(fig), fig);
    if (hunk) return hunk;
    const fv = el.closest('.fv-head');
    if (fv) {
      const sec = fv.closest('.fv-file');
      return { anchor: fileAnchor(sec.dataset.layer, sec.dataset.path), at: fv, label: fit(`${prOf(sec.dataset.layer)} · ${sec.dataset.path}`) };
    }
    const flag = el.closest('.flag-box');
    if (flag) {
      const stop = flag.closest('.stop');
      const s = stopData.get(stop.dataset.stop);
      return { anchor: fit(`${prOf(s.layer)} stop ${stop.dataset.num} flag: ${FLAG_NAME[flag.dataset.flag] ?? flag.dataset.flag}`), at: flag, label: fit(`${prOf(s.layer)} · ${stop.dataset.num} flag`), detail: fit(flag.textContent, 500) };
    }
    const take = el.closest('.takeaways li');
    if (take) {
      const ch = take.closest('.chapter');
      const i = $$('li', take.parentElement).indexOf(take) + 1;
      const who = chapterData.get(ch.dataset.chapter) ? prOf(chapterData.get(ch.dataset.chapter).layer) : 'stack';
      const text = $('span:last-child', take)?.textContent ?? '';
      return { anchor: fit(`${who} takeaway ${i}: ${text}`), at: take, label: fit(`${who} takeaway ${i}`) };
    }
    const claim = el.closest('tr[data-claim]');
    if (claim) {
      const [chId, idx] = claim.dataset.claim.split(/-(?=\d+$)/);
      const ch = chapterData.get(chId);
      return { anchor: fit(`${prOf(ch?.layer)} claim ${Number(idx) + 1}: ${claim.children[1]?.textContent ?? ''}`), at: claim, label: fit(`${prOf(ch?.layer)} claim ${Number(idx) + 1}`) };
    }
    // The act's diagram: a row is its hop, a head its component.
    const am = el.closest('.seq .sq-row, .seq .sq-p');
    if (am?.matches('.sq-row')) {
      const i = Number(am.dataset.hopI);
      const h = DATA.flow[i];
      if (h) return { anchor: hopAnchor(h), at: am, label: fit(`flow · ${h.from} → ${h.to}`) };
    }
    if (am) return { anchor: fit(`flow component: ${am.dataset.node}`), at: am, label: fit(`flow · ${am.dataset.node}`) };
    const dot = el.closest('.flow-map .dot, .flow-stage, .hop[data-hop]');
    if (dot) {
      const i = dot.classList.contains('dot') ? Number(dot.dataset.hopI) : dot.dataset.hop ? DATA.flow.findIndex((h) => h.id === dot.dataset.hop) : flow.i;
      const h = DATA.flow[i];
      if (h) return { anchor: hopAnchor(h), at: dot, label: fit(`flow · ${h.from} → ${h.to}`) };
    }
    // Inside a stop, its frame (the head, the actions, the body's box) stands
    // for the stop itself.
    const stop = el.closest('.stop');
    if (stop) {
      const block = el.closest('.stop-head, .stop-actions') ? null : blockOf(el, stop);
      const para = block && !block.matches('.stop-body, .ctx, .stop-hd') ? block : null;
      const s = stopData.get(stop.dataset.stop);
      if (para) return { anchor: textAnchor(`${prOf(s.layer)} stop ${stop.dataset.num}`, spaced(para)), at: para, label: fit(`${prOf(s.layer)} · ${stop.dataset.num} ${s.title}`), detail: fit(spaced(para), 500), root: stop, words: spaced(para) };
      return { anchor: stopAnchor(stop.dataset.stop), at: stop, label: fit(`${prOf(s.layer)} · ${stop.dataset.num} ${s.title}`) };
    }
    return textSpot(el);
  }

  async function compose(spot) {
    if (!comments.api) return toast('<b>comments</b>Comments work when this page is open on claude.ai.');
    if (comments.off) return toast('<b>comments off</b>Commenting from the page is off here; use the comment control in the claude.ai toolbar.');
    try {
      const opts = { label: spot.label };
      if (spot.detail) opts.detail = spot.detail;
      if (comments.anchors) await comments.anchors.compose(spot.anchor, spot.point ?? spot.at, opts);
      else await comments.api.openComposer(spot.range ? { range: spot.range } : { element: spot.at });
    } catch (e) {
      const code = e?.code;
      if (code === 'forbidden' || code === 'unavailable' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
        comments.off = true;
        document.documentElement.classList.add('comments-off');
        toast('<b>comments off</b>Commenting from the page is off here; use the comment control in the claude.ai toolbar.');
      } else if (code === 'rate_limited') toast('<b>slow down</b>Too many comments at once; try again in a moment.');
      else if (code !== 'invalid') toast('<b>comment not opened</b>Try again in a moment.');
    }
  }
  function commentOnSelection() {
    const sel = state.sel;
    if (sel) {
      const { layer, path, side, start, end } = sel;
      compose({ anchor: lineAnchor(layer, path, side, start, end), at: sel.first, point: pointAt(sel.first), label: fit(`${prOf(layer)} · ${path.split('/').pop()} ${side} L${start}${end !== start ? `-${end}` : ''}`), detail: fit(`at ${shaOf(layer)}: ${sel.text}`, 500) });
      return true;
    }
    const s = window.getSelection();
    if (s && !s.isCollapsed && s.rangeCount && !s.anchorNode?.parentElement?.closest('.code')) {
      const node = s.anchorNode?.parentElement;
      const spot = node && spotFor(node);
      if (spot) {
        const quote = fit(s.toString(), 60);
        const stop = node.closest('.stop');
        if (stop) {
          const d = stopData.get(stop.dataset.stop);
          spot.anchor = fit(`${prOf(d.layer)} stop ${stop.dataset.num} text: “${quote}”`);
        }
        spot.detail = fit(s.toString(), 500);
        spot.range = s.getRangeAt(0);
        const rects = spot.range.getClientRects();
        const last = rects[rects.length - 1];
        if (last) spot.point = { x: Math.round(last.right + scrollX), y: Math.round(last.top + scrollY + last.height / 2) };
        compose(spot);
        return true;
      }
    }
    return false;
  }
  // c comments on a selection at once. Without one it turns on comment mode:
  // the next click on a line, a paragraph or a title places the comment
  // there, and the shell's own mode carries on once its composer opens.
  // c again, or Escape, leaves.
  const pointAt = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + scrollX + Math.min(18, r.width / 2)), y: Math.round(r.top + scrollY + Math.min(r.height / 2, 14)) };
  };
  // In comment mode one dashed ring marks exactly what a click would anchor to.
  let ringEl = null;
  let ringFrame = 0;
  // The header tools and the step bar stay live in comment mode, so a reader
  // can leave the mode or move on; everything else takes the click.
  const COMMENTABLE = '.main, [data-rail]';
  function ringAt(target) {
    const spot = target?.closest?.(COMMENTABLE) && !target.closest('[data-uncommentable]') ? spotFor(target) : null;
    const el = spot?.at instanceof Element ? spot.at : null;
    if (el === ringEl) return;
    ringEl?.classList.remove('cm-target');
    ringEl = el;
    ringEl?.classList.add('cm-target');
  }
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!(comments.mode || comments.picking)) return;
      const t = e.target;
      cancelAnimationFrame(ringFrame);
      ringFrame = requestAnimationFrame(() => ringAt(t));
    },
    { passive: true },
  );
  function renderCommentMode() {
    const on = comments.mode || comments.picking;
    if (!on) ringAt(null);
    document.documentElement.classList.toggle('commenting', on);
    $('[data-act="comment-mode"]')?.setAttribute('aria-pressed', String(on));
    const pill = fixed('[data-pick]');
    if (pill) pill.hidden = !comments.picking;
  }
  function setPicking(on) {
    comments.picking = on;
    renderCommentMode();
  }
  function commentKey() {
    if (commentOnSelection()) return;
    if (!comments.api) return toast('<b>comments</b>Comments work when this page is open on claude.ai.');
    if (comments.off) return toast('<b>comments off</b>Commenting from the page is off here; use the comment control in the claude.ai toolbar.');
    if (comments.mode) return comments.anchors?.exitMode();
    setPicking(!comments.picking);
    S.play('toggle');
  }

  // Anchor names back to the spots on the page. Pins need only the spots in
  // the chapter on screen, so a report skips the rest.
  const shownOnly = (els, shown) => (shown ? els.filter((e) => !e.closest('.chapter')?.hidden) : els);
  // A PR split into flow chapters repeats a stop's number, a takeaway's and a
  // claim's place and a file's header in each chapter. Each of those anchors
  // resolves one way: among its copies across the layer's chapters, the ones
  // whose own anchor reads as this one, or every copy when none does; then,
  // for a pin, only those in view. A copy that matches but hides places no
  // pin, rather than a pin on the visible copy of other words.
  const byOwnAnchor = (els, anchor, shown) => {
    const own = els.filter((el) => spotFor(el)?.anchor === anchor);
    return shownOnly(own.length ? own : els, shown);
  };
  function resolveAnchor(anchor, { shown = false } = {}) {
    if (anchor.startsWith('rail: ')) return $$('[data-rail] a, [data-rail] button').filter((r) => railAnchor(r) === anchor).slice(0, 1);
    let m = /^(#\d+)@[0-9a-f]{7} (.+) (new|old) L(\d+)(?:-(\d+))?$/.exec(anchor);
    if (m) {
      const layer = layerByLabel.get(m[1])?.id;
      const path = m[2].replace(/^…\//, '');
      const side = m[3];
      const n = Number(m[4]);
      const figs = shownOnly($$(`figure.hunk[data-layer="${CSS.escape(layer ?? '')}"]`), shown).filter((f) => f.dataset.path === path || f.dataset.path.endsWith(`/${path}`));
      const hits = [];
      for (const fig of figs) for (const ln of codeLines(fig)) if (gutter(ln)[side] === n) hits.push(ln);
      return hits;
    }
    m = /^(#\d+)@[0-9a-f]{7} (.+) whole file$/.exec(anchor);
    if (m) {
      const layer = layerByLabel.get(m[1])?.id;
      // Reopening lands on the copy in the chapter that homes the file.
      const own = chaptersOfLayer(layer);
      const home = own.find((c) => DATA.files[c]?.files.some((f) => f.p === m[2] && f.homes.some((h) => h === `hk-${c}` || stopData.get(h)?.chapter === c))) ?? own[0];
      if (home && !shown) buildFiles(chapterEl(home));
      const secs = [home, ...own.filter((c) => c !== home)].flatMap((c) => $$(`[data-files="${CSS.escape(c ?? '')}"] .fv-file`)).filter((sec) => sec.dataset.path === m[2]);
      return byOwnAnchor(secs.map((sec) => $('.fv-head', sec)).filter(Boolean), anchor, shown);
    }
    m = /^(#\d+) stop (\d+[a-z]?)(?: (flag|text):|:)/.exec(anchor);
    if (m) {
      const layer = layerByLabel.get(m[1])?.id;
      const same = chaptersOfLayer(layer).flatMap(stopsOf).filter((s) => s.dataset.num === m[2]);
      if (m[3] === 'flag') return byOwnAnchor(same.flatMap((s) => $$('.flag-box', s)), anchor, shown);
      const heads = same.map((s) => $('.stop-head', s));
      if (m[3] === 'text') {
        const hits = same.map((s) => spotByWords(s, quoteOf(anchor))).filter(Boolean);
        return hits.length ? byOwnAnchor(hits, anchor, shown) : shownOnly(heads, shown).slice(0, 1);
      }
      return byOwnAnchor(heads, anchor, shown);
    }
    m = /^(#\d+|stack) takeaway (\d+):/.exec(anchor);
    if (m) {
      const own = m[1] === 'stack' ? ['c-open'] : chaptersOfLayer(layerByLabel.get(m[1])?.id);
      const lis = own.map((c) => $$('.ch-head .takeaways li', chapterEl(c))[Number(m[2]) - 1]).filter(Boolean);
      return byOwnAnchor(lis, anchor, shown);
    }
    m = /^(#\d+) claim (\d+):/.exec(anchor);
    if (m) {
      const trs = chaptersOfLayer(layerByLabel.get(m[1])?.id)
        .map((c) => document.querySelector(`tr[data-claim="${CSS.escape(`${c}-${Number(m[2]) - 1}`)}"]`))
        .filter(Boolean);
      return byOwnAnchor(trs, anchor, shown);
    }
    m = /^(#\d+|opening|close|flow) text: “/.exec(anchor);
    if (m) {
      const roots = m[1] === 'flow' ? [fixed('[data-flow]')] : m[1] === 'opening' ? [chapterEl('c-open')] : m[1] === 'close' ? [chapterEl('c-close')] : chaptersOfLayer(layerByLabel.get(m[1])?.id).map(chapterEl);
      const hits = roots
        .filter(Boolean)
        .map((r) => spotByWords(r, quoteOf(anchor)))
        .filter(Boolean);
      return byOwnAnchor(hits, anchor, shown);
    }
    m = /^flow component: (.+)$/.exec(anchor);
    if (m) return $$('.seq.on .sq-p').filter((g) => g.dataset.node === m[1]);
    if (/^flow (hop \d+|in passing):/.test(anchor)) {
      const i = (DATA.flow ?? []).findIndex((h) => hopAnchor(h) === anchor);
      return [seq.rows.get(i), $(`.flow-map .dot[data-hop-i="${i}"]`)].filter(Boolean);
    }
    // A thread the shell's own click-to-comment placed names a CSS path,
    // which may point into rows that still wait.
    try {
      let el = document.querySelector(anchor);
      if (!el && state.chapter) {
        rowsAround(chapterEl(state.chapter));
        el = document.querySelector(anchor);
      }
      return el ? [el] : [];
    } catch {
      return [];
    }
  }
  // Where a spot shows now: itself, or the nearest visible thing that stands
  // for it (a fold, a closed panel's summary, a reviewed stop's head).
  function visibleFor(el) {
    if (!el || !el.isConnected) return null;
    // A stop row of a folded chapter shows as that chapter's row.
    if (el.closest('[data-rail]')) return el.getClientRects().length ? el : $('.toc-ch', el.closest('.toc-item'));
    const ch = el.closest('.chapter');
    if (!ch || ch.hidden) return null;
    if (el.closest('[data-walk][hidden], [data-files][hidden]')) return null;
    const closed = el.closest('.fv-body[hidden]');
    if (closed) return $('.fv-head', closed.closest('.fv-file'));
    const shut = el.closest('figure.hunk.shut');
    if (shut && !el.closest('figcaption')) return $(':scope > figcaption', shut);
    const details = el.closest('details:not([open])');
    const summary = details && $(':scope > summary', details);
    if (summary && !summary.contains(el)) return summary;
    const stop = el.closest('.stop.reviewed:not(.open)');
    if (stop && !el.closest('.stop-head')) return $('.stop-head', stop);
    if (el.classList.contains('o') && !el.classList.contains('show')) {
      let b = el.previousElementSibling;
      while (b && !b.classList.contains('fold')) b = b.previousElementSibling;
      return b;
    }
    return (el.checkVisibility?.({ visibilityProperty: true }) ?? el.getClientRects().length > 0) ? el : null;
  }
  // A spot inside a part that skips rendering off screen has no box yet: its
  // pin stands on the nearest part that has one, and moves onto the spot once
  // that part draws and the pins are reported again.
  const boxOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (r.width || r.height) return r;
    }
    return el.getBoundingClientRect();
  };
  function pinPoint(anchor) {
    for (const el of resolveAnchor(anchor, { shown: true })) {
      const v = visibleFor(el);
      if (!v) continue;
      const r = boxOf(v);
      return { x: Math.round(r.left + scrollX + Math.min(18, r.width / 2)), y: Math.round(r.top + scrollY + Math.min(r.height / 2, 14)) };
    }
    return null;
  }
  let pinFrame = 0;
  function reportPins() {
    if (!comments.anchors) return;
    cancelAnimationFrame(pinFrame);
    pinFrame = requestAnimationFrame(() => {
      const map = {};
      withSpots(() => {
        for (const t of comments.threads) {
          const p = pinPoint(t.anchor);
          if (p) map[t.id] = p;
        }
      });
      try {
        comments.anchors.placed(map);
      } catch {
        /* a released registration ignores reports */
      }
    });
  }
  // A stop drawn for the first time settles to its real height and moves
  // every pin below it.
  let settle = 0;
  document.addEventListener(
    'contentvisibilityautostatechange',
    () => {
      if (!comments.threads.length) return;
      clearTimeout(settle);
      settle = setTimeout(reportPins, 150);
    },
    true,
  );
  // The shell re-projects window scroll for pins in the page's flow; the rail
  // stays put while the page scrolls and scrolls on its own, so a pin on it
  // is placed again.
  const railPins = () => {
    if (comments.threads.some((t) => t.anchor?.startsWith('rail: '))) reportPins();
  };
  window.addEventListener('scroll', railPins, { passive: true });
  $('[data-rail]')?.addEventListener('scroll', railPins, { passive: true });
  function revealThread(id) {
    const t = comments.threads.find((x) => x.id === id);
    const el = t && withSpots(() => resolveAnchor(t.anchor)[0]);
    if (!el) return;
    if (el.closest('[data-rail]')) {
      const v = visibleFor(el);
      v?.scrollIntoView({ block: 'nearest' });
      flash(v);
      reportPins();
      return;
    }
    const ch = el.closest('.chapter');
    if (ch) showChapter(ch.dataset.chapter, { view: el.closest('[data-files]') ? 'files' : 'walk', sound: false, top: false });
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    const stop = el.closest('.stop');
    if (stop) {
      if (stop.classList.contains('reviewed')) stop.classList.add('open');
      setCurrent(stop.dataset.stop, { sound: false });
    }
    const body = el.closest('.fv-body[hidden]');
    if (body) $('.fv-toggle', body.closest('.fv-file'))?.click();
    const shut = el.closest('figure.hunk.shut');
    if (shut) $(':scope > figcaption .hunk-fold', shut)?.click();
    unfoldLine(el);
    requestAnimationFrame(() => {
      glideTo(landY(el, 'center'), { el, block: 'center' });
      flash(el);
      reportPins();
    });
  }
  async function initComments(use) {
    const api = await use('comments').catch(() => null);
    if (!api) return;
    comments.api = api;
    document.documentElement.classList.add('comments-on');
    try {
      comments.anchors = await api.customAnchors({
        mode(on) {
          comments.mode = on;
          if (on) comments.picking = false;
          else comments.threads = [];
          renderCommentMode();
          reportPins();
        },
        threads(list) {
          comments.threads = Array.isArray(list) ? list : [];
          reportPins();
        },
        reveal(id) {
          revealThread(id);
        },
        composing(open) {
          if (!open) clearLineSelection();
        },
      });
      reportPins();
    } catch {
      // Shell anchoring: the shell's own click-to-comment lands on these.
      comments.anchors = null;
      $$('.stop, .hunk, .takeaways li, .flag-box, tr[data-claim], .fv-head').forEach((el) => el.setAttribute('data-comment-target', ''));
    }
  }
  // In comment mode a click on a spot opens the composer there, and a drag
  // across code lines comments on the range.
  let drag = null;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!(comments.mode || comments.picking) || !comments.anchors || e.button !== 0) return;
      const ln = e.target.closest?.('.ln:not(.h)');
      if (!ln || e.target.closest('[data-uncommentable]')) return;
      drag = { fig: ln.closest('.hunk'), from: ln, to: ln };
      selectLines(drag.fig, ln, ln);
      e.preventDefault();
    },
    true,
  );
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const ln = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ln:not(.h)');
    if (ln && ln.closest('.hunk') === drag.fig && ln !== drag.to) {
      drag.to = ln;
      selectLines(drag.fig, drag.from, ln);
    }
  });
  let swallowClick = false;
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 60);
    commentOnSelection();
  });
  document.addEventListener(
    'click',
    (e) => {
      if (swallowClick) {
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!(comments.mode || comments.picking) || !comments.api) return;
      if (!e.target.closest?.(COMMENTABLE) || e.target.closest('[data-uncommentable]')) return;
      const spot = spotFor(e.target);
      if (!spot) return;
      e.preventDefault();
      e.stopPropagation();
      compose({ ...numbered(spot), point: { x: Math.round(e.pageX), y: Math.round(e.pageY) } });
    },
    true,
  );

  // ------------------------------------------------------------ glossary
  // The glossary overlay clones the closing chapter's grouped list once and
  // filters it as the reader types.
  function openDeck(slugId) {
    const deck = fixed('[data-deck]');
    if (deck && !deck.childElementCount) {
      const list = $('#c-close .gloss')?.cloneNode(true);
      if (list) {
        list.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        list.querySelectorAll('a[href^="#"]').forEach((a) => a.setAttribute('data-close-overlay', ''));
        $$('.gloss-group', list).forEach((g, i) => (g.dataset.order = String(i)));
        $$('.term', list).forEach((t, i) => (t.dataset.order = String(i)));
        deck.append(list);
      }
      filterTerms('');
    }
    openOverlay('deck');
    const input = fixed('[data-term-filter]');
    if (slugId) {
      if (input && input.value) {
        input.value = '';
        filterTerms('');
      }
      const t = $(`[data-deck] .term[data-slug="${CSS.escape(slugId)}"]`);
      if (t) {
        requestAnimationFrame(() => t.scrollIntoView({ block: 'center' }));
        flash(t);
      }
    } else requestAnimationFrame(() => input?.focus());
  }
  // Every typed word has to fit some word of a term or its definition, in
  // any order and with a slip allowed (runtime/search.js). The best fits lead,
  // and their PR's group leads with them; an empty filter restores the order.
  const byScore = (a, b) => b.score - a.score || a.order - b.order;
  const termDefs = new WeakMap();
  const defOf = (t) => (termDefs.has(t) ? termDefs.get(t) : termDefs.set(t, $('.def', t)?.textContent ?? '').get(t));
  // A list moves its children only when the order changed: each move restyles them.
  function reorder(box, els) {
    if (!box || els.every((el, i) => box.children[i] === el)) return;
    box.append(...els);
  }
  function filterTerms(q) {
    const query = q.trim();
    const { score } = window.WTSearch;
    const deck = fixed('[data-deck]');
    let shown = 0;
    let total = 0;
    const groups = (deck ? $$('.gloss-group', deck) : []).map((g) => {
      const terms = $$('.term', g).map((t) => {
        total++;
        const s = query ? score(query, t.dataset.term, defOf(t)) : 1;
        t.hidden = !s;
        if (s) shown++;
        return { el: t, score: query ? s : 0, order: Number(t.dataset.order) };
      });
      terms.sort(byScore);
      reorder($('.terms', g), terms.map((x) => x.el));
      g.hidden = !terms.some((x) => !x.el.hidden);
      return { el: g, score: Math.max(0, ...terms.map((x) => x.score)), order: Number(g.dataset.order) };
    });
    groups.sort(byScore);
    reorder(deck && $('.gloss', deck), groups.map((x) => x.el));
    const c = fixed('[data-term-count]');
    if (c) c.textContent = query ? `${shown} of ${total}` : `${total} terms`;
  }
  document.addEventListener('input', (e) => {
    if (e.target.matches?.('[data-term-filter]')) filterTerms(e.target.value);
  });

  // What an in-page link opens, said before the reader follows it: only what
  // the link and the row around it do not already show. A square in the dot
  // map previews its own hop, which the stage does not show until picked.
  const plainText = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/`/g, '');
  function peekFor(a) {
    if (a.closest('.rail, .navi, .views, .hdr')) return null;
    if (a.matches('.flow-map .dot')) {
      const i = Number(a.dataset.hopI);
      if (i === flow.i) return null;
      const h = DATA.flow?.[i];
      if (h?.passing) return { title: `in passing · ${layerLabel('base')}`, text: plainText(h.label) };
      return h ? { title: `hop ${h.num} · ${h.from} → ${h.to}`, text: plainText(h.story ?? h.label) } : null;
    }
    const r = parseHash(a.getAttribute('href'));
    let parts = null;
    if (r.stop) {
      const s = stopData.get(r.stop);
      if (!s) return null;
      const here = a.closest('.chapter')?.id === s.chapter;
      parts = { where: here ? '' : layerLabel(s.layer), name: `${stopEl(r.stop)?.dataset.num ?? ''} ${plainText(s.title)}`.trim(), check: plainText(s.title), text: plainText(s.gist) };
    } else if (r.view === 'files' && r.file !== null) {
      const f = DATA.files[r.chapter]?.files[r.file];
      parts = f ? { where: '', name: 'every change in this file', check: 'every change in this file', text: f.p } : null;
    } else if (r.chapter && chapterData.has(r.chapter)) {
      const ch = chapterData.get(r.chapter);
      parts = { where: layerLabel(ch.layer), name: plainText(ch.title), check: plainText(ch.title), text: plainText(ch.gist) };
    } else if (a.matches('.cav-mark') && CAVEATS.has(a.dataset.caveat)) {
      return { html: CAVEATS.get(a.dataset.caveat).peek };
    } else if (r.hop !== undefined) {
      const h = DATA.flow?.[r.hop];
      if (!h) return null;
      parts = h.passing ? { where: '', name: `in passing · ${layerLabel('base')}`, check: 'in passing', text: plainText(h.label) } : { where: layerLabel(h.layer), name: `hop ${h.num} · ${h.from} → ${h.to}`, check: `${h.from} → ${h.to}`, text: plainText(h.story ?? h.label) };
    } else if (r.anchor?.startsWith('cav-') && CAVEATS.has(r.anchor.slice(4))) {
      return { html: CAVEATS.get(r.anchor.slice(4)).peek };
    } else if (r.anchor && REFS.has(r.anchor)) {
      const x = REFS.get(r.anchor);
      parts = { where: '', name: x.title, check: x.title, text: x.line };
    } else if (r.anchor?.startsWith('hk-')) parts = { where: '', name: 'not in the walk', check: 'not in the walk', text: 'the files the walk skips, each with its whole diff' };
    return parts && unseen(a, parts);
  }
  function unseen(a, { where, name, check, text }) {
    const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const box = a.closest('.flow-stage, .card, .term') ?? a.closest('li, tr, dd, .stop-head, .fv-head, p') ?? a;
    const seen = norm(box.textContent);
    const shown = (t) => !t || seen.includes(norm(t));
    const title = [shown(where) ? '' : where, shown(check) ? '' : name].filter(Boolean).join(' · ');
    const body = shown(text) ? '' : text;
    if (!title && !body) return null;
    return body ? { title, text: body } : { title: '', text: title };
  }

  // Term definitions, flow dots and link targets share one tooltip, placed
  // inside the viewport and announced as the element's description.
  const tip = fixed('[data-tip]');
  let tipFor = null;
  // What opens a peek, and what answers a click without being a native
  // control. Each one looks interactive at rest, and nothing else does:
  // page-check.mjs holds both ways on the rendered page (WTTriggers). A
  // control that names keys peeks its keys (keys.js).
  const PEEKS = '.term-ref, .sev[data-def], .flow-map .dot, .main a[href^="#"]:not(.term-ref), [data-deck] a.term-go, a[data-lens], .seq .sq-row:not(.ahead):not(.on), [data-peek]';
  const SHEETS = '.term-ref, .sev[data-def], a[data-lens], .cav-mark, .main [data-peek]';
  const CLICKS = '.seq .sq-row:not(.ahead):not(.on)';
  const KEYED = 'button[aria-keyshortcuts], a[aria-keyshortcuts]';
  window.WTTriggers = Object.freeze({ peek: PEEKS, sheet: SHEETS, click: CLICKS });
  const tipTarget = (el) => el.closest?.(PEEKS) ?? el.closest?.(KEYED);
  // A call site's lens: its lines at the layer's head, the linked one lit and
  // the ones the layer adds marked as the diff marks them.
  function lensHtml(L) {
    const rows = L.lines.map((t, k) => {
      const n = L.from + k;
      return `<span class="ll${n === L.at ? ' at' : ''}${L.added.includes(n) ? ' add' : ''}"><i>${n}</i><span>${(L.html?.[k] ?? esc(t)) || ' '}</span></span>`;
    });
    return `<b>${esc(L.path)} · ${esc(layerLabel(L.layer))}</b><pre class="lens-code" translate="no">${rows.join('')}</pre>`;
  }
  function showTip(el) {
    if (!el.matches(PEEKS)) {
      const keysHtml = K.hint(el);
      if (!tip || !keysHtml) return;
      tip.classList.remove('lens');
      tipFor?.removeAttribute('aria-describedby');
      tipFor = el;
      tip.innerHTML = keysHtml;
      // aria-keyshortcuts already names the keys to a screen reader.
      return placeTip(el, { describe: false });
    }
    const L = el.dataset.lens ? DATA.lens?.[el.dataset.lens] : null;
    if (L && tip) {
      tipFor?.removeAttribute('aria-describedby');
      tipFor = el;
      tip.classList.add('lens');
      tip.innerHTML = lensHtml(L);
      // Read aloud, ten lines of code drown the link: the lens stays visual.
      return placeTip(el, { describe: false });
    }
    tip?.classList.remove('lens');
    // A row of the act's diagram previews its hop, which the stage shows only
    // once it is picked; the current hop's row adds nothing.
    if (el.matches('.seq .sq-row')) {
      const i = Number(el.dataset.hopI);
      const h = DATA.flow?.[i];
      if (!tip || !h || i === flow.i) return;
      tipFor?.removeAttribute('aria-describedby');
      tipFor = el;
      tip.innerHTML = h.passing ? `<b>${esc(`in passing · ${layerLabel('base')}`)}</b>${esc(plainText(h.label))}` : `<b>${esc(`hop ${h.num} · ${h.from} → ${h.to}, over ${h.via}`)}</b>${esc(plainText(h.story ?? h.label))}`;
      return placeTip(el);
    }
    // A link shows only its peek, so a link whose target is already on
    // screen shows nothing.
    const link = el.matches('a[href^="#"]:not(.term-ref)');
    const peek = link ? peekFor(el) : null;
    if (peek?.html && tip) {
      tipFor?.removeAttribute('aria-describedby');
      tipFor = el;
      tip.innerHTML = peek.html;
      return placeTip(el);
    }
    const text = link ? peek?.text : (el.dataset.def ?? el.dataset.peek ?? el.getAttribute('aria-label'));
    if (!tip || !text) return;
    tipFor?.removeAttribute('aria-describedby');
    tipFor = el;
    const title = peek?.title ?? el.dataset.term;
    tip.innerHTML = title ? `<b>${esc(title)}</b>${esc(text)}` : esc(text);
    placeTip(el);
  }
  function placeTip(el, { describe = true } = {}) {
    tip.hidden = false;
    if (describe) el.setAttribute('aria-describedby', 'wt-tip');
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8 + h < Math.min(innerHeight, navTop());
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 8 : r.top - h - 8}px`;
  }
  function hideTip(el) {
    if (el && el !== tipFor) return;
    tipFor?.removeAttribute('aria-describedby');
    tipFor = null;
    if (tip) tip.hidden = true;
  }
  // A mouse peek opens when the pointer moves over its target. When a key
  // scrolls the page, the browser reports whatever slides under a still
  // mouse as hovered, with the pointer at the same screen position; that
  // opens nothing, or a peek would pop up after every move the keys make.
  // Touch and pen open on arrival.
  let hand = null;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const moved = !hand || hand.x !== e.clientX || hand.y !== e.clientY;
      hand = { x: e.clientX, y: e.clientY };
      if (!moved) return;
      const t = tipTarget(e.target);
      if (t && t !== tipFor) showTip(t);
    },
    { passive: true },
  );
  // A finger covers what a peek floats beside, so touch opens no peek on
  // arrival: a tap opens the sheet below instead.
  let touchedAt = -Infinity;
  const touching = () => performance.now() - touchedAt < 1000;
  document.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && (touchedAt = performance.now()), { capture: true, passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'touch') return;
    const t = tipTarget(e.target);
    if (t) showTip(t);
  });
  document.addEventListener('pointerout', (e) => {
    const t = tipTarget(e.target);
    if (t && !t.contains(e.relatedTarget)) hideTip(t);
  });
  // A control's keys peek on keyboard focus; a click that focuses it has
  // already hovered it.
  document.addEventListener('focusin', (e) => {
    if (touching()) return;
    const t = tipTarget(e.target);
    if (t && (t.matches(PEEKS) || t.matches(':focus-visible'))) showTip(t);
  });

  // On a touch screen what a peek says opens in a sheet at
  // the screen's bottom, over the navigator, so the tapped word stays in view
  // and lit. One sheet at a time; a tap outside, a swipe down, its close
  // button or Escape closes it. A link to another part of the page follows on
  // the tap and leaves its back control, so it needs no sheet; a square or a
  // row of the flow shows its hop on the stage.
  const sheetEl = fixed('[data-peek-sheet]');
  const sheetBody = sheetEl && $('.ps-body', sheetEl);
  let sheetFor = null;
  const TOUCH = matchMedia('(hover: none) and (pointer: coarse)');
  const sheetTarget = (el) => el.closest?.(SHEETS) ?? null;
  function sheetHtml(el) {
    if (el.matches('.cav-mark')) {
      const c = CAVEATS.get(el.dataset.caveat);
      return c ? `${c.peek}<a class="ps-go" href="#cav-${esc(c.id)}" data-close-sheet>the whole caveat, with its links</a>` : null;
    }
    if (el.matches('a[data-lens]')) {
      const L = DATA.lens?.[el.dataset.lens];
      return L ? `${lensHtml(L)}<a class="ps-go" href="${esc(el.href)}" target="_blank" rel="noopener">open on GitHub</a>` : null;
    }
    if (el.matches('.term-ref, .sev[data-def]')) {
      const go = el.matches('a.term-ref') ? `<a class="ps-go" href="${esc(el.getAttribute('href'))}" data-close-sheet>in the glossary</a>` : '';
      return `<b>${esc(el.dataset.term ?? '')}</b><p>${esc(el.dataset.def ?? '')}</p>${go}`;
    }
    const t = el.dataset.peek;
    return t ? `<p>${esc(t)}</p>` : null;
  }
  function openSheet(el) {
    const html = sheetEl && sheetHtml(el);
    if (!html) return false;
    sheetFor?.classList.remove('tapped');
    sheetFor = el;
    el.classList.add('tapped');
    sheetEl.classList.toggle('lens', el.matches('a[data-lens]'));
    sheetBody.innerHTML = html;
    sheetEl.style.removeProperty('transform');
    sheetEl.hidden = false;
    L.open(sheetEl, { close: closeSheet });
    // The tapped word stays above the sheet.
    inFrame(
      () => [el.getBoundingClientRect().bottom, sheetEl.getBoundingClientRect().top],
      ([bottom, top]) => bottom > top - 12 && glideTo(clampY(scrollY + bottom - top + 48)),
    );
    return true;
  }
  function closeSheet() {
    if (!sheetEl || sheetEl.hidden) return false;
    sheetEl.hidden = true;
    sheetFor?.classList.remove('tapped');
    sheetFor = null;
    L.closed(sheetEl);
    return true;
  }
  if (sheetEl) {
    let y0 = null;
    sheetEl.addEventListener('touchstart', (e) => (y0 = e.touches[0].clientY), { passive: true });
    sheetEl.addEventListener('touchmove', (e) => {
      const dy = e.touches[0].clientY - (y0 ?? 0);
      if (y0 !== null && dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheetEl.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - (y0 ?? 0);
      y0 = null;
      if (dy > 60) closeSheet();
      else sheetEl.style.removeProperty('transform');
    });
  }
  document.addEventListener('focusout', (e) => {
    const t = tipTarget(e.target);
    if (t) hideTip(t);
  });

  // A jump from one part of the page to another flashes what it lands on and
  // leaves a way back to where it started, with the question that sent the
  // reader there. Every jump goes on the trail (trail.js): Back, `b` and the
  // back pill return to the place it left, scroll, hop and folds included.
  function originOf(a) {
    const qa = a.closest('[data-qa]');
    if (qa) return { el: qa, label: 'the question', question: $('label', qa)?.textContent ?? '' };
    const card = a.closest('.card');
    if (card) return { el: card, label: 'the card', question: $('.front .qt', card)?.textContent ?? '' };
    const term = a.closest('.term');
    if (term) return { el: term, label: 'the glossary', question: term.dataset.term };
    const claim = a.closest('tr[data-claim]');
    if (claim) return { el: claim, label: 'the claim ledger', question: claim.children[1]?.textContent ?? '' };
    const row = a.closest('tr');
    if (row) return { el: row, label: 'the ledger' };
    const stop = a.closest('.stop');
    if (stop) return { el: stop.querySelector('.stop-head'), label: `${stop.dataset.num} ${plainText(stopData.get(stop.dataset.stop)?.title)}`.trim() };
    const sec = a.closest('.fv-file');
    if (sec) return { el: sec.querySelector('.fv-head'), label: sec.dataset.path.split('/').pop() };
    const hop = a.closest('.hop, .flow-stage');
    if (hop) return { el: hop, label: 'the flow' };
    return { el: a, label: 'where you were' };
  }
  // Where the reader is when a jump starts from outside the column, such as
  // the rail: the stop they are on, or the top of the chapter.
  function hereOrigin() {
    const stop = stopEl(state.stop);
    if (stop && stop.dataset.chapter === state.chapter) return { el: $('.stop-head', stop), label: `${stop.dataset.num} ${plainText(stopData.get(stop.dataset.stop)?.title)}`.trim() };
    return { el: $('.ch-head h1', chapterEl(state.chapter)), label: 'where you were' };
  }
  function placeNow() {
    const ch = chapterEl(state.chapter);
    return { chapter: state.chapter, view: state.view, stop: state.stop, y: scrollY, hop: flow.i, open: ch ? $$('details[open]', ch) : [], shown: ch ? $$('.stop.open', ch) : [] };
  }
  // A place comes back whole and at once: its folds snap, so nothing above
  // the scroll it restores is still moving when it lands.
  function restorePlace(p) {
    hideTip();
    closeSheet();
    closeOverlays();
    if (flow.playing) stopFlow();
    const root = document.documentElement;
    root.classList.add('snap');
    showChapter(p.chapter, { view: p.view, sound: false, top: false });
    const ch = chapterEl(p.chapter);
    if (ch) {
      const open = new Set(p.open);
      $$('details[open]', ch).forEach((d) => open.has(d) || (d.open = false));
      p.open.forEach((d) => (d.open = true));
      const shown = new Set(p.shown);
      $$('.stop.open', ch).forEach((el) => shown.has(el) || showStop(el, false));
      p.shown.forEach((el) => showStop(el, true));
    }
    if (DATA.flow?.length && flow.i !== p.hop) renderHop(p.hop, { cue: false });
    setCurrent(p.stop && stopEl(p.stop)?.dataset.chapter === p.chapter ? p.stop : null, { sound: false });
    // A chapter that opens lays out a frame later, so the scroll waits for it.
    inFrame(null, () => {
      holdAnchor(() => window.scrollTo({ top: p.y, behavior: 'auto' }));
      requestAnimationFrame(() => root.classList.remove('snap'));
      flash(p.origin?.el);
    });
    light(null);
    S.play('return');
    renderBack();
  }
  const trail = T.create({ snapshot: placeNow, restore: restorePlace });
  // A reviewed stop folds to its head; `show` opens it again.
  function showStop(el, open) {
    el.classList.toggle('open', open);
    const b = $('.reopen', el);
    b?.setAttribute('aria-expanded', String(open));
    if (b) b.textContent = open ? 'hide' : 'show';
  }
  function landingOf(hash) {
    const r = parseHash(hash);
    if (r.stop) return $('.stop-head', stopEl(r.stop));
    if (r.view === 'files' && r.file !== null) return $('.fv-head', document.getElementById(`${r.chapter}-f${r.file}`));
    if (r.chapter && !r.view) return $('.ch-head h1', chapterEl(r.chapter));
    return r.anchor ? document.getElementById(r.anchor) : null;
  }
  // A landing pulses a wash behind its words and fades, so it never draws
  // over a border or a focus ring. Two animation names take turns, so a
  // second pulse restarts without reading layout.
  const flashing = new WeakSet();
  function flash(el) {
    if (!el) return;
    if (!flashing.has(el)) {
      flashing.add(el);
      el.addEventListener('animationend', (e) => {
        if (!e.animationName.startsWith('flash-')) return;
        el.classList.remove('flash');
        delete el.dataset.flash;
      });
    }
    el.classList.add('flash');
    el.dataset.flash = el.dataset.flash === 'a' ? 'b' : 'a';
  }
  // A link that opens a chapter or a view at its top needs no pulse: the
  // whole screen changed, and what it opened is the first thing on it. A
  // landing among other things on screen pulses, a heading included.
  const opensAtTop = (href) => {
    const r = parseHash(href);
    return Boolean(r.chapter) && (!r.view || r.file === null);
  };
  function land(el, href) {
    if (!opensAtTop(href)) setTimeout(() => flash(el ?? landingOf(href)), M.reduced() ? 0 : 450);
  }
  function jump(a) {
    const href = a.getAttribute('href');
    trail.jump(href, { origin: originOf(a) });
    const answer = answerFor(a);
    route(href, { aim: answer });
    light(answer);
    land(answer, href);
    renderBack();
  }
  // A jump from outside the column: the rail, the navigator, a sheet, the
  // meter, a key.
  function follow(href, a = null) {
    trail.jump(href, { origin: a?.closest('.main') ? originOf(a) : hereOrigin() });
    route(href);
    renderBack();
  }
  // The sentence a question's link points at. A folded stop opens first, so
  // the sentence is on screen when the jump lands.
  function answerFor(a) {
    const r = parseHash(a.getAttribute('href'));
    const el = r.stop && a.dataset.look ? stopEl(r.stop) : null;
    const mark = el?.querySelector(`mark.answer[data-answer~="${CSS.escape(a.dataset.look)}"]`);
    if (!mark) return null;
    if (el.classList.contains('reviewed') && !el.classList.contains('open')) showStop(el, true);
    return mark;
  }
  // The answer stays lit while the way back is on screen.
  let lit = null;
  function light(mark) {
    lit?.classList.remove('lit', 'flash');
    if (lit) delete lit.dataset.flash;
    lit = mark;
    mark?.classList.add('lit');
  }
  // The back pill names the place `b` returns to, while there is one.
  function renderBack() {
    const pill = fixed('[data-back]');
    const origin = trail.last()?.origin;
    if (!pill) return;
    pill.hidden = !origin;
    if (!origin) return;
    pill.innerHTML = `<span class="bk">back${origin.question ? '' : ` to ${esc(origin.label)}`}</span>${origin.question ? `<span class="q">${esc(origin.question)}</span>` : ''}`;
  }
  function hideBack() {
    light(null);
    const pill = fixed('[data-back]');
    if (pill) pill.hidden = true;
  }
  const goBack = () => trail.back();
  window.addEventListener('scroll', () => tipFor && hideTip(), { passive: true });

  // -------------------------------------------------------------- overlays
  // An overlay is a layer: its sheet takes focus, and a press on the ground
  // around the sheet closes it.
  function openOverlay(name) {
    if (name === 'help') labelResets();
    $$('.overlay.show').forEach((o) => {
      o.classList.remove('show');
      L.closed($('.sheet', o));
    });
    const o = $(`[data-overlay="${name}"]`);
    if (!o) return;
    o.classList.add('show');
    L.open($('.sheet', o), { close: closeOverlays });
    S.play('open');
    requestAnimationFrame(() => $('.sheet', o)?.focus?.());
  }
  const closeOverlays = () => {
    const open = $$('.overlay.show');
    open.forEach((o) => {
      o.classList.remove('show');
      L.closed($('.sheet', o));
    });
    if (open.length) S.play('close');
    return open.length > 0;
  };

  // ----------------------------------------------------------------- scenes
  const scenes = new Map();
  function initScenes() {
    const defs = window.WT_SCENES || {};
    for (const root of $$('.scene[data-scene]')) {
      const def = defs[root.dataset.scene];
      if (!def || !window.WTScene) continue;
      const sc = new window.WTScene.Scene(root, def);
      scenes.set(root, sc);
      // A scene keeps focus on its controls while it plays, so the arrows
      // step it; Safari leaves a clicked button unfocused unless told.
      $('.scene-cover', root)?.addEventListener('click', () => {
        S.unlock();
        sc.play();
        $('[data-scene-act="play"]', root)?.focus({ preventScroll: true });
      });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-scene-act], [data-scene-seek]');
        if (b && document.activeElement !== b) b.focus({ preventScroll: true });
        if (b?.dataset.sceneAct) {
          S.unlock();
          const act = b.dataset.sceneAct;
          if (act === 'play') sc.toggle();
          else if (act === 'next') sc.next();
          else if (act === 'prev') sc.prev();
          else if (act === 'replay') sc.replay();
        }
        const seg = e.target.closest('[data-scene-seek]');
        if (seg) sc.seek(+seg.dataset.sceneSeek);
      });
    }
    // Visibility only picks which scene space plays and pauses one that leaves.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const sc = scenes.get(e.target);
          if (!sc) continue;
          sc.visible = e.intersectionRatio;
          if (!e.isIntersecting) sc.pause();
        }
      },
      { threshold: [0, 0.4, 0.8] },
    );
    for (const root of scenes.keys()) io.observe(root);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) scenes.forEach((s) => s.pause());
    });
  }
  const sceneOf = (el = document.activeElement) => (el ? ([...scenes.values()].find((s) => s.root.contains(el)) ?? null) : null);
  const sceneInView = () => [...scenes.values()].filter((s) => s.visible >= 0.4 && !s.root.closest('.chapter')?.hidden && !s.root.closest('[hidden]')).sort((a, b) => b.visible - a.visible)[0];

  // -------------------------------------------------------------- the flow
  // One hop at a time in a fixed stage; the dot map marks where it is.
  const flow = { i: 0, playing: false, once: false, runVoiced: false, voiced: Boolean(store.get('listen', false)), run: 0 };
  // Every hop sounds the same: stepping the flow is navigation, whatever the
  // hop carries. The diagram cues belong to scenes. The renderer draws each
  // hop's stage once (views.mjs hopStage), the first on the page and every
  // one in the page's data.
  const hopHtml = (i) => DATA.flow[i].stage;
  // Each caveat by its id, for its peek and its touch sheet.
  const CAVEATS = new Map((DATA.caveats ?? []).map((c) => [c.id, c]));
  const REFS = new Map((DATA.reference ?? []).map((x) => [x.id, x]));
  function renderHop(i, { cue = true, focus = false } = {}) {
    const h = (DATA.flow ?? [])[i];
    const stage = fixed('[data-flow-stage]');
    if (!h || !stage) return;
    flow.i = i;
    flow.at = 0;
    // Each hop's parts are new elements, so they fade in on their own under
    // `go`; nothing restarts, so nothing reads layout.
    stage.innerHTML = hopHtml(i);
    sayable();
    // The address names the hop on the stage, so a reload or a shared link
    // opens the same hop.
    if (state.chapter === 'c-open' && h.id) replaceHash(h.id);
    stage.style.removeProperty('--dwell');
    stage.classList.toggle('go', !M.reduced());
    markHop(i, { focus });
    showSeq(i);
    updateWhere();
    if (cue) S.play('step');
    reportPins();
  }
  // The act on the stage shows as its sequence diagram. The rows the story has
  // reached keep their arrows, dimmed; the rows still to come stay empty, so
  // the act builds up and never changes height. Moving on draws the new arrow
  // from caller to callee, its tip leading, and the callee answers when the
  // tip lands; moving back or leaving the act draws nothing. Nothing else in
  // the flow moves.
  const seq = { figOf: new Map(), hopsOf: new Map(), rows: new Map(), heads: new Map(), shown: null, at: -1, anims: new Map(), slides: [], leaving: null };
  function initSeqs() {
    for (const fig of $$('.seq', fixed('[data-seqs]') ?? document)) {
      const hops = new Set();
      for (const row of $$('.sq-row', fig)) {
        const i = Number(row.dataset.hopI);
        hops.add(i);
        seq.rows.set(i, row);
        seq.figOf.set(i, fig);
      }
      for (const i of hops) seq.hopsOf.set(i, hops);
      seq.heads.set(fig, new Map($$('.sq-p', fig).map((p) => [p.dataset.node, p])));
      fig.classList.add('live');
    }
    const box = $('.seqs-scroll', fixed('[data-seqs]') ?? document);
    if (box)
      new ResizeObserver(([e]) => {
        seq.w = e.contentRect.width;
        if (!seq.shown) return;
        fitHeads(seq.shown);
        fitLabels(seq.shown);
      }).observe(box);
  }
  // A phone is narrower than an act's heads need at their desktop width, so
  // the heads restack to fit the box: each extra tier gives every name one
  // more column of room, and each name wraps to the room it gets. The rows
  // keep their places under the heads. A wider box restores the drawing
  // views.mjs made.
  const NARROW = { char: 7.8, line: 15, sysChar: 6.8, sysLine: 12, row: 24, pass: 18 };
  function wrapName(name, max) {
    const words = name.split(' ').flatMap((w) => (w.length <= max ? [w] : w.split(/(?<=[.\-/])/)));
    const lines = [];
    for (const w of words) {
      const last = lines.at(-1);
      const joined = last === undefined ? null : last + (/[.\-/]$/.test(last) ? '' : ' ') + w;
      if (joined !== null && joined.length <= max) lines[lines.length - 1] = joined;
      else lines.push(w);
    }
    return lines;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  // Each line is [x, dy, text].
  function setTspans(text, lines) {
    text.replaceChildren(
      ...lines.map(([x, dy, ln]) => {
        const t = document.createElementNS(svgNS, 'tspan');
        t.setAttribute('x', x);
        t.setAttribute('dy', dy);
        t.textContent = ln;
        return t;
      }),
    );
  }
  const setLines = (text, lines, x, dy) => setTspans(text, lines.map((ln, k) => [x, k ? dy : 0, ln]));
  function fitHeads(fig) {
    const svg = $('.sq-svg', fig);
    const w = seq.w ?? 0;
    const need = parseFloat(svg?.style.getPropertyValue('--minw-heads'));
    const narrow = w > 0 && w + 1 < need && PHONE.matches;
    const key = narrow ? String(Math.round(w)) : '';
    if (!svg || (fig.dataset.fit ?? '') === key) return;
    const hds = $$('.sq-hd', svg);
    const sysNames = $$('.sq-sysname', svg);
    const bands = $$('.sq-sys', svg);
    const attrs = (el, names) => Object.fromEntries(names.map((a) => [a, el.getAttribute(a)]));
    // What views.mjs drew, kept once, so a wider box puts it back.
    fig.wtDrawn ??= {
      h: svg.getAttribute('height'),
      heads: hds.map((g) => {
        const p = $('.sq-p', g);
        return { p: attrs(p, ['x', 'y', 'width', 'height']), box: attrs($('.sq-box', p), ['y', 'height']), text: $('.sq-name', p).getAttribute('y'), lines: $$('.sq-name tspan', p).map((t) => [t.getAttribute('x'), t.getAttribute('dy'), t.textContent]), life: attrs($('.sq-life', g), ['y1', 'y2']) };
      }),
      sys: sysNames.map((t) => $$('tspan', t).map((x) => [x.getAttribute('x'), x.getAttribute('dy'), x.textContent])),
      bands: bands.map((b) => b.getAttribute('height')),
      rows: $$('.sq-row', svg).map((r) => ({ top: parseFloat($('.sq-band', r).getAttribute('y')), h: $('.sq-band', r).getAttribute('height') })),
    };
    const D = fig.wtDrawn;
    fig.dataset.fit = key;
    if (!narrow) {
      svg.setAttribute('height', D.h);
      hds.forEach((g, i) => {
        const p = $('.sq-p', g);
        const d = D.heads[i];
        for (const [a, v] of Object.entries(d.p)) p.setAttribute(a, v);
        for (const [a, v] of Object.entries(d.box)) $('.sq-box', p).setAttribute(a, v);
        const text = $('.sq-name', p);
        text.setAttribute('y', d.text);
        setTspans(text, d.lines);
        for (const [a, v] of Object.entries(d.life)) $('.sq-life', g).setAttribute(a, v);
      });
      sysNames.forEach((t, k) => {
        t.setAttribute('y', 10);
        setTspans(t, D.sys[k]);
      });
      bands.forEach((b, k) => b.setAttribute('height', D.bands[k]));
      $$('.sq-row', svg).forEach((r, k) => {
        r.removeAttribute('transform');
        $('.sq-band', r).setAttribute('height', D.rows[k].h);
      });
      return;
    }
    const n = hds.length;
    const names = hds.map((g) => $('.sq-p', g).dataset.node);
    const room = (i, T) => {
      const l = Math.max(0, (i + 0.5 - T / 2) / n);
      const r = Math.min(1, (i + 0.5 + T / 2) / n);
      return { l, r, chars: Math.max(3, Math.floor(((r - l) * w * 0.94 - 8) / NARROW.char)) };
    };
    // The fewest tiers at which every word of every name fits its box.
    let T = 1;
    while (T < 4 && names.some((nm, i) => wrapName(nm, room(i, T).chars).some((ln) => ln.length > room(i, T).chars))) T++;
    const lay = names.map((nm, i) => {
      const r = room(i, T);
      const lines = wrapName(nm, r.chars);
      return { ...r, lines, tier: i % T, bh: lines.length * NARROW.line + 10 };
    });
    // A system's title wraps to its band; a one-word title wider than its
    // band staggers with its neighbors onto a second line, so no two meet.
    let titleLines = 0;
    let stagger = false;
    const titles = sysNames.map((t, k) => {
      const band = t.previousElementSibling;
      const bw = (parseFloat(band?.getAttribute('width')) / 100) * w;
      const title = D.sys[k].map(([, , tx]) => tx).join(' ');
      const max = Math.max(3, Math.floor((bw - 6) / NARROW.sysChar));
      const lines = wrapName(title, max);
      if (lines.some((ln) => ln.length > max)) stagger = true;
      titleLines = Math.max(titleLines, lines.length);
      return lines;
    });
    sysNames.forEach((t, k) => {
      t.setAttribute('y', 10 + (stagger && k % 2 ? NARROW.sysLine : 0));
      setLines(t, titles[k], D.sys[k][0]?.[0] ?? '50%', NARROW.sysLine);
    });
    const titleH = (titleLines + (stagger ? 1 : 0)) * NARROW.sysLine;
    const tierH = Array.from({ length: T }, (_, t) => Math.max(0, ...lay.filter((x) => x.tier === t).map((x) => x.bh)));
    const tierTop = [titleH + (titleH ? 6 : 0)];
    for (let t = 1; t < T; t++) tierTop.push(tierTop[t - 1] + tierH[t - 1] + 6);
    const headsEnd = tierTop[T - 1] + tierH[T - 1];
    // Rows sit closer than on a desktop, where each carries its label; the
    // arrow alone needs less height.
    const rowEls = $$('.sq-row', svg);
    let y = headsEnd + 12;
    rowEls.forEach((r, k) => {
      const pitch = r.classList.contains('passing') ? NARROW.pass : NARROW.row;
      r.setAttribute('transform', `translate(0 ${(y - D.rows[k].top).toFixed(1)})`);
      $('.sq-band', r).setAttribute('height', pitch);
      y += pitch;
    });
    const H = y + 6;
    svg.setAttribute('height', String(H));
    hds.forEach((g, i) => {
      const p = $('.sq-p', g);
      const x = lay[i];
      const hh = tierH[x.tier];
      p.setAttribute('x', `${(x.l * 100).toFixed(2)}%`);
      p.setAttribute('width', `${((x.r - x.l) * 100).toFixed(2)}%`);
      p.setAttribute('y', tierTop[x.tier]);
      p.setAttribute('height', hh);
      const box = $('.sq-box', p);
      box.setAttribute('y', hh - x.bh);
      box.setAttribute('height', x.bh);
      const text = $('.sq-name', p);
      text.setAttribute('y', hh - x.bh + 16);
      setLines(text, x.lines, '50%', NARROW.line);
      const life = $('.sq-life', g);
      life.setAttribute('y1', tierTop[x.tier] + hh);
      life.setAttribute('y2', H - 4);
    });
    bands.forEach((b) => b.setAttribute('height', headsEnd + 5));
  }
  function showSeq(i) {
    const fig = seq.figOf.get(i);
    if (!fig) return;
    const was = seq.at;
    const entering = seq.shown !== fig;
    let from = null;
    let before = null;
    if (entering) {
      from = seq.shown;
      // Where the old act's heads stand, read before the new act shows and
      // while a slide still carries them, so the next slide starts from
      // there instead of from the end of the one it replaces.
      if (from && !M.reduced()) before = new Map([...seq.heads.get(from)].map(([name, p]) => [name, $('.sq-box', p).getBoundingClientRect()]));
      landSlide();
      from?.classList.remove('on');
      fitHeads(fig);
      fig.classList.add('on');
      seq.shown = fig;
      reportPins();
    }
    seq.at = i;
    const met = new Set();
    for (const k of seq.hopsOf.get(i)) {
      const row = seq.rows.get(k);
      row.classList.toggle('past', k < i);
      row.classList.toggle('on', k === i);
      row.classList.toggle('ahead', k > i);
      // A step in passing names no caller or callee; its hops meet their heads.
      if (k <= i) for (const x of DATA.flow[k]?.hops ?? [row.dataset]) met.add(x.from).add(x.to);
    }
    const row = seq.rows.get(i);
    for (const [name, p] of seq.heads.get(fig)) {
      p.classList.toggle('idle', !met.has(name));
      p.classList.toggle('caller', name === row.dataset.from);
      p.classList.toggle('callee', name === row.dataset.to);
      p.classList.remove('answer');
    }
    fitLabels(fig);
    reveal(fig, row);
    // A step on lets an arrow still growing finish; a step back or a jump
    // to another act shows every earlier arrow whole at once.
    if (i < was || entering) {
      for (const raf of seq.anims.values()) cancelAnimationFrame(raf);
      seq.anims.clear();
      for (const l of $$('line.sq-arrow', fig)) {
        if (l.getAttribute('x2') !== `${l.dataset.x2}%`) l.setAttribute('x2', `${l.dataset.x2}%`);
        l.style.removeProperty('visibility');
      }
    }
    const wait = before ? slide(from, fig, before) : 0;
    if (i > was || entering) grow(row, seq.heads.get(fig).get(row.dataset.to), wait);
  }
  // A new act is a Transform of the one before, as in 3Blue1Brown's scenes:
  // each head the two acts share slides from its old place to its new one
  // with its lifeline, the heads only the new act has fade in behind them,
  // and the old act's other heads and rows fade out over the new one. The new
  // act's first arrow grows once the heads have landed. A step during the
  // slide lands it at once.
  const SLIDE = 480;
  function slide(from, to, before) {
    const mine = seq.heads.get(to);
    const moves = [];
    for (const [name, p] of mine) {
      const g = p.parentElement;
      const was = before.get(name);
      if (!was) {
        moves.push(g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: SLIDE * 0.5, easing: 'ease-out', fill: 'backwards' }));
        continue;
      }
      const now = $('.sq-box', p).getBoundingClientRect();
      const dx = was.left + was.width / 2 - (now.left + now.width / 2);
      const dy = was.top + was.height / 2 - (now.top + now.height / 2);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moves.push(g.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: SLIDE, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }));
    }
    for (const b of $$('.sq-sys, .sq-sysname', to)) moves.push(b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: SLIDE * 0.4, easing: 'ease-out', fill: 'backwards' }));
    // The old act stays over the new one while it fades, without the heads
    // that moved on, and no taller than the new act.
    from.classList.add('leaving');
    from.style.height = `${Math.min(from.offsetHeight, to.offsetHeight)}px`;
    for (const [name, p] of seq.heads.get(from)) if (mine.has(name)) p.parentElement.style.visibility = 'hidden';
    const out = from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    // The old act leaves before the heads land; its end must not cut their slide short.
    out.onfinish = endLeaving;
    seq.leaving = from;
    seq.slides = [...moves, out];
    return SLIDE;
  }
  function landSlide() {
    const moves = seq.slides;
    seq.slides = [];
    for (const a of moves) a.cancel();
    endLeaving();
  }
  function endLeaving() {
    const from = seq.leaving;
    seq.leaving = null;
    if (!from) return;
    from.classList.remove('leaving');
    from.style.removeProperty('height');
    for (const p of seq.heads.get(from).values()) p.parentElement.style.removeProperty('visibility');
  }
  // The arrow grows from the caller's lifeline to the callee's on one
  // ease-out curve, and its marker rides the tip; the label fades in behind
  // it, and the callee's box flashes once when the tip arrives.
  function grow(row, callee, wait = 0) {
    const line = $('line.sq-arrow', row);
    const label = $('.sq-label', row);
    const answer = () => {
      if (!callee || M.reduced()) return;
      callee.classList.remove('answer');
      void callee.getBBox?.();
      callee.classList.add('answer');
    };
    if (M.reduced() || !row.checkVisibility?.()) return;
    label?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: wait + 120, easing: 'ease-out', fill: 'backwards' });
    const t0 = performance.now() + wait;
    const run = (fn) => seq.anims.set(row, requestAnimationFrame(fn));
    cancelAnimationFrame(seq.anims.get(row));
    if (!line) {
      const later = (now) => (now < t0 ? run(later) : (seq.anims.delete(row), answer()));
      run(later);
      return;
    }
    const x1 = Number(line.dataset.x1);
    const x2 = Number(line.dataset.x2);
    const D = 420;
    // Until the heads land, the arrow waits unseen at its caller.
    if (wait) line.style.visibility = 'hidden';
    const frame = (now) => {
      if (now < t0) {
        run(frame);
        return;
      }
      line.style.removeProperty('visibility');
      const k = Math.min(1, (now - t0) / D);
      if (k < 1) {
        line.setAttribute('x2', `${(x1 + (x2 - x1) * (1 - Math.pow(1 - k, 3))).toFixed(2)}%`);
        run(frame);
        return;
      }
      seq.anims.delete(row);
      line.setAttribute('x2', `${line.dataset.x2}%`);
      answer();
    };
    line.setAttribute('x2', `${x1}%`);
    run(frame);
  }
  // A label centers on its arrow and slides inward at the figure's edges, so
  // it shows whole at any width and clear of the row numbers; the figure
  // measures its labels as it shows.
  function fitLabels(fig) {
    const svg = $('.sq-svg', fig);
    const w = svg?.getBoundingClientRect().width;
    if (!w) return;
    // Every length is read before any label moves, so the loop lays out once.
    const labels = $$('.sq-label[data-mid]', fig).filter((tx) => tx.dataset.mid);
    const lens = labels.map((tx) => tx.getComputedTextLength?.() ?? 0);
    labels.forEach((tx, k) => {
      const at = (Number(tx.dataset.mid) / 100) * w;
      const x = Math.max(24 + lens[k] / 2, Math.min(w - 6 - lens[k] / 2, at));
      tx.setAttribute('dx', (x - at).toFixed(1));
    });
  }
  // On a narrow screen the figure scrolls sideways: the current arrow comes
  // into view.
  function reveal(fig, row) {
    const sc = fig.parentElement;
    if (!sc || sc.scrollWidth <= sc.clientWidth + 1) return;
    const line = $('.sq-arrow', row);
    const svg = $('.sq-svg', fig);
    if (!line || !svg) return;
    const w = svg.getBoundingClientRect().width;
    const xs = [Number(line.dataset?.x1 ?? 0), Number(line.dataset?.x2 ?? line.dataset?.x1 ?? 0)].map((p) => (p / 100) * w);
    const lo = Math.min(...xs) - 40;
    const hi = Math.max(...xs) + 40;
    if (lo < sc.scrollLeft) sc.scrollLeft = Math.max(0, lo);
    else if (hi > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = hi - sc.clientWidth;
  }
  // The dot map is one tab list and one Tab stop: the current square. Focus
  // in the map follows the hop, so the arrows go on from where the stage is.
  function markHop(i, { focus = false } = {}) {
    const map = $('.flow-map');
    if (!map) return;
    const follow = focus || map.contains(document.activeElement);
    $$('.dot', map).forEach((d) => {
      const on = Number(d.dataset.hopI) === i;
      d.classList.toggle('on', on);
      d.tabIndex = on ? 0 : -1;
      d.setAttribute('aria-selected', String(on));
      if (on && follow) d.focus({ preventScroll: true });
    });
    const id = DATA.flow?.[i]?.id;
    for (const li of $$('.flow-list .hop[data-hop]')) {
      const on = li.dataset.hop === id;
      li.classList.toggle('on', on);
      if (on) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    }
  }
  function initFlowMap() {
    const map = $('.flow-map');
    const stage = fixed('[data-flow-stage]');
    if (!map || !stage) return;
    stage.id = 'wt-stage';
    stage.setAttribute('role', 'tabpanel');
    stage.setAttribute('aria-label', 'the hop');
    map.setAttribute('role', 'tablist');
    map.setAttribute('aria-label', 'every hop');
    $$('.flow-row, .flow-row .dots', map).forEach((r) => r.setAttribute('role', 'none'));
    $$('.lane-name', map).forEach((n) => n.setAttribute('aria-hidden', 'true'));
    $$('.dot', map).forEach((d) => {
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-controls', 'wt-stage');
    });
    markHop(flow.i);
  }
  // The stage is as tall as its tallest hop at the current width, so stepping
  // never moves the page and no line is cut. A hidden twin measures each hop.
  let stageWidth = 0;
  function sizeStage() {
    const stage = fixed('[data-flow-stage]');
    const n = DATA.flow?.length ?? 0;
    const width = stage?.getBoundingClientRect().width ?? 0;
    if (!n || !width) return;
    stageWidth = width;
    // A hop's height follows the length of its words, so the dozen longest
    // hold the tallest; their twins lay out together, in one pass. A step in
    // passing sets its hops as a list, taller than its words' length says, so
    // every one of them is measured too.
    const words = Array.from({ length: n }, (_, i) => hopHtml(i).replace(/<[^>]+>/g, '').length);
    const longest = words.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, i]) => i);
    DATA.flow.forEach((h, i) => h.passing && !longest.includes(i) && longest.push(i));
    const twin = stage.cloneNode(false);
    twin.removeAttribute('data-flow-stage');
    twin.removeAttribute('aria-live');
    twin.removeAttribute('id');
    twin.classList.remove('go');
    Object.assign(twin.style, { position: 'static', height: 'auto' });
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    Object.assign(box.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0', width: `${width}px`, contain: 'layout style' });
    const twins = longest.map((i) => {
      const t = twin.cloneNode(false);
      t.innerHTML = hopHtml(i);
      return t;
    });
    box.append(...twins);
    stage.parentElement.append(box);
    const tallest = Math.max(...twins.map((t) => t.offsetHeight));
    box.remove();
    stage.style.height = `${Math.ceil(tallest)}px`;
  }
  function watchStage() {
    const stage = fixed('[data-flow-stage]');
    if (!stage) return;
    new ResizeObserver(() => {
      const width = stage.getBoundingClientRect().width;
      if (width && Math.abs(width - stageWidth) > 0.5) sizeStage();
    }).observe(stage);
    document.fonts?.ready.then(sizeStage);
    document.fonts?.addEventListener?.('loadingdone', sizeStage);
  }
  // The flow is where the reader is while its stage or its act fills a good
  // part of the screen: the arrows and the navigator then step its hops, and
  // the navigator says which hop. Scrolling changes only what the next press
  // moves, never the hop itself.
  const seen = new Map();
  let flowSeen = false;
  function watchFlowView() {
    const parts = [fixed('[data-flow-stage]'), fixed('[data-seqs]')].filter(Boolean);
    if (!parts.length || !window.IntersectionObserver) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting ? { px: e.intersectionRect.height, whole: e.intersectionRatio > 0.98 } : { px: 0, whole: false });
        const vals = [...seen.values()];
        const now = vals.some((v) => v.whole) || vals.reduce((a, v) => a + v.px, 0) > innerHeight * 0.35;
        if (now === flowSeen) return;
        flowSeen = now;
        updateWhere();
      },
      { rootMargin: '-12% 0px -12% 0px', threshold: [0, 0.25, 0.5, 0.75, 0.99] },
    );
    parts.forEach((el) => io.observe(el));
  }
  const flowOnScreen = () => flowHere() && flowSeen;
  const flowActive = () => inFlow() || (flowOnScreen() && !sceneOf() && !$('.overlay.show'));
  // The navigator's arrows follow the screen alone, so its place always says
  // what they do; a tap moves no focus to rely on.
  function naviStep(delta) {
    const i = flow.i + delta;
    if (flowOnScreen() && i >= 0 && i < (DATA.flow?.length ?? 0)) return stepFlow(delta);
    step(delta);
  }
  // The arrows step hops the way a media player's track buttons step tracks:
  // a flow that plays plays on from the new hop, and a flow that stands with
  // `listen` on reads the new hop once. `←` more than three seconds into a
  // playing hop starts that hop over; a second `←` goes back a hop.
  const RESTART_S = 3;
  function stepFlow(delta, { focus = false } = {}) {
    const n = DATA.flow?.length ?? 0;
    if (!n) return;
    if (delta < 0 && flow.playing && hopSeconds() > RESTART_S) return goHop(flow.i, { focus, again: true });
    goHop(Math.max(0, Math.min(n - 1, flow.i + delta)), { focus });
  }
  function goHop(i, { focus = false, again = false } = {}) {
    const playing = flow.playing && !flow.once;
    halt();
    if (playing) return runFlow({ from: i, focus });
    if (flow.voiced && voiceSource()) return runFlow({ from: i, once: true, focus });
    if (i !== flow.i || again || focus) renderHop(i, { focus });
  }
  // How far the hop on the stage has played, in seconds: the lines already
  // read and the second the voice reached, or the share of its reading time.
  function hopSeconds() {
    if (flow.runVoiced) return flow.heard?.i === flow.i ? (flow.heard.before ?? 0) + (flow.heard.t ?? 0) : 0;
    const h = DATA.flow?.[flow.i];
    return h ? ((flow.at ?? 0) * hopMs(h)) / 1000 : 0;
  }
  // A pause keeps the hop on screen, its clock where it stopped and the
  // second its voice reached; play resumes there, with no new render, cue or
  // animation.
  function stopFlow() {
    if (flow.playing) flow.paused = { i: flow.i, at: flow.at ?? 0, heard: flow.runVoiced ? flow.heard : null, voiced: flow.runVoiced };
    halt({ keep: true });
  }
  // Every run ends here: a pause keeps its place, anything else drops it.
  function halt({ keep = false } = {}) {
    if (!keep) flow.paused = null;
    flow.run++;
    flow.playing = false;
    flow.once = false;
    flow.runVoiced = false;
    hush();
    const stage = fixed('[data-flow-stage]');
    stage?.setAttribute('aria-live', 'polite');
    if (!flow.paused) stage?.style.removeProperty('--dwell');
    playButton(false);
    media(flow.paused ? 'paused' : 'none');
  }
  // A voice that has not spoken yet says so on the button that started it.
  function playButton(on, { loading = false } = {}) {
    const b = fixed('[data-act="flow-play"]');
    if (!b) return;
    $('[data-play]', b)?.toggleAttribute('hidden', on);
    $('[data-pause]', b)?.toggleAttribute('hidden', !on);
    $('span', b).textContent = loading ? 'loading…' : on ? 'pause' : 'play';
    b.toggleAttribute('aria-busy', loading);
  }
  // A hop holds for its reading time plus its animation. The clock stops while
  // the reader points at or focuses the stage, and a bar under it fills as it runs.
  // A hop holds for its drawing plus the reading of everything the flow shows
  // for it: its endpoints, what travels on its arrow, its story line, its
  // subtitle and the stop's title.
  const hopMs = (h) => {
    const s = h.stop ? stopData.get(h.stop) : null;
    const sub = h.sub ? h.sub.replace(/<[^>]+>/g, '') : (s?.gist ?? '');
    return (M.reduced() ? 0 : 900) + M.readMs(`${h.from} ${h.to} ${String(h.label).replace(/<[^>]+>/g, '')} ${h.story ?? ''} ${sub} ${s?.title ?? ''}`, 22000);
  };
  // The stage persists while its content re-renders each hop, so it tracks the
  // pointer itself; :hover drops whenever the node under the pointer is replaced.
  const held = new WeakSet();
  const holdOn = (el) => {
    if (!el || el.dataset.holds) return;
    el.dataset.holds = '1';
    el.addEventListener('pointerenter', () => held.add(el));
    el.addEventListener('pointerleave', () => held.delete(el));
    el.addEventListener('focusin', () => held.add(el));
    el.addEventListener('focusout', () => held.delete(el));
  };
  async function dwellFlow(ms, run, from = 0) {
    const stage = fixed('[data-flow-stage]');
    holdOn(stage);
    await M.clock(ms, {
      from,
      held: () => held.has(stage),
      alive: () => flow.playing && run === flow.run,
      onTick: (p) => {
        flow.at = p;
        stage?.style.setProperty('--dwell', p.toFixed(4));
      },
    });
  }
  // `play` is the flow's one playback control. It plays in the voice while
  // `listen` is on and in silence while it is off, and resumes a pause where
  // it stopped, going on past the hop. After a hop read once, play starts
  // at the hop after it.
  function playFlow({ finale = false, silentStart = false } = {}) {
    if (flow.playing) return stopFlow();
    // The finale plays on the close, where the walk ends; any other play
    // stays where the flow is on screen, or opens the whole flow.
    if (finale && state.chapter !== 'c-close') route('#c-close');
    else if (!flowHere()) route('#c-open');
    const n = DATA.flow?.length ?? 0;
    if (!n) return;
    const voiced = !finale && flow.voiced && Boolean(voiceSource());
    const p = flow.paused;
    const resume = !finale && p && p.i === flow.i && p.voiced === voiced && (voiced || p.at < 1) ? p : null;
    const from = finale ? 0 : resume ? flow.i : flow.ended === flow.i && flow.i < n - 1 ? flow.i + 1 : flow.i >= n - 1 ? 0 : flow.i;
    halt();
    runFlow({ from, resume, finale, silentStart, voiced });
  }
  // One run of the flow from a hop: to the end, or one hop when `once`, in
  // the voice or in silence.
  async function runFlow({ from, resume = null, once = false, finale = false, silentStart = false, voiced = flow.voiced && Boolean(voiceSource()), focus = false }) {
    const n = DATA.flow?.length ?? 0;
    if (!n) return;
    if (voiced && voiceSource() === 'openai' && !voice.key) return openVoicePanel('Paste an OpenAI API key to use this voice.');
    if (!flowHere()) route('#c-open');
    flow.paused = null;
    flow.ended = null;
    const run = ++flow.run;
    flow.playing = true;
    flow.once = once;
    flow.runVoiced = voiced;
    const ctl = voiced ? (voice.abort = new AbortController()) : null;
    playButton(true, { loading: voiced });
    if (voiced) media('playing');
    fixed('[data-flow-stage]')?.setAttribute('aria-live', 'off');
    if (!resume && !once) $('[data-flow]')?.scrollIntoView({ behavior: smooth(), block: 'start' });
    const alive = () => flow.playing && run === flow.run;
    // A pause the page did not make, from the browser or the lock screen.
    const outside = () => alive() && stopFlow();
    const inOutro = resume?.heard?.k === Infinity;
    try {
      for (let i = inOutro ? n : from; alive() && i < n; i++) {
        const same = resume?.i === i;
        if (!same) renderHop(i, { cue: !voiced && !(silentStart && i === 0), focus: focus && i === from });
        if (voiced) await sayHop(i, ctl, { alive, outside, back: same ? resume.heard : null, intro: !once && i === 0 });
        else await dwellFlow(hopMs(DATA.flow[i]), run, same ? resume.at : 0);
        if (!alive()) return;
        if (once) {
          flow.ended = i;
          return halt();
        }
        if (voiced) await new Promise((r) => setTimeout(r, 450));
      }
      const outro = voiced && N.segments.find((s) => s.kind === 'outro');
      if (alive() && outro) {
        const at = inOutro ? resume.heard.t : 0;
        const heard = (flow.heard = { i: n - 1, k: Infinity, intro: false, t: at, dur: 0 });
        await sayLine(outro, ctl.signal, () => {}, { from: at, onTime: (t, d) => ((heard.t = t), d && (heard.dur = d)), onOutsidePause: outside });
      }
      if (alive()) {
        flow.heard = null;
        halt();
        S.play(finale ? 'finale' : 'converge');
      }
    } catch (e) {
      if (!alive()) return;
      halt();
      openVoicePanel(e.message);
    }
  }


  // -------------------------------------------------------------- narration
  // The whole flow read aloud, in the order the stage plays it. Two voices
  // read the one script: a recording made with OpenAI when the page is built,
  // published beside it, or OpenAI at view time with the reader's own key.
  // claude.ai's frame blocks requests to other hosts, so the second is offered
  // only where the page runs outside it: a local copy or a live preview. With
  // neither, the page has no voice and shows no listen control.
  const N = DATA.narration ?? { segments: [] };
  const LOCAL = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const OA_VOICES = ['marin', 'cedar', 'coral', 'sage', 'ash', 'ballad', 'verse', 'alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
  const SPEECH = 'https://api.openai.com/v1/audio/speech';
  const voice = { pick: store.get('voice', null), key: LOCAL ? store.get('oa-key', '') ?? '' : '', oa: store.get('oa-voice', null) ?? N.voice ?? 'marin', recorded: N.recorded ? N.voice : null, abort: null, status: '', urls: new Map() };
  const hasRecording = () => N.segments.some((s) => s.clip);
  const voiceSources = () => [hasRecording() && 'recorded', LOCAL && 'openai'].filter(Boolean);
  // The reader's pick when the page offers it, else the recording.
  function voiceSource() {
    const all = voiceSources();
    return all.includes(voice.pick) ? voice.pick : all[0] ?? null;
  }
  // A recording published beside the page after it was rendered: its
  // narration.json names each clip by a hash of what shapes its sound, the
  // way narrate.mjs names the files.
  async function clipFile(v, text) {
    const bytes = new TextEncoder().encode(JSON.stringify([v.model, v.voice, v.instructions, text]));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hash.slice(0, 16)}.mp3`;
  }
  async function findRecording() {
    if (hasRecording() || location.protocol === 'file:' || !crypto.subtle) return;
    try {
      const res = await fetch('narration.json', { cache: 'no-store' });
      if (!res.ok) return;
      const rec = await res.json();
      const have = new Set(rec.clips ?? []);
      for (const s of N.segments) {
        const name = await clipFile(rec, s.text);
        if (have.has(name)) s.clip = `${rec.dir ?? 'audio'}/${name}`;
      }
      if (hasRecording()) voice.recorded = rec.voice;
    } catch {
      /* no recording beside the page */
    }
    renderVoicePanel();
  }
  // Clips OpenAI made for this reader stay in this browser, so a replay costs nothing.
  const clipCache = (() => {
    let db = null;
    const open = () =>
      (db ??= new Promise((res) => {
        try {
          const r = indexedDB.open('wt-voice', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('clips');
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch {
          res(null);
        }
      }));
    const run = async (mode, fn) => {
      const d = await open();
      if (!d) return null;
      return new Promise((res) => {
        try {
          const q = fn(d.transaction('clips', mode).objectStore('clips'));
          q.onsuccess = () => res(q.result ?? null);
          q.onerror = () => res(null);
        } catch {
          res(null);
        }
      });
    };
    return { get: (k) => run('readonly', (s) => s.get(k)), put: (k, v) => run('readwrite', (s) => s.put(v, k)) };
  })();
  async function openaiUrl(text, signal) {
    const k = `${N.model}|${voice.oa}|${N.instructions}|${text}`;
    if (voice.urls.has(k)) return voice.urls.get(k);
    let blob = await clipCache.get(k);
    if (!blob) {
      let res;
      try {
        res = await fetch(SPEECH, { method: 'POST', signal, headers: { Authorization: `Bearer ${voice.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: N.model, voice: voice.oa, input: text, instructions: N.instructions, response_format: 'mp3' }) });
      } catch {
        if (signal.aborted) return null;
        throw new Error('The page could not reach OpenAI.');
      }
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error?.message;
        throw new Error(res.status === 401 ? 'OpenAI refused this key.' : res.status === 429 ? 'OpenAI is limiting this key: try again in a minute.' : msg || `OpenAI answered ${res.status}.`);
      }
      blob = await res.blob();
      clipCache.put(k, blob);
    }
    const url = URL.createObjectURL(blob);
    voice.urls.set(k, url);
    return url;
  }
  // Each resolves when its line has been said, or at once when the run stops.
  // Progress drives the stage's bar on every frame, and the second the clip
  // reached is kept, so a pause resumes mid-line. A pause the browser or the
  // lock screen makes, rather than the page, pauses the run the same way.
  function playUrl(url, signal, onProgress, { from = 0, onTime = () => {}, onOutsidePause = () => {}, onStart = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      let raf = 0;
      const done = (err) => {
        cancelAnimationFrame(raf);
        a.onended = a.onerror = a.onpause = null;
        onTime(a.currentTime, a.duration);
        if (err) reject(err);
        else resolve();
      };
      const tick = () => {
        if (a.duration) {
          onProgress(Math.min(1, a.currentTime / a.duration));
          onTime(a.currentTime, a.duration);
        }
        raf = requestAnimationFrame(tick);
      };
      a.onended = () => done();
      a.onerror = () => done(new Error('The recording did not load.'));
      a.onpause = () => {
        if (signal.aborted || a.ended) return;
        onTime(a.currentTime, a.duration);
        onOutsidePause();
      };
      signal.addEventListener('abort', () => (a.onpause = null, a.pause(), done()), { once: true });
      // A seek before the clip's header loads is lost in some browsers.
      if (from > 0) a.addEventListener('loadedmetadata', () => (a.currentTime = from), { once: true });
      a.play().then(
        () => {
          onStart();
          raf = requestAnimationFrame(tick);
        },
        (e) => done(e?.name === 'NotAllowedError' ? new Error('The browser held the sound back: press play again.') : e),
      );
    });
  }
  const lineUrl = async (seg, signal) => (voiceSource() === 'openai' ? openaiUrl(seg.text, signal) : seg.clip);
  // How long a clip speaks, in seconds, read from its header; 0 when unknown.
  const clipLength = (url) =>
    new Promise((resolve) => {
      if (!url) return resolve(0);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => resolve(0);
      a.src = url;
    });
  // A line the recording lacks passes in silence: the page never swaps voices.
  async function sayLine(seg, signal, onProgress, opts) {
    const url = await lineUrl(seg, signal);
    if (signal.aborted) return;
    if (url) return playUrl(url, signal, onProgress, opts);
    onProgress(1);
  }
  const segsFor = (i, intro) => N.segments.filter((s) => s.hop === i && s.kind !== 'outro' && (s.kind !== 'intro' || intro));
  function prefetch(i) {
    if (voiceSource() !== 'openai') return;
    const idle = new AbortController().signal;
    for (const seg of segsFor(i + 1, false)) openaiUrl(seg.text, idle).catch(() => {});
  }
  // `listen` turns the voice on or off, the way a mute control does; `play`
  // alone plays and pauses. The choice stays in this browser.
  function listenButton() {
    const b = fixed('[data-act="flow-listen"]');
    if (!b) return;
    b.setAttribute('aria-pressed', String(flow.voiced));
    b.setAttribute('aria-label', flow.voiced ? 'listen: on' : 'listen: off');
    $('[data-on]', b)?.toggleAttribute('hidden', !flow.voiced);
    $('[data-off]', b)?.toggleAttribute('hidden', flow.voiced);
  }
  function toggleVoice() {
    const src = voiceSource();
    if (!src) return toast('<b>no voice</b>This page ships without a recorded voice.');
    if (!flow.voiced && src === 'openai' && !voice.key) return openVoicePanel('Paste an OpenAI API key to use this voice.');
    flow.voiced = !flow.voiced;
    store.set('listen', flow.voiced);
    listenButton();
    // A flow that plays goes on in the new mode from the start of its hop; a
    // hop read once falls silent.
    if (flow.playing) {
      const { once } = flow;
      halt();
      if (!once) runFlow({ from: flow.i });
    }
    S.play('toggle');
  }
  // A click on the story line reads its hop again, `listen` on or off.
  function sayAgain() {
    if (!voiceSource()) return;
    const playing = flow.playing && !flow.once && flow.runVoiced;
    halt();
    runFlow({ from: flow.i, once: !playing, voiced: true });
  }
  // On a page with a voice the story line is a control that reads its hop.
  function sayable() {
    const p = voiceSource() && $('[data-flow-stage] .st-label');
    if (!p || p.querySelector('.st-say')) return;
    p.innerHTML = `<button type="button" class="st-say" data-act="say" title="read this hop aloud">${SAY_ICON}${p.innerHTML}</button>`;
  }
  const SAY_ICON = `<span class="st-say-ico">${icon('sound')}</span>`;
  function hush() {
    voice.abort?.abort();
    voice.abort = null;
  }
  // The lock screen and a headset's buttons play, pause and step the flow by
  // the same rules as the page's own controls.
  function media(state) {
    const session = navigator.mediaSession;
    if (!session) return;
    try {
      if (state === 'playing' && !media.bound) {
        media.bound = true;
        session.setActionHandler('play', () => flow.playing || playFlow());
        session.setActionHandler('pause', () => flow.playing && stopFlow());
        session.setActionHandler('previoustrack', () => stepFlow(-1));
        session.setActionHandler('nexttrack', () => stepFlow(1));
      }
      if (state === 'playing' && window.MediaMetadata) session.metadata = new MediaMetadata({ title: document.title, artist: 'the whole flow' });
      if (media.bound) session.playbackState = state;
    } catch {
      /* a browser without one of these actions */
    }
  }
  // One hop's lines in the voice. Paused while reading, the voice resumes on
  // the same hop at the second of the line it had reached (voice.js). Each
  // line takes the share of the bar its clip takes of the hop's time, so the
  // bar fills at one pace and meets each line where it starts.
  async function sayHop(i, ctl, { alive, outside, back, intro }) {
    const stage = fixed('[data-flow-stage]');
    const again = back ? V.resume(back, i) : null;
    const from0 = again && !again.fresh ? again : null;
    const opens = from0 ? from0.intro : intro;
    const segs = segsFor(i, opens);
    prefetch(i);
    const lens = await Promise.all(segs.map(async (s) => clipLength(await lineUrl(s, ctl.signal))));
    const total = lens.reduce((a, b) => a + b, 0);
    const before = (k) => lens.slice(0, k).reduce((a, b) => a + b, 0);
    const share = (k, p) => (total ? (before(k) + p * lens[k]) / total : (k + p) / segs.length);
    for (let k = from0 ? from0.k : 0; k < segs.length && alive(); k++) {
      const at = from0 && k === from0.k ? from0.t : 0;
      const heard = (flow.heard = { i, k, intro: opens, t: at, dur: lens[k], before: before(k) });
      await sayLine(segs[k], ctl.signal, (p) => stage?.style.setProperty('--dwell', share(k, p).toFixed(4)), { from: at, onTime: (t, d) => ((heard.t = t), d && (heard.dur = d)), onOutsidePause: outside, onStart: () => alive() && playButton(true) });
    }
  }
  function renderVoicePanel() {
    const src = voiceSource();
    const all = voiceSources();
    const listen = fixed('[data-act="flow-listen"]');
    if (listen) listen.hidden = !src;
    listenButton();
    sayable();
    const pick = fixed('[data-act="voice"]');
    if (pick) pick.hidden = !all.includes('openai');
    const name = fixed('[data-voice-name]');
    if (name) name.textContent = src === 'recorded' ? `${voice.recorded}, recorded` : src === 'openai' ? `${voice.oa}, OpenAI` : 'none';
    const panel = fixed('[data-voice-panel]');
    if (!panel || panel.hidden) return;
    const radio = (id, label) => `<label class="vp-src"><input type="radio" name="wt-voice-src" value="${id}"${src === id ? ' checked' : ''}> ${label}</label>`;
    panel.innerHTML = `<fieldset><legend class="caps">voice</legend>${all.includes('recorded') ? radio('recorded', `recorded · ${esc(voice.recorded)}`) : ''}${
      all.includes('openai')
        ? `${radio('openai', 'OpenAI, with your key')}<div class="vp-opts"><label for="wt-oa-key">API key</label><input id="wt-oa-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" value="${esc(voice.key)}"><label for="wt-oa-voice">voice</label><select id="wt-oa-voice">${OA_VOICES.map((v) => `<option${v === voice.oa ? ' selected' : ''}>${v}</option>`).join('')}</select><label class="vp-keep"><input type="checkbox" id="wt-oa-keep"${store.get('oa-key', '') ? ' checked' : ''}> remember the key on this device</label><p class="keyline">The key goes only to api.openai.com, from this browser. Each line is made once, then kept here.</p></div>`
        : ''
    }</fieldset><p class="keyline vp-status" role="status">${esc(voice.status)}</p>`;
  }
  function openVoicePanel(status = '') {
    const panel = fixed('[data-voice-panel]');
    if (!panel) return;
    voice.status = status;
    panel.hidden = false;
    fixed('[data-act="voice"]')?.setAttribute('aria-expanded', 'true');
    L.open(panel, { close: closeVoicePanel, opener: fixed('[data-act="voice"]') });
    renderVoicePanel();
  }
  function closeVoicePanel() {
    const panel = fixed('[data-voice-panel]');
    if (!panel || panel.hidden) return false;
    panel.hidden = true;
    fixed('[data-act="voice"]')?.setAttribute('aria-expanded', 'false');
    L.closed(panel);
    return true;
  }
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.closest?.('[data-voice-panel]')) return;
    if (t.name === 'wt-voice-src') store.set('voice', (voice.pick = t.value));
    else if (t.id === 'wt-oa-voice') store.set('oa-voice', (voice.oa = t.value));
    else if (t.id === 'wt-oa-keep') store.set('oa-key', t.checked && voice.key ? voice.key : null);
    voice.status = voice.pick === 'openai' && !voice.key ? 'Paste an OpenAI API key to use this voice.' : '';
    S.play('toggle');
    renderVoicePanel();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'wt-oa-key') return;
    voice.key = e.target.value.trim();
    if ($('#wt-oa-keep')?.checked) store.set('oa-key', voice.key || null);
    const name = fixed('[data-voice-name]');
    if (name) name.textContent = voiceSource() === 'openai' ? `${voice.oa}, OpenAI` : name.textContent;
  });

  // ------------------------------------------------------------------ keys
  let gPending = 0;
  // One flow player serves the page: the chapter on screen holds it, so the
  // close plays the flow in place, with the hop, the pause and the map it had.
  const flowHere = () => Boolean(chapterEl(state.chapter)?.querySelector('[data-flow-dock] [data-flow]'));
  function dockFlow(ch) {
    const dock = ch && $('[data-flow-dock]', ch);
    const el = fixed('[data-flow]');
    if (dock && el && el.parentElement !== dock) dock.append(el);
  }
  const ACTIONS = {
    j: () => step(-1),
    k: () => step(1),
    ']': () => stepChapter(1),
    '[': () => stepChapter(-1),
    x: () => (state.view === 'walk' ? toggleReviewed(state.stop, { advance: true }) : undefined),
    c: () => commentKey(),
    d: () => toggleView(),
    m: () => toggleSound(),
    '?': () => openOverlay('help'),
    t: () => openDeck(),
    l: () => toggleVoice(),
    b: () => goBack(),
    r: () => sceneInView()?.replay(),
    z: () => foldKey(),
    ArrowRight: (e) => arrow(1, e),
    ArrowLeft: (e) => arrow(-1, e),
    ArrowDown: () => page(1),
    ArrowUp: () => page(-1),
    Home: () => edge(-1),
    End: () => edge(1),
    ' ': () => {
      if (inFlow()) return playFlow();
      const sc = sceneOf() ?? sceneInView();
      if (sc) return sc.toggle();
      if (flowHere()) return playFlow();
    },
    g: () => (gPending = performance.now() + 900),
    0: () => {
      if (performance.now() < gPending) follow('#c-open');
    },
    Escape: () => {
      if (tipFor) return hideTip();
      if (closeSheet()) return;
      if (L.closeTop()) return;
      if (state.sel || window.getSelection()?.toString()) return clearLineSelection({ text: true });
      if (comments.picking) return setPicking(false);
      if (comments.mode) return comments.anchors?.exitMode();
      if (leaveWidget()) return;
      hideBack();
    },
  };
  // The arrows go to what holds focus, the way a native control takes them:
  // the flow, or its bar, stage, act or dot map, steps the hops and the focus
  // follows the hop, a scene steps itself, and anywhere else they step the
  // walk like j and k. The letter keys never change meaning, so j and k
  // always leave. Past the flow's either end a fresh press moves on; a held
  // arrow stops.
  const inFlow = (el = document.activeElement) => flowHere() && Boolean(el?.matches?.('[data-flow]') || el?.closest?.('.flow-bar, .flow-stage, .flow-map, .seqs'));
  function arrow(delta, e) {
    if (flowActive()) {
      const i = flow.i + delta;
      if (i >= 0 && i < (DATA.flow?.length ?? 0)) return stepFlow(delta, { focus: true });
      if (e?.repeat) return;
    }
    const sc = sceneOf();
    if (sc) return delta > 0 ? sc.next() : sc.prev();
    step(delta);
  }
  function edge(side) {
    if (inFlow()) return goHop(side < 0 ? 0 : (DATA.flow?.length ?? 1) - 1, { focus: true });
    const sc = sceneOf();
    if (sc) sc.seek(side < 0 ? 0 : sc.def.steps.length - 1);
  }
  // Escape hands the arrows back to the page: focus leaves the flow or the
  // scene for the stop or the chapter around it.
  function leaveWidget() {
    const a = document.activeElement;
    const w = a?.matches?.('[data-flow]') ? a : a?.closest?.('.flow-bar, .flow-stage, .flow-map, .seqs, .scene');
    if (!w) return false;
    (w.closest('.stop') ?? w.closest('.chapter'))?.focus({ preventScroll: true });
    return true;
  }
  // Space belongs to the focused button or link, and a square plays the
  // flow; elsewhere it plays the scene on screen or the flow, and keeps its
  // browser meaning when neither is there. Home and End scroll the page
  // unless the flow or a scene holds focus.
  const ownsKeys = (el) => Boolean(el?.matches?.('a[href], button, summary, input, select, textarea, [contenteditable="true"]')) && !el.matches('.flow-map .dot');
  const wantsDefault = (k) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k) && document.activeElement?.matches?.(WIDE) && document.activeElement.tabIndex === 0) return true;
    if (k === ' ') return ownsKeys(document.activeElement) || (!inFlow() && !sceneOf() && !sceneInView() && !flowHere());
    if (k === 'Home' || k === 'End') return !inFlow() && !sceneOf();
    if (k === 'r') return !sceneInView();
    // An open sheet scrolls itself.
    if (k === 'ArrowUp' || k === 'ArrowDown') return Boolean($('.overlay.show'));
    return false;
  };
  const MOVES = new Set(['j', 'k', '[', ']', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
  // A key lights its keycaps and presses the controls it names, where a
  // reader can see them: the header, the rail, the navigator, the chapter on
  // screen and what floats over it. The rest of the page is hidden, and a
  // query over it would walk every chapter per press.
  const pressedCaps = new Map();
  const ARIA_KEY = { ' ': 'Space' };
  function capsOf(k) {
    const roots = [fixed('.hdr'), fixed('[data-rail]'), fixed('[data-navi]'), fixed('[data-back]'), fixed('[data-toast]'), fixed('[data-tip]'), chapterEl(state.chapter), ...fixed('.overlay', true).filter((o) => o.classList.contains('show'))];
    const sel = `.key[data-key="${CSS.escape(k)}"], [aria-keyshortcuts~="${CSS.escape(ARIA_KEY[k] ?? k)}"]`;
    return [...new Set(roots.filter(Boolean).flatMap((r) => $$(sel, r)))];
  }
  document.addEventListener('keydown', (e) => {
    const k = K.keyOf(e);
    if (!k) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing && k !== 'Escape') return;
    const act = ACTIONS[k];
    if (!act || wantsDefault(k)) return;
    e.preventDefault();
    // Held down, a key that moves keeps moving, and its cue ticks at the
    // sound's own pace; a key that toggles acts once.
    if (e.repeat && !MOVES.has(k)) return;
    S.unlock();
    if (!e.repeat) {
      const caps = capsOf(k);
      pressedCaps.get(k)?.forEach((el) => M.release(el));
      pressedCaps.set(k, caps);
      caps.forEach((el) => M.press(el));
    }
    S.hold(e.repeat);
    act(e);
    S.hold(false);
  });
  // A key typed with Shift, such as `?`, can come up as its bare character
  // once Shift lifts first, so a Shift that lifts releases every cap.
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') return releaseCaps();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pressedCaps.get(k)?.forEach((el) => M.release(el));
    pressedCaps.delete(k);
  });
  // A keyup that lands outside the frame, such as after the host takes focus
  // for its comment composer, never reaches the page, and its caps stay lit.
  const releaseCaps = () => {
    pressedCaps.forEach((caps) => caps.forEach((el) => M.release(el)));
    pressedCaps.clear();
  };
  window.addEventListener('blur', releaseCaps);
  document.addEventListener('visibilitychange', releaseCaps);
  document.addEventListener('pointerdown', releaseCaps);

  // ----------------------------------------------------------------- sound
  function toggleSound() {
    S.setEnabled(!S.enabled);
    renderSound();
    if (S.enabled) S.play('toggle');
  }
  function renderSound() {
    const b = fixed('[data-act="sound"]');
    if (!b) return;
    const st = S.state();
    b.setAttribute('aria-pressed', String(st === 'on'));
    b.setAttribute('aria-label', st === 'off' ? 'Turn sound on' : st === 'armed' ? 'Sound on: click anywhere to start audio' : 'Turn sound off');
    $('[data-on]', b)?.toggleAttribute('hidden', st === 'off');
    $('[data-off]', b)?.toggleAttribute('hidden', st !== 'off');
  }
  S.onChange(renderSound);

  // ---------------------------------------------------------------- clicks
  // A press inside a stop makes it current, silently: the stop you touch is
  // the stop you are on.
  document.addEventListener('pointerdown', (e) => {
    const stop = e.target.closest?.('.stop');
    if (stop && !comments.mode && stop.dataset.stop !== state.stop) setCurrent(stop.dataset.stop, { sound: false });
    const sec = e.target.closest?.('.fv-file');
    if (sec && state.file !== Number(sec.dataset.fileI)) {
      state.file = Number(sec.dataset.fileI);
      markRailFile();
      updateWhere();
    }
  });
  document.addEventListener('click', (e) => {
    S.unlock();
    if (e.target.closest?.('[data-peek-sheet]')) {
      if (e.target.closest('.ps-x') || e.target.closest('[data-close-sheet]')) closeSheet();
      if (e.target.closest('.ps-x')) return;
    } else if ((TOUCH.matches || touching()) && !comments.mode && !comments.picking) {
      const t = sheetTarget(e.target);
      if (t && openSheet(t)) return e.preventDefault();
    }
    // A row is a square of its own: it shows its hop and keeps the arrows on
    // the flow, the way a click on a square does.
    const col = e.target.closest?.(CLICKS);
    if (col) return goHop(Number(col.dataset.hopI), { focus: true });
    const dot = e.target.closest?.('.flow-map .dot');
    if (dot) {
      e.preventDefault();
      return goHop(Number(dot.dataset.hopI), { focus: true });
    }
    const a = e.target.closest?.('a[href^="#"]');
    if (a && !e.defaultPrevented) {
      e.preventDefault();
      hideTip();
      if (a.hasAttribute('data-close-overlay') || a.closest('.overlay')) {
        closeOverlays();
        follow(a.getAttribute('href'), a);
        land(null, a.getAttribute('href'));
        return;
      }
      const tab = a.closest('.tab[data-view]');
      if (tab) return pickView(tab.dataset.view);
      if (a.closest('.main') && !a.closest('.views')) return jump(a);
      follow(a.getAttribute('href'), a);
      return;
    }
    if (e.target.closest?.('[data-back]')) return goBack();
    const b = e.target.closest?.('[data-act]');
    if (b) {
      const act = b.dataset.act;
      const stop = b.closest('.stop')?.dataset.stop;
      if (act !== 'sound' && b.closest('[data-rail-tools]')) closeRail();
      if (act === 'review') toggleReviewed(stop ?? state.stop, { advance: !stop });
      else if (act === 'reopen') {
        const el = b.closest('.stop');
        const open = !el.classList.contains('open');
        showStop(el, open);
        S.play(open ? 'unfold' : 'fold');
        reportPins();
      } else if (act === 'comment') {
        const spot = spotFor(b.closest('.stop'));
        if (spot) compose({ ...spot, point: { x: Math.round(e.pageX), y: Math.round(e.pageY) } });
      } else if (act === 'comment-mode') commentKey();
      else if (act === 'next' || act === 'prev') naviStep(act === 'next' ? 1 : -1);
      else if (act === 'top') glideTo(0);
      // Stops lay out as they come near, so the page grows while it flies; the
      // spring follows a mark at the page's end instead of a height read once.
      else if (act === 'bottom') {
        const end = fixed('[data-page-end]');
        glideTo(end ? landY(end) : document.documentElement.scrollHeight, { el: end });
      }
      else if (act === 'sound') toggleSound();
      else if (act === 'close-sheet') closeOverlays();
      else if (act === 'help') openOverlay('help');
      else if (act === 'reset-folds') askReset(b, () => resetFolds());
      else if (act === 'reset-progress') askReset(b, () => resetProgress());
      else if (act === 'fold') foldKey();
      else if (act === 'deck') openDeck();
      else if (act === 'rail') {
        if (!closeRail()) openRail(b);
      } else if (act === 'flow-play') playFlow();
      else if (act === 'flow-listen') toggleVoice();
      else if (act === 'say') sayAgain();
      else if (act === 'voice') {
        if (!closeVoicePanel()) openVoicePanel();
      } else if (act === 'flow-next' || act === 'flow-prev') stepFlow(act === 'flow-next' ? 1 : -1);
      else if (act === 'files-all') setAllFiles(b);
      else if (act === 'fold-all') setAllDiffs(b);
      else if (act === 'open-all') setAllSkipped(b);
      return;
    }
    if (e.target.closest?.('.qa-ans > summary')) return S.play('flip');
    const hf = e.target.closest?.('.hunk-fold');
    if (hf) return toggleHunk(hf);
    const fvt = e.target.closest?.('.fv-toggle');
    if (fvt) return toggleFile(fvt);
    const ord = e.target.closest?.('.fv-order [data-order]');
    if (ord) return setOrder(ord.closest('[data-files]').dataset.files, ord.dataset.order);
    const trail = e.target.closest?.('[data-trail-more]');
    if (trail) {
      const ol = trail.closest('.trail');
      const open = !ol.classList.contains('open');
      ol.classList.toggle('open', open);
      trail.setAttribute('aria-expanded', String(open));
      return;
    }
    const more = e.target.closest?.('.toc-more');
    if (more) {
      const group = more.closest('.has-branches');
      if (group) return setBranches(group, more.getAttribute('aria-expanded') !== 'true');
      more.closest('ol')?.querySelectorAll('.more-row').forEach((li) => li.classList.remove('more-row'));
      more.closest('li')?.remove();
      return;
    }
    const card = e.target.closest?.('.card > button');
    if (card) {
      card.setAttribute('aria-pressed', String(card.parentElement.classList.toggle('flip')));
      S.play('flip');
      return;
    }
  });
  document.addEventListener('toggle', () => reportPins(), true);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reportPins, 150);
  });

  document.addEventListener('change', (e) => {
    const li = e.target.closest?.('[data-qa]');
    if (li && e.target.type === 'checkbox') {
      const id = li.dataset.qa;
      if (e.target.checked) state.qa.add(id);
      else state.qa.delete(id);
      applyQa();
      persist();
      S.play(e.target.checked ? 'checked' : 'unmark');
    }
  });
  function applyQa() {
    $$('[data-qa]').forEach((li) => {
      const on = state.qa.has(li.dataset.qa);
      li.classList.toggle('done', on);
      const box = $('input[type="checkbox"]', li);
      if (box) box.checked = on;
    });
  }

  // ------------------------------------------------------ private progress
  let saveTimer = 0;
  let saving = false;
  function saveRemoteProgress() {
    if (!remote.db || !remote.uid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (saving) return saveRemoteProgress();
      saving = true;
      try {
        await remote.db.doc(`data/users/${remote.uid}/progress`).set({ reviewed: [...state.reviewed], qa: [...state.qa], seen: [...state.seen], at: new Date().toISOString() });
      } catch {
        /* private progress stays local this visit */
      }
      saving = false;
    }, 700);
  }
  // ------------------------------------------------------------------ boot
  function boot() {
    if (!document.documentElement.lang) document.documentElement.lang = 'en';
    for (const id of state.reviewed) applyReviewed(id);
    applyQa();
    renderSound();
    placeTools();
    initScenes();
    initFlowMap();
    initSeqs();
    showSeq(flow.i);
    watchStage();
    watchFlowView();
    watchScrollables();
    renderVoicePanel();
    findRecording();
    route(location.hash || '#c-open', { load: true });
    updateProgress();
    window.addEventListener('hashchange', () => trail.popped(location.hash) || route(location.hash));
    connect();
  }

  async function connect() {
    const use = window.claude?.use?.bind(window.claude);
    if (!use) return;
    const safe = (n) => use(n).catch(() => null);
    initComments(safe);
    const [user, db] = await Promise.all([safe('user'), safe('db')]);
    Object.assign(remote, { user, db });
    if (user) {
      try {
        remote.uid = (await user.me()).id;
      } catch {
        /* no identity: progress stays in this browser */
      }
    }
    if (db && remote.uid) {
      try {
        const snap = await db.doc(`data/users/${remote.uid}/progress`).get();
        const d = snap.exists ? snap.data() : {};
        for (const id of d.reviewed ?? []) state.reviewed.add(id);
        for (const id of d.qa ?? []) state.qa.add(id);
        for (const id of d.seen ?? []) state.seen.add(id);
        for (const id of state.reviewed) applyReviewed(id);
        applyQa();
        updateProgress();
        updateWhere();
        // A load writes nothing: the merged record goes up with the reader's next change.
      } catch {
        /* keep local progress */
      }
    }
  }

  boot();
})();
