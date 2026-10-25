# Extractor brief: one chapter of a review walkthrough

Fill the `{{…}}` placeholders and hand this brief to one agent per layer. The agent writes data, not HTML: a renderer draws it and a checker verifies it against the real diff.

---

You write one chapter of an interactive review page for {{SUBJECT}} in `{{OWNER}}/{{REPO_NAME}}`. The page is for everyone: the author, the reviewers, and teammates new to the code. It traces the data flow. Each **stop** is one frame of the call stack waking up: a function, method or handler that runs because the frame before it called it or sent it something. Reading the stops in order is like stepping through a debugger across the change.

You never retype code: you cite hunks by id.

## Paths

- Materials per layer: `{{WORK}}/layers/<layer>/`
  - `index.md`: every changed file and hunk with its id (`path#hN`), header, churn and first changed line. Start here.
  - `patch.diff`: the layer's full diff (base..head, `git diff -M -U3`).
  - `hunks.json`: the same hunks as data.
  - `calldiff-changed.md`, when present: syntactic call trees through changed files. Leads only, never proof.
- Other layers' materials sit in the sibling folders. Read them to confirm what a later layer completes.
- Repo: `{{REPO}}`, with every layer's base and head commit fetched. Read code at the head with line numbers: `git -C {{REPO}} show <head>:<path> | cat -n | sed -n 'A,Bp'`. Search at the head: `git -C {{REPO}} grep -n '<pattern>' <head> -- <dir>`. Leave the working tree and branches as they are.
- PR title and body: {{PR_BODY_SOURCE}}
- Schema: `{{SKILL}}/walkthrough/outline.schema.json` (`$defs.chapter`, `$defs.stop`, `$defs.hop`, `$defs.term`).
- Checker: `node {{SKILL}}/walkthrough/check.mjs --chapter <your file> --layer <layer> --layers {{WORK}}/layers --repo {{REPO}}`
- Output folder: `{{WORK}}/out/`

## The layers, bottom to top

{{LAYER_TABLE}}

Each layer's diff is its own base..head. Explain only what your layer changes. Code from lower layers appears as unchanged frames in the stack, tagged with the layer that introduced it.

## Output file

Write `chapter-<layer>.json` in the output folder:

```json
{
  "layerOrder": [{{LAYER_IDS}}],
  "chapter": { "…": "$defs.chapter" },
  "hops": [{ "…": "$defs.hop" }],
  "glossary": [{ "…": "$defs.term" }],
  "scenes": [{ "id": "…", "stop": "…", "beats": ["…"], "facts": ["…"] }]
}
```

Ids: chapter `c<layer>`, stops `c<layer>-s1`, `c<layer>-s2`, …, branch ids `c<layer>-<word>`, hops `c<layer>-hop-<word>`. Lowercase letters, digits and dashes only.

Run the checker until it prints `OK`. Every error is a real defect: a hunk with no home or two homes, an invented hunk id, a frame symbol away from its line, a call site that does not call the frame, a dangling stop reference. Fix every error. Fix a warning when the fix is cheap.

## What the walk shows: architecture and data flow

A reviewer judges a change by what it does to the system before how its code reads. Choose stops, and the facts each one states, through two lenses. A hunk that serves neither earns no stop: it goes to `housekeeping`, which the page lists under `not in the walk`, one click from its full diff.

**Architecture: the parts and how they connect.**
- Components: each app, service, worker, module, queue or topic, table, cache, external API and flag the layer adds or touches. Say which are new.
- Boundaries: each crossing of a process, a network, a transaction, a tenant or a deploy unit, and whether the caller waits for the answer.
- Ownership: the one writer of each stored fact, and every reader.
- Dependencies: which way each one points, and which ones are new.
- Rollout: the flags, env vars, migrations and deploy order the change needs.

**Data flow: one datum's life through those parts.**
- Entry: where it arrives, from whom, and in what shape.
- Change: each place its shape changes, and what it drops or adds.
- Storage: the table and columns, the key, the tenancy, what is unique, and its lifecycle (draft, published, archived).
- Identity: which ids travel, where each is minted, and the keys that make a retry idempotent or keep an order.
- Consistency: transactions, delivery guarantees, retries, dedupe and ordering, and what a partial failure leaves behind.
- Exit: who reads it back, and what leaves the system in what shape.

Each fact has a field:

