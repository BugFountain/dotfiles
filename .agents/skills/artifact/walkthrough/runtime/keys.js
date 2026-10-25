/* Keys: the shortcut a keydown names, on both kinds of page. window.WTKeys.
   A shortcut is one bare key. Ctrl, Alt and Meta belong to the browser and
   the system. Shift belongs to the character it types: `?` is Shift+/ on most
   keyboards, so a symbol typed with Shift still names its key, while Shift
   with a letter, a space or a named key (Shift+J, Shift+Space, Shift+←) names
   none, and the browser keeps it. Caps lock types a capital with no Shift, so
   a letter reads lowercase. */
(function (root) {
  'use strict';
  function keyOf(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    const k = e.key;
    if (!k || k === 'Unidentified' || k === 'Dead') return null;
    if (k.length > 1 || k === ' ' || /\p{L}/u.test(k)) return e.shiftKey ? null : k.length > 1 ? k : k.toLowerCase();
    return k;
  }
  // What a control's peek says: its keys as keycaps, after its name when the
  // control shows no word of its own. A native `title` shows on hover alone,
  // late; the page's peek shows this on hover and on keyboard focus. The caps
  // come from markup.js, which the page inlines before it runs a peek.
  const KEY = { Space: ' ' };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function hint(el) {
    const ks = (el.getAttribute('aria-keyshortcuts') ?? '').split(/\s+/).filter(Boolean);
    if (!ks.length) return null;
    const name = el.textContent.trim() ? '' : el.getAttribute('aria-label') ?? '';
    const { keycap, keys } = root.WTMarkup;
    return `${name ? `${esc(name)} ` : ''}${keys(...ks.map((k) => keycap(KEY[k] ?? k)))}`;
  }
  root.WTKeys = Object.freeze({ keyOf, hint });
})(typeof window !== 'undefined' ? window : globalThis);
