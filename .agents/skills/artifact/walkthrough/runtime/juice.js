/* The page's juice: small, springy answers to the reader's hand. It moves
   transforms and opacity only, so it never lays the page out, and nothing in
   it answers a hover: the page stays calm under a moving pointer. Reduced
   motion turns all of it off. The press squash lives in walkthrough.css. */
(() => {
  const mq = (q) => window.matchMedia?.(q) ?? { matches: false };
  const reduced = mq('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const once = (el, cls) => {
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    el.classList.add(cls);
  };

  if (!('IntersectionObserver' in window)) return;

  // A PR's churn counts up the first time its row shows, its bar grows with
  // it, and the count pops as it lands. A row near the screen drops to zero
  // first, so the reader never sees the total, then zero. Figure spaces pad
  // each number to its final width, so nothing beside it moves.
  const NUM = /\d[\d,]*/g;
  const texts = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) if (/\d/.test(w.currentNode.data)) out.push([w.currentNode, w.currentNode.data]);
    return out;
  };
  const at = (data, p) => data.replace(NUM, (m) => Math.round(Number(m.replace(/,/g, '')) * p).toLocaleString('en-US').padStart(m.length, ' '));
  const finals = new Map();
  const run = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      run.unobserve(e.target);
      const n = e.target.querySelector('.churn-n');
      const t0 = performance.now() + i * 50;
      e.target.querySelector('.churn')?.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 720, delay: i * 50, easing: SPRING, fill: 'backwards' });
      e.target.classList.remove('jz-armed');
      const tick = (now) => {
        const p = Math.min(1, Math.max(0, now - t0) / 640);
        for (const [node, data] of finals.get(e.target)) node.data = p < 1 ? at(data, 1 - (1 - p) ** 3) : data;
        if (p < 1) requestAnimationFrame(tick);
        else if (n) once(n, 'jz-pop');
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  const arm = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      arm.unobserve(e.target);
      const t = texts(e.target.querySelector('.churn-n') ?? e.target);
      finals.set(e.target, t);
      for (const [node, data] of t) node.data = at(data, 0);
      e.target.classList.add('jz-armed');
      run.observe(e.target);
    }
  }, { rootMargin: '50% 0px' });
  for (const li of document.querySelector('ol.layers')?.children ?? []) arm.observe(li);

  // A warning shakes once, gently, the first time it shows.
  const warn = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      warn.unobserve(e.target);
      once(e.target, 'jz-shake');
    }
  }, { threshold: 1 });
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 200));
  const chapters = [...(document.getElementById('main')?.children ?? [])].filter((c) => c.matches('.chapter'));
  const watch = () => {
    const ch = chapters.shift();
    if (!ch) return;
    ch.querySelectorAll('.sev.warning, .flag-box.warning > .ft').forEach((el) => warn.observe(el));
    idle(watch);
  };
  idle(watch);
})();
