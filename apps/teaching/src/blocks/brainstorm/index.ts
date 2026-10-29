import { el } from '@/blocks/peer-feedback-ui';
import type { RenderMode, RenderContext } from '@/blocks/render';
import { mountTeacher } from './teacher';
import { mountStudent } from './student';
import type { BrainstormBlock } from './shared';
import '@/blocks/peer-feedback.css';
import './brainstorm.css';

/**
 * Brainstorm: students send short answers to one question by join code. The
 * teacher's board shows each answer as its writer's anonymous symbol orbiting
 * the question, then reveals them as a grid, word cloud or AI-sorted groups.
 * Safety mode and answers per student are set per block; the rules live on
 * the server (netlify/functions/_shared/brainstorm.mjs).
 */

export { createBrainstormEditor } from './editor';

export function renderBrainstorm(block: BrainstormBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback brainstorm');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Brainstorm'), el('h3', 'pf-prompt block-title', block.content.question.trim() || 'Share your ideas.'));
  root.append(head);

  if (mode === 'print') {
    const sheet = el('div', 'pf-print');
    sheet.append(el('p', 'pf-print__label', 'Your ideas'), el('div', 'pf-print__lines'));
    root.append(sheet);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note block-secondary', 'Students take part from the published lesson.'));
    return root;
  }
  if (mode === 'teacher') {
    root.append(mountTeacher(block, ctx.lessonId, ctx.display === true));
  } else {
    const corner = el('div', 'pf-corner');
    corner.hidden = true;
    head.append(corner);
    root.append(mountStudent(block, ctx.lessonId, corner));
  }
  return root;
}
