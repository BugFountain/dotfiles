/* Layers: what opens over the page (a drawer, a sheet, a panel)
   and how it closes. window.WTLayers. Both kinds of page inline it, so every
   layer closes the same way: Escape closes the top one, a press outside the
   top one and its opener closes it, and closing gives focus back to the
   opener, or to what held it when the layer opened, unless the reader's
   pointer already chose a new place. */
(function (root) {
  'use strict';

  const stack = [];
  const find = (el) => stack.findIndex((l) => l.el === el);

  // The owner hides the layer in `close` and calls `closed` from there, so a
  // layer closed by its own control and one closed from here end the same.
  function open(el, { close, opener = null } = {}) {
    if (!el || typeof close !== 'function') return;
    const i = find(el);
    if (i >= 0) stack.splice(i, 1);
    stack.push({ el, close, opener, from: root.document?.activeElement ?? null });
  }
  function restore(l, focus) {
    const doc = root.document;
    const lost = !doc?.activeElement || doc.activeElement === doc.body || l.el.contains(doc.activeElement);
    if (focus && lost) (l.opener ?? l.from)?.focus?.({ preventScroll: true });
  }
  function closed(el) {
    const i = find(el);
    if (i >= 0) restore(stack.splice(i, 1)[0], true);
  }
  function closeTop({ focus = true } = {}) {
    const l = stack.pop();
    if (!l) return false;
    l.close();
    restore(l, focus);
    return true;
  }
  // A press on the top layer's own opener is left to the opener, which
  // toggles the layer itself.
  function press(target) {
    const l = stack.at(-1);
    if (!l || l.el.contains(target) || l.opener?.contains(target)) return false;
    return closeTop({ focus: false });
  }

  root.document?.addEventListener('pointerdown', (e) => press(e.target), true);
  root.WTLayers = { open, closed, closeTop, press, isOpen: (el) => find(el) >= 0, top: () => stack.at(-1)?.el ?? null };
})(typeof window !== 'undefined' ? window : globalThis);
