/* Confetti: the burst that marks a finished chapter or stack. window.WTConfetti.
   Pixel shards and scanline streaks in the theme's hues fall through one
   canvas above the page, glitch sideways now and then, and fade; the canvas
   leaves the page when the last one lands. Reduced motion and a hidden page
   get none. No dependencies. */
(function () {
  'use strict';

  const reduced = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };
  const HUES = ['--candy', '--candy-2', '--purple', '--mint', '--cyan', '--ink'];
  let canvas = null;
  let g = null;
  let raf = 0;
  let last = 0;
  const bits = [];

  function mount() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    document.body.append(canvas);
  }
  function unmount() {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas?.remove();
    canvas = null;
    g = null;
  }

  // A shard is a square pixel that tumbles; a streak is a thin scanline that
  // keeps level; a glyph is one character of 完了 ("done"), for the stack.
  function spawn(x, y, n, { angle = -Math.PI / 2, spread = 1.1, speed = [7, 15], glyphs = false } = {}) {
    const css = getComputedStyle(document.documentElement);
    const colors = HUES.map((h) => css.getPropertyValue(h).trim()).filter(Boolean);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread * 2;
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      const r = Math.random();
      bits.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        kind: glyphs && r < 0.08 ? 'glyph' : r < 0.3 ? 'streak' : 'shard',
        ch: Math.random() < 0.5 ? '完' : '了',
        size: 3 + Math.random() * 4,
        spin: (Math.random() - 0.5) * 0.4,
        turn: Math.random() * Math.PI,
        color: colors[Math.floor(Math.random() * colors.length)] || '#ff2d6a',
        life: 0,
        ttl: 1.3 + Math.random() * 0.9,
        glitch: 0,
      });
    }
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000) || 0.016;
    last = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    const k = dt * 60;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      if (b.life > b.ttl || b.y > innerHeight + 40) {
        bits.splice(i, 1);
        continue;
      }
      b.vy += 0.32 * k;
      b.vx *= 0.985 ** k;
      b.vy *= 0.985 ** k;
      b.x += b.vx * k;
      b.y += b.vy * k;
      b.turn += b.spin * k;
      // Now and then a bit skips sideways for a few frames, like a bad signal.
      if (b.glitch > 0) b.glitch -= dt;
      else if (Math.random() < 0.012 * k) b.glitch = 0.05;
      const dx = b.glitch > 0 ? (b.size * 2) * (Math.random() < 0.5 ? -1 : 1) : 0;
      const fade = Math.min(1, (b.ttl - b.life) / (b.ttl * 0.35));
      g.globalAlpha = fade * (b.glitch > 0 ? 0.55 : 1);
      g.fillStyle = b.color;
      if (b.kind === 'streak') g.fillRect(b.x + dx - b.size * 1.6, b.y, b.size * 3.2, 1.5);
      else if (b.kind === 'glyph') {
        g.font = `700 ${Math.round(b.size * 3.2)}px "Noto Sans JP", sans-serif`;
        g.fillText(b.ch, b.x + dx, b.y);
      } else {
        g.save();
        g.translate(b.x + dx, b.y);
        g.rotate(b.turn);
        g.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * (0.6 + 0.4 * Math.abs(Math.cos(b.turn * 2))));
        g.restore();
      }
    }
    g.globalAlpha = 1;
    if (bits.length) raf = requestAnimationFrame(frame);
    else unmount();
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Two cannons sit at the middle of the left and right edges and aim inward
  // and up, so the bits arc over the reading column and fall through it.
  function cannons(n, opts = {}) {
    const y = innerHeight / 2;
    spawn(0, y, n, { angle: -Math.PI / 5, spread: 0.35, speed: [13, 21], ...opts });
    spawn(innerWidth, y, n, { angle: (-4 * Math.PI) / 5, spread: 0.35, speed: [13, 21], ...opts });
  }
  // A chapter: one volley from both sides.
  function burst() {
    if (reduced() || document.hidden) return false;
    mount();
    cannons(55);
    start();
    return true;
  }
  // The stack: a bigger volley with the done glyphs, then a second one.
  function finale() {
    if (reduced() || document.hidden) return false;
    mount();
    cannons(110, { speed: [15, 25], glyphs: true });
    setTimeout(() => {
      if (!canvas) mount();
      cannons(70, { glyphs: true });
      start();
    }, 380);
    start();
    return true;
  }

  window.WTConfetti = { burst, finale };
})();
