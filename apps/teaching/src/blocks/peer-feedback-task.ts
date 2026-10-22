import { el } from '@/blocks/peer-feedback-ui';

/**
 * The teacher's prompt, read as a task card instead of one dense paragraph.
 *
 * Literacy moves, all from the text the teacher already typed:
 * - Chunking: each instruction that opens with a command word becomes its own
 *   numbered step, so a student holds one demand at a time.
 * - Command words: the opening verb is a chip. Tap it to see what that word
 *   asks for, worded to match the NESA glossary of key words.
 * - Success criteria: length and evidence demands ("One paragraph with at
 *   least one QTE/A") move into a checklist the writer and the reviewer both
 *   read, so feedback is against criteria rather than taste.
 * - Cues: a trailing "(think about …)" becomes a hint under its step.
 *
 * Anything the parser doesn't recognise stays as plain text, in order.
 */

const VERBS: Record<string, string> = {
  account: 'Explain the reasons for it, step by step.',
  analyse: 'Take it apart: show how the parts work and what they suggest.',
  assess: 'Make a judgement of its value, quality or size, with reasons.',
  compare: 'Show how the things are alike and how they differ.',
  contrast: 'Show how the things are different.',
  define: 'State exactly what it means.',
  describe: 'Say what it is like: its features and characteristics.',
  discuss: 'Weigh up the issues, points for and against.',
  evaluate: 'Judge how well it works, and back the judgement with evidence.',
  examine: 'Look closely and say what you find.',
  explain: 'Show how and why: make the cause and effect links clear.',
  identify: 'Recognise it and name it.',
  interpret: 'Draw out what it means.',
  justify: 'Back up your claim with reasons and evidence.',
  locate: 'Find it in the text and point to exactly where it is.',
  outline: 'Sketch the main features briefly.',
  summarise: 'Give the main points briefly.'
};

/** Opening words that start a new step even without a glossary entry. */
const STEP_STARTERS = new Set([...Object.keys(VERBS), 'choose', 'find', 'select', 'write', 'highlight', 'annotate', 'quote', 'use', 'consider', 'list', 'state', 'give']);

const CRITERION = /^(?:one|two|three|four|five|\d+|at least|no more than|up to|a single|include|includes|use at least|minimum|maximum|max|min)\b.*\b(?:paragraphs?|sentences?|words?|quotes?|quotations?|QTE\/?A?|examples?|techniques?|lines?)\b/i;
const HINT = /\(\s*((?:think about|consider|hint|remember|e\.g\.|for example|try)[^()]*)\)\s*\.?\s*$/i;

export type TaskStep = { verb: string | null; text: string; hint: string | null };
export type Task = { steps: TaskStep[]; criteria: string[] };

function firstWord(text: string): string {
  return (text.match(/^[A-Za-z]+/)?.[0] ?? '').toLowerCase();
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Split a line into sentences, but only break where the next sentence opens with a command word. */
function chunk(line: string): string[] {
  const sentences = line.match(/[^.!?]+(?:[.!?]+(?:\s*\))?|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [line];
  const out: string[] = [];
  for (const sentence of sentences) {
    if (out.length && !STEP_STARTERS.has(firstWord(sentence))) out[out.length - 1] += ` ${sentence}`;
    else out.push(sentence);
  }
  return out;
}

function criteriaFrom(line: string): string[] {
  return line
    .replace(/[.!]+$/, '')
    .split(/\s*[;,]\s*|\s+with\s+|\s+and\s+(?=at least|no more than|one|two|three|\d)/i)
    .map((part) => capitalise(part.trim()))
    .filter(Boolean);
}

export function parseTask(prompt: string): Task {
  const steps: TaskStep[] = [];
  const criteria: string[] = [];
  for (const line of prompt.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    if (CRITERION.test(line)) {
      criteria.push(...criteriaFrom(line));
      continue;
    }
    for (const piece of chunk(line)) {
      const hintMatch = piece.match(HINT);
      const text = (hintMatch ? piece.slice(0, hintMatch.index) : piece).trim();
      const hint = hintMatch ? capitalise(hintMatch[1]!.trim().replace(/\s+here\.?$/i, '').replace(/\.$/, '')) : null;
      const word = firstWord(text);
      steps.push({ verb: STEP_STARTERS.has(word) ? text.slice(0, word.length) : null, text, hint });
    }
  }
  return { steps, criteria };
}

/** What a command word asks for, or null when it isn't in the glossary. */
export function verbMeaning(verb: string): string | null {
  return VERBS[verb.toLowerCase()] ?? null;
}

export function taskCard(prompt: string): HTMLElement {
  const { steps, criteria } = parseTask(prompt);
  const card = el('div', 'pf-task');

  // A single step is the whole question, not step 1 of 1: no number.
  const numbered = steps.length > 1;
  const list = el('ol', numbered ? 'pf-task__steps' : 'pf-task__steps pf-task__steps--single');
  steps.forEach((step, i) => {
    const item = el('li', 'pf-task__step');
    if (numbered) item.append(el('span', 'pf-task__num', `${i + 1}.`));
    const body = el('div', 'pf-task__body');
    const line = el('p', 'pf-task__text block-body');
    const meaning = step.verb ? verbMeaning(step.verb) : null;
    if (step.verb && meaning) {
      const chip = el('button', 'pf-verb', step.verb);
      chip.type = 'button';
      chip.setAttribute('aria-expanded', 'false');
      const define = el('p', 'pf-task__define');
      define.hidden = true;
      define.append(el('strong', '', `${capitalise(step.verb.toLowerCase())} `), document.createTextNode(`means: ${meaning}`));
      chip.addEventListener('click', () => {
        define.hidden = !define.hidden;
        chip.setAttribute('aria-expanded', String(!define.hidden));
      });
      line.append(chip, document.createTextNode(step.text.slice(step.verb.length)));
      body.append(line, define);
    } else if (step.verb) {
      line.append(el('strong', 'pf-verb pf-verb--plain', step.verb), document.createTextNode(step.text.slice(step.verb.length)));
      body.append(line);
    } else {
      line.textContent = step.text;
      body.append(line);
    }
    if (step.hint) body.append(el('p', 'pf-task__hint', step.hint));
    item.append(body);
    list.append(item);
  });
  if (steps.length) card.append(list);

  if (criteria.length) {
    const box = el('div', 'pf-criteria');
    box.append(el('p', 'pf-criteria__label', 'Success criteria:'));
    const items = el('ul', 'pf-criteria__list');
    for (const c of criteria) items.append(el('li', 'pf-criteria__item', c));
    box.append(items);
    card.append(box);
  }
  return card;
}
