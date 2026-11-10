import type { Block } from '@/schemas/block';
import { loadActivityState, saveActivityState, storageKey } from '../learning-activity';
import {
  fadeStages,
  frameFor,
  frameStart,
  itemStage,
  limitStatus,
  listWords,
  usesJoiningWord,
  type FadeStage,
  type SentenceFormat
} from './sentence-model';
import './sentence-formats.css';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
type Question = QuestionSet['content']['questions'][number];
type Mode = 'student' | 'teacher' | 'print';
type Ctx = { lessonId?: string; saveScope?: string; display?: boolean };
type State = Record<string, string>;

const PRINT_LINES = 3;

/** The task line under each item's material, by format. */
const TASKS: Record<SentenceFormat, string> = {
  sentence_combining: 'Join them into one sentence.',
  appositive: 'Add an appositive: a phrase that renames the noun.',
  sentence_expansion: 'Expand the sentence with detail.',
  note_to_topic: 'Turn the notes into one topic sentence.'
};

const STAGE_LABELS: Record<FadeStage, string> = {
  model: 'Worked example',
  frame: 'Frame',
  independent: 'On their own'
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const quoted = (word: string) => `‘${word.trim()}’`;
const kernelsOf = (q: Question) => (q.kernels ?? []).map((k) => k.trim()).filter(Boolean);

function lines(count = PRINT_LINES): HTMLElement {
  const wrap = el('div', 'block-question-set__response-lines');
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) wrap.append(el('div', 'block-question-set__line'));
  return wrap;
}

/** The sentences or notes an item works from, shaped by its format. */
function material(format: SentenceFormat, q: Question): HTMLElement | null {
  const kernels = kernelsOf(q);
  const wrap = el('div', 'block-sentence__material');
  if (format === 'sentence_combining') {
    if (!kernels.length) return null;
    const list = el('ol', 'block-sentence__kernels');
    list.setAttribute('aria-label', 'Sentences to join');
    for (const kernel of kernels) list.append(el('li', 'block-sentence__kernel', kernel));
    wrap.append(list);
  } else if (format === 'note_to_topic') {
    if (!kernels.length) return null;
    const list = el('ul', 'block-sentence__notes');
    list.setAttribute('aria-label', 'Notes');
    for (const note of kernels) list.append(el('li', 'block-sentence__note', note));
    wrap.append(list);
  } else {
    if (kernels.length) wrap.append(el('p', 'block-sentence__kernel block-sentence__kernel--single', kernels.join(' ')));
    if (format === 'sentence_expansion' && q.question_words?.length) {
      const chips = el('ul', 'block-sentence__chips');
      chips.setAttribute('aria-label', 'Question words to answer');
      for (const word of q.question_words) chips.append(el('li', 'block-sentence__chip', word));
      wrap.append(chips);
    }
    if (!wrap.childNodes.length) return null;
  }
  return wrap;
}

/** The task: the format's line plus the joining word or question words it asks for. */
function task(format: SentenceFormat, q: Question): string {
  const conjunction = q.conjunction?.trim();
  if (format === 'sentence_combining' && conjunction) return `${TASKS[format]} Use ${quoted(conjunction)}.`;
  if (format === 'sentence_expansion' && q.question_words?.length) return `Add ${listWords(q.question_words)}.`;
  return TASKS[format];
}

/** Word count, the limit, and the joining-word check, read live from the box. */
function helperText(format: SentenceFormat, q: Question, text: string, limit: number | undefined): { text: string; over: boolean } {
  const { words, over } = limitStatus(text, limit);
  const parts = [over && limit ? `Trim to ${limit} words` : limit ? `${words} / ${limit} words` : `${words} ${words === 1 ? 'word' : 'words'}`];
  const conjunction = q.conjunction?.trim();
  if (format === 'sentence_combining' && conjunction) {
    parts.push(usesJoiningWord(text, conjunction) ? `Uses ${quoted(conjunction)} ✓` : `Use ${quoted(conjunction)} to join them`);
  }
  return { text: parts.join(' · '), over };
}

/** A studied example: the material, an arrow, then the model sentence. */
function workedCard(format: SentenceFormat, q: Question, model: string): HTMLElement {
  const card = el('div', 'block-sentence__worked');
  card.append(el('p', 'block-sentence__worked-label block-eyebrow', 'Worked example'));
  const source = material(format, q);
  if (source) card.append(source);
  card.append(el('p', 'block-sentence__task block-secondary', task(format, q)));
  const result = el('p', 'block-sentence__worked-answer block-body');
  result.append(el('span', 'block-sentence__arrow', '→ '), document.createTextNode(model));
  card.append(result);
  return card;
}

/**
 * Sentence-level writing (Writing Revolution): sentence combining,
 * appositives, sentence expansion and note to topic sentence. The first item
 * is a worked example, middle items start from a frame, the last are written
 * from scratch. Answers save as the format's written part, keyed by question.
 */
