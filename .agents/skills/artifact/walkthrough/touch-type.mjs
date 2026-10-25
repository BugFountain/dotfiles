// A phone reads no text under 14 px. The runtime CSS is set for a desktop,
// where 11–13 px mono labels read fine, so render.mjs appends one media block
// that lifts every smaller pixel size to the floor, rule by rule: a rule the
// page adds later is lifted with no one listing it. A lifted rule keeps its
// selector's weight, so a more specific rule that sets a larger size still
// wins, and it never reaches SVG text, whose sizes the diagrams lay out by.

const FONT_SIZE = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px/;
// `font: 400 11px/13px var(--ui)`: the size, and a line height in pixels if it has one.
const FONT = /(?:^|;)\s*font\s*:[^;]*?([\d.]+)px(?:\s*\/\s*([\d.]+)px)?/;

// Top-level rules and rules inside media blocks a phone matches, with their
// bodies. Comments and strings never end a block.
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (text, phoneOk) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      let quote = null;
      for (; j < text.length && depth; j++) {
        const c = text[j];
        if (quote) {
          if (c === quote && text[j - 1] !== '\\') quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, phoneOk && phoneMatches(prelude));
      else if (!prelude.startsWith('@') && phoneOk) out.push({ selector: prelude, body });
      i = j;
    }
  };
  walk(src, true);
  return out;
}

// A phone is narrow and may prefer less motion; it is never wider than 560 px.
function phoneMatches(query) {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (min && Number(min[1]) > 360) return false;
  if (max && Number(max[1]) < 560) return false;
  return !/prefers-reduced-motion:\s*no-preference|hover:\s*hover|pointer:\s*fine/.test(query);
}

// Keycaps scale with the text around them, and a touch screen hides them.
const SKIP = /\.key\b/;

export function touchType(css, { min = 14, media = '(max-width: 560px)' } = {}) {
  // A size set from the scale (`var(--fs-4)`) reads as the pixels its token holds.
  const steps = new Map([...css.matchAll(/(--fs-[\w-]+)\s*:\s*([\d.]+px)/g)].map((m) => [m[1], m[2]]));
  const pixels = (body) => body.replace(/var\((--fs-[\w-]+)\)/g, (m, k) => steps.get(k) ?? m);
  const lifted = [];
  for (const { selector, body: raw } of rules(css)) {
    if (SKIP.test(selector)) continue;
    const body = pixels(raw);
    const f = FONT.exec(body);
    const fs = FONT_SIZE.exec(body);
    const size = Number(fs?.[1] ?? f?.[1] ?? NaN);
    if (!(size < min)) continue;
    const lh = f?.[2] ? `; line-height: ${((Number(f[2]) * min) / size).toFixed(1)}px` : '';
    // A selector with a pseudo-element takes no :where() after it.
    const sels = selector
      .split(/,(?![^(]*\))/)
      .map((x) => x.trim())
      .filter((x) => x && !x.includes('::'))
      .map((x) => `${x}:where(:not(svg *))`);
    if (sels.length) lifted.push(`${sels.join(', ')} { font-size: ${min}px${lh}; }`);
  }
  return lifted.length ? `@media ${media} {\n${lifted.join('\n')}\n}` : '';
}
