# Attention

Read this before painting a page, and audit the page with it before delivery. It decides what a reader sees first, and it keeps the page's secondary parts quiet. It distills [Refactoring UI](https://github.com/wondelai/skills/blob/main/refactoring-ui/SKILL.md) (Wathan and Schoger; the wondelai skill, MIT) and the repo's [`content-hierarchy`](../../../../../../../../.claude/skills/ux-design/content-hierarchy/SKILL.md) and [`layout-composition`](../../../../../../../../.claude/skills/ux-design/layout-composition/SKILL.md) rules for this theme's dark, mono, hairline look. [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) checks compliance; this kit checks emphasis.

## Principles

- **One primary per unit.** A stop, a card or a panel has one element the eye lands on first. On a stop it is the title; the gist comes second, and the code third. Everything else steps down.
- **Emphasize by de-emphasizing.** Raise the one thing by lowering its neighbors: mute the metadata, drop a border, shrink a label. Never answer "this needs attention" by adding color to more things.
- **One lever at a time.** Size, weight or color, not all three. The single most important element per page may take two.
- **Grayscale first.** The hierarchy must read with the color off. Color then keeps the one role the theme gives each form of it: candy-2 caps text is a label (a kicker, a section mark, a list tick); candy is the one warning, as a solid mark or a warning note's label, and in a diff a removed line; a candy-2 outline asks for attention; purple is where the reader is; mint is an added line; cyan is a test, beside its test tube; the layer ramp names a PR, beside its number. A new use takes one of these roles or stays ink and mute.
- **Proximity before borders.** Group with space: space between groups exceeds space within them (4 and 8 inside a group, 16 and 24 between). Borders belong to containers (a stop, a hunk, a stage), chips and controls, never to running text: inline code is a tint, a label is plain text.
- **Metadata recedes.** The stack, the call site, the payload, ranges, churn and counts are tertiary: 11–12px, mute, one row. They sit beside their subject and never interrupt the prose.
- **What acts looks like it acts, at rest, and nothing else does.** Receding never hides a control: a link or a peek carries a dotted underline, and what opens in place leads with its caret, the one caret icon that turns as the fold opens. Ink and a solid underline mark hover and focus. Plain text never wears the dotted underline, a bordered tag never links, and a dashed border keeps its one meaning (code only) ([`interactivity.md`](interactivity.md#navigation)).
- **One control, one action.** Two controls never end in the same act, and a control that switches a mode on or off is a toggle with `aria-pressed` and an icon that shows its state, such as `listen` beside `play`.
- **The beat's own content stays open.** A fold or an inner scroll holds what a reader may skip, never the content the beat is about: a stop's deciding code, the stage's hop, the model a section exists to show.
- **One measure per unit.** Every text block of a stop, a callout and a box included, shares the stop's left and right edges; only code runs wider, in its own scroll. A paragraph narrower than its neighbors reads as a mistake.
- **Words show whole.** No title, name, link or sentence ends in an ellipsis or a line clamp, at any width. A column of names grows to its longest name, up to a cap, and wraps past it, and rows that share the column share its width. A fixed-height box sizes to its tallest content at the current width, so nothing inside it is cut.
- **Links name their destination.** A link says what it opens in its own text: a stop's number and title, a file, a chapter. It pulses what it lands on when the landing could be missed, never a chapter or a view it opens at the top, and leaves a way back. A link that answers a question lands on the sentence that answers it, not on the top of the stop. Only a ledger column whose header names the target shows a bare number, and it still previews. A bare `05` in prose asks the reader to guess.
- **A peek adds, never repeats.** On hover and focus a peek shows what the screen does not: a term's definition, a stop's gist, the hop a square stands for, the stop a glossary term leads to, what a badge means. A link whose row already shows its destination has no peek, and no native `title` repeats text in view. On a touch screen a peek opens at a tap in a sheet clear of the finger ([`interactivity.md`](interactivity.md)).
- **Loud is rare.** At most one solid mark per view: the one warning. Outline marks for important, plain text for context. A repeated element gets quieter as it repeats.
- **Flat, like the rest.** No shadows, gradients or glow anywhere, keycaps included. Depth comes from surface steps (`--bg`, `--surface`, `--surface-2`).
- **A picture sits beside its words.** A diagram that explains a beat shares one screen with the words that explain it, and draws only what that beat needs: the flow's stage sits over its act's diagram, never over the whole system, and draws no second picture of the hop. A diagram uses a notation its readers already know (a sequence diagram for a process across components), gives each arrow a row or a number of its own so no two labels meet, labels every arrow with what travels, and keeps every name whole in its box. What a label says, the key leaves out.
- **Time follows reading.** Anything that advances by itself holds each beat for its reading time (200 words a minute plus a second), pauses while the reader points at it or focuses it, and shows its clock. A pause keeps the beat and its clock, so resuming never restarts either.

## Audit

Answer each question for the busiest view of the page (for a review, a stop with evidence). Score `round(passed / rows × 10)`, name the failed rows and fix them before delivery.

| # | Question | A failure looks like |
| --- | --- | --- |
| 1 | Squint at it: does exactly one element per unit read first? | The number, a badge and a chip outshine the title |
| 2 | With color off, does the hierarchy still read? | Emphasis carried only by candy |
| 3 | Does each color keep the one role the theme gives its form? | Candy text on a badge, a link and an arrow, so none reads as a label or a risk |
| 4 | Is space between groups larger than space inside them? | Header, context, prose and evidence equally spaced |
| 5 | Do borders wrap only containers, chips and controls? | Boxed inline code, boxed labels, boxed payloads |
| 6 | Does metadata sit quiet in one row beside its subject? | Underlined frames and chips between the gist and the prose |
| 7 | Is there at most one solid mark in view? | Several filled badges or number blocks |
| 8 | Does every link say where it goes and show where it landed? | Bare numbers in prose; a jump to a whole stop when one sentence answers the question |
| 9 | Does nothing carry shadow, gradient or glow? | A lifted keycap on a flat page |
| 10 | Does every auto-advancing beat hold for its reading time, pause on hover and focus, and show its clock? | A caption that moves on mid-sentence |
| 11 | At desktop and phone widths, does every title, name, link and sentence show whole? | An act name cut to "The Conversation settles exactl…"; a story line clamped at two lines on a phone |
| 12 | Does every peek add something the screen does not already show? | A PR chip whose peek repeats the title beside it; a native tooltip over its own label |
| 13 | Does everything that acts look like it acts before the pointer finds it? | A payload label that opens its shape, set as plain text |
| 14 | Do the text blocks of a unit share one left and right edge? | A paragraph capped at 70ch between full-width callouts |
| 15 | Is each mark named once? | `slow down` as a badge and again as the callout's label |
| 16 | Does every subtitle tell the reader what to do or define a word the page uses? | `your ticks stay private` under a heading; a subtitle that repeats the legend below it |
| 17 | Does each diagram share the screen with the words that explain it, draw only what they need, and read without a key? | A diagram taller than the screen between a hop and its squares, every arrow of the stack crossing at once, unlabeled arrows in a grid the reader must decode, the stage drawing the hop a second time above the diagram |

## For review pages

- **The stop.** The number is the layer color as text; badges show what asks for attention (warning, then important), then a quiet `branch` badge on a branch stop, which says where the stop sits; the stop kind stays off the head. Each badge is a Tab stop whose peek says in one sentence what it means (`dormant code`: code nothing in production calls in this PR), because a reader meets these words before any legend. Under the gist one quiet context block holds the call stack, how the frame was reached, and the payload, one short row each, with the changed frames marked by a layer-colored square. Each mark is named once, by its head badge: the slow-down callout carries only its reason, and a flag box adds only who completes it, unless the stop has two flags to tell apart. A flag's evidence opens from its box on request, and each receipt in it links to its line with a lens. The prose follows, then the evidence.
- **Evidence headers.** Path in ink, range and churn in mute, then the file's tests and its whole diff as quiet text buttons. Wherever the page counts or names tests (a rail file's count, a `2 tests` link, a test section's kicker, a proof chip) a cyan test tube leads, and a count never shortens to a letter like `1t`. Every line of a code block spans the block's full scroll width, so a background never ends mid-block.
- **Meters.** A progress meter shows only what can progress: the chapters with stops, never the opening or the close. In the rail a tick means reviewed and nothing else, so the close sits in the number column as `end`, the way the opening sits as `00`.
- **Actions.** One outlined action per stop (mark reviewed); comment is a text button.
- **Questions and ledgers.** A question hides its answer behind `answer`; open, each quoted sentence carries the stop it comes from, by number and title: `01b A missing token fails before the SDK initializes`. The jump centers the quoted sentence that answers it (the question's `look`, checked verbatim by `check.mjs`) and keeps it lit while the back control shows the question. A card names its stop the same way once it turns. Ledgers keep bare numbers under a header that names them.
