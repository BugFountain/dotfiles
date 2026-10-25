/* Trail: the way back from every jump, on both kinds of page. window.WTTrail.
   A jump, such as a link, a peek's `go`, a rail row or a glossary hit, first
   asks the page where the reader is (`snapshot`) and pushes a history entry.
   The browser's Back and the page's `b` both return to that place, and the
   page puts it back (`restore`): the scroll, the stage's hop, the open folds.
   Forward returns to where Back left, the same way. A frame that refuses
   history writes keeps the places in memory, so `b` still returns.

   Each history entry the trail made carries its index in `state.wtTrail`
   and this runtime's id in `state.wtRun`; `places[k]` is where the reader
   was when they left entry k. An entry from before a reload has no place
   here, so the page's hash routing answers it. */
(function (root) {
  'use strict';
  function create({ snapshot, restore, win = root }) {
    const places = [];
    const run = Math.random().toString(36).slice(2);
    let at = 0;
    let writes = true;
    let popped = null;
    // The trail puts the scroll back itself; the browser's own restore would
    // land on the scroll it saved, before the folds changed.
    try {
      if ('scrollRestoration' in win.history) win.history.scrollRestoration = 'manual';
    } catch {
      /* a frame that refuses it keeps the browser's restore */
    }
    const write = (fn) => {
      if (!writes) return;
      try {
        fn();
      } catch {
        writes = false;
      }
    };
    function jump(hash, extra = {}) {
      places[at] = { ...snapshot(), ...extra };
      places.length = at + 1;
      popped = null;
      write(() => {
        win.history.replaceState({ ...(win.history.state ?? {}), wtTrail: at, wtRun: run }, '');
        win.history.pushState({ wtTrail: at + 1, wtRun: run }, '', hash ?? undefined);
      });
      at++;
    }
    function go(k) {
      places[at] = { ...places[at], ...snapshot() };
      at = k;
      if (places[k]) restore(places[k]);
    }
    // `b`: one place back, through the browser's history when it takes writes.
    function back() {
      if (at === 0) return false;
      if (writes) win.history.back();
      else go(at - 1);
      return true;
    }
    win.addEventListener('popstate', (e) => {
      const k = e.state?.wtTrail;
      if (e.state?.wtRun !== run || typeof k !== 'number' || k === at) return;
      popped = win.location.hash;
      go(k);
    });
    return {
      jump,
      back,
      // The place `b` returns to, or null at the start of the trail.
      last: () => (at > 0 ? places[at - 1] ?? null : null),
      // A hash change that a Back or Forward the trail answered caused, which
      // the page's own hash routing leaves alone. The page asks on every hash
      // change, and a traversal between entries of one fragment fires none,
      // so any answer ends the claim.
      popped(hash) {
        const mine = popped !== null && hash === popped;
        popped = null;
        return mine;
      },
      // A hash the page writes in place keeps the entry's place in the trail.
      replace(url) {
        write(() => win.history.replaceState(win.history.state, '', url));
      },
    };
  }
  root.WTTrail = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
