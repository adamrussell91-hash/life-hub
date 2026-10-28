// packages/collaboration-book/render/review.ts
// The review, Review's chart: three stations in the order they are answered: what happened
// (cyan), whether the conditions changed (gold) and whether to keep the practice (ink), with a
// cyan path between each. Phone: the stations stack.
import { REVIEW_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotName } from '../../decision-book/render/core';

const PARTS: Array<{ slot: keyof typeof REVIEW_SLOTS; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'happened', title: 'What happened', fill: 'green' },
  { slot: 'conditions', title: 'Did the conditions change', fill: 'red' },
  { slot: 'keep', title: 'Keep, adjust or stop', fill: 'ink' }
];

export function createReviewView(doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLElement>();
  return createChart({
    family: 'review',
    label: 'The review',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const row = el(doc, 'ol', 'cb-review__row');
        PARTS.forEach((spec, i) => {
          const station = el(doc, 'li', `cb-review__station cb-review__station--${spec.slot}`);
          station.setAttribute('aria-label', spec.title);
          const n = el(doc, 'span', 'cb-review__n', String(i + 1));
          n.setAttribute('aria-hidden', 'true');
          station.append(n, el(doc, 'span', 'cb-review__title', spec.title));
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
