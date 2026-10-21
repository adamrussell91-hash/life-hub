// packages/decision-book/render/plot.ts
// The plot family's chart: one square field per plot (two qualitative axes, low at the bottom
// left), an optional shaded band, and each point as a pill at its place. A point not yet
// placed waits in a tray under the field. The person places points with the form under the
// chart: per point, a 1–10 select for each axis (and size), then Place, which sends a score
// snapshot. Phone: the field keeps its square (pills shrink to dots with the name in the key);
// the key lists every point with its position in words.
import { positionsOf } from '../families/plot.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

type Axes = { x: { label: string; low: string; high: string }; y: { label: string; low: string; high: string } };
export type PlotChart = {
  axes?: Axes;
  plots?: { id: string; label: string; axes: Axes }[];
  point: string;
  size?: { label: string };
  band?: { label: string; x: [number, number]; y: [number, number] };
};
type Place = { x?: number; y?: number; size?: number };

/** Percent along an axis for a 1–10 value (1 at 5%, 10 at 95%). */
export const pct = (value: number): number => 5 + ((value - 1) / 9) * 90;
/** How far a pill shifts left of its point: none near the left edge, all of it near the right. */
export const shift = (x: number): string => (x <= 3 ? '0%' : x >= 8 ? '-100%' : '-50%');

export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const plots = chart.plots ?? [{ id: 'main', label: '', axes: chart.axes! }];
  const fields = new Map<string, { field: HTMLDivElement; tray: HTMLDivElement }>();
  const key = el(doc, 'ol', 'dm-plot__key');
  const form = el(doc, 'form', 'dm-plot__form');
  const rows = new Map<string, { row: HTMLFieldSetElement; name: HTMLLegendElement; selects: Record<string, HTMLSelectElement> }>();
  let emit: (payload: Record<string, unknown>) => void = () => {};
  let formHead: HTMLParagraphElement | null = null;

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
        const x = select(point.plot.axes.x.label, at[point.id]?.x);
        const y = select(point.plot.axes.y.label, at[point.id]?.y);
        const size = chart.size ? select(chart.size.label, at[point.id]?.size) : null;
        const go = el(doc, 'button', 'dm-plot__place', 'Place');
        go.type = 'button';
        const selects: Record<string, HTMLSelectElement> = { x: x.querySelector('select')!, y: y.querySelector('select')! };
        if (size) selects.size = size.querySelector('select')!;
        go.addEventListener('click', () => {
          const place: Place = {};
          for (const [axis, input] of Object.entries(selects)) if (input.value !== '–') place[axis as keyof Place] = Number(input.value);
          if (place.x && place.y) emit({ points: { [point.id]: place } });
        });
        fieldset.append(name, x, y, ...(size ? [size] : []), go);
        form.append(fieldset);
        row = { row: fieldset, name, selects };
        rows.set(point.id, row);
      }
      setText(row.name, point.title);
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
      if (!fields.size) {
        for (const plot of plots) {
          const wrap = el(doc, 'div', 'dm-plot__plot');
          if (plot.label) wrap.append(el(doc, 'h3', 'dm-plot__title', plot.label));
          const body = el(doc, 'div', 'dm-plot__body');
          const y = el(doc, 'div', 'dm-plot__y');
          y.setAttribute('aria-hidden', 'true');
          y.append(el(doc, 'span', '', plot.axes.y.high), el(doc, 'span', 'dm-plot__axis-label', plot.axes.y.label), el(doc, 'span', '', plot.axes.y.low));
          const field = el(doc, 'div', 'dm-plot__field');
          field.setAttribute('role', 'group');
          field.setAttribute('aria-label', `${plot.label ? `${plot.label}: ` : ''}${plot.axes.x.label} across, ${plot.axes.y.label} up`);
          if (chart.band) {
            const band = el(doc, 'div', 'dm-plot__band', chart.band.label);
            band.style.left = `${pct(chart.band.x[0])}%`;
            band.style.width = `${pct(chart.band.x[1]) - pct(chart.band.x[0])}%`;
            band.style.bottom = `${pct(chart.band.y[0])}%`;
            band.style.height = `${pct(chart.band.y[1]) - pct(chart.band.y[0])}%`;
            field.append(band);
          }
          const x = el(doc, 'div', 'dm-plot__x');
          x.setAttribute('aria-hidden', 'true');
          x.append(el(doc, 'span', '', plot.axes.x.low), el(doc, 'span', 'dm-plot__axis-label', plot.axes.x.label), el(doc, 'span', '', plot.axes.x.high));
          body.append(y, field, x);
          const tray = el(doc, 'div', 'dm-plot__tray');
          tray.setAttribute('data-label', 'Not placed yet');
          wrap.append(body, tray);
          ctx.frame.append(wrap);
          fields.set(plot.id, { field, tray });
        }
        formHead = el(doc, 'p', 'dm-plot__form-head', 'Place each point: choose where it sits on each axis, then Place.');
        ctx.frame.append(key, formHead, form);
      }
      const at = positionsOf(run) as Record<string, Place>;
      const points = run.nodes.filter((node) => slotName(node) === 'point');
      const plotOf = (tag: string | undefined) => plots.find((p) => p.id === tag) ?? plots[0];
      if (formHead) formHead.hidden = !points.length;
      syncForm(points.map((node) => ({ id: node.id, title: node.title ?? node.text, plot: plotOf(node.tag) })), at);
      key.replaceChildren(...points.map((node) => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const words = place?.x && place?.y ? `${plot.axes.x.label} ${place.x}, ${plot.axes.y.label} ${place.y}${place.size ? `, ${chart.size!.label.toLowerCase()} ${place.size}` : ''}` : 'not placed yet';
        return el(doc, 'li', 'dm-plot__key-item', `${node.title ?? node.text}: ${words}`);
      }));
      return points.map((node) => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const { field, tray } = fields.get(plot.id)!;
        const placed = Boolean(place?.x && place?.y);
        return {
          node,
          host: placed ? field : tray,
          fill: placed ? 'green' : 'tint',
          label: `Point ${slotIndex(node)}${placed ? ` at ${plot.axes.x.label} ${place!.x}, ${plot.axes.y.label} ${place!.y}` : ', not placed'}`,
          style: placed ? { left: `${pct(place!.x!)}%`, bottom: `${pct(place!.y!)}%`, '--dm-size': String(place!.size ?? 4), '--dm-shift': shift(place!.x!) } : { left: '', bottom: '', '--dm-size': '', '--dm-shift': '' }
        };
      });
    }
  }, doc);
}
