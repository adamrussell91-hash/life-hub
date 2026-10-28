import { createGlyphSet } from '../../../../../packages/design-kit/js/glyph-set.js';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { renderStepsInto } from './note';

/**
 * Unit planning prompts that come from the book. Each carries the technique's icon; opening one
 * shows its five steps, fetched from the private endpoint. Teacher view only: ids live here,
 * book text never does, and nothing is saved on the unit.
 */
export const PLANNING_FIELDS: ReadonlyArray<{ label: string; technique: string; hint?: string }> = [
  { label: 'Review schedule across the unit', technique: 'w1-weekly-and-monthly-review', hint: 'Daily, weekly and monthly review (Rosenshine)' },
  { label: 'Anticipated misconceptions', technique: 'w1-head-on-misconceptions' },
  { label: 'Vocabulary to teach on purpose', technique: 'w1-deliberate-vocabulary-development' },
  { label: 'Reading plan', technique: 'w1-plan-for-reading' },
  { label: 'Knowledge organiser', technique: 'w1-using-a-knowledge-organiser' },
  { label: 'Core and hinterland', technique: 'w1-deliver-core-signpost-hinterland' },
  { label: 'Small-step sequence', technique: 'w1-sequence-concepts-in-small-steps' },
  { label: 'Tiered questions', technique: 'w1-tiered-questions-and-problems' },
  { label: 'Homework as guided study', technique: 'w1-homework-as-guided-study' },
  { label: 'Enquiry projects', technique: 'w1-enquiry-projects' }
];

const glyphs = createGlyphSet({ svgs: {}, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'tk-wt-badge__glyph' });

/** A teacher-only row of planning prompts for the unit page. Returns null if the catalogue lacks them all. */
export function renderPlanningPrompts(): HTMLElement | null {
  const fields = PLANNING_FIELDS.filter((f) => techniqueById(f.technique));
  if (!fields.length) return null;
  const wrap = document.createElement('details');
  wrap.className = 'tk-wt-plan';
  const head = document.createElement('summary');
  head.className = 'tk-wt-plan__head';
  head.textContent = 'Planning prompts from the WalkThrus (only you see these)';
  const list = document.createElement('div');
  list.className = 'tk-wt-badges';
  for (const field of fields) {
    const entry = techniqueById(field.technique)!;
    const details = document.createElement('details');
    details.className = 'tk-wt-badge';
    const summary = document.createElement('summary');
    summary.className = 'tk-wt-badge__summary';
    summary.title = `${entry.name}${field.hint ? ` · ${field.hint}` : ''}: open the steps`;
    const label = document.createElement('span');
    label.textContent = field.label;
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
    list.append(details);
  }
  wrap.append(head, list);
  return wrap;
}
