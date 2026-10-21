import { el } from '@/blocks/peer-feedback-ui';
import type { RenderMode, RenderContext } from '@/blocks/render';
import { mountTeacher } from './teacher';
import { mountStudent } from './student';
import { lineMarks, liveStatements, renderStimulus, type ContinuumBlock } from './shared';
import '@/blocks/peer-feedback.css';
import './continuum-line.css';

/**
 * Continuum line: one stimulus, up to ten statements. Students join by code,
 * place their colour-and-shape symbol on the line for each statement and give
 * a reason. The projector shows symbols roaming until the teacher reveals,
 * then every symbol glides to its place. A re-place round lets students move
 * and say why. The rules live on the server
 * (netlify/functions/_shared/continuum-line.mjs).
 */

export { createContinuumLineEditor } from './editor';

export function renderContinuumLine(block: ContinuumBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback continuum-line');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  const { left, right } = block.content.scale;
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Continuum line'), el('h3', 'pf-prompt block-title', `${left || '…'} ↔ ${right || '…'}`));
  root.append(head);
  const statements = liveStatements(block);

  if (mode === 'print') {
    root.append(renderStimulus(block.content.stimulus));
    const sheet = el('ol', 'cl-print');
    for (const s of statements) {
      const item = el('li', 'cl-print__item');
      const track = el('div', 'cl-track cl-print__track');
      track.append(lineMarks(block.content.scale, s.snap));
      item.append(el('p', 'cl-print__statement', s.text), track, el('p', 'cl-print__why', 'Why there?'), el('div', 'pf-print__lines'));
      sheet.append(item);
    }
    root.append(sheet);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(renderStimulus(block.content.stimulus));
    if (statements.length) {
      const list = el('ol', 'cl-preview');
      for (const s of statements) list.append(el('li', '', s.text));
      root.append(list);
    }
    root.append(el('p', 'pf-note block-secondary', 'Students take part from the published lesson.'));
    return root;
  }
  if (mode === 'teacher') {
    root.append(mountTeacher(block, ctx.lessonId, renderStimulus(block.content.stimulus)));
  } else {
    const corner = el('div', 'pf-corner');
    corner.hidden = true;
    head.append(corner);
    root.append(mountStudent(block, ctx.lessonId, corner, renderStimulus(block.content.stimulus)));
  }
  return root;
}
