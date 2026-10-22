// packages/decision-book/render/tension.ts
// The tension family's chart.
//   pull      the centre disc between two columns of equal arrows pointing away from it
//             (no lengths: the kit forbids a made-up balance of forces);
//   gap       two columns facing each other across a named gap;
//   triangle  three corners around the centre; a fixed corner is filled and says "Fixed",
//             and its fix note sits under it.
// Phone: the columns stack (first side, centre, second side); the triangle becomes three
// labelled corner cards.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, setAttr, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

export type TensionChart = { variant: 'pull' | 'gap' | 'triangle'; centre: string; sides: { id: string; label: string; fill: Fill }[]; gap?: string; pick?: number };

export function createTensionView(tool: ChartTool & { chart: TensionChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const sides = new Map<string, { box: HTMLDivElement; forces: HTMLDivElement; fixes: HTMLDivElement; flag: HTMLSpanElement }>();
  let centreBox: HTMLDivElement | null = null;

  function sideBox(side: TensionChart['sides'][number], index: number): HTMLDivElement {
    const box = el(doc, 'div', 'dm-tension__side');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', side.label);
    box.setAttribute('data-side', side.id);
    box.setAttribute('data-fill', side.fill);
    box.setAttribute('data-at', String(index));
    const head = el(doc, 'div', 'dm-tension__head');
    head.setAttribute('aria-hidden', 'true');
    head.append(el(doc, 'span', 'dm-tension__label', side.label));
    const flag = el(doc, 'span', 'dm-tension__fixed', 'Fixed');
    flag.hidden = true;
    head.append(flag);
    const forces = el(doc, 'div', 'dm-tension__forces');
    const fixes = el(doc, 'div', 'dm-tension__fixes');
    box.append(head, forces, fixes);
    sides.set(side.id, { box, forces, fixes, flag });
    return box;
  }

  return createChart({
    family: 'tension',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!centreBox) {
        const stage = el(doc, 'div', `dm-tension__stage dm-tension__stage--${chart.variant}`);
        centreBox = el(doc, 'div', 'dm-tension__centre');
        centreBox.setAttribute('role', 'group');
        centreBox.setAttribute('aria-label', chart.centre);
        centreBox.append(el(doc, 'span', 'dm-tension__centre-label', chart.centre));
        if (chart.variant === 'triangle') {
          const shape = svg(doc, 'svg', { class: 'dm-tension__triangle', viewBox: '0 0 100 88', 'aria-hidden': 'true' });
          shape.append(svg(doc, 'polygon', { points: '50,4 96,84 4,84' }));
          stage.append(shape, sideBox(chart.sides[0], 0), centreBox, sideBox(chart.sides[1], 1), sideBox(chart.sides[2], 2));
        } else {
          const middle = el(doc, 'div', 'dm-tension__middle');
          if (chart.variant === 'gap') {
            const gap = el(doc, 'span', 'dm-tension__gap', chart.gap!);
            gap.setAttribute('aria-hidden', 'true');
            middle.append(gap);
          }
          middle.append(centreBox);
          stage.append(sideBox(chart.sides[0], 0), middle, sideBox(chart.sides[1], 1));
        }
        ctx.frame.append(stage);
      }
      const fixed = new Set(run.nodes.filter((node) => slotName(node) === 'fix').map((node) => node.tag));
      for (const [id, side] of sides) {
        side.flag.hidden = !fixed.has(id);
        setAttr(side.box, 'data-fixed', fixed.has(id) ? 'true' : null);
      }
      const out: EntrySpec[] = [];
      for (const node of run.nodes) {
        const name = slotName(node);
        if (name === 'centre') out.push({ node, host: centreBox!, fill: 'ink', label: chart.centre });
        const side = chart.sides.find((s) => s.id === node.tag);
        if (!side) continue;
        if (name === 'force') out.push({ node, host: sides.get(side.id)!.forces, fill: side.fill, label: `${side.label}, force ${slotIndex(node)}` });
        if (name === 'fix') out.push({ node, host: sides.get(side.id)!.fixes, fill: 'ink', label: `${side.label} held fixed` });
      }
      return out;
    }
  }, doc);
}
