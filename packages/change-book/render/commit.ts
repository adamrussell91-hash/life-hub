// packages/change-book/render/commit.ts
// The reversible step, Act's chart: the result that matters as the headline; what it rests on,
// each saying which model and node it uses (from setBasis, as Decision Maker's decision record
// does); the next action beside who it affects; the review date in words; and "What would
// overturn it" as a copper band. Phone: the same order, one column.
import { COMMIT_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotIndex, slotName } from '../../decision-book/render/core';
import { type Basis, basisWords, reviewWords } from '../../decision-book/render/record';

export type StepView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const T = 'var(--ch-teal)';
const C = 'var(--ch-copper)';
const I = 'var(--ch-ink)';
const P = 'var(--ch-paper)';

/** Each part's mark, in the pack's language: teal paths, one copper hinge, ink for weight (static markup, 100×100). */
const MARKS: Record<string, string> = {
  result: `<circle cx="50" cy="50" r="36" fill="none" stroke="${T}" stroke-width="8"/><polygon points="50,38 62,50 50,62 38,50" fill="${C}"/>`,
  rests_on: `<path d="M18 80H82" stroke="${I}" stroke-width="10" stroke-linecap="round"/><path d="M30 80V40H70V80" fill="none" stroke="${T}" stroke-width="8" stroke-linejoin="round"/><polygon points="50,22 62,34 50,46 38,34" fill="${C}"/>`,
  next_action: `<path d="M16 70H50L84 36" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><polygon points="50,58 62,70 50,82 38,70" fill="${C}"/>`,
  affected: `<path d="M20 74C30 54 40 54 50 74C60 54 70 54 80 74" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/><circle cx="30" cy="36" r="10" fill="${I}"/><circle cx="70" cy="36" r="10" fill="${I}"/><polygon points="50,34 58,42 50,50 42,42" fill="${C}"/>`,
  check_back: `<rect x="18" y="24" width="64" height="58" fill="none" stroke="${T}" stroke-width="6"/><line x1="18" y1="40" x2="82" y2="40" stroke="${T}" stroke-width="6"/><polygon points="50,48 60,58 50,68 40,58" fill="${C}"/>`,
  change_course: `<path d="M18 50H44 M56 50C70 50 72 26 84 26 M56 50C70 50 72 74 84 74" fill="none" stroke="${T}" stroke-width="8" stroke-linecap="round"/><polygon points="50,40 60,50 50,60 40,50" fill="${C}" stroke="${P}" stroke-width="2"/>`
};

function mark(doc: Document, slot: string): SVGSVGElement {
  const node = doc.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('class', 'ch-commit__mark');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = MARKS[slot];
  return node;
}

/** Each part: its slot, class, heading and fill. */
const PARTS: Array<{ slot: keyof typeof COMMIT_SLOTS; className: string; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'result', className: 'ch-commit__result', title: 'The result that matters', fill: 'ink' },
  { slot: 'rests_on', className: 'ch-commit__rests', title: 'Rests on', fill: 'tint' },
  { slot: 'next_action', className: 'ch-commit__action', title: 'Next action', fill: 'green' },
  { slot: 'affected', className: 'ch-commit__affected', title: 'Who it affects', fill: 'tint' },
  { slot: 'check_back', className: 'ch-commit__back', title: 'Review date', fill: 'tint' },
  { slot: 'change_course', className: 'ch-commit__turn', title: 'What would overturn it', fill: 'red' }
];

export function createStepView(doc: Document = document): StepView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'commit',
    label: 'The reversible step',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const part = (spec: (typeof PARTS)[number]): HTMLDivElement => {
          const box = el(doc, 'div', `ch-commit__part ${spec.className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', spec.title);
          box.append(mark(doc, spec.slot), el(doc, 'span', 'ch-commit__title', spec.title));
          hosts.set(spec.slot, box);
          return box;
        };
        const [result, rests, action, affected, back, turn] = PARTS.map(part);
        const go = el(doc, 'div', 'ch-commit__row');
        go.append(action, affected);
        const ends = el(doc, 'div', 'ch-commit__row');
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
