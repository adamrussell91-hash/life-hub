import { el } from '@/blocks/peer-feedback-ui';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { renderPrint, type DiamondNineBlock } from './shared';
import { mountStudent } from './student';
import { mountTeacher, renderPreview } from './teacher';
import '@/blocks/peer-feedback.css';
import './diamond-nine.css';

/**
 * Diamond 9: nine cards ranked in a 1-2-3-2-1 diamond against the teacher's
 * criterion. Students rank alone, give reasons for the two ends, then see the
 * class diamond; they can rank again after the discussion and by a second
 * criterion. The maths lives in ./model.ts; the server only stores
 * (netlify/functions/_shared/thinking-responses.mjs).
 */

export type { DiamondNineBlock } from './shared';
export { createDiamondNineEditor } from './editor';

export function renderDiamondNine(block: DiamondNineBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const display = mode === 'teacher' && ctx.display === true;
  const root = el('section', `peer-feedback d9${display ? ' d9--display' : ''}`);
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Diamond 9'));
  if (block.content.title.trim()) head.append(el('h3', 'pf-prompt block-title', block.content.title.trim()));
  const criterion = block.content.criterion.trim();
  const rank = el('p', 'd9-criterion', 'Rank by: ');
  rank.append(el('strong', '', criterion || '…'));
  head.append(rank);
  if (mode === 'student') {
    head.append(el('p', 'd9-howto block-secondary', 'Tap a card, then tap a space in the diamond. Most at the top, least at the bottom.'));
  }
  root.append(head);

  if (mode === 'print') {
    root.append(renderPrint(block));
    return root;
  }
  if (mode === 'teacher') {
    root.append(ctx.lessonId ? mountTeacher(block, ctx.lessonId, display) : renderPreview(block));
    return root;
  }
  root.append(mountStudent(block, ctx));
  return root;
}
