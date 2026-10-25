/* Disclose: every <details> opens and closes by its height, on both kinds of
   page. window.WTDisclose. Where the browser animates to `auto`, page.css does
   it with ::details-content and this file does nothing. Elsewhere a press on
   a summary opens the fold and grows it from its summary's height, or shrinks
   it to that height and then closes it. A second press mid-way turns it
   back from where it is. A fold the page opens or closes itself, such as a
   landing's or `z`'s, snaps, as does every fold under reduced motion. */
(function () {
  'use strict';
  const native = window.CSS?.supports?.('interpolate-size', 'allow-keywords') ?? false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: true };
  const MS = 220;
  const running = new WeakMap();
  const aim = new WeakMap();
  function animate(d, open) {
    aim.set(d, open);
    const was = running.get(d);
    const from = d.getBoundingClientRect().height;
    was?.cancel();
    d.open = true;
    const full = d.getBoundingClientRect().height;
    d.open = false;
    const shut = d.getBoundingClientRect().height;
    d.open = true;
    const to = open ? full : shut;
    d.style.overflow = 'clip';
    const a = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    running.set(d, a);
    a.onfinish = () => {
      running.delete(d);
      d.style.removeProperty('overflow');
      if (!open) d.open = false;
    };
    a.oncancel = () => d.style.removeProperty('overflow');
  }
  if (!native && typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || reduced.matches || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const s = e.target.closest?.('summary');
      const d = s?.parentElement;
      if (!d || d.tagName !== 'DETAILS' || s !== d.querySelector(':scope > summary') || !d.animate) return;
      // A link or a button inside the summary acts on its own.
      const own = e.target.closest('a[href], button, input, label');
      if (own && s.contains(own)) return;
      e.preventDefault();
      animate(d, running.has(d) ? !aim.get(d) : !d.open);
    });
  }
  window.WTDisclose = Object.freeze({ native });
})();
