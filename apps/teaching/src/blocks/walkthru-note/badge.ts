import type { Block } from '@/schemas/block';
import { createGlyphSet } from '../../../../../packages/design-kit/js/glyph-set.js';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { attachedTechniques } from './attach';
import { renderStepsInto } from './note';

const glyphs = createGlyphSet({ svgs: {}, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'tk-wt-badge__glyph' });

/**
 * Teacher view only: the icon of a technique this block embodies, opening its five steps in place.
 * Nothing about it is stored on the block.
 */
export function renderTechniqueBadge(block: Block): HTMLElement | null {
  const ids = attachedTechniques(block);
  if (!ids.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'tk-wt-badges';
  for (const id of ids) {
    const entry = techniqueById(id);
    if (!entry) continue;
    const details = document.createElement('details');
    details.className = 'tk-wt-badge';
    const summary = document.createElement('summary');
    summary.className = 'tk-wt-badge__summary';
    summary.title = `${entry.name}: open the steps (only you see this)`;
    const label = document.createElement('span');
    label.textContent = entry.name;
    summary.append(glyphs.element(entry.id), label);
    const body = document.createElement('div');
    body.className = 'tk-wt-badge__body';
    let loaded = false;
    details.addEventListener('toggle', () => {
      if (!details.open || loaded) return;
      loaded = true;
      renderStepsInto(body, entry.id, {});
    });
    details.append(summary, body);
    wrap.append(details);
  }
  return wrap;
}
