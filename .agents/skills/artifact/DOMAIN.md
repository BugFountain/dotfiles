# Artifact domain

The words this skill, its briefs, its outlines and its pages use for a review walk and the pages built beside it. Each term keeps one meaning. [`WRITING.md`](WRITING.md) says how to write with them.

Several terms name a part of the page the reader never needs a word for. For those, the page shows the thing itself: `_On the page_` says what the reader sees in place of the internal word. The internal word stays in the skill, the outline and the code.

## Language

### The walk

**Walk**:
One review page for a PR or a stack: an opening, a chapter per PR, and a close.
_On the page_: `review walk`
_Avoid_: walkthrough (the renderer's folder), tour, report

**Stack**:
An ordered chain of PRs, each built on the one below it.
_Avoid_: series, train

**Layer**:
One PR of a stack.
_On the page_: its number, `#4156`
_Avoid_: level, slice

**Churn**:
The lines a PR adds and removes. A layer's row splits it by each file's path into code, tests and generated files, so a PR that is mostly specs or a regenerated client reads as the review it is.
_On the page_: `+781 −3,667` for the code, `tests 1,326`, `generated 40`, and the bar's key `code added · code removed · tests · generated`

**Opening**:
The walk's first part, in this order: the intent, before and after, the brief, the takeaways, the flow, the layers, the release plan and the reference.
_On the page_: `the whole flow`

**Brief**:
The few ideas every later section of a walk uses, at most ten, each defined once and folded under the intent. Each item names the glossary terms it defines, and the glossary shows the item's text for them instead of a second definition. The voice does not read it.
_On the page_: its title, which names the ideas it holds, such as `the ten ideas behind the stack`, a line on who opens it, and each idea's name
_Avoid_: prerequisites, primer

**Chapter**:
The part of the walk for one PR, or for one flow of a large PR.
_On the page_: the PR's number and title
_Avoid_: section, page, act

**Close**:
The walk's last part: the flow once more, the questions, the claims, the flags, the files several PRs change, the glossary and the coverage ledger.
_On the page_: `close`, with `end` where the rail puts a number

**Section**:
One part of the opening or the close: its head, or what sits under one of its headings. `↓` and `↑` read the opening and the close by section, the way they read a chapter by stop.
_On the page_: the heading, `what changes`, `the whole flow`, `the layers`, `every question`
_Avoid_: block, panel

### Inside a chapter

**Stop**:
One frame of the call stack as it wakes, with the code that decides it.
_On the page_: `stop` in counts, help and hints, which the chapter's walk defines (`each stop is a frame waking up, in the order the code runs`); a link names one by its number and title. Controls act on it without naming it: `mark reviewed`, `comment`.
_Avoid_: step (a Talent Agents term), card, node

**Wake**:
What calls a stop: the caller's line and how it calls.
_On the page_: `via call from …`

**Trail**:
The frames above a stop, each with the layer that introduced it.
_On the page_: the call stack

**Gist**:
The one sentence that says what a stop or a chapter does.

**Detail**:
What the gist, the code and the branch cards leave out: the reason for the shape, the invariant, what breaks.

**Slow down**:
The marker on the one to three stops per chapter where the risk sits.
_On the page_: `slow down`

**Decision**:
The question a stop answers before control forks.

**Branch**:
One outcome of a decision, with the stops that follow it.
_On the page_: a branch card
_Avoid_: path, case

**Flag**:
A change that makes sense only through a later layer, or through work outside the stack. Its type is dormant code, producer without a consumer yet, interim behavior, inverted order, or outside the stack. Dormant code has no caller yet, and a later layer adds one. A dormant flag that no layer completes is dead code: nothing in the stack calls it. Code behind a feature flag that is off still has a caller, so it carries no flag: its flag check is a decision. A flag no layer completes is open: it outlives the change, so it links the caveat that records when and where it closes.
_On the page_: the flag icon and its type, such as `dormant code`, with the layer that completes it, `#5983 completes it`, or, open, `completed outside the stack` and its caveat's marker; on a layer's row, `leaves N for later` and `finishes N from earlier`
_Avoid_: debt, TODO, warning

**Caveat**:
A decision the change makes knowingly imperfect, or unusual enough that a reader would stop to question it: what the code does, why it stands for now, what it costs meanwhile, the fix, and where and when the fix is planned. Every open item the page shows is one.
_On the page_: `caveat N`, a marker on each stop and hop it names and beside each open flag and claim, and its card under `known caveats`
_Avoid_: tech debt, known issue, TODO

**Claim**:
A behavior a layer states, with the layer that completes it.

### Evidence

**Diff fold**:
A diff or a file closed to its header by its caret. The reader's browser remembers it.
_On the page_: `▸` and `▾`, `fold every diff`, `open every file`

**Receipt**:
A `file:line` in a flag's evidence, with the layer whose head holds that line.
_On the page_: the `file:line` as a link, with its lens on hover

**Hunk**:
One `@@` block of one layer's `git diff -U3`, copied verbatim and cited by its id. Each layer numbers the hunks of a file on its own, so an id names a hunk only within its layer.
_Avoid_: snippet, chunk

**Home**:
The one place a hunk appears in full: a stop, a proof chip, a margin note, or a file row.
_On the page_: the stop's number and title

**Excerpt**:
A hunk shown again outside its home, cut to its focus lines.

**Proof chip**:
A test example that reaches a stop, named as written, with the branch it covers.
_On the page_: the example's name after a cyan test tube, under `proved by`

**Untested**:
A branch no test reaches.
_On the page_: `N untested` on the stop's head, and the branches under `untested`

**Margin**:
A file that serves a stop without joining the flow: a migration, a doc, a type, config or a generated file.
_On the page_: `beside`

**Housekeeping**:
A changed file no stop explains: glue, docs, fixtures or generated files. Its PR lists it after the last stop with its whole diff, and every file tags it.
_On the page_: `not in the walk`

**Every file**:
One PR's changed files in reading order, each with its whole diff. The files the walk opens start open.
_On the page_: `every file`; a test's own section leads with a cyan test tube and `test`
_Avoid_: files tab, diff view

**Reading order**:
The order every file opens in: stored data first when the PR changes it, the entry first when it does not.

### The flow

**Flow**:
Every hop of the change set, told as one story.
_On the page_: `the whole flow`

**Hop**:
One arrow of the flow: from, to, how, the layer that adds it, its proof level and the stop that explains it.
_On the page_: `hop N of M`, and a square in the dot map
_Avoid_: step, edge, beat

**Act**:
A chapter of the flow's story: the hops that answer one question, three to twelve in a stack, as few as one in a small PR.
_On the page_: `N · title`
_Avoid_: chapter, lane

**Story line**:
The sentence a hop carries, which follows from the line before it.

**Reference**:
What a reader looks up while walking: the domain model, a table of rules, a picture, questions with their answers. The domain model and the answers open the opening, under `what changes`, before the flow; the release plan follows the layers; the rest folds under `reference`. Each entry folds under its title, and the stage links it from every hop it explains.
_On the page_: `reference`, and in a hop's footer `explained in how a Plan graph reads`
_Avoid_: appendix, FAQ as a heading

**Hop subtitle**:
The line under a story line on the stage: the code that does the hop, or the reason it matters. A hop's own, or else the gist of its stop.
_Avoid_: gist (a stop's field)

**Hop footer**:
The one row under a hop's subtitle on the stage that names each thing the page holds about the hop: `code` (its PR and stop, `#9491 · 02 Route a company on Hatchet to its run`), `proof` (its proof level), `unfinished` (a flag and who completes it), `caveat` and `explained in` (each reference entry that explains it).
_On the page_: `code`, `proof`, `unfinished`, `caveat`, `explained in`

**Lane**:
The part of the system a hop runs in: setup, runtime or verify.

**Boundary**:
What a hop crosses: a process, a network, a transaction, a tenant or a deploy unit.
_On the page_: the hop's `via`, such as `kafka` or `http`

**Component**:
A part of the system a hop starts or ends at: an app, a module, a worker, a queue, a table, an external API.
_On the page_: a head of the act's diagram
_Avoid_: node (the outline's field name)

**System**:
A deployable or a store that components live in: an app, a queue, a database, an engine, the outside world, CI. Each component sits in one.
_On the page_: a band of heads in the act's diagram

**Stage**:
The box that plays one hop at a time; a run in passing plays as one.

**In passing**:
A run of hops from before the stack, inside one act, that the stage plays as one: muted, naming the components it passes, its hops listed under it. The voice reads it as one short line.
_On the page_: `in passing`, a gray dash in the dot map, a short dotted row in the act diagram

**Act diagram**:
The act on the stage, under it, as a sequence diagram: the act's components across the top, grouped by system in the outline's order, a lifeline under each, and one row per hop in story order, an arrow from caller to callee labeled with what travels. The arrow's line says whether the caller waits (solid), moves on (dashed) or sets something up before the flow runs (dotted). The rows the story has reached keep their arrows; the rows to come stay empty.
_Avoid_: timeline

**What travels**:
A hop's payload, command or row, as its `label` names it.
_On the page_: the label over the hop's arrow, after its boundary (`http · POST draft/publish`)

**Navigator**:
The control bottom right that steps the walk: top, back, where the reader is over a tick per item of the level, forward, bottom, and reviewed.
_On the page_: `home`, `j ←`, `#5983 · 04/30`, `k →`, `end`, `x reviewed`

**Dot map**:
Every hop the stack adds as a square, and every run in passing as a gray dash, one row per act.

**Proof level**:
How far a hop is shown to work: a test reaches it, only its code exists, or a recorded run shows it.
_On the page_: `tested`, `code only`, `recorded`
_Avoid_: assembled (the outline's value for code only)

**Scene**:
An animated diagram of a mechanism that happens in time: a race, a retry, a lease.

### Checking yourself

**Question**:
One of four to eight questions a reader answers by reading the code or using the product, with the stops that answer it.

**Answer quote**:
The words in a stop that answer a question. The question shows them under `answer`, and the link after them lands on them in the stop, lit.
_On the page_: a quoted sentence under `answer`

**Card**:
A question on one face and its answer on the other.

### Reading and marking

**Reviewed**:
A stop the reader marked. The marks are the reader's own.
_On the page_: `mark reviewed`; in the rail, a tick after the stop's number

**Celebration**:
The confetti and the `chapter` or `finale` cue when a mark finishes a chapter or the stack.
_Avoid_: reward, achievement

**Start over**:
The two resets in the key sheet: folds back to their defaults, and review marks cleared, saved progress included. Each acts on the open PR, or on the whole walk from the opening and the close.
_On the page_: `reset #5983's folds` and `clear #5983's review marks` in a PR; `reset every fold` and `clear every review mark` on the opening and the close

**Comment**:
A claude.ai comment thread on one spot of the page.
_On the page_: `comment`
_Avoid_: note, annotation

**Anchor**:
The words that name a comment's spot, readable without the page.

**Spot**:
What one comment can anchor to: a line or a range, a stop, a flag, a takeaway, a claim, a hop, a component of the act's diagram, a rail row, or any block that holds words. Every element of the content and the rail belongs to one.
_On the page_: the dashed ring in comment mode

**Peek**:
The small panel that says what a link opens or what a term means, with only what the screen does not show.
_Avoid_: tooltip in prose, popover, hover card

**Lens**:
The peek of a call site's `file:line` link: ten lines of the file at its layer's head, the linked line lit and the lines the layer adds marked.
_On the page_: the file and its PR above the lines
_Avoid_: preview, snippet

**Back pill**:
The control that returns to where the last link started.
_On the page_: `back`

**Glossary term**:
A word the stack uses in its own sense, marked in prose where it first appears.

### A hand-painted page

A page an agent writes by hand walks with the review page's keys through `page.js` ([`kits/interactivity.md`](kits/interactivity.md#hand-painted-pages)). Its words for what the reader moves through:

**Part**:
What `k` and `j` step through on a hand-painted page: a heading, a group or an item.
_Avoid_: stop, which is a review page's part

**Group**:
The items under one head, folded as one: `z` folds or opens them all.
_On the page_: the group's own title, and `3 of 7 reviewed` once the reader marks one
_Avoid_: section, which is a part of a review page's opening or close

**Item**:
The part a reader marks reviewed on a hand-painted page.
_On the page_: `reviewed` once marked

### Sound and voice

**Cue**:
A short sound with one meaning.
_Avoid_: effect, beep

**Family**:
The cues that share a job: navigation, marks, settings, surfaces, disclosure, conversation, diagram.

**Narration**:
The whole flow read aloud: an intro, each act's title, each story line, an outro. `listen` is the toggle that turns it on; `play` plays it.
_On the page_: `listen`
_Avoid_: voiceover, podcast, audio mode

**Clip**:
One narration line recorded when the page is built.

**Voice**:
Who reads the narration: the recording, or OpenAI with the reader's own key. A page with neither has no voice.
_On the page_: `voice · marin, recorded`, `voice · marin, OpenAI`

**Keycap**:
A key drawn on screen: in the keys sheet, and in running text that names a key (`press ? for every key`). A control never carries one; its tooltip names its key.
