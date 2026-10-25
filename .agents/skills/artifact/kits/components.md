# Components

The parts every page is built from. Each has one job and one definition. A page draws a part from its definition and invents no other chrome beside it, and the checks below hold it to that ([`themes/cyberpunk.md`](../themes/cyberpunk.md)). A part both the prerendered page and the runtime draw lives in [`walkthrough/runtime/markup.js`](../walkthrough/runtime/markup.js), `window.WTMarkup`: `views.mjs` runs that file to prerender a review page, `render.mjs` inlines it before `walkthrough.js`, and a hand-painted page inlines it before `page.js`. Each part takes its sizes, spaces, radii and tints from the scale that opens [`walkthrough/runtime/page.css`](../walkthrough/runtime/page.css), and its colors from the theme.

| Component | Its one job | Variants | Select | Built |
| --- | --- | --- | --- | --- |
| Keycap | a key's legend, in the key sheet and in the peek of the control the key triggers | single, sequence | chrome | yes: `keycap(key)`, `keys(…)` |
| Icon | every pictogram | test, flag, play, pause, stop, check, caret, sound, sound-off, glossary, menu, top, bottom, fold, unfold, prev, next, close, caveat, external | chrome | yes: `icon(name)`, `sprite()` |
| Tag | a small bordered token | plain, layer, proof (tested, assembled, recorded), count | chrome | yes: `tag(html, { kind })`, `layerTag`, `proofTag` |
| Mark | the severity of a unit | warning, important, info | chrome | yes: `mark(severity, html)`, `flagSeverity(flag)` |
| Label | caps text: a kicker, a section mark, a sub-heading, a table header | kicker, section, sub, plain | content; kickers chrome | yes: `.kicker`, `.mark`, `.sub`, `.caps` |
| Note | a boxed or left-ruled paragraph | rule, box, loud, dropped | content | yes: `.callout` |
| Button | one control, one action | solid, outline, text, icon-only; pressed (a mode it toggles), current | chrome | yes: `.btn` |
| Form control | a value the reader types or picks | search, text, password, radio, checkbox, select | content | no: the browser's own, themed where it stands |
| Disclosure | a fold with one caret rule | inline, row, a count that opens | content; its summary chrome | yes: `.disclose`, `icon('caret')` |
| Tabs | one choice among views | link tabs, radio group | chrome | yes: `.tabs`, `.tab` |
| Code | code with syntax colors | diff, excerpt, lens, block, inline | content | yes: `.code`, `.lens-code`, `.code-block`, `.inline-code` |
| Table | rows and columns in one wrapper | table; key and value still to build | content | yes for tables: `tableView`, `.scroll` |
| Panel | a surface with a hairline | plain, ground, split, current, caveat card, compact caveat card | content; a caveat's number and key chrome | yes: `.panel` |
| Layer | anything over the page, through `WTLayers` | sheet, drawer, peek, peek sheet (touch), lens, toast, pill | content; toast and pills chrome | yes: `.overlay > .sheet`, `.tip`, `.toast`, `.backpill`, `.pickpill` |
| Navigator | where the reader is, and the step controls | with ticks, without | chrome | yes: `navigator()`, `tick()` |
| Meter | progress | segments, ring, bar, churn (code, tests, generated) | chrome | yes: `.gauge`, `.ring`, `.churn` |
| Link | a link that names its target | stop, cross-reference, external, term, receipt or lens, tests, reference, brief, peek target, caveat marker | content; a caveat marker chrome | yes: `stopLink`, `xref`, one underline rule |
| Stage | the flow's current hop, drawn once for the stage and the list | hop, run in passing | content; its top row and meta chrome | yes: `hopStage` |
| Diagram | a drawn figure with its legend | sequence, scene, domain model; legend line, swatch, text; legend folded on a phone | chrome | yes: `.sq-*`, `.dm-*`, `.scene-stage`, `.legend` |

## Keycap

