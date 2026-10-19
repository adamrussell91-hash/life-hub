// packages/problem-solver/render/intent-statement.ts
// Intent statement (toolkit, Analyse): six bands stacked in a column, red, yellow, blue,
// red, yellow, blue. Each band is an arrow pointing right, with a flat left edge whose
// notch holds a small triangle in the next band's colour, as the book draws it. The
// heading sits on the left of the band and the node's title on the right.
// Each band appears with its own node, in fixed order whatever order the nodes arrive,
// and unfurls left to right. The whole band is the button for its details card, which
// opens under it. On a narrow panel the heading sits above the title.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type IntentStatementView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Part = 'problem' | 'stakeholders' | 'failures' | 'approach' | 'opportunity' | 'risk';

const PARTS: Part[] = ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk'];
const HEADING: Record<Part, string> = { problem: 'Problem', stakeholders: 'Stakeholders', failures: 'Failures', approach: 'Approach', opportunity: 'Opportunity', risk: 'Risk' };
const COLOURS: Accent[] = ['red', 'yellow', 'blue'];

const SVG = 'http://www.w3.org/2000/svg';

const isPart = (name: string | undefined): name is Part => PARTS.includes(name as Part);

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

type Band = { item: HTMLDivElement; button: HTMLButtonElement; part: Part };

export function createIntentStatementView(doc: Document = document): IntentStatementView {
  const root = doc.createElement('div');
  root.className = 'ps-intent';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Intent statement');

  const group = createDisclosureGroup();
  const bands = new Map<string, Band>();
  const parts = new Map<Part, Band>();
  let stack: HTMLDivElement | null = null;

  /**
   * The focus and open rings: one SVG filter each that grows the band's silhouette by 2px in
   * paper, then in ink, so the ring traces the arrow exactly and the clip never cuts it.
   */
  function ringFilters(): SVGSVGElement {
    const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'ps-intent__defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const defs = doc.createElementNS(SVG, 'defs');
    for (const [kind, ink] of [['focus', 4], ['open', 3.5]] as const) {
      const id = nextId(`ps-intent-ring-${kind}`);
      const filter = doc.createElementNS(SVG, 'filter');
      filter.setAttribute('id', id);
      for (const [name, value] of [['x', '-10%'], ['y', '-20%'], ['width', '120%'], ['height', '140%'], ['color-interpolation-filters', 'sRGB']]) filter.setAttribute(name, value);
      const layer = (radius: number, colour: string, result: string): void => {
        const grow = doc.createElementNS(SVG, 'feMorphology');
        grow.setAttribute('in', 'SourceAlpha');
        grow.setAttribute('operator', 'dilate');
        grow.setAttribute('radius', String(radius));
        grow.setAttribute('result', `${result}-shape`);
        const flood = doc.createElementNS(SVG, 'feFlood');
        flood.setAttribute('class', `ps-intent__flood--${colour}`);
        flood.setAttribute('result', `${result}-colour`);
        const fill = doc.createElementNS(SVG, 'feComposite');
        fill.setAttribute('in', `${result}-colour`);
        fill.setAttribute('in2', `${result}-shape`);
        fill.setAttribute('operator', 'in');
        fill.setAttribute('result', result);
        filter.append(grow, flood, fill);
      };
      layer(ink, 'ink', 'ink');
      layer(2, 'paper', 'paper');
      const merge = doc.createElementNS(SVG, 'feMerge');
      for (const input of ['ink', 'paper', 'SourceGraphic']) {
        const n = doc.createElementNS(SVG, 'feMergeNode');
        n.setAttribute('in', input);
        merge.append(n);
      }
      filter.append(merge);
      defs.append(filter);
      root.style.setProperty(`--ps-intent-ring-${kind}`, `url(#${id})`);
    }
    svg.append(defs);
    return svg;
  }

  function ensureStack(): HTMLDivElement {
    if (stack) return stack;
    root.append(ringFilters());
    stack = doc.createElement('div');
    stack.className = 'ps-intent__stack';
    stack.setAttribute('data-region', 'statement');
    stack.setAttribute('aria-label', 'Problem, stakeholders, failures, approach, opportunity and risk');
    root.append(stack);
    return stack;
  }

  const label = (part: Part, node: PsNode): string => `${HEADING[part]}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`;

  function addBand(node: PsNode, part: Part): Band {
    const index = PARTS.indexOf(part);
    const colour = COLOURS[index % 3];
    const detailsId = nextId('ps-intent-details');
    const item = doc.createElement('div');
    item.className = `ps-intent__item is-${colour} ps-intent__item--${part}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-part', part);

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-intent__band';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    // The arrow is clipped; the ring is drawn round the button's silhouette, so it is never clipped.
    const shape = span(doc, 'ps-intent__shape');
    shape.setAttribute('aria-hidden', 'true');
    shape.append(span(doc, `ps-intent__notch is-${COLOURS[(index + 1) % 3]}`));
    const words = span(doc, 'ps-intent__words');
    const title = span(doc, 'ps-intent__title-line');
    title.append(span(doc, 'ps-intent__title', nodeTitle(node)));
    if (node.state === 'contested') title.append(contestedTag(doc, node));
    words.append(span(doc, 'ps-intent__heading', HEADING[part]), title);
    button.append(shape, words);
    button.setAttribute('aria-label', label(part, node));

    const card = detailsCard(doc, node, colour, detailsId);
    item.append(button, card);
    group.register(item, button);

    // Keep the bands in book order whatever order the nodes arrive in.
    const later = PARTS.slice(index + 1).map((p) => parts.get(p)?.item).find(Boolean) ?? null;
    ensureStack().insertBefore(item, later);
    const band: Band = { item, button, part };
    bands.set(node.id, band);
    parts.set(part, band);
    return band;
  }

  /** A new band unfurls from its left edge; several arriving at once follow one another down. */
  function unfurl(band: Band, delay: number): void {
    if (!canAnimate(band.button)) return;
    band.button.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 480, delay, easing: EASE, fill: 'backwards' });
    const words = band.button.querySelector('.ps-intent__words');
    if (words) words.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: delay + 200, easing: EASE, fill: 'backwards' });
  }

  function update(run: PsToolRun): void {
    const fresh: Band[] = [];
    for (const node of run.nodes) {
      const name = parseSlot(node.slot)?.name;
      if (!isPart(name)) continue;
      let band = bands.get(node.id);
      if (!band) {
        // One band per part: a second node for a filled part is ignored.
        if (parts.has(name)) continue;
        band = addBand(node, name);
        fresh.push(band);
      }
      band.item.classList.toggle('is-contested', node.state === 'contested');
    }
    fresh.sort((a, b) => PARTS.indexOf(a.part) - PARTS.indexOf(b.part));
    // Keep a whole statement arriving at once under about a second.
    const step = fresh.length > 1 ? Math.min(90, 450 / (fresh.length - 1)) : 0;
    fresh.forEach((band, i) => unfurl(band, Math.round(i * step)));
  }

  return { el: root, update };
}
