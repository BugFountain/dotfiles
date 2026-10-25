# Motion and sound

Read this before a page moves or makes a sound. The style follows anoma.ly's "OpenCode Reloaded" notes and Kit Langton's visual-effect pages: motion shows a change of state, and sound confirms an action the reader took. Both are short, quiet and optional.

The source of truth is the runtime: [`walkthrough/runtime/motion.js`](../walkthrough/runtime/motion.js) (`WTMotion`, `WTScene`) and [`walkthrough/runtime/sound.js`](../walkthrough/runtime/sound.js) (`WTSound`). A hand-painted page inlines the same two files instead of writing new ones.

## One act, one answer

Motion and sound answer the reader, never the scroll position.

- **Only an act moves the page's state.** A key, a click, a link or the address changes the current stop, opens a chapter or plays a scene. Scrolling changes nothing: no current stop, no focus, no sound, and no animation beyond the two one-time reveals under [Juice](#juice). A page with a scroll-spy feels random, because the reader cannot tell what they did.
- **One cue per act.** An act plays at most one sound, the one that names its result. `x` on the last stop of a chapter plays `chapter`, not `reviewed` and then `chapter`. A move that opens a new chapter plays `turn`, not `turn` and then a step.
- **Keys press without sound.** A pressed key moves its keycap on screen; the act it triggers makes the only sound.

## Motion

Motion answers one question: what changed? A frame that wakes slides in, a hop's edge draws from source to target, a fold opens under the control that asked. Motion that answers nothing is decoration; leave it out.

- **Durations.** 120–360 ms for interface state. A keycap press fades its colors over 90 ms each way. A scene step or a flow hop takes up to about 1 s, then holds its end state so the reader can read it.
- **Curves.** Position moves on a damped spring (`WTMotion.spring`, stiffness 260, damping 26: a small overshoot that settles). Opacity and color tween with an ease-out. Nothing bounces more than once. Animate `transform` and `opacity`.
- **One thing at a time.** The eye follows one change. Stagger several changes by 40–60 ms, in reading order.
- **Parts move together.** The parts of one object share one clock: an arrowhead rides the tip of its line, and the target lights when the tip arrives. Never animate a line while its head sits still at the end.
- **Nothing loops.** An animation plays because the reader asked for it, then stops. A scene that leaves the screen pauses.
- **Autoplay waits for reading.** A beat that advances by itself holds for its animation plus its reading time: 200 words a minute over everything it shows, plus a second to find the words (`WTMotion.readMs`). A scene step counts its caption, at most 9 s. A flow hop counts its endpoints, what travels on its arrow, its story line and its stop's gist and title, at most 22 s. The clock stops while the reader points at the stage or focuses inside it, and a bar or the next scrub segment fills on every animation frame (`WTMotion.clock`), never in steps. `←` and `→` step by hand at any time.
- **The page never jumps.** A scroll the page makes on purpose runs on one critically damped spring with scroll anchoring off, so the target lands where it was sent, and a new target mid-flight bends the motion instead of restarting it. The browser's own smooth scroll jumps a frame when a second one interrupts it. A link that opens another chapter lands on its target while the chapter slides in and holds it there, with anchoring off, until the stops around it have drawn at their real height. A trip longer than two and a half screens starts one screen short, so the spring never flies past stops it would have to render. The reader's wheel, touch, page keys and `home` or `end` stop the spring; `↑` and `↓` are the page's own and bend it.
- **A landing pulses when it could be missed.** The element a link lands on pulses a wash of purple behind its words for 1.4 s, full for its first third: an inset shadow that paints over the element's own background and under its text, so it never collides with a border or a focus ring the way an outline does. A link that opens a chapter or a view at its top does not pulse, because the whole screen changed and what it opened is the first thing on it. A landing among other things pulses, a heading included. The wash only fades a color in place, so reduced motion keeps it. Closing a fold from its end keeps the control under the pointer.
- **Every fold grows and shrinks.** A `<details>` opens by growing from its summary to its full height and closes by shrinking back, in 220 ms on the interface curve, on both kinds of page and for every fold, whoever drew it. Where the browser animates to `auto`, `page.css` does it with `::details-content` and `interpolate-size`; there every fold moves, whoever opens it. Elsewhere [`walkthrough/runtime/disclose.js`](../walkthrough/runtime/disclose.js) animates a fold its summary opens, a second press mid-way turns it back, and a fold the page opens itself, for a landing, `z` or `open all`, snaps. Reduced motion snaps every fold.
- **Reduced motion.** `prefers-reduced-motion: reduce` jumps every animation to its end state and drops the confetti. `WTMotion` does this for every tween and spring; CSS transitions need their own media query. The end state must explain on its own, so the reduced page loses the motion and keeps the meaning.

