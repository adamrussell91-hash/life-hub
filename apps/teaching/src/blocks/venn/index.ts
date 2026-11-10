import { el } from '@/blocks/peer-feedback-ui';
import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { drawDiagram, legend, regionTag } from './diagram';
import { fillFrame, regionLabel, regionsFor, textCount, textLabel, TEXT_KEYS } from './model';
import { mountStudent } from './student';
import { mountTeacher, renderPreview } from './teacher';
import '@/blocks/peer-feedback.css';
import './venn.css';

/**
 * Two-text Venn: students place points in each region, tag each one surface
 * or deep, say how each text treats a shared point, and finish a synthesis
 * sentence. The teacher sees every student's Venn and can show one, without
 * initials, on Display. Logic lives in ./model.ts; the server only stores
 * (netlify/functions/_shared/thinking-responses.mjs).
 */

export type VennBlock = Extract<Block, { block_type: 'venn' }>;

export { createVennEditor } from './editor';

function renderPrint(block: VennBlock): HTMLElement {
  const { content } = block;
  const count = textCount(content.texts);
  const labels = content.texts.map((t) => t.label);
  const sheet = el('div', 'venn-print');
  sheet.append(drawDiagram({ count, labels, print: true, size: 'large' }), legend(count, labels));
  const regions = el('div', `venn-print__regions venn-columns--${count >= 3 ? 'three' : 'two'}`);
  for (const r of regionsFor(count)) {
    const box = el('section', 'venn-print__region');
    const head = el('p', 'pf-print__label');
    head.append(el('span', 'venn-column__tag', regionTag(r)), document.createTextNode(` ${regionLabel(r, labels, count)}`));
    box.append(head, el('div', 'pf-print__lines'));
    regions.append(box);
  }
  const synth = el('section', 'venn-print__synthesis');
  synth.append(el('p', 'pf-print__label', 'Your synthesis sentence'));
  if (content.synthesis_frame.trim()) synth.append(el('p', 'venn-frame', fillFrame(content.synthesis_frame, labels)));
  synth.append(el('div', 'venn-print__box'));
  const key = el('p', 'venn-print__key block-secondary');
  key.textContent = 'Key: S = surface (plot, feature), D = deep (idea, concept, purpose). Mark each point S or D. A shared point says how each text treats it.';
  sheet.append(regions, synth, key);
  const preload = content.preload.filter((p) => p.text.trim());
  if (preload.length) {
    const list = el('ul', 'venn-preview__preload');
    for (const p of preload) list.append(el('li', '', p.text));
    sheet.append(el('p', 'pf-print__label', 'Points to sort'), list);
  }
  return sheet;
}

export function renderVenn(block: VennBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback venn');
  root.dataset.blockId = block.id;
  const count = textCount(block.content.texts);
  const labels = block.content.texts.map((t) => t.label);
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Two-text Venn'));
  if (block.content.prompt.trim()) head.append(el('h3', 'pf-prompt block-title', block.content.prompt));
  head.append(el('p', 'venn-texts block-secondary', TEXT_KEYS.slice(0, count).map((k) => textLabel(k, labels)).join(' · ')));
  root.append(head);

  if (mode === 'print') root.append(renderPrint(block));
  else if (mode === 'teacher') root.append(ctx.lessonId ? mountTeacher(block, ctx.lessonId, !!ctx.display) : renderPreview(block));
  else root.append(mountStudent(block, ctx));
  return root;
}
