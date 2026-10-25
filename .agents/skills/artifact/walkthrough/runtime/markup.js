/* Markup: the small parts every page draws, as HTML strings, from one source.
   window.WTMarkup. views.mjs runs this file to prerender a review page,
   render.mjs inlines it before walkthrough.js, and a hand-painted page inlines
   it before page.js, so a part looks and reads the same wherever it is drawn
   (kits/components.md). */
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------------------------------------------------------------- keycap
  // A keycap's legend is the key as a keyboard prints it, never the name the
  // DOM gives it: `←`, not `ArrowLeft`.
  const KEY_LABEL = { ' ': 'space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'esc', Home: 'home', End: 'end' };
  const keycap = (k, label) => `<kbd class="key" data-key="${esc(k)}">${esc(label ?? KEY_LABEL[k] ?? k)}</kbd>`;
  const keys = (...ks) => `<span class="keys">${ks.join('')}</span>`;

  // ------------------------------------------------------------------ icon
  // Every pictogram, drawn once as a symbol on a 16-unit grid in the color of
  // the text around it. A font glyph would fall back to a system font or an
  // emoji at its own size and baseline, so no page draws one as an icon. The
  // test tube is cyan wherever it stands: nothing else wears cyan
  // (themes/cyberpunk.md).
  const ICONS = {
    test: [1.5, '<path d="M4.5 2h7M5.5 2v9a2.5 2.5 0 0 0 5 0V2"/><path d="M5.5 7.5h5V11a2.5 2.5 0 0 1-5 0z" fill="currentColor" stroke="none"/>'],
    flag: [1.4, '<path d="M4 14.5V2"/><path d="M4 2.5h8.5l-2.2 3.2 2.2 3.3H4z" fill="currentColor"/>'],
    play: [1.3, '<path d="M5 3v10l8-5z" fill="currentColor"/>'],
    pause: [1.3, '<path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" stroke="none"/>'],
    stop: [1.3, '<path d="M4 4h8v8H4z" fill="currentColor" stroke="none"/>'],
    check: [1.7, '<path d="M3 8.5 6.5 12 13 4.5"/>'],
    caret: [1.5, '<path d="M6 3.5 10.5 8 6 12.5"/>'],
    sound: [1.3, '<path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4"/>'],
    'sound-off': [1.3, '<path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="m11.5 6 3 4m0-4-3 4"/>'],
    glossary: [1.3, '<rect x="3" y="2.5" width="9" height="11" rx="1"/><path d="M5.5 5.5h4M5.5 8h4"/>'],
    menu: [1.3, '<path d="M2 4h12M2 8h12M2 12h12"/>'],
    top: [1.3, '<path d="M3.5 2.5h9M8 13.5V6M5 8.5 8 5.5l3 3"/>'],
    bottom: [1.3, '<path d="M3.5 13.5h9M8 2.5V10M5 7.5l3 3 3-3"/>'],
    fold: [1.3, '<path d="M5 2.5 8 5.5l3-3M5 13.5l3-3 3 3"/>'],
    unfold: [1.3, '<path d="M5 5.5 8 2.5l3 3M5 10.5l3 3 3-3"/>'],
    prev: [1.5, '<path d="M10 3.5 5.5 8l4.5 4.5"/>'],
    next: [1.5, '<path d="M6 3.5 10.5 8 6 12.5"/>'],
    close: [1.5, '<path d="m4 4 8 8M12 4l-8 8"/>'],
    caveat: [1.5, '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.1"/>'],
    external: [1.5, '<path d="M6 3.5h6.5V10M12.5 3.5 4 12"/>'],
  };
  // The sheet every icon points at; a page holds it once. An inline SVG
  // ignores `hidden`, and one with no display keeps its symbols, so the sheet
  // takes no room instead (page.css, .defs).
  const sprite = () =>
    `<svg class="defs" aria-hidden="true" focusable="false">${Object.entries(ICONS)
      .map(([name, [w, d]]) => `<symbol id="wt-i-${name}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`)
      .join('')}</svg>`;
  // `attrs` carries what a control toggles, such as `data-on hidden` on one of
  // a pair of icons that swap.
  const icon = (name, attrs = '') => `<svg class="icon i-${name}" aria-hidden="true"${attrs ? ` ${attrs}` : ''}><use href="#wt-i-${name}"/></svg>`;

  // ----------------------------------------------------------------- names
  // A hop's proof level in the words the dot map's legend uses (DOMAIN.md).
  const PROOF_NAME = { tested: 'tested', assembled: 'code only', recorded: 'recorded' };
  const FLAG_NAME = { dormant: 'dormant code', dead: 'dead code', 'producer-only': 'producer without a consumer yet', interim: 'interim behavior', 'inverted-order': 'inverted order', 'outside-stack': 'outside the stack' };
  // Dormant code waits for a caller a later layer adds. A confirmed dormant
  // flag that no layer completes has no caller anywhere in the stack: it is
  // dead code, and the page names it so.
  const flagKind = (f) => (f.type === 'dormant' && !f.completedBy && f.status === 'confirmed' ? 'dead' : f.type);

  // ------------------------------------------------------------------- tag
  // A small bordered token. Its variant is `kind`: none for a plain tag, `layer`
  // for one in its layer's color `c` (a number in that color, and a square with
  // `dot`), a proof level (`tested`, `assembled` or `recorded`, told apart by
  // the border as well as the color), or `count`, a button that opens what it
  // counts. `html` is markup already escaped; a tag with `href` is a link.
  function tag(html, { kind = '', c = '', href = '', dot = false, attrs = '' } = {}) {
    const el = kind === 'count' ? 'button' : href ? 'a' : 'span';
    const at = [`class="tag${kind ? ` ${kind}` : ''}"`, kind === 'count' ? 'type="button"' : '', c ? `style="--c:${c}"` : '', href ? `href="${esc(href)}"` : '', attrs].filter(Boolean).join(' ');
    return `<${el} ${at}>${dot ? '<span class="dot"></span>' : ''}${html}</${el}>`;
  }
  // A layer's tag: its label in its color, then any words after it.
  const layerTag = (label, c, { after = '', ...opts } = {}) => tag(`<b>${esc(label)}</b>${after}`, { ...opts, kind: 'layer', c });
  const proofTag = (level) => tag(esc(PROOF_NAME[level] ?? level), { kind: PROOF_NAME[level] ? level : '' });

  // ------------------------------------------------------------------ mark
  // The severity of a unit, most important first: warning is a solid mark,
  // important an outline, info quiet, so the rank reads by fill as well as
  // color. These three words are the only ones; a `[!NOTE]` callout reads info.
  const SEVERITY = ['warning', 'important', 'info'];
  const mark = (severity, html, attrs = '') => `<span class="sev ${SEVERITY.includes(severity) ? severity : 'info'}"${attrs ? ` ${attrs}` : ''}>${html}</span>`;
  // A flag that waits on work outside the stack, or on a later layer the
  // stack needs merged first, is a risk. Interim behavior changes before
  // release, and a flag no layer completes stays open. A dormant or
  // producer-only flag that a later layer completes is context.
  function flagSeverity(f) {
    if (f.type === 'outside-stack' || f.type === 'inverted-order') return 'warning';
    if (f.type === 'interim' || !f.completedBy) return 'important';
    return 'info';
  }

  // ------------------------------------------------------------- navigator
  // Where the reader is and the controls that step, bottom right on both kinds
  // of page. The page fills the place (`data-where`) and the ticks
  // (`data-ticks`, each a `tick`) and answers each `data-act`: top, prev,
  // next, bottom, fold and review. `href` makes the place a link.
  // The review page adds the menu that opens its drawer.
  function navigator({ label, where = '', href = '', fold = 'fold every diff', foldHidden = true, menu = false }) {
    const b = (act, attrs, inner, cls = '') => `<button type="button" class="btn text nb${cls}" data-act="${act}" ${attrs}>${inner}</button>`;
    const spot = href ? `<a class="where" href="${esc(href)}" data-where>${where}</a>` : `<span class="where" data-where aria-live="polite">${where}</span>`;
    // Each control shows its icon, and its keys peek from aria-keyshortcuts
    // (keys.js): a keycap beside an icon says the same thing twice.
    return `<nav class="navi" data-navi aria-label="${esc(label)}">${[
      menu ? b('rail', 'aria-label="chapters and tools" aria-expanded="false"', icon('menu'), ' menu') : '',
      b('top', 'aria-label="top of the page" aria-keyshortcuts="Home"', icon('top'), ' edge'),
      b('prev', 'aria-label="previous" aria-keyshortcuts="j ArrowLeft"', icon('prev')),
      `<span class="spot">${spot}<span class="ticks" data-ticks aria-hidden="true"></span></span>`,
      b('next', 'aria-label="next" aria-keyshortcuts="k ArrowRight"', icon('next')),
      b('bottom', 'aria-label="bottom of the page" aria-keyshortcuts="End"', icon('bottom'), ' edge'),
      b('fold', `aria-keyshortcuts="z" aria-expanded="true" aria-label="${esc(fold)}"${foldHidden ? ' hidden' : ''}`, `${icon('fold', 'data-in')}${icon('unfold', 'data-out hidden')}`, ' edge nfold'),
      b('review', 'aria-keyshortcuts="x" aria-pressed="false"', `${icon('check')}<span>reviewed</span>`, ' rv'),
    ].join('')}</nav>`;
  }
  // One tick per part at the reader's level: filled once reviewed, ringed
  // where the reader is, smaller for a branch.
  const tick = ({ id, href = '', title = '', done = false, on = false, branch = false }) =>
    `<a class="tk${branch ? ' br' : ''}${done ? ' done' : ''}${on ? ' on' : ''}"${href ? ` href="#${esc(href)}"` : ''} data-tk="${esc(id)}" tabindex="-1" title="${esc(title)}"></a>`;

  // Who completes a flag with no layer that completes it, in the words the
  // stop's flag box and the flow's stage share. A page for one PR says `this
  // PR` and never `layer` or `stack` (recipes/review.md).
  function unfinished(f, single) {
    if (flagKind(f) === 'dead') return single ? 'nothing calls it' : 'nothing in the stack calls it';
    if (f.type === 'outside-stack') return single ? 'completed outside this PR' : 'completed outside the stack';
    return single ? 'this PR does not complete it' : 'no layer completes it';
  }

  // --------------------------------------------------------------- catalog
  // Every class a page may carry, by the component that owns it
  // (kits/components.md). A class ending in `*` stands for its family, such as
  // an icon's `i-test`. `Page` holds the review page's layout, `Kit` the page
  // kit's hooks and `Skeleton` the theme skeleton's own. render.mjs refuses a
  // page with a class outside it, and page-check.mjs fails a hand-painted one.
  const CATALOG = {
    Keycap: ['key', 'keys', 'key-hint', 'mouse-lbl', 'touch-lbl'],
    Icon: ['icon', 'defs', 'i-*'],
    Tag: ['tag', 'layer', 'tested', 'assembled', 'recorded', 'count', 'dot'],
    Mark: ['sev', 'warning', 'important', 'info', 'badges'],
    Label: ['caps', 'kicker', 'mark', 'sub'],
    Button: ['btn', 'outline', 'text', 'solid', 'icon-only', 'nb', 'edge', 'nfold', 'rv', 'reopen', 'rail-toggle', 'fold-all', 'voice-pick', 'sel-fab', 'arming', 'tl', 'menu', 'pick-stop', 'sheet-x'],
    Disclosure: ['disclose', 'fold', 'end', 'hunk-fold', 'fv-toggle'],
    Tabs: ['tabs', 'tab'],
    Code: ['code', 'mini-diff', 'ln', 'a', 'd', 'c', 'h', 'nl', 'cut', 'o', 'f', 'show', 'sel', 'lens-code', 'll', 'add', 'at', 'code-block', 'ref-pic', 'inline-code', 'plus', 'minus', 'yk', 'ys', 'yn', 'yt', 'yc', 'yx', 'mono', 'sym'],
    Table: ['scroll', 'table', 'ledger', 'flags', 'claim-ledger', 'one', 'file-index', 'long', 'claims', 'path', 'later', 'open', 'complete'],
    Note: ['callout', 'box', 'dropped', 'loud', 'slowdown', 'untested', 'entry', 'flag-box', 'ft', 'ev', 'ev-d', 'decision', 'q', 'opts', 'outcome', 'go', 'otherwise', 'bl'],
    Panel: ['panel', 'ground', 'split', 'current', 'stop', 'hunk', 'evidence', 'scene', 'lane', 'card', 'face', 'front', 'back', 'bio', 'voice-panel', 'flow-stage', 'seqs', 'beforeafter', 'ref-pair', 'stack', 'b', 'caveats', 'caveat', 'cav-title', 'cav-n', 'cav-rows', 'cav-where', 'cav-k', 'cav-code', 'compact', 'cav-plan'],
    Layer: ['overlay', 'sheet', 'gloss-sheet', 'tip', 'lens', 'toast', 'backpill', 'pickpill', 'bk', 'pick-mouse', 'pick-touch', 'peek-sheet', 'ps-x', 'ps-body', 'ps-title', 'ps-go'],
    Navigator: ['navi', 'spot', 'where', 'ticks', 'tk', 'br', 'done', 'on', 'flowing'],
    Meter: ['meter', 'meter-label', 'seg', 'gauge', 'ring', 'churn', 'churn-w', 'churn-n', 'churn-more', 'churn-key', 'n-t', 'n-g', 'p', 'm', 'scene-scrub', 'next'],
    Link: ['cav-mark', 'term-ref', 'loc', 'to-tests', 'to-ref', 'to-brief', 'to-hop', 'cav-link', 'skip-to', 'io-l', 'to-stop', 'xref', 'peekable', 'layer-go', 'tt', 'term-go', 'home-of', 'excerpt-of', 'file-link', 'rel'],
    Diagram: ['legend', 'line', 'swatch', 'waits', 'async', 'setup', 'sq-*', 'dm', 'dm-*', 'scene-stage', 'seq', 'flow-map', 'flow-row', 'lane-name', 'act-name', 'dots', 'pf-*', 'passing', 'same', 'new', 'changed', 'alt', 'idle', 'caller', 'callee', 'answer', 'live', 'leaving', 'past', 'ahead', 'wire', 'label', 'note', 'val', 'head', 'frame', 'ghost', 'bar', 'fail', 'active', 'added'],
    Page: ['wt', 'hdr', 'brand', 'tools', 'body', 'rail', 'main', 'chapter', 'ch-head', 'ch-meta', 'sha', 'gist', 'intent', 'views', 'walk-view', 'stops', 'stop-head', 'stop-hd', 'stop-num', 'stop-title', 'stop-gist', 'stop-body', 'stop-actions', 'ctx', 'trail', 'fr', 'more', 'outer', 'wake', 'via', 'payload', 'io', 'to', 'transition', 'proofs', 'proof-d', 'cv', 'margin-d', 'hk', 'hk-bar', 'files-view', 'files', 'fv-*', 'test', 'toc', 'toc-*', 'has-branches', 'more-row', 'g', 't', 'n', 'lb', 'hops', 'hop', 'lanes', 'lg', 'layers', 'order', 'debts', 'debt', 'takeaways', 'qa', 'qa-ans', 'cards', 'card-go', 'qt', 'gloss', 'gloss-*', 'terms', 'term', 'def', 'refs', 'ref', 'ref-b', 'ref-more', 'rt', 'ref-caveats', 'brief', 'brief-d', 'brief-sum', 'brief-skip', 'brief-items', 'brief-term', 'brief-links', 'brief-close', 'brief-terms', 'rail-tools', 'faq', 'flow', 'flow-*', 'st-*', 'story', 'howto', 'local-note', 'page-end', 'sp', 'sr', 'skip', 'js', 'comments-on', 'comments-off', 'commenting', 'cm-target', 'flash', 'lit', 'tapped', 'is-wide', 'jz-armed', 'jz-pop', 'jz-shake', 'reviewed', 'shut', 'played', 'flip', 'rng', 'coverage', 'resets', 'keyline', 'k-idle', 'k-live', 'vp-*', 'scene-head', 'scene-cover', 'play', 'scene-bar', 'scene-cap', 'scene-ctl', 'scene-steps', 'seqs-scroll', 'grp', 'also', 'branch', 'detail', 'flag', 'hunk-meta', 'prose', 'snap'],
    Kit: ['wtp', 'wtp-bar', 'wtp-tools', 'wtp-cur', 'wtp-lit', 'wtp-prog', 'wtp-reviewed', 'wtp-commenting', 'wtp-keylist', 'wtp-resets', 'wtp-filter', 'wtp-terms'],
    Skeleton: ['page', 'lede', 'pane', 'pane-h', 'want'],
  };
  // Chrome is not selectable; content is (kits/components.md, Selection).
  // Each component names the classes that root its chrome; every other class
  // roots content, and a component with no entry is content whole. A chrome
  // root's variants and children ride on it. catalog.test.mjs fails a root
  // that no stylesheet takes out of selection.
  const CHROME = {
    Keycap: ['key', 'keys', 'key-hint'],
    Icon: ['icon'],
    Tag: ['tag'],
    Link: ['cav-mark'],
    Mark: ['sev', 'badges'],
    Label: ['kicker'],
    Button: ['btn'],
    Tabs: ['tabs', 'tab'],
    Layer: ['toast', 'backpill', 'pickpill'],
    Navigator: ['navi'],
    Meter: ['meter', 'gauge', 'ring', 'churn-w', 'churn-key'],
    Diagram: ['legend', 'flow-map', 'sq-svg', 'dm-svg', 'scene-stage'],
    Panel: ['cav-n', 'cav-k'],
    Page: ['hdr', 'rail-tools', 'flow-bar', 'st-top', 'st-meta', 'scene-bar', 'scene-cover', 'stop-num', 'stop-actions'],
    Kit: ['wtp-bar', 'wtp-tools', 'wtp-prog'],
  };
  const exact = new Set(Object.values(CATALOG).flat().filter((c) => !c.endsWith('*')));
  const families = Object.values(CATALOG).flat().filter((c) => c.endsWith('*')).map((c) => c.slice(0, -1));
  const inCatalog = (c) => exact.has(c) || families.some((f) => c.startsWith(f) && c.length > f.length);
  // The classes of a list that no component owns, once each.
  const unknownClasses = (names) => [...new Set(names)].filter((c) => c && !inCatalog(c));
  // A pictogram set as text, where an icon belongs: the flag, play, pause,
  // check and caret glyphs, and any emoji. Arrows and box drawing are text.
  // ©, ® and ™ are pictographic in Unicode but plain text in prose; only
  // their emoji form, with the U+FE0F selector, stands in for an icon.
  const GLYPH = /[\u2691\u25b6\u25b8\u25be\u25b4\u275a\u2713\u2714\u203a\u22ef]|[\u00a9\u00ae\u2122]\uFE0F|(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}/u;

  root.WTMarkup = Object.freeze({ CATALOG, CHROME, unknownClasses, GLYPH, navigator, tick, unfinished, esc, KEY_LABEL, keycap, keys, ICONS, sprite, icon, tag, layerTag, proofTag, SEVERITY, mark, flagSeverity, PROOF_NAME, FLAG_NAME, flagKind });
})(typeof window !== 'undefined' ? window : globalThis);
