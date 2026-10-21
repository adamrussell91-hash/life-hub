// packages/decision-book/render/plot.ts
// The plot family's chart: one square field per plot (two qualitative axes, low at the bottom
// left), an optional shaded band (a rectangle, or a diagonal channel), and each point as a pill
// at its place. A point not yet placed waits in a tray under the field. The person places
// points with the form under the chart: per point, a 1–10 select for each axis (and size),
// then Place, which sends a score snapshot. When the axes are dimensions the person names, the
// names they gave sit above the plots and every axis, key line and select uses them.
// Phone: the field keeps its square (pills shrink to dots with the name in the key); the key
// lists every point with its position in words.
import { axisLabel, positionsOf } from '../families/plot.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

type Axis = { label?: string; dim?: string; low: string; high: string };
type Axes = { x: Axis; y: Axis };
export type PlotChart = {
  axes?: Axes;
  plots?: { id: string; label: string; axes: Axes }[];
  point: string;
  size?: { label: string };
  band?: { label: string; x?: [number, number]; y?: [number, number]; diagonal?: number };
  dimensions?: { id: string; label: string }[];
};
type Place = { x?: number; y?: number; size?: number };

/** Percent along an axis for a 1–10 value (1 at 5%, 10 at 95%). */
export const pct = (value: number): number => 5 + ((value - 1) / 9) * 90;
/** How far a pill shifts left of its point: none near the left edge, all of it near the right. */
export const shift = (x: number): string => (x <= 3 ? '0%' : x >= 8 ? '-100%' : '-50%');
/** The clip path of a channel `d` percent either side of the rising diagonal. */
export const diagonalBand = (d: number): string => `polygon(0% ${100 - d}%, 0% 100%, ${d}% 100%, 100% ${d}%, 100% 0%, ${100 - d}% 0%)`;

