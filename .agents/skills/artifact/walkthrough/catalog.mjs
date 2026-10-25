// The checks that keep a page inside the catalog (kits/components.md), in
// one place for render.mjs's refusal, the runtime's test and the CSS test.
// The catalog itself lives in runtime/markup.js, which both kinds of page
// inline; this file reads it the way views.mjs does.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const shared = {};
vm.runInNewContext(readFileSync(new URL('./runtime/markup.js', import.meta.url), 'utf8'), shared);
const { GLYPH, keycap, CATALOG, CHROME } = shared.WTMarkup;
// The list comes back as an array of this realm, not of the context markup.js ran in.
export const unknownClasses = (names) => [...shared.WTMarkup.unknownClasses(names)];
export { GLYPH };

// The static classes a runtime source writes: its class attributes with each
// ${…} taken out, className assignments and classList calls.
export function sourceClasses(src) {
  const out = [];
  for (const m of src.matchAll(/class="([^"]*)"/g)) out.push(...m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter((c) => /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(c)));
  for (const m of src.matchAll(/className\s*=\s*'([^']*)'/g)) out.push(...m[1].split(/\s+/));
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)) out.push(m[1]);
  return out.filter(Boolean);
}

const uncomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// What a runtime source draws outside the catalog: an unknown class, a glyph
// set as an icon, or a keycap built by hand rather than by keycap().
export function sourceProblems(src, { name = 'source', keycapHome = false } = {}) {
  const out = unknownClasses(sourceClasses(src)).map((c) => `${name}: class "${c}" belongs to no component`);
  const code = uncomment(src);
  const glyph = GLYPH.exec(code);
  if (glyph) out.push(`${name}: the glyph "${glyph[0]}" stands where an icon belongs, near "${code.slice(Math.max(0, glyph.index - 40), glyph.index + 10).replace(/\s+/g, ' ').trim()}"`);
  if (!keycapHome && /<kbd\b/.test(code)) out.push(`${name}: builds a <kbd> by hand instead of calling keycap()`);
  return out;
}

// CSS outside :root takes its colors, radii, spaces and tints from tokens: no
// hex, rgb() or hsl() color, no pixel radius, no padding, margin or gap in
// pixels up to the scale's end (past 28px a length is layout), and no
// color-mix() strength that is not a --mix-* step. The page is flat and a
// dashed border has one meaning: no gradient, no tilt on hover, and a dashed
// border only on the code-only proof (a legend's dashed line draws an arrow,
// and a branch's connector a path, not a border). Each selector of a group
// must qualify: one exempt selector exempts none of the others.
const DASH_OK = /assembled|\.line\.|branch::after/;
const SPACE = /^(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?$/;
export function cssProblems(css, name = 'css') {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (/^:root\b/.test(sel)) continue;
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      const at = `${name}: ${sel.replace(/\s+/g, ' ').slice(0, 60)} { ${prop}: ${val} }`;
      if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(val)) out.push(`${at}: a literal color`);
      if (prop === 'border-radius' && !/^(0|var\(--radius-[a-z0-9]+\))$/.test(val)) out.push(`${at}: a radius off the scale`);
      if (SPACE.test(prop)) for (const n of val.replace(/env\([^)]*\)/g, '').matchAll(/(-?)(\d+(?:\.\d+)?)px/g)) if (Number(n[2]) <= 28) out.push(`${at}: a space off the scale`);
      if (/color-mix\(.*?\d+(?:\.\d+)?%/.test(val)) out.push(`${at}: a tint strength off the --mix-* steps`);
      if (/gradient\(/.test(val)) out.push(`${at}: a gradient on a flat page`);
      if (/:hover/.test(sel) && (/^(perspective|rotate)$/.test(prop) || /perspective\(|rotate[XY3]/.test(val))) out.push(`${at}: a tilt on hover`);
      if (/^border(-(top|right|bottom|left))?(-style)?$/.test(prop) && /\bdashed\b/.test(val) && !sel.split(',').every((one) => DASH_OK.test(one))) out.push(`${at}: a dashed border, which means code only`);
    }
  }
  return out;
}

// Every chrome root the catalog names sits in a rule that takes it out of
// selection, and belongs to the component that names it. Reads the rules
// that set user-select: none, in either stylesheet.
export function selectProblems(css) {
  const out = [];
  const held = new Set();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) if (/(^|;)\s*user-select\s*:\s*none/.test(m[2])) for (const c of m[1].matchAll(/\.([a-z][a-z0-9-]*)/g)) held.add(c[1]);
  for (const [component, roots] of Object.entries(CHROME)) {
    for (const r of roots) {
      const owned = (CATALOG[component] ?? []).some((c) => c === r || (c.endsWith('*') && r.startsWith(c.slice(0, -1))));
      if (!owned) out.push(`${component}: chrome root "${r}" is not one of its classes`);
      if (!held.has(r)) out.push(`${component}: chrome root "${r}" stays selectable; add .${r} to the chrome rule`);
    }
  }
  return out;
}

// The page draws only what the catalog holds (kits/components.md): each class
// a component owns, inline styles that set only the custom properties the
// stylesheet reads, icons as icons rather than glyphs, and keycaps from
// keycap(). Code keeps its own characters, so a glyph inside code is text.
// Lists each problem once.
const STYLE_PROPS = new Set(['--c', '--rows', '--folds', '--head', '--minw', '--minw-heads', '--w', '--n', '--lanes', '--share']);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function catalogProblems(html) {
  const out = new Set();
  for (const c of unknownClasses([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)))) out.add(`class "${c}" belongs to no component`);
  for (const m of html.matchAll(/\bstyle="([^"]*)"/g)) {
    for (const d of m[1].split(';')) {
      const prop = d.split(':')[0].trim();
      if (prop && !STYLE_PROPS.has(prop)) out.add(`style "${d.trim()}" sets more than a custom property the stylesheet reads`);
    }
  }
  const text = html.replace(/<(pre|code|script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ');
  const glyph = GLYPH.exec(text);
  if (glyph) out.add(`the glyph "${glyph[0]}" stands where an icon belongs, near "${text.slice(Math.max(0, glyph.index - 40), glyph.index + 10).replace(/\s+/g, ' ').trim()}"`);
  for (const [kbd] of html.matchAll(/<kbd\b[^>]*>[^<]*<\/kbd>/g)) {
    const k = /data-key="([^"]*)"/.exec(kbd);
    if (!k || kbd !== keycap(unesc(k[1]))) out.add(`${kbd} is not built by keycap()`);
  }
  return [...out];
}
