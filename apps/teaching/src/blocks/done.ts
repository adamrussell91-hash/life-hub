import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { el } from '@/quiz/dom';
import './done.css';

/**
 * Done: retired. Every class lesson now ends with the lesson footer's tick, and a
 * quiz counts as done when it's handed in, so a Done block would ask twice.
 * Saved ones stay valid but show students nothing; the teacher sees why.
 */

type DoneBlock = Extract<Block, { block_type: 'done' }>;

const RETIRED_NOTE = 'Students finish every lesson with the tick at the foot of the page, so this block shows them nothing. You can delete it.';

export function renderDone(_block: DoneBlock, mode: RenderMode): HTMLElement {
  const root = el('section', 'dn-done');
  if (mode === 'student') {
    root.hidden = true;
    return root;
  }
  root.append(el('p', 'dn-done__note', RETIRED_NOTE));
  return root;
}

export function createDoneEditor(_block: DoneBlock, _onChange: (b: DoneBlock) => void): HTMLElement {
  const root = el('div', 'dn-done dn-done--editor');
  root.append(el('p', 'dn-done__note', RETIRED_NOTE));
  return root;
}
