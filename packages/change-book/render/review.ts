// packages/change-book/render/review.ts
// The review, Review's chart: three stations in the order they are answered: what happened
// (teal), whether the reading held (copper) and whether the model still helps (ink), with a teal
// path between each. Phone: the stations stack.
import { REVIEW_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotName } from '../../decision-book/render/core';

const PARTS: Array<{ slot: keyof typeof REVIEW_SLOTS; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'happened', title: 'What happened', fill: 'green' },
  { slot: 'held', title: 'Did your reading hold', fill: 'red' },
  { slot: 'keep', title: 'Does the model still help', fill: 'ink' }
];

export function createReviewView(doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLElement>();
  return createChart({
    family: 'review',
    label: 'The review',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const row = el(doc, 'ol', 'ch-review__row');
        PARTS.forEach((spec, i) => {
          const station = el(doc, 'li', `ch-review__station ch-review__station--${spec.slot}`);
          station.setAttribute('aria-label', spec.title);
          const n = el(doc, 'span', 'ch-review__n', String(i + 1));
          n.setAttribute('aria-hidden', 'true');
          station.append(n, el(doc, 'span', 'ch-review__title', spec.title));
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
