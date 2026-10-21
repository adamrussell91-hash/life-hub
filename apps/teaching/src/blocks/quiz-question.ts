import type { Block } from '@/schemas/block';
import type { RenderMode, RenderContext } from '@/blocks/render';
import { QUIZ_KIND_INFO, checkQuestion, parseGapPassage, type QuizQuestion } from '@/quiz/core';
import { mountQuestionBuilder } from '@/quiz/builder';
import { el, formatMarks } from '@/quiz/dom';
import { lessonImages } from '@/quiz/images';
import '@/quiz/quiz.css';

/**
 * One question in a quiz lesson. The teacher sees the question with its
 * answer; students take it inside the quiz player, from a published copy
 * with the answer removed.
 */

type QuizBlock = Extract<Block, { block_type: 'quiz_question' }>;

export function createQuizQuestionEditor(block: QuizBlock, onChange: (b: QuizBlock) => void, getLessonBlocks?: () => Block[]): HTMLElement {
  let current = block;
  const builder = mountQuestionBuilder({
    question: { ...block.content.question, id: block.id },
    audience: 'teacher',
    allowImageUrl: true,
    images: lessonImages(getLessonBlocks?.() ?? []),
    onChange: (question) => {
      current = { ...current, content: { ...current.content, question } };
      onChange(current);
    }
  });
  const root = el('div', 'qz-question-editor');
  if (block.content.from_submission) root.append(el('p', 'qz-note block-secondary', 'Written by a student and approved by you. Edit anything.'));
  root.append(builder.root);
  return root;
}

export function renderQuizQuestion(block: QuizBlock, mode: RenderMode, _ctx: RenderContext = {}): HTMLElement {
  const q = block.content.question as QuizQuestion;
  const root = el('section', 'qz-card');
  root.dataset.blockId = block.id;
  const info = QUIZ_KIND_INFO[q.kind];
  const head = el('div', 'qz-card__head');
  head.append(el('span', 'qz-eyebrow block-eyebrow', info?.label ?? 'Question'), el('span', 'qz-card__marks block-secondary', `${formatMarks(q.marks ?? 1)} ${q.marks === 1 ? 'mark' : 'marks'}`));
  root.append(head);
  const promptText = q.prompt?.trim() || (q.kind === 'fill_gap' ? 'Fill the gaps.' : '');
  root.append(el('p', 'qz-card__prompt block-title', promptText || 'Write the question.'));

  if (mode === 'student') {
    root.append(el('p', 'qz-note block-secondary', 'This question is part of the quiz.'));
    return root;
  }
  const answer = el('div', 'qz-card__answer');
  for (const line of answerLines(q, mode === 'print')) answer.append(el('p', 'qz-card__line', line));
  root.append(answer);
  if (mode === 'teacher') {
    const checked = checkQuestion({ ...q, id: block.id });
    if (!checked.ok) {
      const warn = el('p', 'qz-card__warn', `Not ready: ${checked.message}`);
      root.append(warn);
    }
    if (q.hint) root.append(el('p', 'qz-note block-secondary', `Hint: ${q.hint}`));
    if (block.content.from_submission) root.append(el('p', 'qz-note block-secondary', 'From a student’s question'));
  }
  return root;
}

/** Plain-text summary of a question and its answer. Print leaves the answer out. */
export function answerLines(q: QuizQuestion, hideAnswer = false): string[] {
  const tick = (ok: boolean) => (hideAnswer ? '○' : ok ? '✓' : '○');
  switch (q.kind) {
    case 'multiple_choice':
    case 'multi_select':
    case 'odd_one_out':
      return (q.options ?? []).map((o) => `${tick(q.correct?.includes(o.id))} ${o.text}`);
    case 'quote_technique':
      return [`“${q.quote ?? ''}”`, ...(q.options ?? []).map((o) => `${tick(q.correct?.includes(o.id))} ${o.text}`)];
    case 'true_false':
      return hideAnswer ? ['True / False'] : [`Answer: ${q.answer ? 'True' : 'False'}`];
    case 'short_answer':
      return hideAnswer ? ['______________'] : [`Accepts: ${(q.accepted ?? []).filter(Boolean).join(' / ')}`];
    case 'fill_gap':
      return [
        parseGapPassage(q.passage ?? '')
          .map((p) => (p.type === 'text' ? p.text : hideAnswer ? '______' : `[${p.answers.join(' / ')}]`))
          .join('')
      ];
    case 'matching':
      return (q.pairs ?? []).map((p) => (hideAnswer ? `${p.left}  ↔  ______` : `${p.left}  ↔  ${p.right}`));
    case 'ordering':
      return hideAnswer ? (q.items ?? []).map((i) => `☐ ${i.text}`) : (q.items ?? []).map((i, n) => `${n + 1}. ${i.text}`);
    case 'categorise':
      return (q.groups ?? []).map((g) =>
        hideAnswer ? `${g.name}: ______` : `${g.name}: ${(q.items ?? []).filter((i) => i.group === g.id).map((i) => i.text).join(', ')}`
      );
    case 'find_it':
      return (q.segments ?? []).map((s) => `${tick(q.correct?.includes(s.id))} ${s.text}`);
    case 'label_image':
      return (q.pins ?? []).map((p, i) => (hideAnswer ? `${i + 1}. ______` : `${i + 1}. ${p.label}`));
    case 'extended_response':
      return hideAnswer || !q.model_answer ? ['Written answer, marked by the teacher.'] : [`Model answer: ${q.model_answer}`];
    case 'explain_effect':
      return [`“${q.quote ?? ''}”${q.technique ? ` (${q.technique})` : ''}`, ...(hideAnswer || !q.model_answer ? [] : [`Model answer: ${q.model_answer}`])];
  }
}
