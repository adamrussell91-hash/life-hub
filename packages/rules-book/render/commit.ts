// packages/rules-book/render/commit.ts
// The experiment, Act's chart: the result that matters as the headline; what it rests on, each
// saying which rule and node it uses (from setBasis, as Decision Maker's decision record does);
// the next action beside how it starts; the check time as a date in words; and "What would
// overturn it" as an orange band. Phone: the same order, one column.
import { COMMIT_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotIndex, slotName } from '../../decision-book/render/core';
import { type Basis, basisWords, reviewWords } from '../../decision-book/render/record';

export type ExperimentView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const B = 'var(--rb-indigo)';
const O = 'var(--rb-orange)';
const I = 'var(--rb-ink)';
const Y = 'var(--rb-yellow)';
const P = 'var(--rb-paper)';

/** Each part's mark, in the pack's shapes (static markup, 100×100). */
const MARKS: Record<string, string> = {
  result: `<circle cx="50" cy="50" r="38" fill="none" stroke="${B}" stroke-width="10"/><circle cx="50" cy="50" r="14" fill="${O}"/>`,
  rests_on: `<polygon points="50,20 84,34 50,48 16,34" fill="${O}"/><polygon points="16,34 50,48 50,80 16,66" fill="${B}"/><polygon points="84,34 50,48 50,80 84,66" fill="${I}"/>`,
  next_action: `<path d="M14 86L70 30" stroke="${I}" stroke-width="10" stroke-linecap="round"/><path d="M88 12L56 24L76 44Z" fill="${O}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`,
  start: `<circle cx="50" cy="50" r="36" fill="none" stroke="${I}" stroke-width="6" stroke-dasharray="0.1 14" stroke-linecap="round"/><circle cx="50" cy="50" r="10" fill="${B}"/>`,
  check_back: `<rect x="16" y="24" width="68" height="60" fill="none" stroke="${B}" stroke-width="6"/><rect x="28" y="46" width="20" height="26" fill="${O}"/><line x1="16" y1="38" x2="84" y2="38" stroke="${B}" stroke-width="6"/>`,
  change_course: `<circle cx="50" cy="38" r="22" fill="${Y}" stroke="${I}" stroke-width="4"/><rect x="40" y="62" width="20" height="10" fill="${I}"/><rect x="24" y="78" width="52" height="8" fill="${P}" stroke="${I}" stroke-width="3"/>`
};

function mark(doc: Document, slot: string): SVGSVGElement {
  const node = doc.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('class', 'rb-commit__mark');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = MARKS[slot];
  return node;
}

/** Each part: its slot, class, heading and fill. */
const PARTS: Array<{ slot: keyof typeof COMMIT_SLOTS; className: string; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'result', className: 'rb-commit__result', title: 'The result that matters', fill: 'ink' },
  { slot: 'rests_on', className: 'rb-commit__rests', title: 'Rests on', fill: 'tint' },
  { slot: 'next_action', className: 'rb-commit__action', title: 'Next action', fill: 'green' },
  { slot: 'start', className: 'rb-commit__start', title: 'How it starts', fill: 'tint' },
  { slot: 'check_back', className: 'rb-commit__back', title: 'Check time', fill: 'tint' },
  { slot: 'change_course', className: 'rb-commit__turn', title: 'What would overturn it', fill: 'red' }
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
          const box = el(doc, 'div', `rb-commit__part ${spec.className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', spec.title);
          box.append(mark(doc, spec.slot), el(doc, 'span', 'rb-commit__title', spec.title));
          hosts.set(spec.slot, box);
          return box;
        };
        const [result, rests, action, start, back, turn] = PARTS.map(part);
        const go = el(doc, 'div', 'rb-commit__row');
        go.append(action, start);
        const ends = el(doc, 'div', 'rb-commit__row');
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
