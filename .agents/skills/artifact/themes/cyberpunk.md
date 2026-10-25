# Theme: cyberpunk

Default artifact theme. Dark candy kit. Read this file before painting when the selected theme is cyberpunk.

The palette and the components below are fixed. Layout is the page's own: column width, grid, density and the number of sections follow the content.

## Philosophy

- Steal vibe from Effect.institute / OpenCode / Kit Langton / minimal.gallery: mono eyebrows, hairlines, one accent cell. Not their palettes.
- One primary per unit, quiet metadata, color that means one thing: [`kits/attention.md`](../kits/attention.md) holds the rules and the audit.
- Flat surfaces, quiet chrome. One loud punch when earned.
- Paced, not dumped: lead with the point, then hand the reader the next beat. See artifact [Narrative pacing](../SKILL.md#narrative-pacing).

## Palette (locked)

```
--bg:       #07060b
--ink:      #f1efe8
--mute:     #9a96a8
--hair:     rgba(241,239,232,0.14)
--surface:  #14121c
--surface-2:#1c1828
--candy:    #ff2d6a
--candy-2:  #ff5a9a
--purple:   #8b7cff   /* WANT / active state ONLY — never big fills */
--mint:     #7dffa8   /* added `+` hunk lines ONLY — never big fills */
--cyan:     #3ee8ff   /* tests ONLY: the test tube and what names tests */
```

Candy = the warning mark and **one** loud solid block (black text on candy). Candy-2 is the lighter tier for labels and small marks: kickers, section marks, list ticks, the reviewed mark. Cream text on dark. Purple marks only the active state: WANT headers, the open or active stop, the current frame. Mint marks only added `+` lines. Cyan marks only tests: the test-tube icon and the counts, links and kickers that name tests, at least 10:1 on every surface. No lime / yellow. No neon lime and no GitHub green. No hot purple cards. No light-bg + dark-text pages. The theme is one dark look on purpose: `:root` sets `color-scheme: dark` and paints the background and every color itself, as the Artifact tool allows a design that commits to one look, so a page adds no light palette.

**Layer ramp.** A page that tells PR layers apart uses ten steps from candy-2 to purple, `--l1` … `--l10` (values in [`walkthrough/runtime/walkthrough.css`](../walkthrough/runtime/walkthrough.css)). They mark layer identity only (chips, rail ticks, spine edges), always beside the layer number, so color never carries the meaning alone.

Inline `code`: a `--surface-2` tint with `--ink` or `--mute` text, no border: borders wrap containers, never words. **Never** candy, purple, or mint fills on inline code.

Diff code sits on `--surface` or `--surface-2`, never directly on `--bg`. WANT panes and the active stop use `--purple`. Producers **must** wrap every `+` hunk line in `.plus` (or the renderer's `.a`) and every `-` hunk line in `.minus` (`.d`); a code block colors them.

## Code

The change is the loudest thing in a diff, so it keeps the theme's two change hues to itself, and syntax colors only help the eye parse.

- **What changed.** An added row takes a `--mint` tint (7%), a removed row a `--candy` tint (9%), and each row's left rule and `+` or `−` sign take the same hue at full strength. A removed line paired with the added line that replaces it marks the words that changed one step stronger (mint 15%, candy 20% in total). Lines that share too little get no word marks.
- **Syntax.** Tokens use their own set, and none sits near mint or candy: keywords `--syn-kw` (dusty violet), strings `--syn-str` (sand), numbers, literals and constants `--syn-num` (peach), types and keys `--syn-type` (periwinkle), comments `--syn-com` (dim lavender). Identifiers are `--syn-text` on changed rows and `--syn-context` on context rows, so context recedes. Values live in [`walkthrough.css`](../walkthrough/runtime/walkthrough.css).
- **Legible on every ground.** Each syntax color keeps at least 4.5:1 contrast against the code surface, both row tints, both word marks and the focus tint. A new color is checked on all six before it ships.
- **Verbatim.** Highlighting only wraps text in tags ([`walkthrough/syntax.mjs`](../walkthrough/syntax.mjs)), so every character of the evidence stays as `git diff` wrote it. A machine-written line cut to a window stays plain.
- **Line numbers** stay mute; the lines a stop cites keep bright numbers when their fold opens.

## Type (locked)

- **Body / headlines / labels / kickers / tokens:** Geist Mono. Small chrome starts at **11px**.
- **Scale.** Every font size, padding, margin, gap, radius and tint strength is a step of the scale that opens [`walkthrough/runtime/page.css`](../walkthrough/runtime/page.css): `--fs-1` … `--fs-11` (10px to 27px), `--sp-px` and `--sp-1` … `--sp-11` (1px to 28px), `--radius-1` and `--radius-round`, and `--mix-1` … `--mix-9`, the percentages a `color-mix()` takes. A value off the scale rounds to its nearest step. Both kinds of page inline `page.css`; a single-punch page copies its `:root` block.
- **Code / call stacks / show-me ASCII / scene labels:** Monocraft, ligatures off (`font-variant-ligatures: none; font-feature-settings: "liga" 0`).
- **JP after Latin face:** `"Noto Sans JP", sans-serif`, loaded from Google Fonts with `&text=` set to the characters the page uses.
- **Load, do not just name.** A family name with no loaded face falls back to system mono, and the page stops looking like this theme.
  - Geist Mono: one Google Fonts stylesheet, `https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap`.
  - Monocraft: not on Google Fonts. Embed the code subset in [`fonts/monocraft-code.woff2`](fonts/monocraft-code.woff2) (3 KB, WOFF2: ASCII, Latin-1, arrows and box drawing, ligatures removed) as a base64 `@font-face` data URI. `walkthrough/render.mjs` does this for review pages. Rebuild the subset with [`fonts/subset-monocraft.sh`](fonts/subset-monocraft.sh); Monocraft is SIL OFL 1.1 ([`fonts/OFL-Monocraft.txt`](fonts/OFL-Monocraft.txt)).
  - These two routes are the ones a claude.ai artifact admits: its CSP loads fonts only from Google Fonts or data URIs, so a CDN font URL fails there without an error.

## Motif (optional) — 2077 subtitles

Kickers / chips / section marks only: one bilingual atom `EN | 漢字` that mirrors that English label alone, e.g. `STACK | 構造`, `DIFF | 差分`, `NOW | 今`, `WANT | 欲しい`. Never body Japanese. Instruction text after the pair is English or mute, never a second `| 漢字` unit. A section mark reads `label | 漢字` between two hairlines, followed by the mute instruction.

## Components

Paste or render these; do not invent other chrome.

- **Labels:** caps text in one tracking ([`kits/components.md`](../kits/components.md#label)). A kicker is bold candy-2 caps above a title; a section mark is a caps label between two hairlines with a mute instruction; a sub-heading is mute caps with a hairline after it.
- **Tags:** hairline boxes with 11px text; a layer tag adds a `--l*` dot and its number, and a proof tag tells its level by its border ([`kits/components.md`](../kits/components.md#tag)).
- **Notes:** a paragraph set apart: a left rule on the surface, or a hairline box, in its severity's color; the loud note, `callout loud`, is at most one per page, black text on candy ([`kits/components.md`](../kits/components.md#note)).
- **Panels:** `--surface` + hairline, square ([`kits/components.md`](../kits/components.md#panel)). A split panel holds two-column NOW/WANT stacks and split diffs: hairline outer frame, shared divider, pane headers (`NOW | 今` ink, `WANT | 欲しい` purple), Monocraft inside.
- **Walkthrough rows:** hairline rows `01  why  short copy`; the active row goes purple. No fat cards, no big number badges.
- **Severity marks:** `warning` is a solid candy mark with dark text, `important` a candy-2 outline, `info` a quiet hairline, and no fourth word. A set of marks lists the most important first, so the order and the fill both carry the rank ([`kits/components.md`](../kits/components.md#mark)).
- **Annotated notes:** 2–4 hairline rows, small candy number squares.
- **Icons:** inline SVG from one symbol sheet, in the color of their text ([`kits/components.md`](../kits/components.md#icon)). Never a font glyph or an emoji as an icon.
- **Keycaps:** flat chips like every other component: `--surface-2`, a hairline, `--ink` legend, sized in `em` by the text around them, in the keys sheet and in running text only, never inside a control. A press inverts the chip to candy-2. Spec in [`kits/motion-sound.md`](../kits/motion-sound.md#keycaps).
- **Diff hunks, stops, the call-stack rail, scenes, notes, ledgers:** review pages take these from the walkthrough renderer; [`walkthrough/runtime/walkthrough.css`](../walkthrough/runtime/walkthrough.css) is their source of truth.

## Large things, disclosed

A list longer than seven items, or a block taller than one screen, never lands whole. It shows its summary and discloses the rest where it stands:

- **A count that opens:** `+8 branches`, `+11 more`, `every hop as a list · 73`.
- **A fixed-height stage** for a sequence the reader plays: one item at a time over a compact map of all of them (a dot per item). The stage keeps its height, so playing it never moves the page.
- **A fold** for code: the lines that matter stay open, and the rest wait behind a control that opens and closes from the same place.

The disclosed state is one click away and one click back.

Anti-patterns:

- Invented HUD / meta tiles (`FILES` / `LINES` / `AUTHOR` grids) unless the ask is metrics
- Purple, mint, or candy fills on big surfaces or inline code
- Glass, glow, shadow, gradient or background grids anywhere, keycaps included
- A surface that tilts, lifts, shines or follows the pointer on hover: a holographic sheen reads as a game, and the rest of the kit is flat and still
- A font glyph or an emoji as an icon: `⚑`, `▶`, `✓`, 🧪
- Inter / system-ui / serif body
- A font named in CSS with no loaded face
- Box-drawing trees when a call stack fits
- A long list or a tall block shown whole, eating the page
- Marks in source order when their severity differs

## Minimal skeleton

For a hand-painted page. A claude.ai artifact takes the content without `<!DOCTYPE>`, `<html>`, `<head>` and `<body>`: the platform adds them. Paste the Monocraft data URI where the skeleton marks it, and [`walkthrough/runtime/page.css`](../walkthrough/runtime/page.css) where it marks the kit's styles: the scale, the labels, tags, marks, buttons, folds and keycaps come from it, on a single-punch page too.

```html
<title>…</title>
<meta name="theme-color" content="#07060b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap">
<style>
@font-face{font-family:Monocraft;font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,/* themes/fonts/monocraft-code.woff2 as base64 */) format("woff2")}
:root{
  color-scheme:dark;
  --bg:#07060b; --ink:#f1efe8; --mute:#9a96a8;
  --hair:rgba(241,239,232,.14); --surface:#14121c; --surface-2:#1c1828;
  --candy:#ff2d6a; --candy-2:#ff5a9a; --purple:#8b7cff; --mint:#7dffa8; --cyan:#3ee8ff;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink)}
body{font-family:"Geist Mono","Noto Sans JP",ui-monospace,monospace;font-size:13px;line-height:1.45;padding-inline:16px}
.page{max-width:760px;margin:0 auto;padding-block:18px 28px}
h1{font-size:22px;font-weight:700;line-height:1.15;text-wrap:balance;margin:8px 0}
.lede{color:var(--mute);font-size:12px;padding-bottom:12px;border-bottom:1px solid var(--hair)}
.pane-h{margin-bottom:6px}
.pane-h.want{color:var(--purple)}
:focus-visible{outline:1px solid var(--purple);outline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
/* walkthrough/runtime/page.css, whole */
</style>
<main class="page">
  <div class="kicker">kit | 設計</div>
  <h1>short human title</h1>
  <p class="lede">One or two sentences.</p>
  <h2 class="mark">the shape | 構造</h2>
  <div class="panel split">
    <div class="pane"><div class="pane-h caps">NOW | 今</div><pre class="code-block" translate="no">…</pre></div>
    <div class="pane"><div class="pane-h caps want">WANT | 欲しい</div><pre class="code-block" translate="no">…</pre></div>
  </div>
</main>
```

Code is a `<pre class="code-block">` or a `<code class="inline-code">` ([`kits/components.md`](../kits/components.md#code)). Add `translate="no"` to every `pre`, diff block and inline `code` element so translation does not alter evidence or identifiers.

## Done

Look matches this theme: the locked palette in its roles, Geist Mono and Monocraft loaded, the components above and nothing invented beside them.
