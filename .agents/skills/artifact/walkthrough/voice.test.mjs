// A paused narration resumes where the voice stopped: the same line at the
// same second on the same hop, and a new hop's first line from its start
// after a step (kits/motion-sound.md#narration).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const win = {};
runInNewContext(readFileSync(new URL('./runtime/voice.js', import.meta.url), 'utf8'), { window: win });
const { resume } = win.WTVoice;

test('a pause on the same hop resumes the line at the second it reached', () => {
  const at = resume({ i: 4, k: 1, t: 2.35, dur: 6.1, intro: false }, 4);
  assert.deepEqual({ ...at }, { i: 4, k: 1, t: 2.35, intro: false, fresh: false });
});

test('a step while paused starts the new hop at its first line', () => {
  const at = resume({ i: 4, k: 1, t: 2.35, dur: 6.1, intro: false }, 5);
  assert.deepEqual({ ...at }, { i: 5, k: 0, t: 0, intro: false, fresh: true });
  assert.equal(resume({ i: 4, k: 1, t: 2, dur: 6 }, 0).intro, true, 'a step back to the first hop opens with the intro again');
});

test('a pause at the very end of a line resumes on the next line', () => {
  const at = resume({ i: 2, k: 0, t: 5.95, dur: 6, intro: true }, 2);
  assert.equal(at.k, 1);
  assert.equal(at.t, 0);
  assert.equal(at.intro, true);
});
