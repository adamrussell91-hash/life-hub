// packages/collaboration-book/render/commit.ts
// The team experiment, Agree's chart: the result for the team as the headline; what it rests on,
// each saying which model and node it uses (from setBasis, as Decision Maker's decision record
// does); the next action beside its owner; the date to come back in words; and "What would change
// course" as a gold band. Phone: the same order, one column.
import { COMMIT_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotIndex, slotName } from '../../decision-book/render/core';
import { type Basis, basisWords, reviewWords } from '../../decision-book/render/record';

export type StepView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const P = 'var(--cb-purple)';
const C = 'var(--cb-cyan)';
const G = 'var(--cb-gold)';

/** Each part's mark, in the pack's language: purple ribbons, cyan for what joins people, one gold point (static markup, 100×100). */
const MARKS: Record<string, string> = {
  result: `<circle cx="50" cy="50" r="34" fill="none" stroke="${P}" stroke-width="8"/><circle cx="50" cy="50" r="10" fill="${G}"/>`,
  rests_on: `<path d="M18 80H82" stroke="${P}" stroke-width="10" stroke-linecap="round"/><path d="M30 80C30 50 70 50 70 80" fill="none" stroke="${C}" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="30" r="9" fill="${G}"/>`,
  next_action: `<path d="M16 70H48L80 38" fill="none" stroke="${C}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="80" cy="38" r="9" fill="${G}"/>`,
  owner: `<circle cx="36" cy="40" r="12" fill="none" stroke="${P}" stroke-width="7"/><circle cx="64" cy="40" r="12" fill="none" stroke="${C}" stroke-width="7"/><path d="M18 80C24 64 48 64 50 80C52 64 76 64 82 80" fill="none" stroke="${P}" stroke-width="7" stroke-linecap="round"/>`,
  check_back: `<rect x="18" y="24" width="64" height="58" rx="6" fill="none" stroke="${P}" stroke-width="6"/><line x1="18" y1="40" x2="82" y2="40" stroke="${P}" stroke-width="6"/><circle cx="50" cy="60" r="9" fill="${G}"/>`,
  change_course: `<path d="M18 50H44 M56 50C70 50 72 26 84 26 M56 50C70 50 72 74 84 74" fill="none" stroke="${C}" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="50" r="9" fill="${G}"/>`
};

function mark(doc: Document, slot: string): SVGSVGElement {
  const node = doc.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('class', 'cb-commit__mark');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = MARKS[slot];
  return node;
}

/** Each part: its slot, class, heading and fill. */
const PARTS: Array<{ slot: keyof typeof COMMIT_SLOTS; className: string; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'result', className: 'cb-commit__result', title: 'The result for the team', fill: 'ink' },
  { slot: 'rests_on', className: 'cb-commit__rests', title: 'Rests on', fill: 'tint' },
  { slot: 'next_action', className: 'cb-commit__action', title: 'Next action', fill: 'green' },
  { slot: 'owner', className: 'cb-commit__owner', title: 'Who owns it', fill: 'tint' },
  { slot: 'check_back', className: 'cb-commit__back', title: 'Come back on', fill: 'tint' },
  { slot: 'change_course', className: 'cb-commit__turn', title: 'What would change course', fill: 'red' }
];

export function createStepView(doc: Document = document): StepView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'commit',
    label: 'The team experiment',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const part = (spec: (typeof PARTS)[number]): HTMLDivElement => {
          const box = el(doc, 'div', `cb-commit__part ${spec.className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', spec.title);
          box.append(mark(doc, spec.slot), el(doc, 'span', 'cb-commit__title', spec.title));
          hosts.set(spec.slot, box);
          return box;
        };
        const [result, rests, action, owner, back, turn] = PARTS.map(part);
        const go = el(doc, 'div', 'cb-commit__row');
        go.append(action, owner);
        const ends = el(doc, 'div', 'cb-commit__row');
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
