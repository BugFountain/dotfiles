#!/usr/bin/env node
// Records the narration with OpenAI text to speech, so the published page
// plays it with no key of its own and every viewer hears the same voice.
//
//   OPENAI_API_KEY=… node narrate.mjs (--outline <outline.json> | --page <page.html>) --out <dir> [--voice marin] [--model gpt-4o-mini-tts] [--dry-run]
//
// Reads the script from an outline, or from a rendered page, which carries
// it. Writes <dir>/audio/<clip>.mp3 for each line that has no clip yet and
// <dir>/narration.json. Published beside the page, the two give it a voice
// with no new render; render.mjs --narration embeds them instead. A line
// keeps its clip until its words, the voice or the model change. Behind a
// proxy, run it with NODE_USE_ENV_PROXY=1 so Node's fetch uses HTTPS_PROXY.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './diff-index.mjs';
import { NARRATOR, clipName, narrationScript } from './narration.mjs';
import { flowSteps } from './views.mjs';

const SPEECH = 'https://api.openai.com/v1/audio/speech';

async function speak(key, voice, text) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(SPEECH, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: voice.model, voice: voice.voice, input: text, instructions: voice.instructions, response_format: 'mp3' }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`OpenAI answered ${res.status}: ${body}`);
  }
}

const scriptOf = (outline) => narrationScript(outline, flowSteps(outline));
// A rendered page carries its script in the data block the runtime reads.
function pageScript(html) {
  const m = /<script type="application\/json" id="wt-data">([\s\S]*?)<\/script>/.exec(html);
  const segments = m ? JSON.parse(m[1]).narration?.segments : null;
  if (!segments?.length) throw new Error('the page carries no narration script');
  return segments;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(args.outline || args.page) || !args.out) {
    console.error('usage: narrate.mjs (--outline <outline.json> | --page <page.html>) --out <dir> [--voice marin] [--model gpt-4o-mini-tts] [--dry-run]');
    process.exit(2);
  }
  const voice = { model: args.model ?? NARRATOR.model, voice: args.voice ?? NARRATOR.voice, instructions: NARRATOR.instructions };
  const segments = args.page ? pageScript(readFileSync(args.page, 'utf8')) : scriptOf(JSON.parse(readFileSync(args.outline, 'utf8')));
  const lines = [...new Set(segments.map((s) => s.text))];
  if (args['dry-run']) {
    for (const s of segments) console.log(`${s.kind.padEnd(5)} ${String(s.hop + 1).padStart(3)}  ${s.text}`);
    console.log(`${segments.length} segments, ${lines.length} distinct lines, ${lines.join(' ').split(/\s+/).length} words`);
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY is not set: nothing to record. --dry-run prints the script.');
    process.exit(2);
  }
  const dir = join(args.out, 'audio');
  mkdirSync(dir, { recursive: true });
  const todo = lines.filter((t) => !existsSync(join(dir, clipName(voice, t))));
  let done = 0;
  const worker = async () => {
    for (let t = todo.shift(); t !== undefined; t = todo.shift()) {
      writeFileSync(join(dir, clipName(voice, t)), await speak(key, voice, t));
      done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  writeFileSync(join(args.out, 'narration.json'), JSON.stringify({ ...voice, dir: 'audio', clips: lines.map((t) => clipName(voice, t)) }, null, 1));
  console.log(`recorded ${done} of ${lines.length} lines with ${voice.model} · ${voice.voice}; the rest were already recorded`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