| Fact | Field |
| --- | --- |
| A boundary | the stop's `wake.via`, and the hop between two components |
| A component | a hop's `from` and `to`, named the same in every chapter |
| A shape | `payload.in` and `payload.out`, with only the fields that matter |
| Storage | the stop where the flow first writes the table, with the migration in its `margin` |
| Ownership | the stop that writes; its `detail` names every reader |
| Identity and consistency | `detail`, and the branch cards for duplicates, retries, races and crashes |
| Rollout | the chapter's `entry`, a `flags` entry, and `slowDown` where the order matters |

## What a stop holds

- `title`: the concept, not the file name, verb first, 3–7 words and 50 characters at most: the rail shows it on two lines. "Record the command before acting", not "Changes to inbox.repository.ts".
- `gist`: one sentence. A reader who reads nothing else understands the stop.
- `kind`: `core` for the heart of the change, `consequence` for callers and downstream updates, `support` for helpers.
- `frame`: the code that wakes. `file`, `symbol` (for example `InboxRepository.record`), and `line`, the head-side line of its definition. The checker wants the symbol's name within 6 lines of `line`.
- `wake`: how control arrives. `via` is `call` for an in-process call, or the boundary crossed (`kafka`, `http`, `hatchet`, `db`, `timer`, `browser`, `webhook`, `cli`, `queue`, `mcp`, `deploy`, `config`, `test`, `other`). `caller` names the call site: `file`, `symbol`, and `line`, the line that makes the call (across a boundary, the producer's line). For `via: "call"` the checker wants a call of the frame's name (`name(`, `.name`, `new Name`) within 3 lines of `line`. When the caller dispatches through a lookup table or an injected function, leave out `line` and explain the dispatch in `wake.note`, with the line it happens on.
- `stack`: outermost frame first, this stop's frame last. Each frame has `symbol`, `file`, `layer` (the layer that introduced it, or `base` when it predates the stack) and `changed` (does this layer change it). Keep the unchanged frames: they show where the new code runs.
- `payload`: `in` and `out`, each a `label` plus a short `shape` with only the fields that matter here (TS-like or JSON-like, under 15 lines).
- `detail`: 2–4 sentences on what the gist, the code and the branch cards leave out: why it has this shape ("X instead of Y because Z"), the invariant it keeps, and what breaks if it is wrong. Say each point once: a branch's behavior lives in its card, a risk in `slowDown`, a later layer in its flag. Log codes (`#7973989e`) stay in the evidence; prose says "logs the failure".
- `anchors`: the hunks that decide this stop. `role: "home"` the first time a hunk appears, `"excerpt"` when a later stop re-shows part of it. `focus: [start, end]` narrows a long hunk to the head-side lines that matter. `label`: one sentence on what this hunk shows that the stop's other hunks do not, never the file name. The page shows labels only on a stop with several hunks.
- `proof`: the test examples that reach this stop's branches. Cite the test file's hunk (`role: "home"` once per hunk, then `"excerpt"` with a `focus` on the example), `name` = the example name as written, `covers` = the branch it reaches.
- `untested`: branches of this stop that no test reaches. Say so plainly.
- `margin`: migrations (`kind: "migration"`, at the stop where the flow first writes that table), ADRs and docs (`adr`, `doc`), type definitions (`type`), config (`config`), generated files (`generated`).
- `flags`: see below.
- `slowDown`: one sentence where the chapter's risk concentrates. One to three stops per chapter.
- `decision` and `branch`: at a fork, the stop carries `decision: {question, branches: [{id, label, outcome}]}`. Each branch's stops follow it in `stops` with `branch: "<id>"`; the main path leaves `branch` null. Cover the failure branches this layer handles: duplicates, races, retries, crashes, kill switches. A branch that returns early wakes no new frame: its stop keeps the decision's frame and call, and its prose says what the return leaves as it was.
- `scene`: a scene id from the list below, on the stop that explains that mechanism.
- `transition`: a short line that hands off to the next stop in the flow's voice ("The consumer hands the parsed command to the inbox."). Empty on the last stop.
- `see`: related stop ids.

Order stops the way control flows at runtime: the entry point first, then each frame as it wakes. A file can wake more than once. Several hunks from several files can share a stop when they serve that frame (a type, a parser, a helper). Setup flows (publish, install, migrations) come before the runtime flow when the layer has both.

## Every hunk has exactly one home

- A home is a stop anchor, a proof chip, a margin note, or a file-level row in `housekeeping` (glue: module wiring, barrels, config, generated files, catalogs, lockfiles) or `everythingElse` (rare: changed files nothing explains).
- A file-level row owns every hunk of its file; cite none of them as a home elsewhere.
- Tests: one home per test hunk. A large new test file is one hunk: home it at the stop it proves best, then cite its other examples as excerpts.
- Docs and ADRs: a margin note on the stop they explain, or housekeeping when they explain nothing in the flow.

## Look-ahead flags

Flag a change that makes sense only through a later layer:

- `dormant`: code with no production caller in this layer. Code behind a feature flag that is off has a caller: its flag check is a decision, not a flag.
- `producer-only`: a producer (event, command, endpoint, row) whose consumer arrives in a later layer.
- `interim`: behavior a later layer replaces or changes.
- `inverted-order`: this layer needs a later layer to work; the prerequisite sits above it.
- `outside-stack`: depends on work outside the stack (another PR or ticket).

A decision the code makes knowingly imperfect, and one a reviewer would stop to question, is a known caveat, not a flag: name it in the stop's detail and list it in your return with what it does, why it stands, what it costs, the fix and where the fix is planned ([review recipe](../recipes/review.md), Known caveats).

Each flag names `completedBy` (the later layer id, or null for `outside-stack`), `status: "candidate"`, and `evidence` as `path:line` at both ends when you can find them. Confirm the completing layer by reading its index or code. Ordinary layering carries no flag: a lower layer's API used as intended by a higher one is the stack working.

## Chapter fields

- `title`, `gist` (one sentence), `intent` (why the PR exists, from the PR body and ticket), `before` and `after` (behavior, one sentence each), `entry` (what starts the flow), `takeaways` (3–5, severity `info`, `important` or `warning`; `warning` only for a behavior shift someone could miss).
- `qa`: 4–8 questions a person answers by reading the code or using the product, each linked to stops.
- `selfCheck`: 2–3 "can you answer this?" cards, each with its answer and the stop that teaches it.
- `claims`: the behavior and contract guarantees of this layer, each `complete` (with stops and test names), `later` (with `completedBy`), or `open` when no layer in the stack completes it.
- `hops` (top level): this layer's part of the end-to-end map. `label` is what travels, and the act diagram writes it over the hop's arrow: the payload, command or row first, on one line of at most 80 characters (`POST draft/publish under advisory lock 19`, `durable task input {tenant, executionId}`). `lane` is {{LANES}}. `from` and `to` use these node names where they fit: {{NODE_NAMES}}. Add a name only when none fits. `proof` is `tested` when a test reaches the hop, `assembled` when only the code exists, `recorded` when a recorded run shows it. A hop only a call tree suggests becomes a hop once you find its caller's line. `layer` is the layer that adds the hop; a hop the code made before the first layer, such as the existing caller a small fix guards, takes `base` and draws gray.
- `glossary` (top level): domain terms a newcomer meets first in this chapter, with one-sentence definitions and the stop where they first appear. Take terms and meanings from the repo's glossary when it has one ({{GLOSSARY}}).

## Scenes

These animated scenes exist:

{{SCENES}}

Set `scene` on the stop that explains the mechanism, and add a storyboard entry to `scenes`: `beats` (4–8 short steps) and `facts` (exact names and values from the code: columns, keys, durations, status names, error codes). Only set a scene your layer implements.

## Voice

- Plain words. Short sentences, 25 words at most, one idea each. Present tense, active voice.
- Describe the system as it is: "the consumer records the command", never "we added" or "this PR now".
- Code names in backticks, two per sentence at most; the sentence still reads as English with them covered.
- Explain without grading or selling: leave out elegant, robust, seamless, simply, critically, importantly, crucial, powerful and leverage.
- Commas, colons and full stops; no em-dashes.
- If you find a real bug while reading, state it in one or two sentences in that stop's detail, with the line. Explain the code; bug hunting is not the job.

## Accuracy

Every statement is true at the layer's head. Read the code; call trees and PR descriptions are leads. The checker verifies frame and call-site lines mechanically, and the cross-layer verifier re-checks flags and claims. When you are unsure, say what you could not confirm in your summary instead of guessing.

## Return

When the checker prints `OK`, return a short plain-text summary: the output file, the stop count, each flag with its completing layer, each known caveat, the checker's final line, any bug you noticed, and anything you could not confirm.
