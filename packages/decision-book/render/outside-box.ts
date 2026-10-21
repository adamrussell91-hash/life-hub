// packages/decision-book/render/outside-box.ts
// Thinking outside the box: nine dots in a 3×3 square, with a "Show one way" toggle that
// draws the four-line answer, its lines running past the square. Beside it, the person's
// attempt and the box they had assumed. Phone: the dots sit above the two answers.
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

/** Dot centres on a 0–2 grid, drawn 30 apart from (25, 25). */
const at = (n: number): number => 25 + n * 30;
/** One way: up the left column past the top, down through the diagonal past the right, back along the foot, then up the other diagonal. */
export const NINE_DOT_ANSWER: Array<[number, number]> = [[0, 2], [0, -1], [3, 2], [0, 2], [2, 0]];

export function createOutsideBoxView(tool: ChartTool, doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLDivElement>();
  return createChart({
    family: 'outside-box',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const puzzle = el(doc, 'div', 'dm-dots');
        const drawing = svg(doc, 'svg', { class: 'dm-dots__drawing', viewBox: '0 0 130 130', role: 'img', 'aria-label': 'Nine dots in a three by three square' });
        const answer = svg(doc, 'polyline', { class: 'dm-dots__answer', points: NINE_DOT_ANSWER.map(([x, y]) => `${at(x)},${at(y)}`).join(' ') });
        drawing.append(answer);
        for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) drawing.append(svg(doc, 'circle', { class: 'dm-dots__dot', cx: String(at(col)), cy: String(at(row)), r: '6' }));
        const toggle = el(doc, 'button', 'dm-dots__toggle', 'Show one way');
        toggle.type = 'button';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.addEventListener('click', () => {
          const on = toggle.getAttribute('aria-pressed') !== 'true';
          toggle.setAttribute('aria-pressed', String(on));
          toggle.textContent = on ? 'Hide the answer' : 'Show one way';
          puzzle.classList.toggle('is-revealed', on);
        });
        puzzle.append(drawing, toggle);
        const answers = el(doc, 'div', 'dm-dots__answers');
        for (const [slot, label] of [['attempt', tool.slots.attempt], ['assumption', tool.slots.assumption]]) {
          const box = el(doc, 'div', 'dm-dots__answer-box');
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', label);
          box.append(el(doc, 'span', 'dm-chart__slot-label', label));
          answers.append(box);
          hosts.set(slot, box);
        }
        ctx.frame.append(puzzle, answers);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => ({ node, host: hosts.get(slotName(node))!, fill: slotName(node) === 'assumption' ? 'red' : 'tint', label: tool.slots[slotName(node)] }));
    }
  }, doc);
}
