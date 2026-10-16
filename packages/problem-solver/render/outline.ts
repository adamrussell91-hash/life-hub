// packages/problem-solver/render/outline.ts
import type { PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';

const LABELS: Record<string, string> = {
  problem: 'Problem', why: 'Why', root: 'Root cause', trunk: 'Problem', cause: 'Cause', effect: 'Effect',
  theme: 'Theme', concept: 'Concept', current: 'Current state', objective: 'Objective', known: 'Known', done: 'Done',
  must_know: 'Must know', must_do: 'Must do', action: 'Action', axis: 'Topic', impact: 'Impact', benefit: 'Benefit',
  statement: 'Statement', s: 'Specific', m: 'Measurable', a: 'Attainable', r: 'Relevant', t: 'Time-based'
};

export function slotLabel(slot: string): string {
  const parsed = parseSlot(slot);
  if (!parsed) return slot;
  const name = LABELS[parsed.name] ?? parsed.name;
  return parsed.index ? `${name} ${parsed.index}` : name;
}

/** Ordered list of a run's nodes. Used as the screen-reader alternative and as the fallback view. */
export function renderOutline(run: PsToolRun, doc: Document = document): HTMLOListElement {
  const list = doc.createElement('ol');
  list.className = 'ps-outline';
  for (const node of run.nodes) {
    const item = doc.createElement('li');
    const slot = doc.createElement('span');
    slot.className = 'ps-outline__slot';
    slot.textContent = slotLabel(node.slot);
    item.append(slot, doc.createTextNode(node.text));
    if (node.state === 'contested') item.append(doc.createTextNode(` (contested: ${node.objection ?? ''})`));
    list.append(item);
  }
  return list;
}
