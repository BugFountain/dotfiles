/* Where the narrator picks up after a pause. A pause keeps the line and the
   second it reached, so play resumes mid-sentence on the same hop; a step
   while paused starts the new hop's first line from its beginning. A pause
   within the last quarter second of a line resumes on the next one, because
   seeking to the end of a clip plays nothing and then waits for `ended`. */
(() => {
  const TAIL = 0.25;
  // `heard` is what the pause kept: the hop, the line, the second, the line's
  // length and whether the run opened with the intro. `i` is the hop on the
  // stage when play resumes.
  function resume(heard, i) {
    if (!heard || heard.i !== i) return { i, k: 0, t: 0, intro: i === 0, fresh: true };
    const t = Number.isFinite(heard.t) && heard.t > 0 ? heard.t : 0;
    const done = heard.dur > 0 && t >= heard.dur - TAIL;
    return { i, k: done ? heard.k + 1 : heard.k, t: done ? 0 : t, intro: heard.intro, fresh: false };
  }
  window.WTVoice = { resume };
})();
