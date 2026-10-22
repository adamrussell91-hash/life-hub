// packages/decision-book/render/scales.ts
// The scales family's chart. One row per scale, each series drawn in its own line style (the
// first solid, the next outlined, the third dotted) so overlays never depend on colour:
//   pairs   the low pole on the left, the high pole on the right, a bar split at the low
//           pole's share of ten;
//   axes    a bar per series along a 1–10 track, or (layout radar) a polygon per series;
//   shares  one bar per series cut into its parts of 100.
// Notes sit under the scale they are about. Under the chart, a form per series scores every
// scale and sends one snapshot (Save). With `named` scales the person's names replace the
// placeholder labels everywhere and sit above the rows. Phone: rows stack, poles above their
// bar; a radar becomes bars. A `dated` chart (one series) overlays its three latest saves instead
// of its series, newest solid, the legend naming each save's date; `min: 0` lets axes go to 0.
import { historyOf, scaleLabel, valuesOf } from '../families/scales.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

type Scale = { id: string; label?: string; low?: string; high?: string };
export type ScalesChart = { mode: 'pairs' | 'axes' | 'shares'; scales: Scale[]; series?: { id: string; label: string }[]; layout?: 'bars' | 'radar'; named?: { label: string }; min?: 0 | 1; dated?: boolean };

const STYLES = ['solid', 'outline', 'dotted'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A save's date as the legend shows it: "8 Oct". */
export const shortDate = (at: string): string => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};
/** The words a scale's form field shows, from its current name. */
const fieldWords = (mode: ScalesChart['mode'], scale: Scale, name: string): string => (mode === 'pairs' ? `${scale.low} (0–10; ${scale.high} gets the rest)` : mode === 'shares' ? `${name} (% of 100)` : `${name} (1–10)`);

