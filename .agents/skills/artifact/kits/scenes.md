# Scenes

Read this before a page animates a mechanism. A scene is a short animated diagram in the style of 3Blue1Brown's explainers: a few persistent objects on a dark stage, changed one step at a time, one caption per step. The runtime is `WTScene` in [`walkthrough/runtime/motion.js`](../walkthrough/runtime/motion.js); its timing and sound rules are in [`motion-sound.md`](motion-sound.md).

## When a scene helps

- The mechanism happens in time or in an order a static figure cannot show: a race, a retry, a lease that expires, a pointer that moves while a run holds the old value, two deliveries that arrive out of order.
- A straight call chain gets no scene. The stack view already shows it.
- One scene per mechanism, on the stop that explains it (`scene` on the stop). A page carries a handful.

## Grammar

- **Persistent objects.** `setup` draws every object once; each step changes them. The reader tracks identity: the row that reads `pending` is the same row that turns `done`. A scene never cuts to a new diagram.
- **Draw on.** A new path or box writes itself (`draw`), the way a pen draws it, so the eye sees where it starts and where it ends.
- **Parts move together.** An object made of parts animates as one piece on one clock. A wire's head rides the pen's tip as the line draws (`draw(path, ms, { head })`), a label appears as the tip passes it, and the node at the end lights when the tip arrives. A part that sits still while its whole moves, or pops in after the motion ends, reads as a separate object.
- **Move to show where a value goes.** A value that goes somewhere travels there (`move`, `travel`). A message is a dot on its path, and its travel sound lasts as long as the trip.
- **Flash to point.** `flash` pulses the object the caption names. One flash per step.
- **One color per concept.** Shapes take a class, never a hex code: `box`, `wire`, `dot`, `label` and `note` draw objects in ink on hairlines, with mute scaffolding; `val` is a value inside a box, `head` an arrow's head, `frame` a dashed boundary, `ghost` what is gone or not yet there, and `bar` a filled level. A role class adds the concept: `fail` (candy) for what fails or is refused, `active` (purple) for the current holder or step, `added` (mint) for what the change adds. The `--l*` ramp marks layer identity. A color keeps its meaning for the whole scene. `role` swaps a shape's role mid-scene.
- **The caption states the claim.** Each caption is one short sentence about what the step shows, and the picture shows nothing the caption does not say.
- **Real names only.** Every label is a name or value from the code: columns, keys, status names, durations, error codes. The extractor's `facts` list supplies them. The scene explains; the hunk beside it proves.
- **The end state explains.** The last frame holds the whole story, so a reader with reduced motion, or one who jumps to the end, still gets it.

## Controls

- A play cover sits over the stage until the reader starts the scene. That click also starts audio.
- `space` plays or pauses the scene on screen, `←` and `→` step it while focus is in it (its cover or its controls; elsewhere they step the walk's stops), `home` and `end` seek its first and last step, `r` replays, and the scrub dots seek to a step. A step pressed while another draws waits its turn.
- A pause keeps the step on screen and its hold where it stopped: play runs the rest of the hold, and the step never draws again.
- While a scene plays, the next scrub segment fills on every frame with the step's reading clock. The clock stops while the pointer is over the scene, except for the pointer that just pressed play, and while focus sits in the scene's text.
- A scene that leaves the screen pauses. Nothing plays on load.
- The prerendered page lists every caption under the stage, so the steps read without JavaScript.

## Definition

A scenes file assigns `window.WT_SCENES`, keyed by the scene id the stops cite:

```js
window.WT_SCENES = {
  'kafka-inbox': {
    title: 'One talent, one partition',
    width: 640,
    height: 360,
    setup(svg, api) {
      api.el('rect', { id: 'p0', x: 40, y: 60, width: 160, height: 40, class: 'box' });
      api.el('path', { id: 'route', d: 'M200 80 H440', class: 'wire', opacity: 0 });
      api.el('circle', { id: 'msg', r: 5, opacity: 0, class: 'dot active' });
    },
    steps: [
      {
        caption: 'The producer keys the command by <code>talentUuid</code>.',
        run: async (api) => {
          await api.draw('#route');
          await api.travel('#msg', '#route', 900);
          api.cue('contact');
        },
        hold: 1400,
      },
    ],
  },
};
```

- `setup` draws the first frame. An object that appears later starts at `opacity="0"`.
- Each `run` animates to its end state, and reaches the same state at once when `api.instant` is true. Seeking to step k rebuilds the stage and replays steps 1 to k instantly, so a step sets its state from fixed values, never from timers or random numbers.
- `hold` is how long the finished step stays before the next one plays, in ms (default 1100).
- The API: `el`, `$`, `$$`, `show`, `hide`, `draw`, `move`, `attr`, `role`, `paint`, `text`, `flash`, `travel`, `cue`, `wait`, `dur`. `cue` plays a sound only while a step animates, never during a seek, and only a diagram cue (`call`, `write`, `send`, `travel`, `contact`, `reject`, `note`, `converge`; see the [audio style guide](motion-sound.md#audio-style-guide)).
- Captions are HTML: wrap code names in `<code>`.
- The stage is an SVG with a 640 × 360 `viewBox` by default. Text is Monocraft; `label` is 13px and `note` 11px.
- `render.mjs --scenes <file>` inlines the file and prerenders each scene's title and captions. A stop that cites a scene id the file lacks renders no scene.
