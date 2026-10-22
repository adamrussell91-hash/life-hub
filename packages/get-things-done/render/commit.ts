// packages/get-things-done/render/commit.ts
// The experiment, Commit's chart, after the book's cover: the result that matters as the
// headline inside the target; what it rests on, each saying which technique and node it uses
// (from setBasis, as Decision Maker's decision record does); the next action on the dart beside
// how it starts; the check-back on the return arrows, as a date in words; and "Change course if"
// as a vermilion band. Phone: the same order, one column.
import { COMMIT_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotIndex, slotName } from '../../decision-book/render/core';
import { type Basis, basisWords, reviewWords } from '../../decision-book/render/record';

export type ExperimentView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const B = 'var(--gt-blue)';
const R = 'var(--gt-red)';
const I = 'var(--gt-ink)';
const P = 'var(--gt-paper)';

/** Each part's mark, in the cover's shapes (static markup, 100×100). */
const MARKS: Record<string, string> = {
  result: `<circle cx="50" cy="50" r="40" fill="none" stroke="${B}" stroke-width="14"/><circle cx="50" cy="50" r="20" fill="none" stroke="${R}" stroke-width="10"/><circle cx="50" cy="50" r="7" fill="${R}"/>`,
  rests_on: `<circle cx="50" cy="50" r="38" fill="none" stroke="${B}" stroke-width="12"/><circle cx="50" cy="50" r="12" fill="${I}"/>`,
  next_action: `<path d="M14 86L70 30" stroke="${I}" stroke-width="10" stroke-linecap="round"/><path d="M88 12L56 24L76 44Z" fill="${I}" stroke="${I}" stroke-width="4" stroke-linejoin="round"/>`,
  start: `<circle cx="50" cy="50" r="36" fill="none" stroke="${I}" stroke-width="6" stroke-dasharray="0.1 14" stroke-linecap="round"/><circle cx="50" cy="50" r="10" fill="${B}"/>`,
  check_back: `<path d="M18 44A33 33 0 0 1 74 24" fill="none" stroke="${B}" stroke-width="10" stroke-linecap="round"/><path d="M86 18L82 42L62 30Z" fill="${B}"/><path d="M82 56A33 33 0 0 1 26 76" fill="none" stroke="${B}" stroke-width="10" stroke-linecap="round"/><path d="M14 82L18 58L38 70Z" fill="${B}"/><circle cx="50" cy="50" r="10" fill="var(--gt-amber)"/>`,
  change_course: `<circle cx="50" cy="50" r="44" fill="${R}"/><rect x="24" y="43" width="52" height="14" rx="3" fill="${P}"/>`
};

function mark(doc: Document, slot: string): SVGSVGElement {
  const node = doc.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('class', 'gt-commit__mark');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = MARKS[slot];
  return node;
}

/** Each part: its slot, class, heading and fill. */
const PARTS: Array<{ slot: keyof typeof COMMIT_SLOTS; className: string; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'result', className: 'gt-commit__result', title: 'The result that matters', fill: 'ink' },
  { slot: 'rests_on', className: 'gt-commit__rests', title: 'Rests on', fill: 'tint' },
  { slot: 'next_action', className: 'gt-commit__action', title: 'Next action', fill: 'green' },
  { slot: 'start', className: 'gt-commit__start', title: 'How it starts', fill: 'tint' },
  { slot: 'check_back', className: 'gt-commit__back', title: 'Check back', fill: 'tint' },
  { slot: 'change_course', className: 'gt-commit__turn', title: 'Change course if', fill: 'red' }
];

export function createExperimentView(doc: Document = document): ExperimentView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'commit',
    label: 'The experiment',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const part = (spec: (typeof PARTS)[number]): HTMLDivElement => {
          const box = el(doc, 'div', `gt-commit__part ${spec.className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', spec.title);
          box.append(mark(doc, spec.slot), el(doc, 'span', 'gt-commit__title', spec.title));
          hosts.set(spec.slot, box);
          return box;
        };
        const [result, rests, action, start, back, turn] = PARTS.map(part);
        const go = el(doc, 'div', 'gt-commit__row');
        go.append(action, start);
        const ends = el(doc, 'div', 'gt-commit__row');
        ends.append(back, turn);
        ctx.frame.append(result, rests, go, ends);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => {
          const name = slotName(node);
          const spec = PARTS.find((p) => p.slot === name)!;
          return {
            node,
            host: hosts.get(name)!,
            fill: spec.fill,
            label: name === 'rests_on' && slotIndex(node) ? `${spec.title} ${slotIndex(node)}` : spec.title,
            meta: name === 'rests_on' ? basisWords(basis[node.id]) || undefined : name === 'check_back' ? reviewWords(node.text) : undefined
          };
        });
    }
  }, doc);
  return {
    ...view,
    update(run) {
      last = run;
      view.update(run);
    },
    setBasis(next) {
      basis = next;
      if (last) view.update(last);
    }
  };
}