export function renderSentenceFormat(block: QuestionSet, mode: Mode, ctx: Ctx = {}): HTMLElement {
  const format = block.content.format as SentenceFormat;
  const root = el('div', `block-question-set block-question-set--sentence block-sentence block-sentence--${format.replace(/_/g, '-')}`);
  if (block.content.title?.trim()) root.append(el('p', 'block-question-set__title', block.content.title));

  const questions = block.content.questions;
  const limit = block.content.sentence?.word_limit;
  const stages = fadeStages(questions.length, block.content.sentence?.fade !== false);
  const teacherNotes = mode === 'teacher' && !ctx.display;
  const typing = mode === 'student';

  if (limit) root.append(el('p', 'block-sentence__limit block-secondary', teacherNotes ? `Word limit: ${limit}` : `Up to ${limit} words for each sentence.`));

  // Answers stay on this device for the student only; previews keep nothing.
  const scope = ctx.lessonId ?? ctx.saveScope;
  const base = typing && scope ? storageKey(scope, block.id) : undefined;
  const answerKey = base ? `${base}.format.${format}` : undefined;
  const seenKey = base ? `${base}.sentence-seen` : undefined;
  const savedAnswers = answerKey ? loadActivityState<State>(answerKey) : null;
  const answers: State = savedAnswers && typeof savedAnswers === 'object' ? { ...savedAnswers } : {};
  const savedSeen = seenKey ? loadActivityState<Record<string, boolean>>(seenKey) : null;
  const seen: Record<string, boolean> = savedSeen && typeof savedSeen === 'object' ? { ...savedSeen } : {};

  const list = el('ol', 'block-question-set__list');
  questions.forEach((q, i) => {
    const stage = itemStage(stages[i] ?? 'independent', q);
    const n = i + 1;
    const model = q.model_answer?.trim() ?? '';
    const li = el('li', 'block-question-set__question block-sentence__item');
    li.dataset.questionId = q.id;
    li.dataset.stage = stage;
    if (q.prompt.trim()) li.append(el('p', 'block-question-set__prompt block-body', q.prompt));

    if (stage === 'model') {
      if (teacherNotes) li.append(el('p', 'block-sentence__stage', STAGE_LABELS.model));
      li.append(workedCard(format, q, model));
      list.append(li);
      return;
    }

    const source = material(format, q);
    if (source) li.append(source);
    li.append(el('p', 'block-sentence__task block-secondary', task(format, q)));
    const frame = stage === 'frame' ? frameFor(q) : '';

    if (teacherNotes) {
      li.append(el('p', 'block-sentence__stage', STAGE_LABELS[stage]));
      if (frame) li.append(el('p', 'block-sentence__frame-note block-secondary', `Frame: ${frame}`));
      if (model) li.append(el('p', 'block-question-set__model-note block-body', `Model answer: ${model}`));
      list.append(li);
      return;
    }

    if (mode === 'print') {
      if (frame) li.append(el('p', 'block-sentence__frame-label block-eyebrow', 'Finish the sentence'), el('p', 'block-question-set__frame', frame));
      li.append(lines());
      list.append(li);
      return;
    }

    // Student, or the teacher's Display view.
    if (frame) li.append(el('p', 'block-sentence__frame-label block-eyebrow', 'Finish the sentence'));
    const start = frameStart(frame);
    const area = el('textarea', 'block-question-set__box block-sentence__box');
    area.rows = 3;
    area.maxLength = 4000;
    area.setAttribute('aria-label', `Item ${n}: your sentence`);
    area.value = answers[q.id] ?? start;
    const helper = el('p', 'block-sentence__helper block-secondary');
    helper.setAttribute('role', 'status');
    helper.setAttribute('aria-live', 'polite');
    const paintHelper = () => {
      const status = helperText(format, q, area.value, limit);
      helper.textContent = status.text;
      helper.classList.toggle('block-sentence__helper--over', status.over);
    };
    paintHelper();
    li.append(area, helper);

    if (model) {
      let revealed = !!seen[q.id];
      const toggle = el('button', 'block-disclosure__toggle block-question-set__model-btn block-self-check__btn');
      toggle.type = 'button';
      const answer = el('div', 'block-question-set__model block-self-check__answer block-body', model);
      const paintModel = () => {
        toggle.textContent = revealed ? 'Hide the model' : 'Check against the model';
        toggle.setAttribute('aria-expanded', String(revealed));
        answer.hidden = !revealed;
        // Write first: the model opens once the student has written something of their own.
        const written = area.value.trim() && area.value.trim() !== start.trim();
        toggle.disabled = typing && !revealed && !written;
      };
      toggle.addEventListener('click', () => {
        if (toggle.disabled) return;
        revealed = !revealed;
        if (revealed) seen[q.id] = true;
        else delete seen[q.id];
        if (seenKey) saveActivityState(seenKey, seen);
        paintModel();
      });
      area.addEventListener('input', paintModel);
      paintModel();
      li.append(toggle, answer);
    }

    area.addEventListener('input', () => {
      paintHelper();
      if (!typing) return;
      answers[q.id] = area.value;
      if (answerKey) saveActivityState(answerKey, answers);
    });
    list.append(li);
  });
  root.append(list);
  return root;
}
