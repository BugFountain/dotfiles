# Editor brief: the prose pass

Fill the `{{…}}` placeholders and hand this brief to the agents of step 6 in the [README](README.md), after the verdicts are merged. Give each agent about 3,000 words of stop prose. Each writes its own verdicts file, and `assemble.mjs` applies the editor files last.

---

A review page for {{SUBJECT}} walks each PR as stops: the frames of its call stack, in the order they run. Verifiers have checked the facts. Your job is the writing: every stop says its point once, in plain words, so a reader who has never seen this code can follow it.

You write data: a verdicts file of corrected prose. You never change a fact.

## Paths

- Outline, read only: `{{OUTLINE}}`. Your chapters: {{CHAPTERS}}.
- Output: `{{OUTPUT}}`.

## What each field is for

A stop shows its fields in this order, so each sentence belongs to one of them:

| Field | Job | Length |
| --- | --- | --- |
| `title` | The frame's behavior, verb first. The rail shows it on two lines. | 3–7 words, 50 characters at most |
| `gist` | What this frame does, for a reader who reads nothing else | One sentence, 25 words at most |
| `detail` | What the gist, the code and the branch cards leave out: why it has this shape, the invariant it keeps, what breaks if it is wrong | 2–4 sentences |
| `slowDown` | The one risk a reviewer must weigh here | One sentence, or `null` |
| `untested` | Each path no test reaches | One line each |
| `transition` | How the next stop wakes, when the call site does not show it | 15 words at most, or `""` |

The stop also shows its call site, its payload shapes, its flags, its branch cards (each branch's label and outcome) and its evidence. Prose never repeats them.

A chapter has a `gist` (one sentence), an `intent` (2–4 sentences: the problem the PR solves and the constraint that shapes it) and `takeaways` (3–5 sentences, each with a severity).

## Rules

- **Rule before mechanism.** When three or more hops, guarantees or terms hold one rule, state the rule once and list them as its holders, under the name the page's known caveats already give it.
- **Say it once.** Delete a sentence that restates the gist, a branch card, a flag, the slow-down or the call site. Merge two sentences that say one thing.
- **Keep every fact.** A fact that lives only in a sentence you cut moves into a sentence you keep. When you cannot tell whether a sentence is redundant, keep it.
- **Add nothing.** No claim, number or name the outline does not already state. What a flag, a claim or a branch card says stays as it is.
- **One code name per sentence**, two at most. Name the concept in words, then give its code name once: "the inbox row, `ex_talent_workflow_command`".
- **Log codes stay in the evidence.** Prose says "logs the failure", never `#7973989e`: a hash beside `#4080` reads as a PR number.
- **Numbers carry units a person reads.** `640m` becomes "640 minutes (10h40m)".
- **Chapter intent** leads with the problem. No ticket links (the chapter header shows the ticket), no stack plumbing ("Stacked on …"), no naming history.
- **Takeaways** say what a reviewer must know before approving: the risk, the guarantee, the thing that waits for a later PR. `warning` marks a risk to production or to a guarantee, `important` a contract or behavior a reviewer must confirm, `info` context. List them warnings first.
- **Voice:** present tense, active voice, plain words, 25 words a sentence at most. No em-dashes. No grading or selling words.

## Verdicts file

```json
{
  "stops": [{ "id": "c812-s4", "title": "…", "gist": "…", "detail": "…", "slowDown": null, "untested": ["…"], "transition": "" }],
  "chapters": [{ "id": "c812", "gist": "…", "intent": "…", "takeaways": [{ "text": "…", "severity": "warning" }] }]
}
```

Give only the fields you change. `null` clears `slowDown`; `""` clears `transition`. Leave out a stop you do not change.

## Answer quotes

A question at the end of a chapter links the stops that answer it, and the page lands the reader on the words that answer it. After your edits, quote those words:

- For each question in `qa`, one `look` entry per linked stop that answers it: `{ "stop": "<id>", "quote": "<words>" }`. Leave out a stop that only sets the scene. An author who writes a chapter alone puts these entries in the chapter's own `qa` items; a verdict's entry replaces the chapter's.
- For each card in `selfCheck`, the words in its `stop` that back its answer.
- A quote is one sentence or clause copied exactly from the stop's final prose: its gist, call-site note, slow-down, detail, a flag's text, the decision's question or a branch outcome, an untested line, or its transition. It is 12–240 characters on one line, keeps each code span and emphasis whole (an asterisk inside code is text), and starts after any bullet marker.
- Copy from your edited prose, not the outline's old prose: `check.mjs` fails a quote it cannot find word for word.
- The quote answers the question itself, not its neighborhood. When no sentence in the linked stops answers it, quote nothing for that stop and name the question in your return: the fix is a sentence in the stop, checked against the code, and a near miss lands the reader on the wrong words.

```json
{
  "looks": [
    { "chapter": "c812", "qa": 0, "look": [{ "stop": "c812-s4", "quote": "…" }] },
    { "chapter": "c812", "card": 1, "quote": "…" }
  ]
}
```

`qa` and `card` count from 0 in the chapter's `qa` and `selfCheck` arrays.

## Before you return

For each stop you changed, list the facts in its old prose and find each one in the new prose, the branch cards, the flags or the call site. Put back any fact with no home. Check that the file parses.

## Return

The output path, how many stops and chapters you changed, how many questions and cards you quoted, every question no sentence answers, and every fact you moved from one field to another.
