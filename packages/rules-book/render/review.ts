// packages/rules-book/render/review.ts
// The review, Review's chart: three stations in the order they are answered: what happened
// (indigo), whether the reading held (orange) and whether the rule is still useful (ink), with a
// dashed divide between each, as the book's cover divides a rule from judgment. Phone: the
// stations stack.
import { REVIEW_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotName } from '../../decision-book/render/core';

const PARTS: Array<{ slot: keyof typeof REVIEW_SLOTS; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'happened', title: 'What happened', fill: 'green' },
  { slot: 'held', title: 'Did your reading hold', fill: 'red' },
  { slot: 'keep', title: 'Is the rule still useful', fill: 'ink' }
];

export function createReviewView(doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLElement>();
  return createChart({
    family: 'review',
    label: 'The review',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const row = el(doc, 'ol', 'rb-review__row');
        PARTS.forEach((spec, i) => {
          const station = el(doc, 'li', `rb-review__station rb-review__station--${spec.slot}`);
          station.setAttribute('aria-label', spec.title);
          const n = el(doc, 'span', 'rb-review__n', String(i + 1));
          n.setAttribute('aria-hidden', 'true');
          station.append(n, el(doc, 'span', 'rb-review__title', spec.title));
          hosts.set(spec.slot, station);
          row.append(station);
        });
        ctx.frame.append(row);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => {
          const spec = PARTS.find((p) => p.slot === slotName(node))!;
          return { node, host: hosts.get(spec.slot)!, fill: spec.fill, label: spec.title };
        });
    }
  }, doc);
}
