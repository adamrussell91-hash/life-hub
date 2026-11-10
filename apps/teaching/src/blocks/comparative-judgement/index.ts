import { el } from '@/quiz/dom';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { mountStudent } from './student';
import { mountTeacher } from './teacher';
import { renderPrint } from './print';
import { criterionOf, type CjBlock } from './shared';
import '@/blocks/peer-feedback.css';
import './comparative-judgement.css';

/**
 * Comparative judgement: the class's answers to one written question, shown
 * two at a time, anonymised; students and the teacher pick the stronger one.
 * A Bradley–Terry fit on the server turns the picks into an order. Design:
 * docs/superpowers/specs/2026-11-11-comparative-judgement-design.md.
 */

export { createComparativeJudgementEditor } from './editor';

export function renderComparativeJudgement(block: CjBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback comparative-judgement');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Comparative judgement'));
  const title = block.content.title?.trim();
  head.append(el('h3', 'pf-prompt block-title', title || criterionOf(block.content)));
  root.append(head);

  if (mode === 'print') {
    root.append(renderPrint(block));
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note block-secondary', 'Students judge answers from the published lesson.'));
    return root;
  }
  if (mode === 'teacher') root.append(mountTeacher(block, { lessonId: ctx.lessonId, display: ctx.display === true }));
  else root.append(mountStudent(block, { lessonId: ctx.lessonId, ...(ctx.classId ? { classId: ctx.classId } : {}) }));
  return root;
}
