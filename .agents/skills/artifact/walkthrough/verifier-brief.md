# Verifier brief: the cross-layer pass

Fill the `{{…}}` placeholders and hand this brief to the agents of step 5 in the [README](README.md). Split the work by scope when the stack is large: one agent per few layers for flags, claims and defect statements, and one for the spine, the histories and the glossary. Each writes its own verdicts file; `assemble.mjs --verdicts a.json,b.json` merges them.

---

Extractor agents each wrote one chapter of an interactive review page for {{SUBJECT}} in `{{OWNER}}/{{REPO_NAME}}`. Each chapter traces one PR's data flow as stops, the frames of the call stack waking up. A checker already proved the mechanical facts: every hunk has one home, and every frame and call site sits at its cited line. Your job is the judgment the checker cannot make: are the cross-layer statements true?

You write data, not HTML: a verdicts file that the merge script applies to the chapters. You never edit a chapter file.

## Paths

- Chapters: `{{WORK}}/out/chapter-<layer>.json` (keys `chapter`, `hops`, `glossary`, `scenes`).
- Diff materials per layer: `{{WORK}}/layers/<layer>/` (`index.md` first, then `patch.diff` and `hunks.json`).
- Repo: `{{REPO}}`, with every layer's base and head commit fetched. Read code at a head: `git -C {{REPO}} show <head>:<path> | cat -n | sed -n 'A,Bp'`. Search at a head: `git -C {{REPO}} grep -n '<pattern>' <head> -- <dir>`. Leave the working tree and branches as they are.
- Schema: `{{SKILL}}/walkthrough/outline.schema.json`.
- The product area's glossary, when the repo has one: {{GLOSSARY}}.

## The layers, bottom to top

{{LAYER_TABLE}}

## Your scope

{{SCOPE}}

## Verdicts file

Write JSON to `{{OUTPUT}}`, with only the keys your scope owns:

```json
{
  "flags": [{ "stop": "<stop id>", "type": "<flag type>", "status": "confirmed | dropped", "completedBy": "<layer id or null>", "text": "<one sentence, only when you correct it>", "evidence": "<file:line what it does (layer); file:line what it does (completing layer)>" }],
  "claims": [{ "chapter": "c<layer>", "index": 0, "state": "complete | later | open", "completedBy": "<layer id, for later only>", "text": "<only when you correct it>" }],
  "stops": [{ "id": "<stop id>", "detail": "<the full corrected detail, only when a statement in it is wrong>" }],
  "chapters": [{ "id": "c<layer>", "takeaways": [{ "text": "<one sentence>", "severity": "info | important | warning" }] }],
  "hops": [{ "id": "<hop id>", "proof": "tested | assembled | recorded", "note": "<why, when you change it>", "from": "<only to fix the map>", "to": "<only to fix the map>" }],
  "nodes": { "<name as written>": "<canonical name>" },
  "biographies": [{ "file": "<path>", "entries": [{ "layer": "<layer id>", "summary": "<one sentence>" }] }],
  "glossary": [{ "term": "<term>", "def": "<one sentence>", "stop": "<stop id where a reader first meets it>" }]
}
```

A flag verdict matches the first unjudged flag of that `type` on that `stop`: give one verdict per flag, in stop order. A claim verdict names the claim by its zero-based `index` in that chapter's `claims`. Check that the file parses before you return.

## Standards

- **Flags.** A flag marks a change that makes sense only through a later PR: `dormant` (no production caller in this layer), `producer-only` (its consumer arrives later), `interim` (a later layer replaces or changes it), `inverted-order` (this layer needs a later layer to work), `outside-stack` (it depends on work outside the stack). Confirm a flag only after reading its completing end in that layer's code at its head, and write both ends into `evidence` as receipts: `file:line`, what the line does, and the layer that holds it in parentheses, one clause per end, clauses split by semicolons: `worker.service.ts:50 registers only the skeleton (4080); interpreter.service.ts:401 calls runNoWait (5983)`. The page links each receipt to a lens of that layer's head, so give the path from the repo root when a file name alone matches two files. Drop a flag that is ordinary layering (a lower layer's API used as intended by a higher layer), or whose claim the code does not bear out, and say why in `text`. Drop an `outside-stack` flag whose work now lands in a layer of the stack, such as a PR registered into the stack after the flag was written; `check.mjs` warns when one names a layer's PR. Re-point a wrong completing layer. A `dormant` flag whose code no later layer calls keeps `completedBy: null`, and its `text` says so; the page names it dead code. A flag the extractor missed comes back as a stop verdict carrying that stop's full `flags` list, the new flag `confirmed`.
- **Claims.** A `later` claim names the layer that completes it; check that the layer does. A guarantee no layer in the stack completes is `open`.
- **Defect statements.** Extractors state defects they noticed in stop `detail` prose. Re-check each against the code at that layer's head. When one is wrong or overstated, return the stop with a corrected `detail`: keep every other sentence as written and fix only the wrong one. A wrong chapter takeaway comes back the same way, as the chapter's full corrected `takeaways` list.
- **Hop proof.** `tested` means a test reaches the hop. `assembled` means only the code exists. `recorded` means a run recorded at the reviewed head SHAs shows it; a run at an older head, or one a PR body describes without a link, is `assembled`, and the `note` names the reported run. A hop only a call tree suggests is `assembled` once you find its caller's line, and is dropped when you cannot.
- **Nodes.** The opening chapter draws every hop as one end-to-end map by lane, so one hop's `to` should be the next hop's `from` where the flow continues. Fold synonyms into one canonical name each, at most 60 characters. When two chapters give one name opposite roles, or point one step at two targets, a hop verdict sets that hop's `from` or `to`.
- **Histories.** For each file that more than one layer changes, one entry per layer that changes it: one sentence on what that layer does to the file, read from that layer's hunks.
- **Glossary.** Merge the chapter glossaries into one list. Fold duplicates and near-duplicates into one term at the earliest stop where a reader meets it, and check each definition against the code and the repo glossary.

## Voice for anything you write

Plain words. Short sentences, 25 words at most, one idea each. Present tense, active voice. Describe the system as it is, never the diff. Code names in backticks, two per sentence at most. Explain without grading or selling. Commas, colons and full stops; no em-dashes.

## Return

A short summary: the output file, the count per verdict kind, every flag you dropped or re-pointed and why, every defect statement you corrected, and anything you could not confirm.
