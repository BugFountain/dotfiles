# Walkthrough renderer

A review page is data plus one shared renderer. Agents write an outline; scripts index the diff, check the outline against it, and draw the page. No model retypes code: an outline cites each hunk by id, and the renderer copies its text from the index.

The page traces the change the way control flows. Each **stop** is one frame of the call stack waking up, in runtime order, with the stack of frames that led to it. The [`review`](../recipes/review.md) recipe says what a page must show; this folder is how it is built.

| File | Job |
| --- | --- |
| [`diff-index.mjs`](diff-index.mjs) | Indexes one base..head range into files and hunks with stable ids (`path#hN`) |
| [`outline.schema.json`](outline.schema.json) | The outline format: layers, spine, chapters, stops |
| [`extractor-brief.md`](extractor-brief.md) | The brief for an agent that writes one layer's chapter |
| [`verifier-brief.md`](verifier-brief.md) | The brief for the agents that check flags, claims and the map across layers |
| [`editor-brief.md`](editor-brief.md) | The brief for the agents that tighten the prose once the facts hold |
| [`story-brief.md`](story-brief.md) | The brief for the agent that tells the whole flow as one story |
| [`check.mjs`](check.mjs) | Verifies an outline or one chapter against the index and the code |
| [`assemble.mjs`](assemble.mjs) | Merges chapter files, a stack file and cross-layer verdicts into one outline |
| [`render.mjs`](render.mjs) | Prerenders the page and inlines the runtime, the fonts and the scenes |
| [`views.mjs`](views.mjs) | The HTML for every component |
| [`catalog.mjs`](catalog.mjs) | The checks that keep a page inside the catalog: `render.mjs`'s refusal, the runtime and stylesheet tests, `page-check.mjs`'s walk |
| [`syntax.mjs`](syntax.mjs) | Syntax colors and word-level change marks for diff lines, and colors for a picture or a payload shape, without changing a character |
| [`touch-type.mjs`](touch-type.mjs) | The phone's type floor: lifts every runtime CSS size under 14 px ([Touch](../kits/interactivity.md#touch)) |
| [`narration.mjs`](narration.mjs) | The flow's script read aloud, and the speech form of a written line |
| [`narrate.mjs`](narrate.mjs) | Records the narration with OpenAI text to speech, one clip per line |
| [`files.mjs`](files.mjs) | Every changed file of a layer in a reading order: tiers, test pairing, the default order |
| [`runtime/`](runtime/) | CSS, motion, the juice, sound, the glossary filter, the confetti, where a paused narration resumes, the layers, the shared markup, the shortcut a keydown names (`keys.js`), the height every fold opens and closes by (`disclose.js`), the way back from every jump (`trail.js`) and the page behavior; `markup.js` draws the parts both the prerendered page and the runtime draw ([`kits/components.md`](../kits/components.md)); `page.js` and `page.css` are the page kit a hand-painted page inlines |
| [`page-check.mjs`](page-check.mjs) | Drives a page in Chrome: each page-kit key on a hand-painted page; on a review page every listed key as typed and a jump back by `b` and Back; on both, that what acts looks like it acts |

## Build a page

Work in a scratch folder (`<work>` below). Each step ends on its check. An agent step gets a second agent only when a second reader raises quality: one that restores the facts an edit dropped, or one that reads a story in order. A fact a script checks needs no second agent: `check.mjs` already proves every hunk's home and every call site.

The steps scale with the change. A stack runs every step, with agents where they say. One PR small enough for one reader (a few hundred changed lines) takes one author through steps 4, 6 and 7 with no second agent, and skips step 5, which judges only statements across layers. The checks at the end of each step still hold.

