/**
 * Explainer block: a recorded teacher demonstration. The teacher talks while
 * marking up a text; students replay the voice with the marks appearing in
 * time. Teacher-made, so students store nothing.
 */
import type { RenderMode } from '@/blocks/render';
import type { ExplainerBlock } from '@/schemas/block';
import { mountExplainerPlayer, renderExplainerStatic } from './player';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import './explainer.css';

export { createExplainerEditor } from './editor';
export { stripExplainerForStudent } from './publish';

/** Students see a published recording; the teacher sees any recording. */
export function playableRecording(block: ExplainerBlock, mode: RenderMode): boolean {
  const rec = block.content.recording;
  if (!rec || rec.duration_s <= 0) return false;
  return mode === 'teacher' || rec.status === 'published';
}

export function renderExplainer(block: ExplainerBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('section');
  root.className = 'block-explainer';
  root.dataset.blockId = block.id;
  const title = block.content.title?.trim();
  const head = document.createElement('header');
  head.className = 'block-explainer__head';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'block-eyebrow';
  eyebrow.textContent = 'Explainer';
  head.append(eyebrow);
  if (title) {
    const h = document.createElement('h3');
    h.className = 'block-title block-explainer__title';
    h.textContent = title;
    head.append(h);
  }
  root.append(head);

  if (mode !== 'print' && playableRecording(block, mode)) {
    if (mode === 'teacher' && block.content.recording!.status === 'draft') {
      const note = document.createElement('p');
      note.className = 'block-explainer__hint';
      note.textContent = 'Draft: students see the text until you publish the recording.';
      root.append(note);
    }
    root.append(mountExplainerPlayer(block).el);
    return root;
  }
  // No recording to play (or print): the text with every mark in place.
  const showMarks = mode === 'teacher' || block.content.recording?.status === 'published';
  root.append(renderExplainerStatic(block, showMarks ? Infinity : -1));
  if (mode === 'print' && showMarks) {
    const notes = (block.content.recording?.events ?? []).filter((ev) => ev.kind === 'note');
    if (notes.length) {
      const list = document.createElement('ul');
      list.className = 'block-explainer__print-notes';
      for (const n of notes) {
        const li = document.createElement('li');
        li.innerHTML = sanitizeRichTextHtml(n.kind === 'note' ? n.html : '');
        list.append(li);
      }
      root.append(list);
    }
  }
  return root;
}
