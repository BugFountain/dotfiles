# Story brief: the whole flow

Fill the `{{…}}` placeholders and hand this brief to one agent after the prose pass (step 7 in the [README](README.md)). One agent writes the whole story, so its voice holds from the first hop to the last. A second agent checks it with the same brief.

---

A review page for {{SUBJECT}} opens with the whole flow: every hop the stack adds, shown one at a time on a stage, with the hops from before the stack that join them mentioned in passing. A reader steps through the hops in order, or plays them, so they must read as one story. Each beat follows from the one before it, and a reader who reads only the stage, from the first hop to the last, understands what the stack does end to end.

You write data: a verdicts file with the story's acts, one story line and one subtitle per hop, the two lines the narration opens and closes with, and the systems the act diagram bands the components in. You change no other fact.

## Paths

- Outline, read only: `{{OUTLINE}}`. The hops are `spine.hops`. Each names the stop that explains it (`stop`), and that stop's `title`, `gist` and `detail` hold the facts.
- Output: `{{OUTPUT}}`.
- Check: `{{CHECK}}` prints every hop the story misses or places twice, every subtitle that repeats its story line or another hop's, and every component no system holds or two systems hold.

## The story

- **One subject.** Follow the thing the stack builds through its life. For a workflow engine, a Plan is authored, published, installed, started, walked and finished, and then proved. Pick the subject most hops serve, and name it in the first act.
- **Acts.** One act per question the story answers, in the order the story happens: a stack runs 4–10 acts of 3–12 hops, and a small PR one or two, an act as short as its question, such as "How does a Plan get authored?". Its title is a verb phrase of 6 words at most, such as "An author drafts a Plan". Give each act the lane its hops mostly run in.
- **Order.** Inside an act, hops go in the order things happen, cause before effect. Infrastructure the subject needs, such as a worker booting, sits where the story first needs it. The proof, tests and demos, comes last, as the story's evidence.
- **Every hop, once.** Each hop sits in exactly one act.
- **The tip.** The flow tells the stack at its tip. Behavior that holds only until a later PR belongs to its chapter and the release plan, so no line says `through #N`, `from #N`, `until #N` or `since #N`. A docs-only layer adds no hop, and a component takes the name of what it does at the tip.
- **Rule before mechanism.** When several hops hold one rule, the line names the rule ([editor brief](editor-brief.md#rules)).
- **The stack's hops carry the story.** Spend the words on the hops a layer adds, the ones whose `layer` is not `base`; on a one-PR page, that PR's hops. A hop from before the stack (`layer: base`) is context. The page plays each run of them inside an act as one, muted, naming the components it passes, and the voice reads the run as one short line. A base hop's story line shows only when a reader opens the run, so keep it short, and let the next stack hop's line say what the run handed it.
- **Story lines.** One sentence per hop, 12–30 words for a stack hop and at most 12 for a hop from before the stack, present tense, active voice, plain words. It says who acts, what they do, and what it hands to the next beat.
- **Subtitles.** Under each story line the stage shows a subtitle: the hop's `sub`, or else its stop's gist. The story line says what happens, in the domain's words. The subtitle names the code that does it, or the reason it matters, and never repeats the story line. Write a `sub` for each hop whose gist restates its line, and for each hop that shares its stop with another hop. The voice never reads a subtitle, so it can carry the code names the story line leaves out.
- **Numbers and heads.** A number carries its unit. A fact that holds only at one PR's head names that PR, and a number that holds for one channel names the channel.
- **Continuity.** A line follows from the line before it. A reader never meets a name the story has not introduced, and a jump in place or time says so: "Meanwhile, the reconciler…", "Back in the catalog…".
- **Heard as well as read.** The page can read the story aloud, act titles included, so write every line to be heard: no symbol a voice would spell out, and one code name at most ([`WRITING.md`](../WRITING.md#written-to-be-heard)). The narration's intro, one to three sentences, opens on the problem the change solves, as a question a teammate would ask, and names the subject; its outro, one or two sentences, sends the reader to the pull requests below.
- **A voice, not a book.** Write it the way an engineer explains a change to a teammate: open on the problem, say why each beat matters, and let a line land on its consequence ("so a lost wake costs a minute, not a call"). Vary sentence length. Never name the page's own structure, in a story line, an act title or the narration: no "act two", "this story", chapter, episode or podcast. `check.mjs` warns on each.
- **Facts from the page only.** Take facts from the hop's `from`, `to` and `label` and from its stop's prose. Add none. One code name per sentence at most, and only when the reader needs it. No em-dashes.

## The systems

The systems band the act diagram's heads under the stage: every component a hop starts or ends at, in one system each.

- **One system per deployable or store.** An app, a queue or topic, a database, a workflow engine, the outside world (people, vendors), CI and demos. A module is a component inside its app, never a system of its own.
- **Order.** Systems go left to right in the order the subject's data first reaches them, so the story reads across the act diagram. People and the outside world go where they first act.
- **Every component, once.** Each hop's `from` and `to` sits in exactly one system. A component no system holds lands in a last column, `other`, and the check warns.
- **Titles.** At most 24 characters, in the reader's words: `Fountain AI`, `Postgres`, `talent and providers`.

## Verdicts file

```json
{
  "acts": [{ "id": "author", "title": "An author drafts a Plan", "lane": "setup", "hops": ["c812-hop-1", "c812-hop-2"] }],
  "hops": [{ "id": "c812-hop-1", "story": "An author saves a Plan, and the catalog validates its graph before it stores the graph on the version 0 draft.", "sub": "`validateWorkflowGraph`: reachability and dead ends, checked before the insert" }],
  "narration": { "intro": "How does a Plan go from a draft to a running workflow without anyone losing an edit? Here is the Plan engine, drafted, published and run.", "outro": "That is the whole flow. Each pull request below walks through the code behind it." },
  "systems": [{ "id": "app", "title": "Fountain AI", "nodes": ["Catalog", "Interpreter"] }, { "id": "db", "title": "Postgres", "nodes": ["Plan version row"] }]
}
```

`acts` replaces the story's order whole. A `hops` entry sets one hop's `story` and `sub` and nothing else. `narration` sets the intro and the outro. `systems` replaces the act diagram's systems whole.

## Before you return

Read the story lines in act order, top to bottom, as a reader would. Fix every line that names something the story has not introduced, repeats the line before it, or jumps without saying so. Then read each line with its subtitle: the two say different things. Run the check until it prints OK, and check that the file parses.

## Return

The output path, each act's title with its hop count, each system's title with its component count, and any hop or component you could not place.