1. **Resolve the layers.** Take them from the stack GitHub registers (`gh stack view --json`, or `GET /repos/{owner}/{repo}/stacks?pull_request=<n>` where GraphQL is blocked), every PR in it included: a PR someone else owns, such as a rule the stack follows, is still a layer with its own chapter. One layer per PR, bottom of the stack first: its id, PR number, title, ticket, base SHA and head SHA. Each layer's base is the head of the layer below it; the bottom layer's base is its merge base with the target branch. Fetch every base and head commit. Done when `git cat-file -e <sha>^{commit}` passes for each.
2. **Index each layer.** `node diff-index.mjs --base <base> --head <head> --out <work>/layers/<id> --layer <id> --repo <repo>`. Done when each `index.md` lists the file and churn counts GitHub shows for that PR.
3. **Seed call trees (optional).** `npx calldiff@0.5.0 diff <base> <head> <source dirs> --locs --format md` beside each index gives syntactic call trees through the changed files. They are leads for the extractor, never proof.
4. **Extract chapters.** One agent per layer (small layers may share one), each given [`extractor-brief.md`](extractor-brief.md) with the placeholders filled. Each writes `<work>/out/chapter-<id>.json`. Done when `node check.mjs --chapter <file> --layer <id> --layers <work>/layers --repo <repo>` prints `OK` for every file.
5. **Verify across layers.** Agents given [`verifier-brief.md`](verifier-brief.md) read every chapter and the later layers' code and write verdicts files (shape below). Done when every flag is `confirmed` or `dropped` with evidence at both ends, every `later` claim names the layer that completes it (a claim no layer completes reads `open`), every hop's `proof` holds, and node names agree across chapters.
6. **Edit the prose.** Agents given [`editor-brief.md`](editor-brief.md), about 3,000 words of stop prose each, write `<work>/verdicts-edit-*.json`: the tightened prose, and a quote of the words that answer each question and card. A second agent given the same brief compares each edited stop with its verified text and restores every fact the edit dropped: a number, a name, a condition, a branch. Pass the files after the verifiers' files, so an edit lands on verified text. Done when every title fits two rail lines, `check.mjs` prints no voice warning the edit introduced, and its `answers:` warning is gone.
7. **Tell the flow as a story.** One agent given [`story-brief.md`](story-brief.md) orders every hop into acts, writes one story line per hop and the narration's intro and outro, so the whole flow reads as one story from the first hop to the last. The story spends its words on the stack's hops; the page and the voice mention each run of hops from before the stack in passing, as one. The agent also groups every component into the systems the act diagram draws. A second agent checks each line against its stop and reads the lines in order. Its `<work>/verdicts-story.json` goes last in `--verdicts`. Done when `check.mjs` places every hop in exactly one act and every component in exactly one system, and prints no `story:` or `systems:` warning.
8. **Write the stack file.** `<work>/stack.json` holds `version`, `kind`, `title`, `name` (two to four words for the browser tab), `repo`, `intro` (intent, before, after, three to five takeaways), `brief` (the ideas every section uses, shape in `outline.schema.json`; `assemble.mjs --brief <file>` takes it from its own file), `caveats` (every knowingly imperfect decision, [below](#known-caveats); `assemble.mjs --caveats <file>` takes the list from its own file), `layers` (each with an `order`: why it sits where it does, naming what it uses from the layers below; a large PR's layer also carries a `note`: what it holds and whether it splits), `reference` (what a reader looks up while walking, each entry naming the hops it explains; [below](#reference-entries); a stack's release plan is an `opening` entry), `spine.lanes` (usually `setup`, `runtime` and `verify`), and in `spine.hops` any hop no chapter owns, such as an external system calling back in.
9. **Assemble.** `node assemble.mjs --stack <work>/stack.json --chapters <work>/out --verdicts <work>/verdicts-a.json,<work>/verdicts-b.json,<work>/verdicts-edit-a.json --out <work>/outline.json`. It also writes `storyboards.json`: the extractors' scene storyboards. Done when it prints no error and no candidate flag.
10. **Write the scenes.** `<work>/scenes.js` defines `window.WT_SCENES` from the storyboards ([`kits/scenes.md`](../kits/scenes.md)).
11. **Render.** `node render.mjs --outline <work>/outline.json --layers <work>/layers --scenes <work>/scenes.js --out <work>/page.html --check --repo <repo>`, plus `--narration` when the narration is recorded ([below](#narration)). `--check` refuses an outline with errors, `--repo` gives every call-site link and evidence receipt its lens, and the renderer refuses a page where a link or a button holds another, where a GitHub link names a path its commit lacks, where a stop link shows no title, or where the markup draws what no component defines ([`catalog.mjs`](catalog.mjs)).
12. **Look at it.** Open the page at desktop and phone widths. Step through one chapter with the keys, scroll, and step again: the keys land where you are and scrolling plays nothing. Tab into the dot map, step it with the arrows and press `esc`: `→` steps the walk again. From the opening's head press `↓`: the page lands on the flow, its keyline lights, and `→` steps a hop. Press `↓` again, then Tab, and do the same in one PR's every-file view: focus goes on inside the section or the file the page landed on. Pause the flow mid-hop and play: the hop stays and its bar goes on. At desktop width the stage and its act diagram share the screen with the diagram's key, and every arrow's label shows whole. Play it from the first hop and watch each arrow grow from caller to callee while the rows build up, step back once (nothing redraws), then click one row. Press the navigator's `end` and `home`, click one tick, and fold a PR from the navigator's `z` far down its chapter. Open the key sheet in a PR and on the opening: the resets name the PR, then the whole walk. Hover one call site's `file:line` for its lens. Follow one chapter's `not in the walk` count and press `open all`. Open one PR's every-file view in both orders, open a test from its file's link, fold one diff and reload to see it stay folded, press `z` in both views, play one scene, and hover one marked term. Play the flow from the close. Follow a question's link into the longest chapter: the stop's head sits under the header once the stops around it draw. Run `walkthrough/perf.mjs` on the page: every interaction meets its budget ([Performance](../kits/interactivity.md#performance)), and Ctrl+F in a PR finds a word from its last diff. Press `↓` through a stop taller than the screen: it scrolls a screen at a time, then the next stop opens. Switch views from both tabs: the tabs land under the header each time. Turn on comment mode and point at the opening's `after` box, an act's name, a row of the act diagram and a rail row: each rings, and a comment's pin comes back to its ring. Type a glossary term's words in the wrong order. Mark a chapter's last stop for its confetti, then `clear review marks` from the key sheet. Run `walkthrough/page-check.mjs` on the page: every line reads `ok`. Check it against the [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Fix what reads wrong in the outline, not in the HTML; what the outline cannot change is a renderer bug to fix in the skill. A session with no browser runs the checks of steps 10 and 11, reads the rendered text, and says in its reply that nobody looked at the page or timed it.
13. **Deliver.** [Publish](../SKILL.md#publish) it where the session can, and host it with [Live preview](../SKILL.md#live-preview) while you iterate.

A single PR runs the same steps with one layer and `kind: "pr"`. A large PR can split into several chapters, one per flow: its chapter file then holds `chapters` instead of `chapter`.

## Narration

The page reads the flow aloud when it has a voice ([`kits/motion-sound.md`](../kits/motion-sound.md#narration)). A recorded narration gives every reader the same voice and puts no key in the page. Without one, the published page shows no listen control.

1. `node narrate.mjs --outline <work>/outline.json --out <work>/narration --dry-run` prints the script. Fix a line that reads badly aloud in the story verdicts, not in the script.
2. `OPENAI_API_KEY=… node narrate.mjs --outline <work>/outline.json --out <work>/narration` records one mp3 per line that has none yet and writes `narration.json`. Behind a proxy, prefix `NODE_USE_ENV_PROXY=1`. A line keeps its clip until its words, the voice or the model change, so a rerun records only what changed. `--page <page.html>` reads the script from a rendered page instead, such as one read back from its artifact.
3. Publish `narration.json` and each clip beside the page, at the paths the manifest names: `files: { "narration.json": "<work>/narration/narration.json", "audio/<clip>.mp3": "<work>/narration/audio/<clip>.mp3", … }`. The page finds them at load, so a page already published needs no new render. `render.mjs --narration <work>/narration/narration.json` writes the clips' names into a page rendered after the recording, so it needs no lookup at load; the clips themselves still publish beside it, because embedded they would push the page past its 16 MB limit.

Done when, with `listen` on, `play` on the published page plays the intro in the recorded voice and the stage advances with each line.

## Known caveats

A caveat is one decision the change makes knowingly imperfect ([review recipe](../recipes/review.md), Known caveats). `caveats` is a list of:

```json
{
  "id": "advisory-claim",
  "title": "A step's work starts at most once through an advisory-lock claim",
  "did": "What the code does.",
  "why": "Why it stands for now.",
  "cost": "What it costs while it stands, and what holds it meanwhile.",
  "fix": "The fix, in one sentence.",
  "planned": { "label": "invariants · Not held today", "path": "apps/…/docs/invariants.md#not-held-today" },
  "where": ["c9489-s8", "c9489-hop-stepstart"],
  "code": ["apps/…/execution-voice-agent.service.ts#claim"]
}
```

An open flag or claim, one no layer completes, stays open past the change, so it is a caveat: it carries `"caveat": "<id>"`. A flag's stop takes the caveat's marker, and the flag's box, its layer's `leaves N for later` row and the close's ledgers show the marker beside `open`; the marker previews the caveat's compact card and opens its card. `check.mjs` refuses an open flag or claim that links no caveat.

`planned` takes a repository `path` (with an optional `#anchor`) or an absolute `href`; a path and each `code` entry link at the tip, a `#symbol` to the first line that names it. `where` names stops and hops, and each carries a marker that opens the caveat. The cards draw at the reference entry that carries `"caveats": true`, in the reference's order, or last in the reference without one. `check.mjs` refuses a caveat that leaves `did`, `why`, `cost` or `fix` blank, whose `planned` lacks a label or a path or href, whose id repeats, or that names a stop or hop the page lacks.

## Reference entries

The page shows the entries in the order `reference` lists them, in three places. An entry with a `model` or with `faq` draws first, under `what changes`, right after the opening's head and before the flow, the model open: it shows fastest what changes. The `opening` entry, the release plan, follows the layers. The rest draw under `reference`. An idea every section uses goes in the brief, not in an entry ([review recipe](../recipes/review.md), Opening): the brief defines, an entry explains what a reader looks up.

An entry in `reference` holds any of these, in this order on the page:

- **`text`**: a sentence or two of prose.
- **`model`**: the domain model as a chart. Draw the whole model, not only what the stack touches: every entity the reader meets, plus its obvious parents. Each entity has an `id`, a `name` and at most one short `line`, its key fact (`one per provider call`). Each relation runs `from` the owner or the actor `to` what it owns or starts, with a `label` of a word or two (`has many`, `writes`, `starts`, `belongs to`). An entity or relation the stack adds carries `mark: "new"` and the `layer` that adds it; one it changes carries `mark: "changed"` and the layer that changes it; the rest carry neither. The chart lays itself out, owners above what they own, and each mark shows in the layer's color and in words, `new #9491`. The entry's `table` then folds under the chart: where each entity lives, who writes it, what it means.
- **`picture`**: a drawing in text, shown as written. `lang` says what it holds: `diagram` (the default) quiets the lines and arrows and colors the code names, quotes and numbers between them; a language (`ts`, `json`, `sql`, …) colors it as a diff's lines are colored; `text` stays plain.
- **`compare`**: two pictures of one thing, `before` and `after`, each with a `label` (`before · base e196deb`, `tip · #9520`) and its `picture`, colored by the entry's `lang`. They stand side by side when both fit the column, else the tip under the old. Split a before and after drawing into a pair rather than stacking both in one `picture`.
- **`table`**, **`faq`**, then **`after`**: prose under the rest.

## What the checker enforces

- The outline matches the schema.
- Every hunk has exactly one home: a stop anchor, a proof chip or a margin note with `role: "home"`, or a file-level row in `housekeeping` or `everythingElse`. Excerpts re-show part of a homed hunk. An invented hunk id is an error.
- A stop's frame symbol sits within 6 lines of its cited head-side line.
- For `via: "call"`, the caller's line, or a line within 3 of it, calls the frame's symbol: a call or `new` expression, not a definition or an assignment. A call through a lookup table or an injected function names the caller without a `line` and explains the dispatch in `wake.note`.
- A flag names a later layer (`outside-stack` and `inverted-order` excepted). Decisions and their branch stops match. Every stop reference resolves.
- A component sits in one system at most. A component no system holds, or a name in a system that no hop starts or ends at, is a warning.
- A hop's subtitle, its `sub` or else its stop's gist, is a warning when 40% of its words are already in the story line, or when another hop shows the same one.
- A reference entry holds text, a picture, a model, a table or answers, names only hops that exist, and gives every table row one cell per column. A domain model draws each entity once, its relations join only its entities, and each mark names a layer the outline holds.
- Each receipt in a flag's evidence names a line its layer's head holds; one that does not is a warning, and the page shows it as text.
- Voice lint, as warnings: em-dashes, verdict words, sentences over 32 words, a gist longer than one sentence, an emoji or a pictograph.
- The brief, as errors: each item's links and hop land on something the page draws, each glossary term an item names is in the glossary and in one item only, and a term with no `def` is named by an item.
- Reading order and words, as warnings: a glossary term the intro, before and after lines or takeaways use that the brief does not define, or a stack page with no brief whose intro uses five terms or more; a term prose writes ten times or more that marks fewer than twice; a one-word term that opens or ends another term whose definition says "not the <word>"; `through #N`, `from #N`, `until #N` or `since #N` in a hop's story or sub; an act over 12 hops; a compare label citing a commit that is no layer's base or head; a takeaway that counts (`three merges`) instead of naming.

## Tests

CI runs `live-preview.test.sh` but not this folder's `*.test.mjs` suite. An agent that changes this folder, `kits/motion-sound.md` or `live-preview.sh` runs it, and the change is not done until it passes ([`EXTENDING.md`](../EXTENDING.md#done)). Run it with a current Node.

1. Give the suite a Chrome. `browser.test.mjs`, `page-check.mjs` and `perf.mjs` load Playwright from `PLAYWRIGHT_CORE`, or from the `playwright-core` package when it is unset, and launch `CHROMIUM` when it is set, or else Playwright's own Chrome. Where neither is installed, install both outside the repository:

   ```sh
   mkdir -p "$HOME/pw" && cd "$HOME/pw" && npm init -y >/dev/null
   npm i --no-audit --no-fund playwright@1.63.0
   npx playwright install chromium --with-deps
   export PLAYWRIGHT_CORE="$HOME/pw/node_modules/playwright-core/index.mjs"
   ```

   A sandbox that already ships a Chrome needs only `CHROMIUM` set to its binary, beside a `PLAYWRIGHT_CORE` that can drive it.

2. Run the suite from the skill folder with the browser required:

   ```sh
   cd /path/to/artifact
   ARTIFACT_BROWSER_REQUIRED=1 node --test
   bash live-preview.test.sh
   ```

   Without `ARTIFACT_BROWSER_REQUIRED`, a Chrome that fails to launch skips the browser tests and the run still passes. A run counts only when its summary reads `fail 0` and `skipped 0`.

3. A change to the page kit also passes `page-check.mjs` and `perf.mjs` on a hand-painted page. A change to the review page's runtime or markup passes `page-check.mjs` on a rendered review page, and `render.mjs --check` on the outline that page came from.

## Verdicts

A verdicts file is the only way the cross-layer pass changes a chapter. Verifiers that split the work each write their own, and `--verdicts a.json,b.json` merges them:

```json
{
  "flags": [{ "stop": "c812-s6", "type": "producer-only", "status": "confirmed", "completedBy": "905", "evidence": "produces at orders.producer.ts:15; consumed at orders.consumer.ts:107 in 905" }],
  "claims": [{ "chapter": "c812", "index": 3, "state": "later", "completedBy": "905" }],
  "stops": [{ "id": "c812-s4", "detail": "Corrected prose.", "scene": "orders-inbox" }],
  "chapters": [{ "id": "c812", "takeaways": [{ "text": "Corrected takeaway.", "severity": "warning" }] }],
  "hops": [{ "id": "c812-hop-ci", "proof": "assembled", "note": "No run output shows the lane running the specs." }, { "id": "c812-hop-walk", "from": "Interpreter" }],
  "nodes": { "Kafka topic": "Kafka orders.commands" },
  "biographies": [{ "file": "src/orders/orders.service.ts", "entries": [{ "layer": "812", "summary": "One sentence on what this layer does to the file." }] }],
  "glossary": [{ "term": "Occurrence key", "def": "One sentence.", "stop": "c812-s9" }],
  "looks": [{ "chapter": "c812", "qa": 0, "look": [{ "stop": "c812-s4", "quote": "Words copied from the stop's prose." }] }, { "chapter": "c812", "card": 1, "quote": "…" }],
  "acts": [{ "id": "author", "title": "An author drafts a Plan", "lane": "setup", "hops": ["c812-hop-1", "c812-hop-2"] }],
  "systems": [{ "id": "app", "title": "Fountain AI", "nodes": ["Catalog", "Interpreter"] }]
}
```

A flag verdict matches the first unjudged flag of that `type` on that `stop`. A stop verdict replaces prose (`title`, `gist`, `detail`, `slowDown`, `untested`, `transition`), the `scene` id, or the whole `flags` list to add a flag the extractor missed. A chapter verdict replaces chapter prose (`title`, `gist`, `intent`, `before`, `after`, `entry`, `takeaways`). Neither touches a hunk citation. `glossary`, when present, replaces the merged glossary, so the verifier can merge near-duplicate terms. `biographies` covers each file that more than one layer changes. A `looks` entry sets the quote that answers one question (`qa`, an index) or one card (`card`); the page marks the quote and lands the question's link on it. `acts`, when present, replaces the story's order whole, and a hop verdict's `story` sets the line the stage shows for that hop. `systems`, when present, replaces the act diagram's systems whole.
