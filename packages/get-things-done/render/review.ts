// packages/get-things-done/render/review.ts
// The experiment review, Review's chart: three stations round the return loop, numbered in the
// order they are answered: what changed (blue), what it cost (vermilion) and what to keep (ink).
// Phone: the stations stack.
import { EXPERIMENT_REVIEW_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotName } from '../../decision-book/render/core';

const PARTS: Array<{ slot: keyof typeof EXPERIMENT_REVIEW_SLOTS; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'changed', title: 'What changed', fill: 'green' },
  { slot: 'cost', title: 'What it cost', fill: 'red' },
  { slot: 'keep', title: 'What to keep', fill: 'ink' }
];

export function createExperimentReviewView(doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLElement>();
  return createChart({
    family: 'review',
    label: 'The experiment review',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const loop = el(doc, 'ol', 'gt-review__loop');
        PARTS.forEach((spec, i) => {
          const station = el(doc, 'li', `gt-review__station gt-review__station--${spec.slot}`);
          station.setAttribute('aria-label', spec.title);
          const n = el(doc, 'span', 'gt-review__n', String(i + 1));
          n.setAttribute('aria-hidden', 'true');
          station.append(n, el(doc, 'span', 'gt-review__title', spec.title));
          hosts.set(spec.slot, station);
          loop.append(station);
        });
        ctx.frame.append(loop);
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
