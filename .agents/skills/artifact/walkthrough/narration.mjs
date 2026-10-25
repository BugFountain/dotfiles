// The whole flow read aloud: an intro, each act's title where the act begins, one line per step, and an outro. A step in passing, a run of
// hops from before the stack, reads as one short line. Both voices read this one
// script, whether they play recorded clips or ask OpenAI at view time
// (kits/motion-sound.md#narration).

import { createHash } from 'node:crypto';

// How the recorded and the OpenAI voices read the script.
export const NARRATOR = {
  model: 'gpt-4o-mini-tts',
  voice: 'marin',
  instructions:
    'Talk like an engineer walking a teammate through a change you find interesting: conversational and lively, with natural emphasis on what changed and why it matters, a varied pace and short pauses between thoughts. Never sound like you are reading a book aloud. Read code names as plain words.',
};

// A code name read as words: separators become spaces, a dot inside a name
// becomes "dot", and a URL keeps only its host.
function codeWords(c) {
  const url = /^(?:https?|wss?):\/\/([^/?#]+)/.exec(c);
  if (url) return url[1];
  return c
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, '$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\.(?=\w)/g, ' dot ')
    .replace(/=/g, ' equals ')
    .replace(/[_\-/\\]+/g, ' ')
    .replace(/[(){}[\]<>:;,*`'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Speech for a line written to be read. Code names become words, a PR number
// reads as a number, and markup a voice would spell out goes.
export function spoken(text) {
  return String(text ?? '')
    .replace(/`([^`]+)`/g, (_, c) => codeWords(c))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#(\d{3,6})\b/g, (_, n) => `PR ${n.length === 4 ? `${n.slice(0, 2)} ${n.slice(2)}` : n}`)
    .replace(/\bN\+1\b/g, 'N plus one')
    .replace(/\s*→\s*/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim();
}

// An act's title reads as a plain transition; a listener never hears the page's
// own structure named.
const actLine = (title) => `${spoken(title)}.`.replace(/\.\.$/, '.');

// A run in passing reads as the parts it touches, named once each in order,
// so the voice moves on quickly to what the change does.
function passingLine(step, whose) {
  const names = [...new Set(step.hops.flatMap((h) => [h.from, h.to]))];
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `Unchanged by this ${whose}: ${list}.`;
}

// The script in playing order, over the player's steps (flowSteps). `hop`
// names the step a segment belongs to: an act's title plays with the act's
// first step, the intro before the first step and the outro after the last.
export function narrationScript(outline, hops) {
  const n = outline.spine.narration;
  const segments = [];
  if (!hops.length) return segments;
  segments.push({ kind: 'intro', hop: 0, text: spoken(n?.intro ?? `${outline.title}.`) });
  hops.forEach((h, i) => {
    if (h.act && (i === 0 || hops[i - 1].act !== h.act)) segments.push({ kind: 'act', hop: i, text: actLine(h.actTitle) });
    segments.push({ kind: 'hop', hop: i, text: spoken(h.passing ? passingLine(h, outline.layers?.length > 1 ? 'stack' : 'change') : (h.story ?? h.label)) });
  });
  segments.push({ kind: 'outro', hop: hops.length - 1, text: spoken(n?.outro ?? 'That is the whole flow.') });
  return segments;
}

// A recorded clip is named by everything that shapes its sound, so a changed
// line, voice or model renders anew and an unchanged one never does.
export function clipName(voice, text) {
  const h = createHash('sha256').update(JSON.stringify([voice.model, voice.voice, voice.instructions, text])).digest('hex');
  return `${h.slice(0, 16)}.mp3`;
}
