/**
 * Hinge back-up question: when a hinge question comes in under the teacher's
 * move-on mark, the re-check needs a parallel question (same idea, new
 * wording, same trap), not the same one again. A teacher can write their own
 * back-up on the block; otherwise Ann drafts one from the original question,
 * the right answer, the teacher's misconception notes and how the class voted.
 *
 * Ann's draft runs as a text tool job (see text-tools.mjs), so the same
 * question and votes never pay for a second model call. Nothing reaches the
 * board until the teacher previews it and chooses to show it.
 */
import { TextToolError } from './text-tool-error.mjs';

export const BACKUP_MIN_OPTIONS = 2;
export const BACKUP_MAX_OPTIONS = 5;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const clip = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const HINGE_BACKUP_SYSTEM = `You write one back-up hinge question for a secondary school teacher, in the middle of a lesson.

The class has just answered a hinge question and too many got it wrong. The teacher will re-teach the idea, then ask your question to check whether the class now understands it. Re-asking the same question only tests whether students remember the answer, so yours must be a parallel question.

A good parallel question:
- tests exactly the same understanding as the original, at the same difficulty;
- uses a new example, quotation, number or scenario. Never reuse the original's example, and never ask about the original question itself;
- has the same number of answers as the original, exactly one of them right;
- keeps the same traps. Each wrong answer should carry one of the misconceptions the class showed, and the most-picked wrong answer's misconception must appear again in a fresh form;
- puts the right answer in a different position from the original;
- can be read and answered in under a minute, with answers of similar length so the right one doesn't stand out.

For each wrong answer, write a short misconception note in the teacher's voice: what a student who picks it probably thinks (for example "naming the technique is the same as explaining its effect").

Use Australian spelling. Plain text only: no markdown and no letters in front of the answers.

Reply with JSON only, no prose and no code fence, in this shape.
{"prompt":"","options":[{"text":"","right":false,"misconception":""}]}`;

/**
 * The job input, as plain text: the original question with each answer, its
 * note and its votes. Stable for the same question and votes, so it caches.
 */
export function hingeBackupSource({ prompt, options, correct_id: correctId, picks = {}, answered = 0 }) {
  const lines = [
    `Original question: ${clip(prompt, 500)}`,
    `Students who answered: ${answered}`,
    'Answers:'
  ];
  options.forEach((o, i) => {
    const right = o.id === correctId;
    const votes = Number(picks[o.id]) || 0;
    const note = right ? 'the right answer' : clip(o.misconception, 300) ? `teacher's note: ${clip(o.misconception, 300)}` : 'no misconception noted';
    lines.push(`${LETTERS[i]}. ${clip(o.text, 300)} (${votes} picked it; ${note})`);
  });
  return lines.join('\n');
}

function firstJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A back-up as the client sends it to be saved: prompt, then answers with one marked right. */
export function cleanBackupDraft(draft) {
  if (!draft || typeof draft !== 'object') return null;
  const prompt = clip(draft.prompt, 500);
  const options = (Array.isArray(draft.options) ? draft.options : [])
    .slice(0, BACKUP_MAX_OPTIONS)
    .map((o) => ({ text: clip(o?.text, 300), misconception: clip(o?.misconception, 300), right: o?.right === true }))
    .filter((o) => o.text);
  if (!prompt || options.length < BACKUP_MIN_OPTIONS) return null;
  if (options.filter((o) => o.right).length !== 1) return null;
  return { prompt, options };
}

export function parseHingeBackupResult(raw) {
  const draft = cleanBackupDraft(firstJsonObject(String(raw ?? '')));
  if (!draft) throw new TextToolError('Ann’s back-up question could not be read. Try again.');
  return draft;
}

/** Stored on the block in the draft lesson, with ids the hinge round can use. */
export function backupForBlock(blockId, draft, source) {
  const options = draft.options.map((o, i) => ({
    id: `${blockId}_bk${i}`.slice(0, 40),
    text: o.text,
    misconception: o.right ? '' : o.misconception
  }));
  const right = draft.options.findIndex((o) => o.right);
  return { prompt: draft.prompt, options, correct_id: options[right].id, source };
}
