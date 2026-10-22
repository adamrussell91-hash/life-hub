// packages/decision-book/render/quadrant.ts
// The quadrant family's chart: a 2×2 of named cells on two labelled axes, the y axis's words
// running up the left (high at the top) and the x axis's along the foot (high at the right),
// as the cells' `col` and `row` say. Each item is a pill in its cell. A payoff cell shows its
// fixed note under the label. Phone (the chart up to 480px wide): the axes go and the cells
// stack as labelled cards, each saying where it sits on both axes.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, slotIndex, slotName } from './core';

export type QuadrantCell = { id: string; label: string; col: 0 | 1; row: 0 | 1; fill: Fill; note?: string };
export type QuadrantChart = {
  axes: { x: { label: string; low: string; high: string }; y: { label: string; low: string; high: string } };
  cells: QuadrantCell[];
  item: string;
  subject?: string;
  reflection?: string | false;
};
export type ChartTool = { name: string; slots: Record<string, string> };

/** Where a cell sits, in words: "High value · Low effort". */
export function cellAxes(chart: QuadrantChart, cell: QuadrantCell): string {
  return `${cell.row === 0 ? chart.axes.y.high : chart.axes.y.low} · ${cell.col === 0 ? chart.axes.x.low : chart.axes.x.high}`;
}

export function createQuadrantView(tool: ChartTool & { chart: QuadrantChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const hosts = new Map<string, HTMLDivElement>();
  return createChart({
    family: 'quadrant',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const yAxis = el(doc, 'div', 'dm-quad__y');
        yAxis.setAttribute('aria-hidden', 'true');
        yAxis.append(el(doc, 'span', 'dm-quad__axis-high', chart.axes.y.high), el(doc, 'span', 'dm-quad__axis-label', chart.axes.y.label), el(doc, 'span', 'dm-quad__axis-low', chart.axes.y.low));
        const grid = el(doc, 'div', 'dm-quad__grid');
        for (const cell of chart.cells) {
          const box = el(doc, 'div', 'dm-quad__cell');
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', `${cell.label}: ${cellAxes(chart, cell).toLowerCase()}`);
          box.setAttribute('data-cell', cell.id);
          box.setAttribute('data-fill', cell.fill);
          box.style.gridColumn = String(cell.col + 1);
          box.style.gridRow = String(cell.row + 1);
          const head = el(doc, 'div', 'dm-quad__head');
          head.setAttribute('aria-hidden', 'true');
          head.append(el(doc, 'span', 'dm-quad__label', cell.label), el(doc, 'span', 'dm-quad__axes', cellAxes(chart, cell)));
          if (cell.note) head.append(el(doc, 'span', 'dm-quad__note', cell.note));
          const items = el(doc, 'div', 'dm-quad__items');
          box.append(head, items);
          grid.append(box);
          hosts.set(cell.id, items);
        }
        const xAxis = el(doc, 'div', 'dm-quad__x');
        xAxis.setAttribute('aria-hidden', 'true');
        xAxis.append(el(doc, 'span', 'dm-quad__axis-low', chart.axes.x.low), el(doc, 'span', 'dm-quad__axis-label', chart.axes.x.label), el(doc, 'span', 'dm-quad__axis-high', chart.axes.x.high));
        ctx.frame.append(yAxis, grid, xAxis);
      }
      return run.nodes
        .filter((node) => slotName(node) === 'item' && hosts.has(node.tag ?? ''))
        .map((node) => {
          const cell = chart.cells.find((c) => c.id === node.tag)!;
          return { node, host: hosts.get(cell.id)!, fill: cell.fill, label: `${cell.label} item ${slotIndex(node)}` };
        });
    }
  }, doc);
}
