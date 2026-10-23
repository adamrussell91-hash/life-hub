import { el } from '@/blocks/peer-feedback-ui';
import type { RenderMode, RenderContext } from '@/blocks/render';
import { mountTeacher } from './teacher';
import { mountStudent } from './student';
import { mountSolo } from './solo';
import { LETTERS, type HingeBlock } from './shared';
import '@/blocks/peer-feedback.css';
import './hinge-question.css';

/**
 * Hinge question: one quick multiple-choice check at the turning point of a
 * lesson. Students tap an answer on the open lesson; the teacher sees the
 * spread with each misconception named and a next step from their own
 * thresholds. The rules live on the server (netlify/functions/_shared/hinge.mjs).
 */

export { createHingeQuestionEditor } from './editor';

export function renderHingeQuestion(block: HingeBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback hinge-question');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  const prompt = el('h3', 'pf-prompt block-title', block.content.prompt.trim() || 'Choose one answer.');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Hinge question'), prompt);
  root.append(head);

  if (mode === 'print') {
    const list = el('ol', 'hq-print');
    block.content.options.forEach((o, i) => {
      const li = el('li', 'hq-print__option');
      li.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', '', o.text));
      list.append(li);
    });
    root.append(list);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note block-secondary', 'Students answer from the published lesson.'));
    return root;
  }
  if (mode === 'student' && ctx.lecture) {
    root.append(mountSolo(block, ctx.lessonId, ctx.lecture === 'preview'));
    return root;
  }
  root.append(mode === 'teacher' ? mountTeacher(block, ctx.lessonId, prompt) : mountStudent(block, ctx.lessonId, prompt));
  return root;
}