### Animate a process

A flow is a process: things happen in an order, between parts that stay put. Its picture follows how 3Blue1Brown and Kit Langton animate one ([visual-effect](https://github.com/kitlangton/visual-effect), [zio-catechism](https://github.com/kitlangton/zio-catechism), Manim's `Transform`):

- **The parts persist; each beat adds one thing.** The act's cast stands on screen from its first beat, and each beat adds one arrow and its label. Nothing is redrawn to show a change. Kit Langton's nodes keep their places and change state; 3Blue1Brown transforms an object into its next form instead of cutting to a new one.
- **What moves is what happened.** A hop's arrow grows from the caller's lifeline to the callee's in 420 ms on an ease-out curve, its head riding the tip, so its direction is the data's direction. The label fades in behind it over 220 ms, and the callee's box flashes once when the tip lands, 520 ms. Nothing else in the flow moves at that time.
- **History stays, dimmed.** Earlier beats keep their arrows and labels at half strength, and later beats hold their rows empty, so the picture builds up and never changes height.
- **The words move with the picture.** The stage's words swap in one 180 ms fade as the arrow starts, the way Kit Langton's code highlight follows the node that runs.
- **Settle; overshoot only on arrival.** Motion settles critically damped, and the one flourish is the callee's answer, the way Kit Langton keeps his bounce for completion.
- **Back and jumps draw nothing twice.** A step back shows the earlier beat whole at once. A jump shows every beat before it whole and grows only its own arrow. A held key or a fast step never leaves an arrow half grown: a step on lets the arrow still growing finish while the next one grows. Every move runs to its end or hands over to the next from where it is: a slide into a further act starts from where the heads stand mid-flight, and nothing that ends early, such as the old act's fade, cuts another move short.
- **A new act transforms the last one.** Each component the two acts share slides from its old place to its new one with its lifeline, 480 ms in and out of the motion, the way 3Blue1Brown's `Transform` carries an object into its next form. The components only the new act has fade in behind them, and the old act's other components and rows fade out over the new one in 220 ms. The new act's first arrow grows once the components land. A step during the slide lands it at once. Inside an act nothing is replaced, only added.
- **Minimal and orthogonal.** Each picture shows one idea with the fewest parts, as zio-catechism asks of every simulation. Labels carry what travels, so the key names only what a label cannot: the line (the caller waits, moves on, or sets something up) and the color (the PR that adds the hop).
- **Reduced motion keeps the meaning.** No growth, slide, flash or fade: every beat and every act lands whole, and the dimmed history and the lit heads still say where the story is.

### Juice

Small springs that answer the reader's press, never its hover ([`walkthrough/runtime/juice.js`](../walkthrough/runtime/juice.js), with its CSS in `walkthrough.css`). Each one moves `transform` or `opacity` only, reads no layout after a write, and plays once per act.

- **Squash.** A pressed button and a pressed keycap squash wide and short, and spring back past rest once on release. The keycap's color press keeps its 90 ms fade beside it.
- **Count.** A PR's churn counts up from zero the first time its row shows, its bar grows from the left with it, and the count pops as it lands. The numbers hold their width, so nothing beside them moves.
- **Shake.** A warning badge and a warning flag's head shake once, gently, the first time they show.
- **What it never does.** It never answers a hover: no card tilts, lifts, shines or follows the pointer, since a pointer passing over the page is not an act. It never loops, idles or sways, never plays a sound, and never changes a stop, a focus or a keycap's pressed state. Count and shake are the only reveals a scroll starts, each once per element per load. Reduced motion turns every one of them off.

### Celebration

Finishing a chapter or the stack is the one moment the page celebrates, because the reader earned it ([`walkthrough/runtime/confetti.js`](../walkthrough/runtime/confetti.js), `WTConfetti`).

- **Where it starts.** Two cannons sit at the middle of the screen's left and right edges and aim inward and up, so the bits arc over the reading column and fall through it. A chapter's last mark fires one volley from both. The stack's last mark fires a bigger volley, then a second one, and the finale plays the flow.
- **What falls.** Pixel shards that tumble and scanline streaks that stay level, in the theme's hues, cyan included; the stack's burst adds the glyphs 完 and 了 ("done"), and `render.mjs` adds them to the Noto Sans JP subset. Now and then a bit skips sideways for a few frames, like a bad signal. Everything fades within about two seconds, and the canvas leaves the page after the last bit lands.
- **What it never does.** It never covers a control's use (the canvas takes no pointer events), never plays on load or on a scroll, and never plays with reduced motion or in a hidden tab. The toast and the sound still say what happened.
- **The sound.** `chapter` rises through five notes and ends in a sparkle of high blips and shimmer over its tail; `finale` rings longest.

## Sound

Sound confirms the reader's own action: a step, a mark, a reveal. It never plays by itself, and it never carries meaning the screen does not also show.

- **Off by default.** A header toggle shows three states: off, armed (on, waiting for a click to start audio), and on. The choice persists in `localStorage` under `wt:sound`.
- **After a click.** Browsers start audio only after a user gesture. `WTSound.unlock()` runs on every click and key press, so the first one starts audio. A cue that cannot start within 120 ms of its trigger is dropped, never played late: a late sound reads as a bug.
- **Synthesized.** Every cue is Web Audio: a stack of layers, each a filtered noise burst or a tone with an optional pitch glide, into an optional echo tail and one master band. No audio files, so nothing to fetch, license or cache.
- **Named by event.** A cue's name is the event it confirms (`branch`, `write`, `reviewed`), never the sound it makes (`chime`, `blip`). The page calls `WTSound.play('<event>')` and the preset decides the sound.
- **Nesting carries structure.** A move into a branch plays `branch`, a move out of one plays `return`, and every other move plays `step`, so the ear follows the nesting the rail shows. `branch` and `return` are one two-note figure, up and down.
- **Cues never pile up.** A burst of cues blurs into noise, so a cue plays again only after 120 ms. A key held down repeats its move at the keyboard's rate and ticks at that one pace, whichever cues its moves play (`WTSound.hold`). A key that toggles acts once however long it is held, and past four cues sounding at once a new one is dropped.
- **Quiet and short.** Layer peaks sit near 0.05, so the loudest moment, four cues at once at full volume, peaks near −17 dBFS and nothing clips; the reader's own volume sets how loud the page is. Most cues last under 250 ms. Endings (`chapter`, `converge`, `finale`) ring longer.
- **Made for laptop speakers.** Every tone sits at 220 Hz or higher and rises over at least 4 ms. Noise passes a bandpass or a lowpass at 4 kHz or lower, never a highpass, and rises over at least 2 ms. The master passes 220 Hz to 6 kHz. A small speaker distorts on what it cannot play, a hiss above 4 kHz sounds like the crackle of a clipped signal, and a tone that reaches its peak within a cycle or two clicks. Each of these reads as saturation at any level. [`walkthrough/sound.test.mjs`](../walkthrough/sound.test.mjs) fails on a layer outside these bounds; judge a new cue on laptop speakers as well as headphones.

### Audio style guide

Every cue has one meaning. A call site plays only the cue whose row below names its event. A new kind of event gets a new cue and a row, never a borrowed one: a cue that means two things teaches the ear nothing. Cues come in families, and a family shares a timbre, so the ear learns what kind of thing happened before it learns which.

| Family | What it answers | Timbre | Loudness |
| --- | --- | --- | --- |
| Navigation | Where the reader is now | Sine and triangle tones; a branch rises and a return falls | Middle |
| Marks | What the reader recorded | Echoing chimes; adding rises, removing falls | Loudest |
| Settings | Which mode is on | Two quick sines | Middle |
| Surfaces | Which panel came or went | Noise sweeps, up to open and down to close | Soft |
| Disclosure | What opened or folded where it stands | Short bandpass clicks | Softest |
| Diagram | What the system does inside a scene | The lowest tones, from 220 Hz, filtered noise, travel sweeps | Under navigation |

- **The page's cues never narrate the system, and the diagram's never answer a control.** Stepping the flow is navigation, so every hop plays `step`, whatever it carries. A played flow that reaches its end closes on `converge`, the way a scene does. `call`, `write` and `send` play only inside a scene.
- **Opposites pair.** `open` and `close`, `unfold` and `fold`, `branch` and `return`, a mark and `unmark`: a pair shares its timbre and moves in opposite directions.
- **The loudest meaning wins.** One act plays one cue: `x` on a chapter's last stop plays `chapter`, not `reviewed`.
- **Silence beats a borrowed cue.** An act with no row makes no sound until it gets a cue of its own.
- **Checked, not remembered.** [`walkthrough/sound.test.mjs`](../walkthrough/sound.test.mjs) fails when a call site plays a cue with no preset or no row here, or when a row names a cue with no preset.

### Cues

| Family | Cue | Plays when |
| --- | --- | --- |
| Navigation | `step` | The reader moves along one line: a stop to the next main stop or to another branch, a file, a view switch, a chapter's top, the top of the current stop, a hop of the flow |
| Navigation | `branch` | A move lands on a branch stop from outside a branch |
| Navigation | `return` | A move leaves a branch for a main stop, or `b` goes back to where a link started |
| Navigation | `turn` | A new chapter opens |
| Marks | `reviewed` | The reader marks a stop reviewed |
| Marks | `checked` | The reader ticks a question |
| Marks | `unmark` | The reader removes a stop's mark or unticks a question |
| Marks | `chapter` | A mark completes a chapter |
| Marks | `finale` | A mark completes the stack, or the reader plays the finale |
| Settings | `toggle` | Sound, comment mode, the file order or the voice changes |
| Surfaces | `open` | An overlay opens |
| Surfaces | `close` | An overlay closes |
| Disclosure | `unfold` | A fold, a diff, a file or a reviewed stop's body opens, one or all at once |
| Disclosure | `fold` | The same closes |
| Disclosure | `flip` | An answer shows: a self-check card turns, or a question opens its answer |
| Diagram | `call` | A scene step wakes a function |
| Diagram | `write` | A scene step stores a value |
| Diagram | `send` | A scene step sends a message over a network or a queue |
| Diagram | `travel` (`duration`) | A dot travels a path in a scene, for as long as the trip |
| Diagram | `contact` | A scene step reaches a browser or a client |
| Diagram | `reject` | A scene shows a path refused |
| Diagram | `note` | A scene step changes an object with no other event |
| Diagram | `converge` | A scene or the flow reaches its last step |

Tune a preset in `sound.js` by ear with the page open: change one layer, reload, press the control. A new preset sits in its family's block there.

### Samples

Stay synthesized. When a cue needs a timbre synthesis cannot reach, use a CC0 sample (soundcn publishes CC0 interface sounds): embed it as a base64 string, decode it with `AudioContext.decodeAudioData`, and play it through the same master band. Decoding in the page needs no network, so it works under a claude.ai artifact's CSP. Name the sample's source and license in a comment beside the preset.

## Narration

The voice reads the whole flow: an intro, each act's title as the act begins, each stack hop's story line, one short line per run in passing (`Unchanged by this stack: WX, Execution API and Event log.`), and an outro (`walkthrough/narration.mjs`). The stage plays along, so the line being read is always on screen.

- **One playback control.** `play` (`space`) plays and pauses the flow, reads `loading…` until the voice first speaks, and a pause keeps its place: play resumes on the same hop, mid-line. `listen` (`l`) is a toggle, like a mute control, with `aria-pressed` and a speaker that shows its state: while it is on, play reads each hop aloud, and a step reads the hop it lands on once; while it is off, play and steps are silent. Turned on or off while the flow plays, the flow goes on from the start of its hop in the new mode. This browser keeps the choice.
- **Steps follow a media player.** `→` goes to the next hop and `←` to the previous one; a flow that plays plays on from there. More than three seconds into a playing hop, `←` starts that hop over, and a second `←` goes back a hop. A click on the stage's story line reads its hop again, with `listen` on or off; on a page with a voice the line shows a speaker at rest. The arrows never seek inside a line.

- **One voice at a time.** While the narrator reads, no cue plays: a hop moves in silence, and `converge` waits for the outro.
- **The line sets the pace.** A hop holds for its lines, then a 450 ms breath. The stage's bar follows the voice on every frame. Paused and resumed, the voice stays on the hop and goes on from the second it reached, mid-sentence ([`walkthrough/runtime/voice.js`](../walkthrough/runtime/voice.js)). A step starts the new hop's first line from its start. The lock screen's and a headset's play, pause and track buttons follow the same rules, through the Media Session.
- **A recorded voice or none.**
  - *Recorded*: clips `narrate.mjs` makes with OpenAI, published beside the page. Every reader hears the same voice, and the page holds no key. A recording can join a page already published: the page finds its `narration.json` beside it.
  - *OpenAI with the reader's key*: offered only where the page runs outside claude.ai, as a local copy or a live preview, because claude.ai's frame blocks requests to other hosts. The key stays in the reader's browser, and each line is made once and kept there.
  - With neither, the page has no voice: no `listen` toggle, no speaker on the story line, and `l` says so. The browser's own voice never stands in, and a line a recording lacks passes in silence.
- **Written to be heard.** A narration line follows [`WRITING.md`](../WRITING.md#written-to-be-heard).

## Keycaps

Every keyboard shortcut is listed in the keys sheet `?` opens, and the control it presses names it in `aria-keyshortcuts`, which the page's peek shows on hover and on keyboard focus (`keys.js`). A control shows one affordance, its icon or its word: a keycap beside it says the same thing twice and crowds the control. A keycap is a flat chip like every other component in the theme, drawn in the keys sheet, in a control's peek and in running text that names a key; it reads as a key by its legend, not by depth. `keycap()` in [`walkthrough/runtime/markup.js`](../walkthrough/runtime/markup.js) renders `<kbd class="key" data-key="k">` for the prerendered page, the runtime and a hand-painted page alike, `keys()` wraps a sequence, and `.key` in [`page.css`](../walkthrough/runtime/page.css) draws it ([`kits/components.md`](components.md)).

- **Size.** Keycaps sit inline with their text and scale with it: `0.78em` of the text around them (10px at least), `min-width: 1.5em`, padding `0.1em 0.4em`, radius 2px, baseline-aligned, and a sequence 0.25em apart. A keycap never sets its own pixel height.
- **Face.** `--surface-2` fill, a 1px `--hair` border, an `--ink` legend in Geist Mono. No gradient, shadow or glow.
- **Press.** Pressing a key inverts every keycap with that `data-key` on screen to a candy-2 fill with a dark legend, and presses every control on screen whose `aria-keyshortcuts` names the key: its border and word turn candy-2 and it squashes, as under a click. Releasing restores them: `WTMotion.press` and `WTMotion.release` set `data-pressed`, and the CSS fades the colors over 90 ms. Reduced motion keeps the color change and drops the fade and the squash.
- **Order.** Paired keys act in the order they sit on the keyboard: `j` and `←` go back, `k` and `→` go forward, `↑` reads up and `↓` down. The keys sheet lists them in that order, and the navigator sets its back arrow before where the reader is and its forward arrow after.
- **Where they sit.** In the keys sheet, which lists every key, and in running text that names one, such as the opening's one line `press ? for every key`. A keycap in running text is a label, not a control; its control is the key. No control carries one on any screen: the navigator's arrows, the flow's play and arrows, the header tools, the fold controls, the back control and `mark reviewed` each show their icon or their word and name their keys in their tooltip. A touch screen, one with no hover and a coarse pointer, has no keys, so the keys sheet, the flow's keyline and `press ? for every key` leave there.
- **Never while typing.** Shortcuts do nothing while focus is in an input, a textarea or an editable element, except `Escape`. Modifier combinations pass through to the browser.
- **One key, as typed.** A shortcut is one bare key. Ctrl, Alt and Meta belong to the browser; Shift counts only for the character it types, so `?` (Shift+/) is a key and Shift+J is none ([`walkthrough/runtime/keys.js`](../walkthrough/runtime/keys.js), which both kinds of page inline). Every key a keys sheet lists reaches a binding (`keys.test.mjs`).
