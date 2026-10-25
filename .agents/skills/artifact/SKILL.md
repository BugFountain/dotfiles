---
name: artifact
description: Self-contained HTML artifacts (explainers, PR and stack review walkthroughs, digests, plans-as-HTML). Router for recipes, kits and themes. Use whenever about to emit a self-contained HTML page. After the file exists, publish it, or host a localhost live preview where nothing publishes.
---

# Artifact

The kit for a **self-contained HTML page**. Pick a recipe, read the theme, then build.

Self-contained means one HTML file that opens as-is: inline CSS and JavaScript, no build step. The page fetches only fonts from Google Fonts and, when it needs a library, a script from a CDN a claude.ai artifact admits (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net/npm`). Everything else is inline or a data URI.

Which sections exist and what they say is the content's call. How the words read is [`WRITING.md`](WRITING.md)'s, in the vocabulary of [`DOMAIN.md`](DOMAIN.md).

## Always

1. **Read and apply the selected theme file** and [`kits/attention.md`](kits/attention.md). Default theme is [`themes/cyberpunk.md`](themes/cyberpunk.md). Its palette and components are fixed; the layout follows the content. Load every font it names the way it says.
2. **Write to [`WRITING.md`](WRITING.md) in the words of [`DOMAIN.md`](DOMAIN.md).** Every word the page shows and every brief that asks an agent to write follows them. A term the page needs and DOMAIN.md lacks goes into DOMAIN.md first.
3. On a hand-painted page, use [`show-me`](../show-me/SKILL.md) for every important code shape, `before → now`, and call stack. A review page gets its stacks and hunks from the walkthrough renderer instead.
4. For a review, build the page with the [walkthrough renderer](walkthrough/README.md) and hold the recipe's evidence, claim and coverage rules. Every other page with more than one part inlines the page kit and marks its parts, so it walks with the review page's keys, marks, folds, sound, comments and terms ([Hand-painted pages](kits/interactivity.md#hand-painted-pages)).
5. Motion shows a change of state and sound confirms the reader's own action ([`kits/motion-sound.md`](kits/motion-sound.md)): scrolling moves no focus and plays no sound. Every keyboard shortcut is listed in the `?` sheet and named in its control's `aria-keyshortcuts`, which the page's peek shows on hover and keyboard focus. A control shows one affordance, its icon or its word, and no keycap beside it.
6. **Known caveats, on every page.** Every knowingly imperfect or surprising decision the page describes, and every item it marks open, gets a caveat where the decision shows: what it does, why it stands, what it costs meanwhile, the fix, and where and when the fix is planned ([`DOMAIN.md`](DOMAIN.md), Caveat). A review page renders them from its outline; a hand-painted page writes each as the caveat card the page kit styles.
7. Before delivery, audit the page with [`kits/attention.md`](kits/attention.md) (emphasis: one primary per unit, quiet metadata, links that name their target) and against Vercel's [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) (compliance). Where the page departs from a rule, such as the theme's lowercase labels against Title Case, say which rule and why.

## Pick what to read

Read `recipes/<name>.md` before building a page. Build only from recipes, kits and themes that have a file; add a new one through [`EXTENDING.md`](EXTENDING.md).

| File | Read when |
| --- | --- |
| [`recipes/review.md`](recipes/review.md) | The ask is a PR, a stack, a reviewer guide, or a walkthrough of a changeset. **Default** for those asks. |
| [`protocols/stacked-prs.md`](protocols/stacked-prs.md) | The review subject is a stack of PRs |
| [`walkthrough/README.md`](walkthrough/README.md) | You build a review page: the pipeline, the checker, the renderer |
| [`kits/motion-sound.md`](kits/motion-sound.md) | A page moves, makes sound, or takes keyboard shortcuts |
| [`kits/scenes.md`](kits/scenes.md) | A page animates a mechanism: a race, a retry, a lease, a pointer |
| [`kits/interactivity.md`](kits/interactivity.md) | A page keeps state, shows who else is reading, or talks to Claude; a hand-painted page takes the page kit |
| [`kits/attention.md`](kits/attention.md) | Always, with the theme: what the reader sees first, and the audit before delivery |
| [`kits/components.md`](kits/components.md) | A page draws a keycap, an icon, a tag or a severity mark, or you add or change a component |
| [`WRITING.md`](WRITING.md) | Always: how every word on a page and in a brief reads |
| [`DOMAIN.md`](DOMAIN.md) | Always: the words for a walk's parts, and what the page shows for each |
| [`themes/cyberpunk.md`](themes/cyberpunk.md) | Always, unless the user names another theme file under `themes/` |
| [`EXTENDING.md`](EXTENDING.md) | You add or change a theme, recipe, kit, protocol, component, check or word the skill owns, or turn page feedback into a rule |

For a review page, read in this order: this router, the theme, the recipe, the stack protocol when the subject is a stack, then the walkthrough README. The renderer already applies the kits; read a kit when you change what the page does.

## Narrative pacing

The page is a **story the reader walks**, not an inventory they scan. A single-punch page (one claim, one block) is exempt and stays fully visible.

- **Purpose first.** Open with the one thing the reader leaves knowing: the claim, the question, or the stakes. Kicker, `h1` and lede carry it, before any inventory or evidence.
- **Beats the reader advances.** Cut the story into beats, each answering "so what happens next". The reader moves the story forward, with a click, a key or a step, and a later beat waits until the reader reaches it. The page picks the mechanism: `<details>`, stepped stops, chapters, a scene.
- **Define before use.** A page with more than a handful of terms of its own folds a brief under its intent: at most ten ideas every later section uses, one word each, each linked to where it shows, with a line on who can skip it. A term the brief does not define reads in plain words where the page first uses it.
- **Summaries say what changes and what to do.** Takeaways, a lede or a summary line state a consequence for a user, an operator or a reader and the act it asks for, define every term they use, and never report on the work itself (a PR still open, a defect found along the way).
- **Overview, then walkthrough, then detail.** Right after the opening comes the fastest map of what changes, such as a domain model and the answers to the questions the change raises; then the walk through it, step by step; then the detail a reader looks up. A reader who stops after the map already knows what the change touches.
- **A model draws whole.** A page with a data model draws every entity the reader meets and its obvious parents, one line each at most, with what the change adds or changes marked in words and color, not only the part the change touches.
- **Deciding evidence up front.** A review leads with its story and the code that decides each stated behavior. Supporting code, tests and remaining hunks come after, or behind a reveal.

## Anti-patterns

- Every beat open on load: a brochure the reader scrolls instead of a story they walk
- Theme or skill commentary in the page (`this page uses artifact`, font rundowns, composition notes)
- Motion or sound that plays on load, loops, shows no change of state, or answers a scroll
- A keyboard shortcut the `?` sheet does not list, or a keycap set beside the control it presses
- Code retyped into a review page instead of copied from the diff index

Visual anti-patterns live in the theme file.

## Publish

When the session has the Artifact tool (claude.ai), publish the page there and share the URL the tool returns. Follow the tool's own contract: its quickstart call for a new artifact, and its `artifact-capabilities` skill before declaring capabilities. What this skill adds:

- A claude.ai artifact is page content without `<!DOCTYPE>`, `<html>`, `<head>` and `<body>`. `render.mjs` emits content in that shape.
- Its CSP admits scripts from the CDNs above and fonts from Google Fonts or data URIs only, and it blocks every request to another host, OpenAI included. The theme's font rules already fit it. Files published beside the page load by relative path, which is how a recorded narration ships ([walkthrough README](walkthrough/README.md#narration)).
- A review page, and a hand-painted page with the page kit, declares the capabilities in [`kits/interactivity.md`](kits/interactivity.md).

## Live preview

After the HTML file exists on disk, host it. The file stays self-contained:
inline CSS and JavaScript, no build step, and it still opens as `file://`. The
server is transport plus hot reload for follow-up edits.

Run the helper when the session cannot publish (above) and the reader shares
this machine, or when the reader asks for a preview. A session in the cloud
publishes instead: its localhost is not the reader's. Leave the server
running. Return the URL only after the helper exits 0.

### Command

[`live-preview.sh`](live-preview.sh) sits beside this file. Call it with the
artifact path:

```sh
live-preview.sh /abs/path/to/page.html
```

The helper is the only place the server mechanism lives. Do not paste a shell
recipe here or into a reply. To change the server, its version pin, or the
session rules, edit the helper and run
[`live-preview.test.sh`](live-preview.test.sh), which also fails when a
Markdown file under this skill restates the server command.

### Contract

| Outcome | What the helper does |
| --- | --- |
| Exit 0 | Prints one line, `http://localhost:<port>/<artifact-file>`, after that path returns HTTP 200 on `127.0.0.1`. |
| Exit 1 | Prints the reason on stderr: the path is not a file, or the server never returned HTTP 200. |
| Exit 2 | Prints usage. It takes exactly one argument. |
| Reuse | One server per parent directory. A call that hits a live server for that directory prints its URL and starts nothing. A dead one is replaced. Only the helper's own session is ever killed. |
| Fallback | Without `node` and `npx` the helper serves the directory with a static server and no hot reload. |

Share the printed URL in that exact shape. Cursor Cloud port forwarding is
transport; do not invent a public URL.

### Do not

- Use `--open`, browser automation, screenshots, or recordings to host the page
- Bind `0.0.0.0` or invent a tunneled public URL
- Stop the server at the end of the turn
- Add anything to the page for the preview's sake
- Treat the preview server as a build step for the HTML
- Add the preview server to `package.json` or any lockfile, or `npm install` it

## Done

The reader gets the point without the source. The look matches the selected theme file. A multi-beat page opens on the point and lets the reader advance the later beats.

A review is done when the recipe's evidence, claim and coverage rules hold and
`check.mjs` passes. It does not issue a verdict on the reviewed change.

Delivery is done when the reply carries the published artifact URL, or, where
nothing publishes, `http://localhost:<port>/<artifact-file>` after that path
returns HTTP 200.