export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const plots = chart.plots ?? [{ id: 'main', label: '', axes: chart.axes! }];
  const fields = new Map<string, { field: HTMLDivElement; tray: HTMLDivElement; xLabel: HTMLSpanElement; yLabel: HTMLSpanElement }>();
  const key = el(doc, 'ol', 'dm-plot__key');
  const form = el(doc, 'form', 'dm-plot__form');
  const dims = el(doc, 'div', 'dm-plot__dims');
  const rows = new Map<string, { row: HTMLFieldSetElement; name: HTMLLegendElement; selects: Record<string, HTMLSelectElement>; labels: Record<string, HTMLSpanElement> }>();
  let emit: (payload: Record<string, unknown>) => void = () => {};
  let formHead: HTMLParagraphElement | null = null;
  let current: DmToolRun | null = null;
  const words = (axis: Axis): string => (current ? axisLabel(current, axis) : axis.label ?? '');

  function select(label: string, value: number | undefined): HTMLLabelElement {
    const wrap = el(doc, 'label', 'dm-plot__pick');
    wrap.append(el(doc, 'span', 'dm-plot__pick-label', label));
    const input = el(doc, 'select', 'dm-plot__select');
    input.append(el(doc, 'option', '', '–'));
    for (let n = 1; n <= 10; n += 1) input.append(Object.assign(el(doc, 'option', '', String(n)), { value: String(n) }));
    input.value = value ? String(value) : '–';
    wrap.append(input);
    return wrap;
  }

  function syncForm(points: { id: string; title: string; plot: (typeof plots)[number] }[], at: Record<string, Place>): void {
    for (const id of [...rows.keys()]) if (!points.some((p) => p.id === id)) {
      rows.get(id)!.row.remove();
      rows.delete(id);
    }
    for (const point of points) {
      let row = rows.get(point.id);
      if (!row) {
        const fieldset = el(doc, 'fieldset', 'dm-plot__row');
        const name = el(doc, 'legend', 'dm-plot__row-name');
        const x = select(words(point.plot.axes.x), at[point.id]?.x);
        const y = select(words(point.plot.axes.y), at[point.id]?.y);
        const size = chart.size ? select(chart.size.label, at[point.id]?.size) : null;
        const go = el(doc, 'button', 'dm-plot__place', 'Place');
        go.type = 'button';
        const selects: Record<string, HTMLSelectElement> = { x: x.querySelector('select')!, y: y.querySelector('select')! };
        const labels: Record<string, HTMLSpanElement> = { x: x.querySelector('span')!, y: y.querySelector('span')! };
        if (size) selects.size = size.querySelector('select')!;
        go.addEventListener('click', () => {
          const place: Place = {};
          for (const [axis, input] of Object.entries(selects)) if (input.value !== '–') place[axis as keyof Place] = Number(input.value);
          if (place.x && place.y) emit({ points: { [point.id]: place } });
        });
        fieldset.append(name, x, y, ...(size ? [size] : []), go);
        form.append(fieldset);
        row = { row: fieldset, name, selects, labels };
        rows.set(point.id, row);
      }
      setText(row.name, point.title);
      setText(row.labels.x, words(point.plot.axes.x));
      setText(row.labels.y, words(point.plot.axes.y));
      for (const [axis, input] of Object.entries(row.selects)) {
        const value = at[point.id]?.[axis as keyof Place];
        if (value && doc.activeElement !== input) input.value = String(value);
      }
      form.append(row.row);
    }
  }

  return createChart({
    family: 'plot',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      current = run;
      if (!fields.size) {
        if (chart.dimensions) {
          dims.setAttribute('role', 'group');
          dims.setAttribute('aria-label', 'Dimensions you named');
          dims.append(el(doc, 'span', 'dm-chart__slot-label', 'Dimensions you named'));
          ctx.frame.append(dims);
        }
        for (const plot of plots) {
          const wrap = el(doc, 'div', 'dm-plot__plot');
          if (plot.label) wrap.append(el(doc, 'h3', 'dm-plot__title', plot.label));
          const body = el(doc, 'div', 'dm-plot__body');
          const y = el(doc, 'div', 'dm-plot__y');
          y.setAttribute('aria-hidden', 'true');
          const yLabel = el(doc, 'span', 'dm-plot__axis-label');
          y.append(el(doc, 'span', '', plot.axes.y.high), yLabel, el(doc, 'span', '', plot.axes.y.low));
          const field = el(doc, 'div', 'dm-plot__field');
          field.setAttribute('role', 'group');
          if (chart.band) {
            const band = el(doc, 'div', 'dm-plot__band', chart.band.label);
            if (chart.band.diagonal) {
              band.classList.add('dm-plot__band--diagonal');
              band.style.clipPath = diagonalBand(chart.band.diagonal);
            } else {
              band.style.left = `${pct(chart.band.x![0])}%`;
              band.style.width = `${pct(chart.band.x![1]) - pct(chart.band.x![0])}%`;
              band.style.bottom = `${pct(chart.band.y![0])}%`;
              band.style.height = `${pct(chart.band.y![1]) - pct(chart.band.y![0])}%`;
            }
            field.append(band);
          }
          const x = el(doc, 'div', 'dm-plot__x');
          x.setAttribute('aria-hidden', 'true');
          const xLabel = el(doc, 'span', 'dm-plot__axis-label');
          x.append(el(doc, 'span', '', plot.axes.x.low), xLabel, el(doc, 'span', '', plot.axes.x.high));
          body.append(y, field, x);
          const tray = el(doc, 'div', 'dm-plot__tray');
          tray.setAttribute('data-label', 'Not placed yet');
          wrap.append(body, tray);
          ctx.frame.append(wrap);
          fields.set(plot.id, { field, tray, xLabel, yLabel });
        }
        formHead = el(doc, 'p', 'dm-plot__form-head', 'Place each point: choose where it sits on each axis, then Place.');
        ctx.frame.append(key, formHead, form);
      }
      for (const plot of plots) {
        const { field, xLabel, yLabel } = fields.get(plot.id)!;
        setText(xLabel, words(plot.axes.x));
        setText(yLabel, words(plot.axes.y));
        setAttr(field, 'aria-label', `${plot.label ? `${plot.label}: ` : ''}${words(plot.axes.x)} across, ${words(plot.axes.y)} up`);
      }
      const at = positionsOf(run) as Record<string, Place>;
      const points = run.nodes.filter((node) => slotName(node) === 'point');
      const plotOf = (tag: string | undefined) => plots.find((p) => p.id === tag) ?? plots[0];
      if (formHead) formHead.hidden = !points.length;
      syncForm(points.map((node) => ({ id: node.id, title: node.title ?? node.text, plot: plotOf(node.tag) })), at);
      key.replaceChildren(...points.map((node) => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const line = place?.x && place?.y ? `${words(plot.axes.x)} ${place.x}, ${words(plot.axes.y)} ${place.y}${place.size ? `, ${chart.size!.label.toLowerCase()} ${place.size}` : ''}` : 'not placed yet';
        return el(doc, 'li', 'dm-plot__key-item', `${node.title ?? node.text}: ${line}`);
      }));
      const named: EntrySpec[] = run.nodes
        .filter((node) => slotName(node) === 'dimension')
        .map((node) => ({ node, host: dims, fill: 'ink', label: `Dimension ${chart.dimensions?.find((d) => d.id === node.tag)?.label ?? slotIndex(node)}` }));
      return [...named, ...points.map((node): EntrySpec => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const { field, tray } = fields.get(plot.id)!;
        const placed = Boolean(place?.x && place?.y);
        return {
          node,
          host: placed ? field : tray,
          fill: placed ? 'green' : 'tint',
          label: `Point ${slotIndex(node)}${placed ? ` at ${words(plot.axes.x)} ${place!.x}, ${words(plot.axes.y)} ${place!.y}` : ', not placed'}`,
          style: placed ? { left: `${pct(place!.x!)}%`, bottom: `${pct(place!.y!)}%`, '--dm-size': String(place!.size ?? 4), '--dm-shift': shift(place!.x!) } : { left: '', bottom: '', '--dm-size': '', '--dm-shift': '' }
        };
      })];
    }
  }, doc);
}
