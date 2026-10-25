// The narration reads written lines aloud. A code name that reaches the voice
// as punctuation, or an act's title read after its first hop, makes the story
// hard to follow by ear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrationScript, spoken } from './narration.mjs';
import { flowHops } from './views.mjs';

test('turns code names and PR numbers into words a voice can say', () => {
  assert.equal(
    spoken('Publish moves the pointer, `active_version_id`, onto `talent-agents.commands` (#4156).'),
    'Publish moves the pointer, active version id, onto talent agents dot commands (PR 41 56).',
  );
  assert.equal(spoken('Burro opens `wss://api.openai.com/v1/realtime` with `executeAgent`.'), 'Burro opens api.openai.com with execute Agent.');
});

test('reads each act title before the act’s first hop, between the intro and the outro', () => {
  const hop = (id) => ({ id, from: 'a', to: 'b', via: 'call', layer: 'l1', proof: 'tested', lane: 'runtime', story: `Line ${id}.` });
  const outline = {
    title: 'Inbox',
    spine: {
      lanes: [{ id: 'runtime', title: 'Runtime' }],
      hops: [hop('h1'), hop('h2'), hop('h3')],
      acts: [
        { id: 'a1', title: 'A command arrives', hops: ['h1', 'h2'] },
        { id: 'a2', title: 'The inbox settles it', hops: ['h3'] },
      ],
    },
  };
  const script = narrationScript(outline, flowHops(outline)).map((s) => `${s.kind}@${s.hop}: ${s.text}`);
  assert.deepEqual(script, [
    'intro@0: Inbox.',
    'act@0: A command arrives.',
    'hop@0: Line h1.',
    'hop@1: Line h2.',
    'act@2: The inbox settles it.',
    'hop@2: Line h3.',
    'outro@2: That is the whole flow.',
  ]);
});
