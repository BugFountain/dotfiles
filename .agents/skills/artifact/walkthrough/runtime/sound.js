/* Sound: synthesized interface cues, no audio files. window.WTSound.
   Each cue is a stack of layers (filtered noise bursts and tones with pitch
   glides) into an optional echo tail and one master band that laptop
   speakers can play. Off by default; audio starts only after the viewer's
   click. A cue that cannot start within 120 ms of its trigger is dropped,
   never played late, and cues never pile up: a cue plays again only after
   120 ms, so a held key ticks at that pace, and at most four sound at once. */
(function () {
  'use strict';

  const PREF = 'wt:sound';
  const VOL = 'wt:volume';
  const read = (k, d) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the preference lasts this visit */
    }
  };

  let enabled = read(PREF, 'off') === 'on';
  let volume = Math.min(1, Math.max(0, parseFloat(read(VOL, '0.7')) || 0.7));
  const GAIN = 3.8;
  let ctx = null;
  let master = null;
  const listeners = new Set();

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    // Laptop speakers distort below 220 Hz and turn broadband hiss into
    // crackle, so the master keeps every cue inside 220 Hz to 6 kHz. Cues peak
    // far under full scale, so nothing compresses them.
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 220;
    low.Q.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 6000;
    high.Q.value = 0;
    master = ctx.createGain();
    master.gain.value = volume * GAIN;
    master.connect(low).connect(high).connect(ctx.destination);
    return ctx;
  }


  // Layer shapes: {tone: wave, f, to?, glide?, at?, a, d, peak, pan?}
  //               {noise: filterType, f, to?, q?, at?, a, d, peak}
  // One preset per event, grouped by family; the family sets the timbre, so
  // the ear learns what kind of thing happened before it learns which. The
  // style guide in kits/motion-sound.md owns the meanings; sound.test.mjs
  // holds the two in step.
  const PRESETS = {
    // Navigation: where the reader is. Sine and triangle tones; entering a
    // branch and leaving it are one figure played up and down.
    step: { gain: 0.5, layers: [{ tone: 'sine', f: 1760, a: 0.004, d: 0.03, peak: 0.05 }, { noise: 'bandpass', f: 3200, q: 1.6, a: 0.002, d: 0.012, peak: 0.03 }] },
    turn: { gain: 0.45, layers: [{ tone: 'triangle', f: 523.25, to: 659.25, glide: 0.08, a: 0.004, d: 0.12, peak: 0.04 }, { noise: 'bandpass', f: 1800, to: 900, q: 0.9, a: 0.004, d: 0.09, peak: 0.02 }] },
    branch: { gain: 0.45, layers: [{ tone: 'sine', f: 740, a: 0.004, d: 0.07, peak: 0.035 }, { tone: 'sine', f: 988, at: 0.055, a: 0.004, d: 0.11, peak: 0.035 }] },
    return: { gain: 0.45, layers: [{ tone: 'sine', f: 988, a: 0.004, d: 0.07, peak: 0.035 }, { tone: 'sine', f: 740, at: 0.055, a: 0.004, d: 0.11, peak: 0.035 }] },
    // Diagram: what the system does inside a scene. Physical: the lowest tones
    // the speakers can play, filtered noise, travel sweeps. Never for the
    // page's own controls.
    call: { gain: 0.5, layers: [{ tone: 'triangle', f: 262, to: 392, glide: 0.05, a: 0.004, d: 0.08, peak: 0.05 }, { noise: 'lowpass', f: 900, a: 0.002, d: 0.03, peak: 0.03 }] },
    write: { gain: 0.55, layers: [{ noise: 'lowpass', f: 700, q: 0.8, a: 0.002, d: 0.07, peak: 0.09 }, { tone: 'sine', f: 220, a: 0.004, d: 0.12, peak: 0.06 }] },
    send: { gain: 0.5, layers: [{ tone: 'triangle', f: 330, to: 880, glide: 0.09, a: 0.004, d: 0.1, peak: 0.05 }, { noise: 'bandpass', f: 2200, a: 0.002, d: 0.04, peak: 0.03 }] },
    travel: {
      gain: 0.5,
      layers: ({ duration = 0.8 }) => [
        { noise: 'bandpass', f: 700, to: 2600, q: 1.2, a: duration * 0.35, d: duration * 0.65, peak: 0.05 },
        { tone: 'sine', f: 360, to: 520, glide: duration, a: duration * 0.3, d: duration * 0.7, peak: 0.012 },
      ],
    },
    contact: { gain: 0.5, layers: [{ tone: 'sine', f: 880, to: 660, glide: 0.05, a: 0.004, d: 0.14, peak: 0.05 }, { noise: 'bandpass', f: 3000, q: 1.2, a: 0.002, d: 0.01, peak: 0.04 }] },
    reject: {
      gain: 0.45,
      layers: [
        { tone: 'sawtooth', f: 220, a: 0.004, d: 0.22, peak: 0.03 },
        { tone: 'sawtooth', f: 226, a: 0.004, d: 0.22, peak: 0.022 },
        { noise: 'lowpass', f: 600, a: 0.002, d: 0.08, peak: 0.05 },
      ],
    },
    converge: {
      gain: 0.45,
      echo: { delay: 0.14, feedback: 0.3, wet: 0.2, lowpass: 3200 },
      layers: [
        { tone: 'triangle', f: 523.25, a: 0.004, d: 0.4, peak: 0.035 },
        { tone: 'triangle', f: 659.25, at: 0.04, a: 0.004, d: 0.4, peak: 0.03 },
        { tone: 'triangle', f: 783.99, at: 0.08, a: 0.004, d: 0.45, peak: 0.028 },
      ],
    },
    note: { gain: 0.5, layers: [{ noise: 'bandpass', f: 1600, q: 1, a: 0.003, d: 0.05, peak: 0.05 }, { tone: 'triangle', f: 660, a: 0.004, d: 0.06, peak: 0.03 }] },
    // Marks: the reader records a judgment. Echoing chimes, rising; removing a
    // mark falls.
    reviewed: {
      gain: 0.5,
      echo: { delay: 0.08, feedback: 0.18, wet: 0.12, lowpass: 4200 },
      layers: [{ tone: 'sine', f: 784, a: 0.004, d: 0.07, peak: 0.05 }, { tone: 'sine', f: 1175, at: 0.07, a: 0.004, d: 0.16, peak: 0.05 }],
    },
    checked: {
      gain: 0.45,
      echo: { delay: 0.1, feedback: 0.2, wet: 0.15, lowpass: 4000 },
      layers: [{ tone: 'triangle', f: 988, to: 1318, glide: 0.05, a: 0.004, d: 0.12, peak: 0.04 }],
    },
    unmark: { gain: 0.45, layers: [{ tone: 'sine', f: 1175, a: 0.004, d: 0.06, peak: 0.035 }, { tone: 'sine', f: 784, at: 0.06, a: 0.004, d: 0.1, peak: 0.035 }] },
    // A finished chapter celebrates: a rising run with a sparkle of high
    // blips over its tail, under the confetti.
    chapter: {
      gain: 0.45,
      echo: { delay: 0.12, feedback: 0.3, wet: 0.2, lowpass: 4200 },
      layers: [
        ...[523.25, 659.25, 783.99, 1046.5, 1318.5].map((f, i) => ({ tone: 'triangle', f, at: i * 0.055, a: 0.004, d: 0.24, peak: 0.032 })),
        ...[2093, 2637, 3136, 2349].map((f, i) => ({ tone: 'sine', f, at: 0.3 + i * 0.05, a: 0.004, d: 0.05, peak: 0.012, pan: i % 2 ? 0.4 : -0.4 })),
      ],
    },
    finale: {
      gain: 0.45,
      echo: { delay: 0.18, feedback: 0.34, wet: 0.24, lowpass: 3000 },
      layers: [
        { tone: 'sine', f: 523.25, a: 0.005, d: 1.4, peak: 0.04 },
        { tone: 'sine', f: 1046.5, a: 0.005, d: 1.1, peak: 0.018 },
        { tone: 'sine', f: 1568, a: 0.005, d: 0.8, peak: 0.01 },
        { tone: 'triangle', f: 659.25, at: 0.2, a: 0.01, d: 0.9, peak: 0.024 },
        { tone: 'triangle', f: 783.99, at: 0.24, a: 0.01, d: 0.9, peak: 0.022 },
      ],
    },
    // Settings: a mode flips. Two quick sines.
    toggle: { gain: 0.5, layers: [{ tone: 'sine', f: 660, a: 0.004, d: 0.05, peak: 0.04 }, { tone: 'sine', f: 990, at: 0.06, a: 0.004, d: 0.08, peak: 0.04 }] },
    // Surfaces: a panel comes or goes; the reader's place stays. Noise sweeps.
    open: { gain: 0.4, layers: [{ noise: 'bandpass', f: 1200, to: 2400, q: 1.2, a: 0.01, d: 0.08, peak: 0.03 }] },
    close: { gain: 0.4, layers: [{ noise: 'bandpass', f: 2400, to: 1200, q: 1.2, a: 0.01, d: 0.08, peak: 0.03 }] },
    // Disclosure: content opens or folds where it stands. The quietest clicks.
    unfold: { gain: 0.4, layers: [{ noise: 'bandpass', f: 1800, to: 2800, q: 2, a: 0.002, d: 0.025, peak: 0.035 }, { tone: 'sine', f: 1320, a: 0.004, d: 0.02, peak: 0.015 }] },
    fold: { gain: 0.4, layers: [{ noise: 'bandpass', f: 2800, to: 1800, q: 2, a: 0.002, d: 0.025, peak: 0.03 }, { tone: 'sine', f: 990, a: 0.004, d: 0.02, peak: 0.012 }] },
    flip: { gain: 0.45, layers: [{ noise: 'bandpass', f: 3000, q: 1.4, a: 0.002, d: 0.03, peak: 0.04 }, { tone: 'sine', f: 520, a: 0.004, d: 0.05, peak: 0.02 }] },
  };

  // A straight rise: an exponential one stays silent, then jumps to its peak
  // in its last millisecond, and that jump clicks.
  function envelope(g, t, a, d, peak) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(c, dest, L, t) {
    const o = c.createOscillator();
    o.type = L.tone;
    o.frequency.setValueAtTime(L.f, t);
    if (L.to) o.frequency.exponentialRampToValueAtTime(L.to, t + (L.glide ?? L.a + L.d));
    const g = c.createGain();
    envelope(g, t, L.a, L.d, L.peak);
    let out = o.connect(g);
    if (L.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = L.pan;
      out = out.connect(p);
    }
    out.connect(dest);
    o.start(t);
    o.stop(t + L.a + L.d + 0.05);
  }

  let noiseBuf = null;
  function noise(c, dest, L, t) {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      let s = 7919;
      for (let i = 0; i < ch.length; i++) {
        s = (Math.imul(s, 1103515245) + 12345) | 0;
        ch[i] = (s >>> 0) / 2147483648 - 1;
      }
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = L.noise;
    f.frequency.setValueAtTime(L.f, t);
    if (L.to) f.frequency.exponentialRampToValueAtTime(L.to, t + L.a + L.d);
    if (L.q) f.Q.value = L.q;
    const g = c.createGain();
    envelope(g, t, L.a, L.d, L.peak);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + L.a + L.d + 0.05);
  }

  function echo(c, input, dest, e) {
    const delay = c.createDelay(1);
    delay.delayTime.value = e.delay;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = e.lowpass;
    const fb = c.createGain();
    fb.gain.value = e.feedback;
    const wet = c.createGain();
    wet.gain.value = e.wet;
    input.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(dest);
    return [delay, lp, fb, wet];
  }

  // Overlapping cues sum before the compressor, so a burst of them saturates
  // the speakers: past four sounding at once, a new cue is dropped.
  const VOICES = 4;
  let sounding = [];
  function render(c, preset, opts) {
    const layers = typeof preset.layers === 'function' ? preset.layers(opts) : preset.layers;
    const t0 = c.currentTime + 0.004;
    sounding = sounding.filter((t) => t > c.currentTime);
    if (sounding.length >= VOICES) return;
    const bus = c.createGain();
    bus.gain.value = (preset.gain ?? 0.5) * (opts.volume ?? 1);
    bus.connect(master);
    const tail = preset.echo ? echo(c, bus, master, preset.echo) : [];
    let end = 0;
    for (const L of layers) {
      const at = L.at ?? 0;
      end = Math.max(end, at + L.a + L.d);
      if (L.tone) tone(c, bus, L, t0 + at);
      else noise(c, bus, L, t0 + at);
    }
    sounding.push(t0 + end);
    const tailSec = preset.echo ? preset.echo.delay * 12 : 0;
    setTimeout(() => {
      bus.disconnect();
      tail.forEach((n) => n.disconnect());
    }, (end + tailSec + 0.2) * 1000);
  }

  // One cue plays at most every 120 ms. While a key is held its moves repeat
  // at the keyboard's rate and play a mix of cues, so across all of them the
  // sound ticks at that one pace.
  const REPEAT_MS = 120;
  const lastAt = new Map();
  let holding = false;
  let tickAt = -Infinity;
  const hold = (on) => (holding = on);
  function play(name, opts = {}) {
    if (!enabled) return;
    const preset = typeof name === 'string' ? PRESETS[name] : name;
    if (!preset) return;
    const now = performance.now();
    if (holding && now - tickAt < REPEAT_MS) return;
    if (now - (lastAt.get(preset) ?? -Infinity) < REPEAT_MS) return;
    lastAt.set(preset, now);
    if (holding) tickAt = now;
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') return render(c, preset, opts);
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const asked = performance.now();
    c.resume().then(
      () => {
        if (performance.now() - asked <= 120 && enabled) render(c, preset, opts);
      },
      () => {},
    );
  }

  function state() {
    if (!enabled) return 'off';
    if (!ctx || ctx.state !== 'running') return 'armed';
    return 'on';
  }
  const notify = () => listeners.forEach((fn) => fn(state()));

  function setEnabled(on) {
    enabled = on;
    write(PREF, on ? 'on' : 'off');
    if (on) {
      const c = ensure();
      c?.resume().then(() => {
        notify();
        play('toggle');
      }, notify);
    }
    notify();
  }

  function unlock() {
    if (!enabled) return;
    const c = ensure();
    if (c && c.state !== 'running') c.resume().then(notify, () => {});
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    write(VOL, String(volume));
    if (master) master.gain.value = volume * GAIN;
  }

  window.WTSound = {
    play,
    hold,
    setEnabled,
    unlock,
    setVolume,
    state,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get enabled() {
      return enabled;
    },
    presets: PRESETS,
  };
})();
