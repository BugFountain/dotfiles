# Writing for artifacts

One idea per sentence. Active voice, present tense. Nothing circumstantial. That governs every word a page shows and every brief that asks an agent to write one. This file adds what pages need.

## Words

[`DOMAIN.md`](DOMAIN.md) is the approved word list. A term keeps one meaning, and the page shows the word DOMAIN.md gives it. When a document needs a term DOMAIN.md lacks, add the term there first instead of coining a synonym. DOMAIN.md holds the page's own words; a term of the code under review goes in the outline's glossary, and a run that cannot edit the skill says which word DOMAIN.md lacked.

One word, one meaning, in the glossary too. A definition that must say `not the X` means two concepts share a word, so one of them takes a new word. `check.mjs` warns when a one-word glossary term opens or ends another term.

## Say what you mean

Take the literal phrase when one exists: `this seam decides the retry branch`, not `this seam earns its keep`. A metaphor shows the writer and adds meanings the writer did not choose. Headlines, ledes, section marks and claims take the literal phrase first.

A sentence stays under 25 words. A comma, a colon or a new sentence does the work of an em-dash. `check.mjs` warns on a review outline's em-dashes and on sentences past 32 words.

## Page copy

- Labels are lowercase and human: `what's going on`, `the shape`, `what changes`. The page never names this skill, a recipe, a kit, show-me or a theme.
- A control is a verb, and it names its object only when the screen does not: `open`, `mark reviewed`, `comment`, `reset #5983's folds`, where the key sheet cannot show which PR is open. Controls, help and messages use only the words [`DOMAIN.md`](DOMAIN.md) gives a thing `_On the page_`: `stop` and `hop` show, because the walk defines them where they first appear, while `home`, `excerpt` and `lane` never do, so the reader names each thing by what it shows.
- A label that repeats what the layout already says goes. A link after a question needs no `answered at`, and a glossary term that links to where it first matters needs no `first at`.
- A heading takes a subtitle only to tell the reader what to do (`try each one, then open its answer`) or to define a word the page goes on to use (`each stop is a frame waking up, in the order the code runs`). A subtitle that restates the heading, repeats a legend, describes what the rows already show, or reassures (`your ticks stay private`) goes. When a heading needs its subtitle to make sense, rename the heading: `files several PRs change`, not `file histories`.
- A link names its destination in the destination's own words: a stop's number and title, a file, a PR. The rest of what it opens goes in its peek ([`kits/attention.md`](kits/attention.md)).
- A count carries its noun, and its parts read in stack order: `leaves 8 for later #5983 ×7 · outside the stack ×1`. A count too tight for its noun takes the noun's icon instead, never a letter: the rail shows a test tube and `1`, and says `1 test` to a screen reader, where `1t` made the reader decode it.
- A badge's peek says in one sentence what the badge means for the stop it sits on: `Code this PR adds before its caller: a later PR in the stack calls it, and the flag below names that PR.`
- A reset asks in its own words, on its own button, and says what it clears before it clears it: `clear 12 ticks and 3 answers? press again`; after, it says what happened: `Every review mark is cleared.`
- A message says what happened and what to do next: `OpenAI refused this key.`, `Paste an OpenAI API key to use this voice.`

## Rows a reader acts on

Every row, line and list item earns its place by what a reader does with it: decide, check, merge, roll back, or look up while walking. A row that restates the layout, reports on the authors' process, or lists a gap the authors could close themselves goes. A gap the page cannot close, such as a check only a person or a staging run can make, moves to where a reader acts on it: a precondition in a release plan, a caveat with its planned fix.

A section about a rule the change follows shows how the rule shaped this change: the decision it forced, the option it ruled out, the code that follows from it. A restatement of the rule alone belongs in the rule's own document, linked.

## Section titles

A section title names what the section holds, in the reader's words: `the domain model`, `the retry budget and who holds it`, `Hatchet client, hints, outages, rollout`. It never describes the reader's act or an ask: `questions a reviewer asks twice`, `what to know first`, `things to check` and `before you merge` each say what to do with the section and nothing about what is in it. A section of questions and answers takes a title that names their subject. What the reader does with a section goes in its subtitle, when it needs one (`try each one, then open its answer`). `check.mjs` warns on a reference, act or brief title built from the reader's act.

## Written to be heard

Narration is read aloud. A line is one sentence of 12 to 30 words, with every code name something a voice can say. `narration.mjs` turns a code name into words and a PR number into a spoken number. Rewrite a line that still needs a symbol read aloud.