`keycap(key, label?)` draws `<kbd class="key" data-key="…">` with the key's legend from one table, `KEY_LABEL`: `←` for `ArrowLeft`, `esc` for `Escape`, `space` for `' '`. `keys(a, b)` sets a sequence. A keycap stands in two places: the key sheet, and the peek a control opens on hover and on keyboard focus, which `keys.js` builds from the control's `aria-keyshortcuts` with these same builders. No keycap sits inside or beside a control, where it crowds the label and means nothing to a finger. The opening points to the key sheet in one line, `press ? for every key` (`.howto`), and hides it where a phone has no keys. It has no modifier: a long legend such as `space` widens the cap by itself. `.key` in `page.css` draws it; [`kits/motion-sound.md`](motion-sound.md#keycaps) says how a press shows. `walkthrough/markup.test.mjs` fails when a control names a key the table has no legend for, or a control in the page's shell carries a keycap; `keys.test.mjs` fails when the key sheet lists a key the page does not answer as typed.

## Icon

`icon(name)` draws `<svg class="icon i-<name>"><use href="#wt-i-<name>"/></svg>`, and `sprite()` the one sheet of symbols the icons point at. The review page holds the sheet at the top of its body; `page.js` adds it to a hand-painted page that has none, so a hand-painted page writes the same `<svg class="icon i-test" aria-hidden="true"><use href="#wt-i-test"/></svg>`. An icon takes the color of its text and sizes by it, `1.15em`, one gap before the words after it. The test tube is cyan wherever it stands. A control that swaps icons holds both and hides one: `icon('sound', 'data-on hidden')`. A new pictogram is a new symbol in `ICONS`, drawn on the 16-unit grid; no page draws a font glyph (`⚑`, `▶`, `❚❚`, `✓`, `›`) or an emoji as an icon, since each falls back to a system font at its own size and baseline. An arrow, or a `©`, `®` or `™` sign, inside a sentence is text and stays text. `external` follows the name of a link that leaves the page.

## Tag

`tag(html, { kind, c, href, dot, attrs })` draws one small bordered token at 11px, a link when it has `href`. A plain tag names a thing: `dropped`, `not in the walk`, `long lines cut`, a ticket, `0 / 4 reviewed`, a hand-painted part's `reviewed`. `layerTag(label, c)` names a layer in its color, with a square when `dot` is set. `proofTag(level)` names a hop's proof and tells the level by its border as well as its color: `tested` solid in the tests' cyan, `assembled` (`code only`) dashed, `recorded` double; a test file's `test` tag takes the tested look with the tube. `kind: 'count'` is a button in the solid hairline that opens what it counts, such as `+2 outer` frames. A dashed border means code only, so no other tag or note wears one. `.tag` in `page.css` draws every variant.

## Mark

`mark(severity, html)` draws a unit's severity in one of three words, most important first: `warning` is a solid candy mark, `important` a candy-2 outline, `info` quiet, so the rank reads by fill as well as color. A stop's badges, a chapter's takeaways and a flag on the flow's stage are marks; a `[!NOTE]` callout reads `info`. `flagSeverity(flag)` is the one rule for a flag's severity wherever the flag shows: work outside the stack or an inverted order is a warning, interim behavior or a flag no layer completes is important, and a flag a later layer completes is info. `.sev` in `page.css` draws it.

## Button

`<button type="button" class="btn outline">` and its siblings: `outline` is a hairline box (a header tool, a stop's `mark reviewed`, a reset, a scene control), `text` has no box (the navigator's steps, a stop's `comment`, `+2 branches`), `solid` is the one candy action, and `icon-only` squares an icon alone. `aria-pressed`, `aria-checked` or `aria-current` shows the active state in purple; a review toggle that is on takes the reviewed candy-2. A button does one thing, and its label names it. A button that switches a mode on and off, such as the flow's voice, says its state in `aria-pressed` and keeps one label; a button never doubles as a second control that the first one already is. A class beside the variant, such as `reopen` or `nb`, only places the button; it never restyles it. A press squashes a button, and a keycap while its key is down ([`motion-sound.md`](motion-sound.md#juice)). `.btn` in `page.css` draws every variant, on both kinds of page.

## Disclosure

A fold that opens in place leads with one caret, `icon('caret')`, that turns a quarter as it opens. Inline: `<details class="disclose">` with the caret first in its summary, for a payload, a margin note, evidence, an answer, a debt row, a file's history, a reference entry, the brief (a reference entry under the intent whose ideas' names show under its line while it is folded: `.brief`, `.brief-d`, `.brief-sum`, `.brief-skip`, `.brief-terms`, `.brief-items`, `.brief-term`, `.brief-links`, `.brief-close`), the glossary and the flow's list. A run in passing lists its hops open, on the stage and in the list, since a fold there hid what the step is about. Row: a button that opens rows says its state in `aria-expanded` and holds the same caret, for a diff's `70 more lines`, its `hide 70 lines`, and the caret that leads a diff's header or a file in every-file view. A count that opens is a count tag or a text button, such as `+2 outer` or `+2 branches`. No summary shows the browser's own triangle or a glyph caret. `page.css` holds the rule.

## Form control

The search box, the glossary's filter, the voice panel's key, voice and source, and a self-check card's box are the browser's own inputs, with a `<label>` for each (a `.sr` one where the design shows none). Each takes the ground fill, a hairline border and the purple focus ring where it stands (`.gloss-top`, `.vp-opts`, `.wtp-filter`); a checkbox takes candy-2 as its accent. No page builds a fake one from a `div`. A shared input rule is still to build.

## Tabs

`.tab` is one choice among views: a link that names its view with `aria-current="page"` (a PR's walk and every file), or a radio in a `.tabs` group with `aria-checked` (every file's reading order). The chosen tab takes the purple edge on the surface; a count beside its name sits in a quiet `span`.

## Label

Caps text that names what follows, in one tracking, `--track-caps`. `.kicker` is bold candy-2 above a title (a chapter, a lane, a sheet's group, a file tier); `.mark` is a section mark between two hairlines, with a mute `em` after the label; `.sub` is a mute sub-heading with a hairline after it; `.caps` is a plain caps label that takes its color from where it sits (a callout's word, a before and after pane, a flag box's head, a card's face, a table header). Purple stays the active state, so no label wears it except the `after` pane, the theme's WANT. `page.css` holds the rule.

## Code

Every piece of code sets in Monocraft with ligatures off and takes one set of syntax colors, `.yk`, `.ys`, `.yn`, `.yt` and `.yc`, wherever it stands, from `syntax.mjs`'s painting. A diff is `.code` rows (`views.mjs`, `hunkFigure`), and an excerpt is the same rows cut to their focus; a lens is `.lens-code`, a call site's lines on hover; a plain block is `<pre class="code-block">`, for a payload's shape, a reference picture and a hand-painted page's call stack, and it scrolls sideways rather than wrap; inline code is `<code class="inline-code">`. `.plus` and `.minus` mark a drawn diff's lines in a code block. `page.css` holds the rule.

## Table

`tableView({ head, rows, label })` in `views.mjs` draws every table on a review page: the close's claim and flag ledgers, a layer's file index, and a reference entry's table. Each sits in one `.scroll` wrapper that scrolls it sideways, takes focus so the arrow keys scroll it, and names it for a screen reader; a reference picture and the domain model scroll in the same wrapper. Headers are caps labels in candy-2. A ledger adds only its column widths (`.table.ledger`). The key-and-value grids (the glossary's terms, the key sheet's rows, the page kit's lists) are still their own.

## Note

`.callout` sets a paragraph apart from the prose. A rule note is a left rule on the surface: an outline's `[!IMPORTANT]`, `[!WARNING]` or `[!NOTE]` callout, a stop's slow down, its untested branches, a chapter's entry. `.callout.box` is a hairline box: a flag, a decision. A severity class (`warning`, `important`, `info`) colors the rule or the edge and the note's head, the caps label or `.ft` that leads it; `dropped` fades a note behind a dashed edge; `loud` is the page's one solid candy block. A class beside it, such as `flag-box` or `slowdown`, places the note or sizes its text and never recolors it.

## Panel

`.panel` is a surface with a hairline: a diff, a scene, a lane, a card's faces, the flow's stage, the voice panel. `ground` sets a panel on the page's ground, for one that holds surfaced panels: a stop, a file's history, the act diagram. A caveat card (`.caveat`, inside the reference entry `.ref-caveats`, the list `.caveats`) is a panel with its number and title (`.cav-n`, `.cav-title`), its rows (`.cav-rows`: `.cav-k` keys, `.cav-where`, `.cav-code`) and links to its hops and stops; the opening links it once (`.cav-link`). Its compact card, `.caveat.compact`, is what a caveat marker's peek and touch sheet show: the title, what it did in one sentence, and its fix with where the fix is planned (`.cav-plan`). An open flag or an open claim with no layer that completes it names its caveat (`caveat: "<id>"` in the outline, which `check.mjs` requires), so its chip shows the caveat's short form and jumps to the card. `split` frames two panes side by side, one over the other at phone width: a before and after, a reference pair, the theme's NOW and WANT. `current` gives the panel where the reader is its purple edge, as the runtime does for the current stop. A class beside it places the panel and never repaints its edge or its fill.

## Navigator

`navigator({ label, where, href })` draws the one navigator both kinds of page show, bottom right and outside the reading column: `home`, `j ←`, the reader's place over its ticks, `k →`, `end`, the fold key `z` and `x reviewed`. The page fills the place (`data-where`) and the ticks (`data-ticks`, each a `tick()`: filled once reviewed, ringed where the reader is) and answers each button's `data-act`. At phone width it spans the screen and keeps its arrows and the place; the ticks and the letters' keycaps leave.

## Layer

What opens over the page, drawn by the same classes on both kinds of page and closed the way [`layers.js`](../walkthrough/runtime/layers.js) closes every layer: a sheet, `.overlay > .sheet`, over a scrim, for the keys and the glossary; a peek, `.tip`, for a term or what a link opens, and its wide lens, `.tip.lens`, for a call site's lines; a toast, `.toast`, that says what an act did; a pill, `.backpill` or `.pickpill`, for the one control a moment needs. The rail's drawer at phone width is the review page's own layer, and it holds the header's tools (`.rail-tools`); the navigator's `menu` button opens it. On touch a peek opens as a bottom sheet instead (`.peek-sheet`: `.ps-title`, `.ps-body`, `.ps-go` and its close, `.ps-x`), and a sheet takes a close button (`.sheet-x`). The comment pill says `click` to a mouse and `tap` to a finger (`.pick-mouse`, `.pick-touch`) and holds its stop button (`.pick-stop`). On both pages the current part wears purple, a landing pulses the wash as an inset shadow, and comment mode rings in dashed purple.

## Meter

How far something has gone. `.gauge` is a track on the surface that fills from the left to `--p` in purple, or in the color it names: the header's segment per PR in the layer's color, a scene's scrub step, done or filling with the dwell. The flow's stage runs the same fill along its bottom edge while a hop holds. `.churn` splits its length into the added and removed hues; a layer's row adds its tests in cyan and its generated files in mute (`.t`, `.g`), each segment `--share` of the longest row, and one key over the rows names them (`.churn-key`). The row's `.churn-w` holds the bar and its counts, `.churn-n`: the code's `+`/`−`, then `.churn-more` with `.n-t` and `.n-g` when non-zero, and a title with the tests' and generated files' own `+`/`−`. A rail `.ring` draws a PR's share reviewed as an arc. Only the chapters with stops get a meter.

## Link

A link names its target in the target's own words: a stop's number and title (`.to-stop`, `stopLink`), with its PR first when it points out of its chapter, a glossary term (`.term-ref`, and a hand-painted page's `[data-term]`), a call site or a flag's receipt that opens its lens (`.loc`), a file's tests (`.to-tests`), a reference entry (`.to-ref`), the files the walk skips (`.skip-to`), a payload's shape (`.io-l`), a brief item from its name on the brief's folded line or from a glossary term it defines (`.to-brief`), and an item's own links. `xref(href, label, name)` draws every other cross-reference in the same shape, a bold label and the target's name: a hop from a caveat's `where`, a reference entry from the stage's footer, the layer that completes a flag, a caveat's code line and its planned fix. With `ext` it opens a new tab and ends in the `external` icon, the one mark of a link that leaves the page. A fact that sits on plain text and opens only a peek, such as a hunk's line range or a frame's file, is a peek target (`.peekable`, `data-peek`, `tabindex="0"`). A caveat marker (`.cav-mark`) is a link with the caveat icon that peeks the compact card and lands on the full one. Every one wears one underline: dotted in mute at rest, solid candy-2 under ink on hover or focus. A tag never links; a link is never styled as a tag. `render.mjs` refuses a stop link that shows its number without its title.

## Stage

`hopStage(ctx, hop, i, n)` in `views.mjs` draws a hop once: the flow's stage shows it, and the flow's list and a narrated replay read the same markup. Its top row names the act and the hop's place (`.st-top`), then the hop's line, its sub, the story line (a replay button on a page with a voice, `.st-say`), and one labeled footer (`.st-foot`, a `dl`): `code` (the stop or the layer), `proof`, `unfinished`, `caveat` and `explained in` (the reference entries that hold the hop). A part with nothing to say is left out; no second footer repeats one. The flow's bar holds its controls and a keyline (`.keyline`, mute text) that says what the arrows do while the flow holds focus.

## Diagram

A drawing with one legend under it; on a phone the act diagram's legend folds under one line (`.sq-legend`, a Disclosure). The act diagram (`.sq-*`: heads over lifelines, one row per hop) and the domain model (`.dm-*`, on the act diagram's boxes, arrows and halo labels) share their shapes; a scene draws in the grammar of [`kits/scenes.md`](scenes.md) inside `.scene-stage`. `legendItems()` in `views.mjs` writes every legend: a line key draws an arrow's stroke (solid, dashed, dotted), a swatch draws a dot's proof (solid, dashed, double), and a bare key is a sentence about the drawing.

## Enforcement

`CATALOG` in [`runtime/markup.js`](../walkthrough/runtime/markup.js) names every class a page may carry, by the component that owns it, with the review page's layout (`Page`), the page kit's hooks (`Kit`) and the theme skeleton's own (`Skeleton`). [`walkthrough/catalog.mjs`](../walkthrough/catalog.mjs) holds the checks that read it:

- `render.mjs` refuses a page with a class outside the catalog, a stop link with no title, an inline style that sets anything but a custom property the stylesheet reads, a glyph where an icon belongs (outside code), or a `<kbd>` that `keycap()` did not build.
- `catalog.test.mjs` fails a runtime template (`walkthrough.js`, `page.js`, `motion.js`, …) that writes an unknown class, a glyph icon or a hand-built keycap, and a stylesheet rule outside `:root` with a literal color, a pixel radius, a padding, margin or gap in pixels up to 28px, or a `color-mix()` strength off the `--mix-*` steps.
- `page-check.mjs` fails a hand-painted page whose `[data-page]` holds a class outside the catalog, and on a review page it holds both directions of what acts: every element the runtime answers (`window.WTTriggers`) looks interactive at rest, and no inert text wears the link underline.
- `catalog.test.mjs` also keeps the page flat and a dashed border to one meaning: no gradient, no tilt on hover, and a dashed border only on the code-only proof.
- `check.mjs` warns on an emoji or a pictograph in an outline's prose.

The juice's motion states, `jz-armed`, `jz-pop` and `jz-shake` ([`motion-sound.md`](motion-sound.md#juice)), sit with the page's other runtime states (`flash`, `lit`, `tapped`, `is-wide`) in `Page`, and the navigator's `flowing` with the Navigator; they move or restyle a component and draw none. A line that names keys a touch screen lacks (`.key-hint`, `.mouse-lbl` beside `.touch-lbl`) belongs to the Keycap.

## Selection

Chrome is not selectable; content is ([`interactivity.md`](interactivity.md), Chrome is not selectable). The Select column says which each component is. `CHROME` in [`runtime/markup.js`](../walkthrough/runtime/markup.js) names the classes that root each component's chrome, a mixed component such as a Layer included; a class it does not name roots content. `page.css` takes every control and the shared chrome roots out of selection, `walkthrough.css` the review page's own, and `catalog.test.mjs` fails a chrome root that neither rule holds or that its component does not own.

A new component adds its classes to `CATALOG` and its row here in the same change.