/** The radar polygon's points for values on 1–10 axes, in a 100×100 box. */
export function radarPoints(values: number[]): string {
  return values.map((value, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
    const r = (value / 10) * 42;
    return `${(50 + r * Math.cos(angle)).toFixed(1)},${(50 + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const series = chart.series ?? [{ id: 'now', label: 'Now' }];
  const radar = chart.layout === 'radar';
  const dated = Boolean(chart.dated);
  /** What the chart overlays: the series, or (dated) its three latest saves. */
  const layers = dated ? STYLES.map((_, i) => `save${i}`) : series.map((s) => s.id);
  let legend: HTMLParagraphElement | null = null;
  const rows = new Map<string, { track: HTMLDivElement; notes: HTMLDivElement }>();
  const bars = new Map<string, HTMLDivElement>();
  let radarSvg: SVGSVGElement | null = null;
  const polygons = new Map<string, SVGPolygonElement>();
  const form = el(doc, 'form', 'dm-scales__form');
  const names = el(doc, 'div', 'dm-scales__names');
  const inputs = new Map<string, Map<string, HTMLInputElement>>();
  const totals = new Map<string, HTMLSpanElement>();
  let emit: (payload: Record<string, unknown>) => void = () => {};

  function buildForm(): void {
    for (const s of series) {
      const fieldset = el(doc, 'fieldset', 'dm-scales__series-form');
      fieldset.append(el(doc, 'legend', 'dm-scales__series-name', `Score ${s.label.toLowerCase()}`));
      const map = new Map<string, HTMLInputElement>();
      for (const scale of chart.scales) {
        const label = el(doc, 'label', 'dm-scales__field');
        const words = el(doc, 'span', 'dm-scales__field-label', fieldWords(chart.mode, scale, scale.label ?? ''));
        words.setAttribute('data-field-for', scale.id);
        label.append(words);
        const input = el(doc, 'input', 'dm-scales__input');
        input.type = 'number';
        input.min = chart.mode === 'axes' ? String(chart.min ?? 1) : '0';
        input.max = chart.mode === 'shares' ? '100' : '10';
        input.step = '1';
        label.append(input);
        fieldset.append(label);
        map.set(scale.id, input);
      }
      const total = el(doc, 'span', 'dm-scales__total');
      total.setAttribute('aria-live', 'polite');
      if (chart.mode === 'shares') {
        const update = (): void => setText(total, `Total ${[...map.values()].reduce((sum, input) => sum + (Number(input.value) || 0), 0)} of 100`);
        for (const input of map.values()) input.addEventListener('input', update);
        update();
      }
      const save = el(doc, 'button', 'dm-scales__save', `Save ${s.label.toLowerCase()}`);
      save.type = 'button';
      save.addEventListener('click', () => {
        const values: Record<string, number> = {};
        for (const [id, input] of map) values[id] = Number(input.value);
        emit({ series: s.id, values });
      });
      fieldset.append(total, save);
      form.append(fieldset);
      inputs.set(s.id, map);
      totals.set(s.id, total);
    }
  }

  function buildRows(frame: HTMLDivElement): void {
    legend = el(doc, 'p', 'dm-scales__legend');
    legend.setAttribute('aria-hidden', 'true');
    if (!dated) series.forEach((s, i) => {
      const chip = el(doc, 'span', 'dm-scales__legend-item', s.label);
      chip.setAttribute('data-style', STYLES[i]);
      legend!.append(chip);
    });
    if (radar) {
      const wrap = el(doc, 'div', 'dm-scales__radar-wrap');
      wrap.setAttribute('aria-hidden', 'true');
      radarSvg = svg(doc, 'svg', { class: 'dm-scales__radar', viewBox: '0 0 100 100' });
      for (const ring of [42, 28, 14]) radarSvg.append(svg(doc, 'polygon', { class: 'dm-scales__ring', points: radarPoints(chart.scales.map(() => (ring / 42) * 10)) }));
      layers.forEach((layer, i) => {
        const poly = svg(doc, 'polygon', { class: 'dm-scales__poly', 'data-style': STYLES[i], points: '' });
        radarSvg!.append(poly);
        polygons.set(layer, poly);
      });
      // Axis names sit just outside the outer ring, at the same angles as the polygon's corners.
      chart.scales.forEach((scale, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / chart.scales.length;
        const label = el(doc, 'span', 'dm-scales__radar-label', scale.label!);
        label.setAttribute('data-label-for', scale.id);
        label.style.left = `${(50 + 49 * Math.cos(angle)).toFixed(1)}%`;
        label.style.top = `${(50 + 49 * Math.sin(angle)).toFixed(1)}%`;
        wrap.append(label);
      });
      wrap.prepend(radarSvg);
      frame.append(legend!, wrap);
    } else frame.append(legend!);
    const list = el(doc, 'div', 'dm-scales__rows');
    // A radar's rows keep its notes; their bars only show on a phone, where the radar is hidden.
    list.setAttribute('data-layout', radar ? 'radar' : chart.mode);
    if (chart.mode === 'shares') {
      for (const [i, s] of series.entries()) {
        const row = el(doc, 'div', 'dm-scales__share-row');
        row.append(el(doc, 'span', 'dm-scales__row-label', s.label));
        const bar = el(doc, 'div', 'dm-scales__share');
        bar.setAttribute('data-style', STYLES[i]);
        row.append(bar);
        list.append(row);
        bars.set(s.id, bar);
      }
    }
    for (const scale of chart.scales) {
      const row = el(doc, 'div', 'dm-scales__row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', scale.label ?? `${scale.low} or ${scale.high}`);
      row.setAttribute('data-scale', scale.id);
      const track = el(doc, 'div', 'dm-scales__track');
      if (chart.mode === 'pairs') row.append(el(doc, 'span', 'dm-scales__pole dm-scales__pole--low', scale.low!), track, el(doc, 'span', 'dm-scales__pole dm-scales__pole--high', scale.high!));
      else {
        const name = el(doc, 'span', 'dm-scales__row-label', scale.label!);
        name.setAttribute('data-label-for', scale.id);
        row.append(name, track);
      }
      const notes = el(doc, 'div', 'dm-scales__notes');
      row.append(notes);
      if (chart.mode === 'shares') track.hidden = true;
      list.append(row);
      rows.set(scale.id, { track, notes });
    }
    frame.append(list, form);
  }

  return createChart({
    family: 'scales',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!rows.size) {
        if (chart.named) {
          names.setAttribute('role', 'group');
          names.setAttribute('aria-label', 'Scales you named');
          names.append(el(doc, 'span', 'dm-chart__slot-label', 'Scales you named'));
          ctx.frame.append(names);
        }
        buildRows(ctx.frame);
        buildForm();
      }
      const name = (scale: Scale): string => scaleLabel(run, scale);
      for (const scale of chart.scales) {
        for (const span of ctx.frame.querySelectorAll(`[data-label-for="${scale.id}"]`)) setText(span, name(scale));
        for (const span of ctx.frame.querySelectorAll(`[data-field-for="${scale.id}"]`)) setText(span, fieldWords(chart.mode, scale, name(scale)));
        setAttr(ctx.frame.querySelector(`.dm-scales__row[data-scale="${scale.id}"]`)!, 'aria-label', name(scale));
      }
      const values = valuesOf(run) as Record<string, Record<string, number>>;
      // The overlays drawn now, in style order: the scored series, or the latest saves.
      const drawn: { layer: string; label: string; style: string; values: Record<string, number> }[] = dated
        ? (historyOf(run, series[0].id, STYLES.length) as { at: string; values: Record<string, number> }[]).map((snap, i) => ({ layer: layers[i], label: shortDate(snap.at), style: STYLES[i], values: snap.values }))
        : series.flatMap((s, i) => (values[s.id] ? [{ layer: s.id, label: s.label, style: STYLES[i], values: values[s.id] }] : []));
      if (dated && legend) {
        const words = drawn.length ? drawn.map((d) => d.label) : ['Not scored yet'];
        if ([...legend.children].map((chip) => chip.textContent).join('|') !== words.join('|')) {
          legend.replaceChildren(...words.map((word, i) => {
            const chip = el(doc, 'span', 'dm-scales__legend-item', word);
            if (drawn.length) chip.setAttribute('data-style', STYLES[i]);
            return chip;
          }));
        }
      }
      for (const scale of chart.scales) {
        if (chart.mode === 'shares') break;
        const { track } = rows.get(scale.id)!;
        const wanted = drawn.map((d) => {
          const value = d.values[scale.id];
          const bar = el(doc, 'span', 'dm-scales__bar');
          bar.setAttribute('data-style', d.style);
          bar.style.width = `${value * 10}%`;
          bar.title = chart.mode === 'pairs' ? `${d.label}: ${scale.low} ${value}, ${scale.high} ${10 - value}` : `${d.label}: ${value} of 10`;
          bar.setAttribute('data-words', bar.title);
          return bar;
        });
        const now = [...track.children].map((child) => (child as HTMLElement).title).join('|');
        if (now !== wanted.map((bar) => bar.title).join('|')) track.replaceChildren(...wanted);
      }
      if (radar) for (const layer of layers) {
        const d = drawn.find((x) => x.layer === layer);
        polygons.get(layer)!.setAttribute('points', d ? radarPoints(chart.scales.map((scale) => d.values[scale.id])) : '');
      }
      for (const s of series) {
        const bar = bars.get(s.id);
        if (bar) {
          const words = values[s.id] ? chart.scales.map((scale) => `${name(scale)} ${values[s.id][scale.id]}%`).join(', ') : 'not scored yet';
          if (bar.title !== words) {
            bar.title = words;
            bar.replaceChildren(...(values[s.id] ? chart.scales.map((scale, j) => {
              const part = el(doc, 'span', 'dm-scales__part', `${name(scale)} ${values[s.id][scale.id]}%`);
              part.style.width = `${values[s.id][scale.id]}%`;
              part.setAttribute('data-part', String(j % 3));
              return part;
            }) : [el(doc, 'span', 'dm-scales__unscored', 'Not scored yet')]));
          }
        }
        for (const [scaleId, input] of inputs.get(s.id)!) if (values[s.id] && doc.activeElement !== input) input.value = String(values[s.id][scaleId]);
      }
      const named: EntrySpec[] = run.nodes
        .filter((node) => slotName(node) === 'scale_name' && rows.has(node.tag ?? ''))
        .map((node) => ({ node, host: names, fill: 'ink', label: `Name of scale ${chart.scales.findIndex((scale) => scale.id === node.tag) + 1}`, order: chart.scales.findIndex((scale) => scale.id === node.tag) }));
      return [...named, ...run.nodes
        .filter((node) => slotName(node) === 'note' && rows.has(node.tag ?? ''))
        .map((node): EntrySpec => {
          const scale = chart.scales.find((s) => s.id === node.tag)!;
          return { node, host: rows.get(scale.id)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${name(scale)}` };
        })];
    }
  }, doc);
}
