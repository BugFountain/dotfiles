# Extending the skill

Every change to what a page looks like, says or does lands in the one file that owns it, so the next agent rebuilds the page from the skill alone. Feedback on one page is a rule for every page: fix the owner, then rebuild the page.

## Owners

| Concern | Owner | Its check |
| --- | --- | --- |
| The name of a part of a page | [`DOMAIN.md`](DOMAIN.md) | Pages and briefs use that name and no other |
| How a sentence reads | [`WRITING.md`](WRITING.md), and the recipe's Voice section | `check.mjs` voice warnings on a review outline |
| What the reader sees first | [`kits/attention.md`](kits/attention.md) | The attention audit |
| Palette, type and components | `themes/<name>.md` | The theme's Done |
| What one kind of page shows and proves | `recipes/<name>.md` | The recipe's Done |
| The procedure for one kind of subject, such as a stack of PRs | `protocols/<name>.md` | The protocol's Done |
| Behavior that several pages share: motion, sound, keys, scenes, state, comments, speed | `kits/<name>.md` | The tests and budgets the kit names |
| How a review page is built | [`walkthrough/`](walkthrough/README.md): `outline.schema.json`, `check.mjs`, `views.mjs`, `runtime/` | `node --test`, `check.mjs`, `perf.mjs` |
| What an agent is asked to write | `walkthrough/*-brief.md` | The step's Done in the walkthrough README |

A file links to its neighbor instead of restating it. When two files say the same thing, the owner keeps it and the copy goes. A new top-level file gets a row in the router in [`SKILL.md`](SKILL.md), whose "Read when" names the asks that open it. A new file under `walkthrough/` gets a row in the walkthrough README's file table.

## Compose

A page is one recipe, one theme, the kits it needs, and the words of DOMAIN.md and WRITING.md. A new kind of page is a new recipe over the same theme and kits. A new look is a new theme over the same components.

A review page is data that the walkthrough renderer draws, so it is rebuilt from its outline and never edited by hand. Every other page is hand-painted: HTML an agent writes to its recipe and theme. A part that both kinds of page need lives once in `walkthrough/runtime/`, so a hand-painted page inlines the same file the renderer inlines. The page kit, `page.js` and `page.css`, is that part for the reading grammar: a hand-painted page marks its parts and gets the review page's keys, marks, folds, sound, comments and terms ([Hand-painted pages](kits/interactivity.md#hand-painted-pages)). A behavior both kinds of page share goes into the kit and the renderer's runtime together, with the same keys and words.

## Add a theme

1. Write `themes/<name>.md` with the sections of [`themes/cyberpunk.md`](themes/cyberpunk.md), in the same order, including its visual anti-patterns.
2. Make every color a token, and name each token's roles. The kits give roles to cyberpunk's hues ([`kits/attention.md`](kits/attention.md) "Grayscale first", [`kits/scenes.md`](kits/scenes.md) "Grammar"): label, warning, removed line, attention, the reader's place, added line, test and layer. Map each role to one of the new theme's tokens. Where cyberpunk makes one token play two roles, as `--bg` is both the ground and the text on candy, split it into two tokens first.
3. Restyle the existing components. A component the theme needs and none has is a component change (below).
4. For review pages, a theme covers everything the renderer paints with: the token block that opens [`walkthrough/runtime/walkthrough.css`](walkthrough/runtime/walkthrough.css), the scale that opens [`walkthrough/runtime/page.css`](walkthrough/runtime/page.css), whose `--mix-*` steps set every tint strength, the `theme-color` and font links that `render.mjs` writes, and the motif labels that `views.mjs` and `render.mjs` print. The renderer paints one theme today, so a second theme gathers those into one option `render.mjs` takes, and the markup stays as it is.

Done when:
- the minimal skeleton and one review page render in the theme at desktop and phone widths (the walkthrough README's single-PR steps build one quickly);
- each text token reaches WCAG AA contrast (4.5:1, or 3:1 for large text) against every ground it sits on, and syntax colors reach what the theme's Code section asks;
- axe, run in a browser with rendering skips turned off ([`kits/interactivity.md`](kits/interactivity.md) "Audit what renders"), reports nothing;
- a render without the new option gives the same bytes as before.

The skill has no contrast or axe tool, so compute the ratios and run axe-core directly.

## Add a recipe

A recipe is one kind of artifact: a review, an explainer, a plan, a digest.

1. Name its parts in DOMAIN.md first.
2. Write `recipes/<name>.md`: its source, its beats in reading order, what it discloses and when, its contract (the evidence, claim and coverage rules for that kind), its voice and its Done.
3. Pick how it builds. The walkthrough renderer needs a diff index, so a recipe whose subject is a changeset builds with it and may add a `kind` to `outline.schema.json`. Every other recipe is hand-painted and shows code shapes through [`show-me`](../show-me/SKILL.md).
4. Copy code by script from a pinned commit; never retype it. A recipe that shows code outside a diff adds that script beside `diff-index.mjs`.

Done when an agent with only the skill, and no context from the session that wrote the recipe, builds one page of that kind, each gap it hits becomes a rule in the recipe, and the page passes the attention audit.

## Add a kit

A kit is behavior that more than one recipe uses.

1. Write `kits/<name>.md`: when it applies, its rules and the checks that prove them.
2. Put its code in `walkthrough/runtime/` as its own file, with a behavior test, so both kinds of page can inline it.
3. It holds to the Always rules in SKILL.md and to "Static first" in [`kits/interactivity.md`](kits/interactivity.md).
4. Each new interaction gets a row in the budget table of [`kits/interactivity.md`](kits/interactivity.md#performance) and a scenario in `perf.mjs`.

## Add a component

1. Name it in DOMAIN.md first.
2. Reuse before adding: [`kits/components.md`](kits/components.md) lists the parts, and stops, hunks, rails, scenes, ledgers and folds cover most needs.
3. Data before markup. The field goes in `outline.schema.json`. When the field states something the code can confirm, `check.mjs` confirms it.
4. Its classes go into `CATALOG` in `runtime/markup.js` and its row into [`kits/components.md`](kits/components.md); a class outside the catalog fails the render, the runtime test and `page-check.mjs`. Markup goes in `views.mjs`, or in `runtime/markup.js` when the runtime or a hand-painted page draws it too, behavior in `runtime/`, and style in `walkthrough.css`, from theme tokens and the scale in `page.css` only.
5. It holds to the Always rules and the kits: it takes a comment, names its keys in `aria-keyshortcuts` for the peek and the keys sheet, reads at phone width and meets its speed budget.

## Turn feedback into the skill

1. Sort it. A fact about one page goes in that page's outline. A wrong render is a renderer bug. Anything true of every page is a rule.
2. Write the rule once, in its owner, as the behavior to produce, and delete any rule it replaces.
3. Add the check that would have caught it: a checker rule, a test, a budget or an audit row. A rule no script can check says in its owner how a reader verifies it.
4. Rebuild a page from the skill and look at it (step 12 of the [walkthrough README](walkthrough/README.md#build-a-page)).

## Done

- The change lives in its owner and nowhere else.
- The router names every new top-level file, and the walkthrough README names every new file in `walkthrough/`.
- The change's check passes, and so do the skill's tests, run with a browser as [the walkthrough README's Tests](walkthrough/README.md#tests) describes. A change to the page kit passes `page-check.mjs` and `perf.mjs` on a hand-painted page, and a change to the review page's runtime or markup passes `page-check.mjs` on a rendered review page.
- A page rebuilt from the skill alone shows the change.
