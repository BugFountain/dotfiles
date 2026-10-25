/* Motion: springs, tweens, keycap presses, and the scene runtime.
   window.WTMotion and window.WTScene. No dependencies. Reduced motion
   jumps every animation to its end state. */
(function () {
  'use strict';

  const reduced = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };

  const ease = {
    linear: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  function tween({ from = 0, to = 1, duration = 400, easing = ease.out, onUpdate, onDone }) {
    if (reduced() || duration <= 0) {
      onUpdate?.(to);
      onDone?.();
      return { stop() {}, done: Promise.resolve() };
    }
    let raf = 0;
    let stopped = false;
    let resolve;
    const done = new Promise((r) => (resolve = r));
    const start = performance.now();
    const frame = (now) => {
      if (stopped) return resolve();
      const t = Math.min(1, (now - start) / duration);
      onUpdate?.(from + (to - from) * easing(t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        onDone?.();
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        resolve();
      },
      done,
    };
  }

  // Damped spring. stiffness 260 / damping 26 settles with a small overshoot;
  // damping = 2 * sqrt(stiffness) settles without one.
  function spring({ from = 0, to = 1, stiffness = 260, damping = 26, mass = 1, velocity = 0, onUpdate, onDone }) {
    if (reduced()) {
      onUpdate?.(to);
      onDone?.();
      return { stop() {}, done: Promise.resolve() };
    }
    let x = from;
    let v = velocity;
    let last = performance.now();
    let raf = 0;
    let stopped = false;
    let resolve;
    const done = new Promise((r) => (resolve = r));
    const frame = (now) => {
      if (stopped) return resolve();
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        const a = (-stiffness * (x - to) - damping * v) / mass;
        v += a * h;
        x += v * h;
      }
      onUpdate?.(x);
      if (Math.abs(v) < 0.002 && Math.abs(x - to) < 0.001) {
        onUpdate?.(to);
        onDone?.();
        resolve();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return {
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        resolve();
      },
      done,
    };
  }

  // A pressed keycap inverts its colors; its CSS fades them over 90ms.
  const press = (el) => {
    el.dataset.pressed = 'true';
  };
  const release = (el) => {
    el.dataset.pressed = 'false';
  };
  const tap = (el) => {
    press(el);
    setTimeout(() => release(el), 110);
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Autoplay holds a beat for as long as its words take to read: 200 words a
  // minute, plus a second to find them, never past 9 s.
  const readMs = (text, max = 9000) => {
    const words = String(text ?? '')
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.min(max, 1000 + words * 300);
  };

  // A reading clock. It counts only while nothing holds it, reports its
  // progress on every frame so a bar fills without steps, and resolves true
  // when it runs out, or false once the caller no longer wants it. `from`
  // starts it part way, so a paused hold resumes where it stopped.
  const clock = (ms, { from = 0, held = () => false, alive = () => true, onTick = () => {} } = {}) =>
    new Promise((resolve) => {
      let left = ms * (1 - Math.min(1, Math.max(0, from)));
      let last = performance.now();
      const frame = (now) => {
        if (!alive()) return resolve(false);
        if (!held()) left -= Math.max(0, now - last);
        last = now;
        onTick(Math.min(1, Math.max(0, 1 - left / ms)));
        if (left <= 0) return resolve(true);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

  window.WTMotion = { tween, spring, ease, reduced, press, release, tap, wait, readMs, clock };

  // -------------------------------------------------------------------------
  // Scenes. A scene is { title, steps: [{ caption, run(api) }], setup(svg, api) }.
  // setup draws the first frame; each step animates to its end state and must
  // reach the same state when api.instant is true, so seeking is replay-to-k.

  const SVGNS = 'http://www.w3.org/2000/svg';

  function makeApi(svg, scene) {
    const api = {
      instant: false,
      svg,
      $: (sel) => svg.querySelector(sel),
      $$: (sel) => [...svg.querySelectorAll(sel)],
      el(tag, attrs = {}, parent = svg) {
        const n = document.createElementNS(SVGNS, tag);
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'text') n.textContent = v;
          else n.setAttribute(k, v);
        }
        parent.appendChild(n);
        return n;
      },
      cue(name, opts) {
        if (!api.instant) window.WTSound?.play(name, opts);
      },
      wait(ms) {
        return api.instant ? Promise.resolve() : wait(ms * scene.speed);
      },
      dur(ms) {
        return api.instant ? 0 : ms * scene.speed;
      },
      show(el, ms = 360) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return Promise.resolve();
        return tween({ from: parseFloat(el.getAttribute('opacity') ?? '0'), to: 1, duration: api.dur(ms), onUpdate: (v) => el.setAttribute('opacity', v.toFixed(3)) }).done;
      },
      hide(el, ms = 280) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return Promise.resolve();
        return tween({ from: parseFloat(el.getAttribute('opacity') ?? '1'), to: 0, duration: api.dur(ms), onUpdate: (v) => el.setAttribute('opacity', v.toFixed(3)) }).done;
      },
      // Stroke draws on, the way a pen writes it. A head drawn at the path's
      // end rides the pen's tip, turning with it, so the line and its head
      // move as one piece.
      draw(el, ms = 700, { head } = {}) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return Promise.resolve();
        head = typeof head === 'string' ? api.$(head) : head;
        const len = el.getTotalLength ? el.getTotalLength() : 100;
        el.setAttribute('opacity', '1');
        el.style.strokeDasharray = `${len}`;
        let ride = null;
        if (head && el.getPointAtLength && len > 1) {
          const angle = (d) => {
            const a = el.getPointAtLength(Math.max(0, Math.min(len - 1, d - 0.5)));
            const b = el.getPointAtLength(Math.max(1, Math.min(len, d + 0.5)));
            return Math.atan2(b.y - a.y, b.x - a.x);
          };
          const end = el.getPointAtLength(len);
          const a0 = angle(len);
          head.setAttribute('opacity', '1');
          ride = (d) => {
            const p = el.getPointAtLength(d);
            head.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${(((angle(d) - a0) * 180) / Math.PI).toFixed(2)}) translate(${-end.x} ${-end.y})`);
          };
        }
        return tween({
          from: len,
          to: 0,
          duration: api.dur(ms),
          easing: ease.inOut,
          onUpdate: (v) => {
            el.style.strokeDashoffset = `${v}`;
            ride?.(len - v);
          },
          onDone: () => {
            el.style.strokeDasharray = '';
            head?.removeAttribute('transform');
          },
        }).done;
      },
      move(el, x, y, opts = {}) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return Promise.resolve();
        const cur = (el.getAttribute('transform') || 'translate(0,0)').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/) || [0, 0, 0];
        const x0 = +cur[1];
        const y0 = +cur[2];
        if (api.instant || reduced()) {
          el.setAttribute('transform', `translate(${x},${y})`);
          return Promise.resolve();
        }
        return spring({
          from: 0,
          to: 1,
          stiffness: opts.stiffness ?? 180,
          damping: opts.damping ?? 24,
          onUpdate: (t) => el.setAttribute('transform', `translate(${x0 + (x - x0) * t},${y0 + (y - y0) * t})`),
        }).done;
      },
      attr(el, name, to, ms = 400) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return Promise.resolve();
        const from = parseFloat(el.getAttribute(name) ?? '0');
        return tween({ from, to, duration: api.dur(ms), onUpdate: (v) => el.setAttribute(name, v.toFixed(2)) }).done;
      },
      paint(el, prop, color) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return;
        el.style.transition = api.instant ? 'none' : 'fill 280ms ease, stroke 280ms ease, color 280ms ease';
        el.style[prop] = color;
      },
      // Swap the role class (fail, active, added) that colors a shape.
      role(el, name) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el) return;
        el.style.transition = api.instant ? 'none' : 'fill 280ms ease, stroke 280ms ease';
        el.classList.remove('fail', 'active', 'added');
        if (name) el.classList.add(name);
      },
      text(el, value) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (el) el.textContent = value;
      },
      // Point at something: a quick scale pulse around its center.
      flash(el, ms = 520) {
        el = typeof el === 'string' ? api.$(el) : el;
        if (!el || api.instant) return Promise.resolve();
        const box = el.getBBox();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const base = el.getAttribute('transform') || '';
        return tween({
          from: 0,
          to: 1,
          duration: api.dur(ms),
          easing: ease.linear,
          onUpdate: (t) => {
            const s = 1 + 0.12 * Math.sin(Math.PI * t);
            el.setAttribute('transform', `${base} translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`);
          },
          onDone: () => el.setAttribute('transform', base),
        }).done;
      },
      // A dot travels a path; the travel sound lasts exactly as long.
      travel(dot, path, ms = 900) {
        dot = typeof dot === 'string' ? api.$(dot) : dot;
        path = typeof path === 'string' ? api.$(path) : path;
        if (!dot || !path) return Promise.resolve();
        const len = path.getTotalLength();
        dot.setAttribute('opacity', '1');
        const place = (t) => {
          const p = path.getPointAtLength(len * t);
          dot.setAttribute('transform', `translate(${p.x},${p.y})`);
        };
        if (api.instant || reduced()) {
          place(1);
          return Promise.resolve();
        }
        api.cue('travel', { duration: api.dur(ms) / 1000 });
        return tween({ from: 0, to: 1, duration: api.dur(ms), easing: ease.inOut, onUpdate: place }).done;
      },
    };
    return api;
  }

  class Scene {
    constructor(root, def) {
      this.root = root;
      this.def = def;
      this.index = -1;
      this.playing = false;
      this.running = false;
      this.speed = 1;
      this.stage = root.querySelector('.scene-stage');
      this.capEl = root.querySelector('[data-scene-cap]');
      this.scrub = root.querySelector('[data-scene-scrub]');
      this.build();
      this.renderBar();
    }
    build() {
      // The scene's own drawing, not an icon on its cover.
      this.stage.querySelector(':scope > svg')?.remove();
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${this.def.width ?? 640} ${this.def.height ?? 360}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', this.def.title);
      this.stage.prepend(svg);
      this.api = makeApi(svg, this);
      this.def.setup(svg, this.api);
    }
    renderBar() {
      const steps = this.def.steps;
      const i = this.index;
      if (this.capEl) this.capEl.innerHTML = i < 0 ? `<span class="n">0/${steps.length}</span>press play` : `<span class="n">${i + 1}/${steps.length}</span>${steps[i].caption}`;
      if (this.scrub) this.scrub.querySelectorAll('button').forEach((b, k) => b.classList.toggle('done', k <= i));
      const play = this.root.querySelector('[data-scene-act="play"]');
      if (play) play.textContent = this.playing ? 'pause' : i >= steps.length - 1 ? 'replay' : 'play';
    }
    async runStep(k, instant) {
      this.api.instant = instant;
      await this.def.steps[k].run(this.api);
      this.api.instant = false;
      this.index = k;
      this.clearHold();
      this.renderBar();
    }
    // A new step drops the hold a pause kept for the step before it.
    clearHold() {
      this.paused = null;
      this.scrub?.querySelectorAll('button.next').forEach((b) => {
        b.classList.remove('next');
        b.style.removeProperty('--dwell');
      });
    }
    async play() {
      this.root.classList.add('played');
      // The pointer that pressed play is over the scene; it holds only after
      // it has left once.
      this.armed = false;
      if (reduced()) return this.seek(this.def.steps.length - 1);
      if (this.index >= this.def.steps.length - 1) this.reset();
      this.playing = true;
      this.renderBar();
      if (this.running) return;
      this.running = true;
      while (this.playing && this.index < this.def.steps.length - 1) {
        // Resumed after a pause, the step on screen finishes its hold first:
        // it neither draws again nor restarts its clock.
        const from = this.paused?.index === this.index ? this.paused.at : null;
        this.paused = null;
        if (from === null) await this.runStep(this.index + 1, false);
        if (!this.playing) {
          this.paused = { index: this.index, at: 0 };
          break;
        }
        if (this.index < this.def.steps.length - 1) {
          const step = this.def.steps[this.index];
          await this.dwell(Math.max(step.hold ?? 0, readMs(step.caption)) * this.speed, from ?? 0);
        }
      }
      this.running = false;
      if (this.index >= this.def.steps.length - 1) {
        this.playing = false;
        window.WTSound?.play('converge');
      }
      this.renderBar();
    }
    // The hold counts only while the reader is not pointing at the scene or
    // focused in its text, and the next scrub segment fills as it runs.
    async dwell(ms, from = 0) {
      if (!this.holdWired) {
        this.holdWired = true;
        this.root.addEventListener('pointerenter', () => (this.pointing = true));
        this.root.addEventListener('pointerleave', () => {
          this.pointing = false;
          this.armed = true;
        });
      }
      const next = this.scrub?.querySelectorAll('button')[this.index + 1];
      next?.classList.add('next');
      const reading = () => {
        const a = document.activeElement;
        return this.root.contains(a) && !a.closest('[data-scene-act], [data-scene-seek], .scene-cover');
      };
      let at = from;
      const done = await clock(ms, {
        from,
        held: () => (this.pointing && this.armed) || reading(),
        alive: () => this.playing,
        onTick: (p) => {
          at = p;
          next?.style.setProperty('--dwell', p.toFixed(4));
        },
      });
      // A pause keeps the hold where it stopped, its bar included.
      if (!done) {
        this.paused = { index: this.index, at };
        return;
      }
      next?.classList.remove('next');
      next?.style.removeProperty('--dwell');
    }
    pause() {
      this.playing = false;
      this.renderBar();
    }
    toggle() {
      if (this.playing) this.pause();
      else this.play();
    }
    reset() {
      this.playing = false;
      this.index = -1;
      this.clearHold();
      this.build();
      this.renderBar();
    }
    async seek(k) {
      this.root.classList.add('played');
      this.playing = false;
      this.index = -1;
      this.clearHold();
      this.build();
      for (let i = 0; i <= k; i++) await this.runStep(i, true);
      this.renderBar();
    }
    // A step pressed while another draws, or while the scene plays, waits
    // for that one to end instead of being dropped, so fast presses all land.
    async idle() {
      while (this.running) await new Promise((r) => setTimeout(r, 20));
    }
    async next() {
      this.pause();
      this.root.classList.add('played');
      this.ahead = (this.ahead ?? 0) + 1;
      if (this.stepping) return;
      this.stepping = true;
      await this.idle();
      this.running = true;
      while (this.ahead > 0 && this.index < this.def.steps.length - 1) {
        this.ahead--;
        await this.runStep(this.index + 1, false);
      }
      this.ahead = 0;
      this.running = false;
      this.stepping = false;
    }
    async prev() {
      this.pause();
      if (this.stepping) return;
      this.stepping = true;
      await this.idle();
      this.stepping = false;
      await this.seek(Math.max(-1, this.index - 1));
    }
    replay() {
      this.reset();
      this.play();
    }
  }

  window.WTScene = { Scene, makeApi };
})();
