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
   * The ring layers are arrows outset round the band (see the CSS). Keeping their slants a
   * true distance from the fill's needs the slant's steepness, which depends on the band's
   * height, so each band carries two factors: --ps-intent-tip = 1 / sin(slant), how far the
   * outset tip moves per pixel of ring, and --ps-intent-run = point / half-height, how far
   * the outset shoulder moves back. The CSS defaults fit a band at its minimum height.
   */
  const sizes = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        // Read every band first, then write.
        const measured = entries.map(({ target }) => {
          const el = target as HTMLElement;
          const half = el.getBoundingClientRect().height / 2;
          const point = parseFloat(getComputedStyle(el).getPropertyValue('--ps-intent-point')) || 0;
          return { el, half, point };
        });
        for (const { el, half, point } of measured) {
          if (!half || !point) continue;
          const tip = (Math.hypot(point, half) / half).toFixed(4);
          const run = (point / half).toFixed(4);
          if (el.style.getPropertyValue('--ps-intent-tip') !== tip) el.style.setProperty('--ps-intent-tip', tip);
          if (el.style.getPropertyValue('--ps-intent-run') !== run) el.style.setProperty('--ps-intent-run', run);
        }
      })
    : null;

  function ensureStack(): HTMLDivElement {
    if (stack) return stack;
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
    // Back to front: the ring (two outset arrows, shown on focus and when open), then the
    // clipped fill with its notch, then the words, which are never clipped or filtered.
    const ring = span(doc, 'ps-intent__ring');
    ring.setAttribute('aria-hidden', 'true');
    const shape = span(doc, 'ps-intent__shape');
    shape.setAttribute('aria-hidden', 'true');
    shape.append(span(doc, `ps-intent__notch is-${COLOURS[(index + 1) % 3]}`));
    const words = span(doc, 'ps-intent__words');
    const title = span(doc, 'ps-intent__title-line');
    title.append(span(doc, 'ps-intent__title', nodeTitle(node)));
    if (node.state === 'contested') title.append(contestedTag(doc, node));
    words.append(span(doc, 'ps-intent__heading', HEADING[part]), title);
    button.append(ring, shape, words);
    button.setAttribute('aria-label', label(part, node));

    const card = detailsCard(doc, node, colour, detailsId);
    item.append(button, card);
    group.register(item, button);

    // Keep the bands in book order whatever order the nodes arrive in.
    const later = PARTS.slice(index + 1).map((p) => parts.get(p)?.item).find(Boolean) ?? null;
    ensureStack().insertBefore(item, later);
    const band: Band = { item, button, part };
    bands.set(node.id, band);
    sizes?.observe(button);
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
