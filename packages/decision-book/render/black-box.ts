// packages/decision-book/render/black-box.ts
// The black box: what goes in on the left, a solid ink square in the middle, what comes out on
// the right, joined by arrows. The hidden part is a "?" inside the square until the person
// names it; then their words sit inside it. Phone: inputs, box and outputs stack top to bottom
// and the arrows turn down.
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

export function createBlackBoxView(tool: ChartTool, doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLDivElement>();
  let mark: HTMLSpanElement | null = null;
  return createChart({
    family: 'black-box',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const stage = el(doc, 'div', 'dm-box');
        const column = (slot: string, title: string): HTMLDivElement => {
          const box = el(doc, 'div', `dm-box__side dm-box__side--${slot}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', title);
          box.append(el(doc, 'span', 'dm-box__title', title));
          hosts.set(slot, box);
          return box;
        };
        const arrow = (): HTMLSpanElement => {
          const out = el(doc, 'span', 'dm-box__arrow');
          out.setAttribute('aria-hidden', 'true');
          return out;
        };
        const middle = el(doc, 'div', 'dm-box__box');
        middle.setAttribute('role', 'group');
        middle.setAttribute('aria-label', tool.slots.inside);
        mark = el(doc, 'span', 'dm-box__mark', '?');
        mark.setAttribute('aria-hidden', 'true');
        middle.append(mark);
        hosts.set('inside', middle);
        stage.append(column('input', 'In'), arrow(), middle, arrow(), column('output', 'Out'));
        ctx.frame.append(stage);
      }
      const nodes = run.nodes.filter((node) => hosts.has(slotName(node)));
      if (mark) mark.hidden = nodes.some((node) => slotName(node) === 'inside');
      return nodes.map((node) => {
        const name = slotName(node);
        return { node, host: hosts.get(name)!, fill: name === 'inside' ? 'ink' : name === 'input' ? 'tint' : 'green', label: name === 'inside' ? tool.slots.inside : `${name === 'input' ? 'In' : 'Out'} ${slotIndex(node)}` };
      });
    }
  }, doc);
}
