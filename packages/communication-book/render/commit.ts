// packages/communication-book/render/commit.ts
// The next conversation, Commit's chart: what would show it went better as the headline; what it
// rests on, each saying which model and node it uses (from setBasis, as Decision Maker's decision
// record does); the next conversation beside who takes it; the date to come back in words; and
// "What would change course" as a gold band. Phone: the same order, one column.
import { COMMIT_SLOTS } from '../commit-slots.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, slotIndex, slotName } from '../../decision-book/render/core';
import { type Basis, basisWords, reviewWords } from '../../decision-book/render/record';

export type StepView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

const SVG_NS = 'http://www.w3.org/2000/svg';
const I = 'var(--cmb-ink)';
const R = 'var(--cmb-grey)';
const G = 'var(--cmb-gold)';

/** The pack's quotation mark (a square head with a cut wedge tail) at x, y, scaled by s. */
const quote = (x: number, y: number, s: number, fill: string): string =>
  `<polygon points="${[[0, 0], [1, 0], [1, 1.2], [0.3, 1.8], [0.45, 1], [0, 1]].map(([px, py]) => `${x + px * s},${y + py * s}`).join(' ')}" fill="${fill}"/>`;

/** Each part's mark, in the pack's language: ink bars for said speech, grey for heard or withheld, one gold point; square ends, no curves but the full stop (static markup, 100×100). */
const MARKS: Record<string, string> = {
  result: `${quote(14, 18, 16, I)}${quote(38, 18, 16, I)}<rect x="14" y="66" width="56" height="12" fill="${R}"/><circle cx="80" cy="72" r="8" fill="${G}"/>`,
  rests_on: `<rect x="14" y="78" width="72" height="12" fill="${I}"/><rect x="26" y="58" width="48" height="12" fill="${R}"/><circle cx="50" cy="38" r="8" fill="${G}"/>`,
  next_action: `${quote(14, 20, 16, I)}<rect x="40" y="26" width="46" height="12" fill="${I}"/><rect x="40" y="46" width="34" height="8" fill="${R}"/><rect x="40" y="62" width="20" height="8" fill="${G}"/>`,
  owner: `${quote(14, 22, 16, I)}<rect x="14" y="62" width="34" height="12" fill="${I}"/><rect x="58" y="62" width="28" height="12" fill="${R}"/><circle cx="72" cy="36" r="8" fill="${G}"/>`,
  check_back: `<rect x="14" y="20" width="72" height="12" fill="${I}"/><rect x="14" y="20" width="12" height="62" fill="${I}"/><rect x="74" y="20" width="12" height="62" fill="${I}"/><rect x="14" y="70" width="72" height="12" fill="${I}"/><circle cx="50" cy="52" r="8" fill="${G}"/>`,
  change_course: `<rect x="14" y="30" width="44" height="12" fill="${I}"/><rect x="14" y="58" width="32" height="12" fill="${R}"/><rect x="56" y="58" width="30" height="12" fill="${G}"/>`
};

function mark(doc: Document, slot: string): SVGSVGElement {
  const node = doc.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', '0 0 100 100');
  node.setAttribute('class', 'cmb-commit__mark');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = MARKS[slot];
  return node;
}

/** Each part: its slot, class, heading and fill. */
const PARTS: Array<{ slot: keyof typeof COMMIT_SLOTS; className: string; title: string; fill: EntrySpec['fill'] }> = [
  { slot: 'result', className: 'cmb-commit__result', title: 'What would show it went better', fill: 'ink' },
  { slot: 'rests_on', className: 'cmb-commit__rests', title: 'Rests on', fill: 'tint' },
  { slot: 'next_action', className: 'cmb-commit__action', title: 'The next conversation', fill: 'green' },
  { slot: 'owner', className: 'cmb-commit__owner', title: 'Who takes it', fill: 'tint' },
  { slot: 'check_back', className: 'cmb-commit__back', title: 'Come back on', fill: 'tint' },
  { slot: 'change_course', className: 'cmb-commit__turn', title: 'What would change course', fill: 'red' }
];

export function createStepView(doc: Document = document): StepView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'commit',
    label: 'The next conversation',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const part = (spec: (typeof PARTS)[number]): HTMLDivElement => {
          const box = el(doc, 'div', `cmb-commit__part ${spec.className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', spec.title);
          box.append(mark(doc, spec.slot), el(doc, 'span', 'cmb-commit__title', spec.title));
          hosts.set(spec.slot, box);
          return box;
        };
        const [result, rests, action, owner, back, turn] = PARTS.map(part);
        const go = el(doc, 'div', 'cmb-commit__row');
        go.append(action, owner);
        const ends = el(doc, 'div', 'cmb-commit__row');
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
