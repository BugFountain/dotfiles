/* Search: word matching for the glossary filter. window.WTSearch. No
   dependencies. A reader types the words they remember, in any order and
   with a slip or two, so every query word only has to fit some word of the
   term or its definition. */
(function (root) {
  'use strict';

  const fold = (s) =>
    String(s ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const wordsOf = (s) => fold(s).match(/[\p{L}\p{N}]+/gu) ?? [];

  // One edit apart: a letter added, dropped or changed, or two neighbors swapped.
  function near(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  // How well one typed word fits one word of the text: the whole word, its
  // start, a run inside it, or a slip away from it or from its start.
  function fit(q, w) {
    if (w === q) return 4;
    if (w.startsWith(q)) return 3;
    if (q.length >= 3 && w.includes(q)) return 2;
    if (q.length >= 4 && (near(q, w) || near(q, w.slice(0, q.length)))) return 1;
    return 0;
  }

  // Zero when some typed word fits nothing; otherwise higher for better
  // fits. A fit in the name counts double, and the whole name typed wins.
  function score(query, name, body = '') {
    const typed = wordsOf(query);
    if (!typed.length) return 1;
    const names = wordsOf(name);
    const bodies = wordsOf(body);
    let total = 0;
    for (const q of typed) {
      let best = 0;
      for (const w of names) best = Math.max(best, 2 * fit(q, w));
      if (best < 8) for (const w of bodies) best = Math.max(best, fit(q, w));
      if (!best) return 0;
      total += best;
    }
    const whole = typed.join(' ');
    const own = names.join(' ');
    if (own === whole) total += 20;
    else if (own.startsWith(whole)) total += 10;
    return total;
  }

  root.WTSearch = { score, wordsOf, near };
})(typeof window === 'undefined' ? globalThis : window);
