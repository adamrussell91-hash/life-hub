// packages/change-book/render/time-value.ts
// Multitasking's chart (family time_value): a split star in the book's shape. The top half is
// TIME, four spokes from 0 to 100% of the working day, filled in a teal tint and outlined in teal;
// the bottom half is VALUE, the same spokes mirrored below a dashed divider, 1 to 10, in copper.
// An earlier save shows faintly behind the latest. Under the star, one row per mode: its letter
// and label, the time (%) and the value (1–10), the gap chips and the notes on it; then Save and a
// readout of the total, which can pass 100 because switching overlaps the other modes.
// Phone: the star scales down and each row stacks.
import { GAP_WORDS, gapFlags, profileHistory, timeTotal, totalWords } from '../families/time-value.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName, svg } from '../../decision-book/render/core';

type Mode = { id: string; label: string; short?: string };
type Profile = { at: string; time: Record<string, number>; value: Record<string, number> };
export type TimeValueTool = { name: string; slots: Record<string, string>; chart: { modes: Mode[] } };

/** The star's geometry: centre at 0,0, spokes this long, in a viewBox wide enough for the letters. */
const R = 100;
/** Each mode's spoke angle in the top half, degrees from the right, counter-clockwise (left to right: A to D). */
const ANGLES = [160, 115, 65, 20];

const letter = (i: number): string => String.fromCharCode(65 + i);

/** The point at `share` (0–1) along mode i's spoke, in the top (time) or bottom (value) half. */
export function spokePoint(i: number, share: number, half: 'time' | 'value'): [number, number] {
  const a = (ANGLES[i % ANGLES.length] * Math.PI) / 180;
  const r = Math.max(0, Math.min(1, share)) * R;
  const y = -r * Math.sin(a);
  return [r * Math.cos(a), half === 'time' ? y : -y];
}

/** A half-star polygon: the centre, then each mode's point, back to the centre. */
export function halfPoints(values: number[], half: 'time' | 'value'): string {
  const scale = half === 'time' ? 100 : 10;
  return [[0, 0], ...values.map((v, i) => spokePoint(i, v / scale, half))].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** The star's words for a screen reader. */
function starWords(modes: Mode[], snap: Profile | null): string {
  if (!snap) return 'Split star of time and value: not scored yet.';
  const parts = modes.map((m, i) => `${letter(i)}, ${m.label}: time ${snap.time[m.id]}% of the day, value ${snap.value[m.id]} of 10`);
  return `Split star of time and value. ${parts.join('. ')}.`;
}

let counter = 0;

export function createTimeValueView(tool: TimeValueTool, doc: Document = document): ChartView {
  const { modes } = tool.chart;
  const ids = modes.map((m) => m.id);
  const uid = `ch-tv-${(counter += 1)}`;
  let built = false;
  let emit: (payload: Record<string, unknown>) => void = () => {};
  let appliedAt = '';

  const star = svg(doc, 'svg', { class: 'ch-tv__star', viewBox: '-150 -122 300 244', role: 'img' });
  const title = svg(doc, 'title', { id: `${uid}-title` });
  star.setAttribute('aria-labelledby', `${uid}-title`);
  const ghost = { time: svg(doc, 'polygon', { class: 'ch-tv__poly ch-tv__poly--time ch-tv__poly--ghost', points: '' }), value: svg(doc, 'polygon', { class: 'ch-tv__poly ch-tv__poly--value ch-tv__poly--ghost', points: '' }) };
  const live = { time: svg(doc, 'polygon', { class: 'ch-tv__poly ch-tv__poly--time', points: '' }), value: svg(doc, 'polygon', { class: 'ch-tv__poly ch-tv__poly--value', points: '' }) };
  const form = el(doc, 'div', 'ch-tv__form');
  const readout = el(doc, 'p', 'ch-tv__readout');
  readout.setAttribute('aria-live', 'polite');
  const status = el(doc, 'p', 'ch-tv__status');
  status.setAttribute('role', 'status');
  const legend = el(doc, 'p', 'ch-tv__legend');
  const rows = new Map<string, { row: HTMLDivElement; time: HTMLInputElement; value: HTMLInputElement; flags: HTMLSpanElement; notes: HTMLDivElement }>();

  function buildStar(): void {
    star.append(title);
    // The dashed divider between the halves, and the half names in small caps.
    star.append(svg(doc, 'line', { class: 'ch-tv__divider', x1: '-150', y1: '0', x2: '150', y2: '0' }));
    const name = (text: string, y: string): SVGTextElement => {
      const t = svg(doc, 'text', { class: 'ch-tv__half', x: '-146', y });
      t.textContent = text;
      return t;
    };
    star.append(name('TIME', '-8'), name('VALUE', '18'));
    // Rings at a half and the whole of each spoke.
    for (const share of [0.5, 1]) {
      for (const half of ['time', 'value'] as const) {
        const points = [[0, 0], ...ids.map((_, i) => spokePoint(i, share, half))].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        star.append(svg(doc, 'polyline', { class: 'ch-tv__ring', points }));
      }
    }
    ids.forEach((_, i) => {
      for (const half of ['time', 'value'] as const) {
        const [x, y] = spokePoint(i, 1, half);
        star.append(svg(doc, 'line', { class: `ch-tv__spoke ch-tv__spoke--${half}`, x1: '0', y1: '0', x2: x.toFixed(1), y2: y.toFixed(1) }));
        const [lx, ly] = spokePoint(i, 1.13, half);
        const badge = svg(doc, 'g', { class: `ch-tv__badge ch-tv__badge--${half}` });
        badge.append(svg(doc, 'circle', { cx: lx.toFixed(1), cy: ly.toFixed(1), r: '9' }));
        const t = svg(doc, 'text', { x: lx.toFixed(1), y: (ly + 4).toFixed(1) });
        t.textContent = letter(i);
        badge.append(t);
        star.append(badge);
      }
    });
    star.append(ghost.time, ghost.value, live.time, live.value);
  }

  function readInputs(): { time: Record<string, number>; value: Record<string, number>; full: boolean; any: boolean } {
    const time: Record<string, number> = {};
    const value: Record<string, number> = {};
    let full = true;
    let any = false;
    for (const [id, row] of rows) {
      const t = row.time.value.trim();
      const v = row.value.value.trim();
      if (t) any = true;
      if (!t || !v) full = false;
      time[id] = Number(t);
      value[id] = Number(v);
    }
    return { time, value, full, any };
  }

  /** The readout and the gap chips follow the form as it is filled. */
  function refresh(): void {
    const draft = readInputs();
    setText(readout, draft.any ? totalWords(timeTotal({ time: Object.fromEntries(ids.map((id) => [id, Number.isFinite(draft.time[id]) ? draft.time[id] : 0])) }, ids)) : 'Set each mode’s share of the day: the four can overlap.');
    const flags = gapFlags(draft, ids).filter((f: { mode: string }) => {
      const row = rows.get(f.mode)!;
      return row.time.value.trim() && row.value.value.trim();
    }) as Array<{ mode: string; kind: 'costly' | 'starved' }>;
    for (const [id, row] of rows) {
      const flag = flags.find((f) => f.mode === id);
      setAttr(row.row, 'data-flag', flag?.kind ?? null);
      if (!flag) {
        if (row.flags.childElementCount) row.flags.replaceChildren();
        continue;
      }
      const words = GAP_WORDS[flag.kind];
      if (row.flags.textContent !== words) {
        const chip = el(doc, 'span', `ch-tv__chip ch-tv__chip--${flag.kind}`, words);
        row.flags.replaceChildren(chip);
      }
    }
  }

  function buildForm(): void {
    const head = el(doc, 'div', 'ch-tv__head');
    head.setAttribute('aria-hidden', 'true');
    head.append(el(doc, 'span', 'ch-tv__head-mode', 'Mode'), el(doc, 'span', 'ch-tv__head-time', 'Time %'), el(doc, 'span', 'ch-tv__head-value', 'Value 1–10'));
    form.append(head);
    modes.forEach((mode, i) => {
      const row = el(doc, 'div', 'ch-tv__row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `${letter(i)}: ${mode.label}`);
      row.setAttribute('data-mode', mode.id);
      const name = el(doc, 'span', 'ch-tv__mode');
      name.append(el(doc, 'span', 'ch-tv__letter', letter(i)), el(doc, 'span', 'ch-tv__mode-label', mode.label));
      const field = (kind: 'time' | 'value'): [HTMLLabelElement, HTMLInputElement] => {
        const label = el(doc, 'label', `ch-tv__field ch-tv__field--${kind}`);
        const words = el(doc, 'span', 'ch-tv__field-label', kind === 'time' ? 'Time %' : 'Value');
        const input = el(doc, 'input', 'ch-tv__input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.step = '1';
        input.min = kind === 'time' ? '0' : '1';
        input.max = kind === 'time' ? '100' : '10';
        input.setAttribute('aria-label', kind === 'time' ? `Time for ${letter(i)}, ${mode.label}: percent of the working day, 0 to 100` : `Value of ${letter(i)}, ${mode.label}: 1 to 10`);
        input.addEventListener('input', refresh);
        label.append(words, input);
        return [label, input];
      };
      const [timeLabel, time] = field('time');
      const [valueLabel, value] = field('value');
      const flags = el(doc, 'span', 'ch-tv__flags');
      flags.setAttribute('aria-live', 'polite');
      const notes = el(doc, 'div', 'ch-tv__notes');
      row.append(name, timeLabel, valueLabel, flags, notes);
      form.append(row);
      rows.set(mode.id, { row, time, value, flags, notes });
    });
    const save = el(doc, 'button', 'ch-tv__save', 'Save the star');
    save.type = 'button';
    save.addEventListener('click', () => {
      const draft = readInputs();
      const ok = draft.full && ids.every((id) => Number.isInteger(draft.time[id]) && draft.time[id] >= 0 && draft.time[id] <= 100 && Number.isInteger(draft.value[id]) && draft.value[id] >= 1 && draft.value[id] <= 10);
      if (!ok) {
        setText(status, 'Give every mode a time from 0 to 100 and a value from 1 to 10.');
        return;
      }
      setText(status, '');
      emit({ time: draft.time, value: draft.value });
    });
    const foot = el(doc, 'div', 'ch-tv__foot');
    foot.append(save, readout);
    form.append(foot, status);
  }

  return createChart({
    family: 'time-value',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!built) {
        buildStar();
        buildForm();
        const wrap = el(doc, 'div', 'ch-tv__star-wrap');
        wrap.append(star);
        legend.setAttribute('aria-hidden', 'true');
        legend.append(el(doc, 'span', 'ch-tv__key ch-tv__key--time', 'Time'), el(doc, 'span', 'ch-tv__key ch-tv__key--value', 'Value'));
        ctx.frame.append(wrap, legend, form);
        built = true;
      }
      const [latest, previous] = profileHistory(run, 2) as Profile[];
      for (const half of ['time', 'value'] as const) {
        live[half].setAttribute('points', latest ? halfPoints(ids.map((id) => latest[half][id]), half) : '');
        ghost[half].setAttribute('points', previous ? halfPoints(ids.map((id) => previous[half][id]), half) : '');
      }
      const words = starWords(modes, latest ?? null);
      setText(title, previous ? `${words} The previous save is drawn faintly.` : words);
      legend.toggleAttribute('data-previous', Boolean(previous));
      if (previous && !legend.querySelector('.ch-tv__key--ghost')) legend.append(el(doc, 'span', 'ch-tv__key ch-tv__key--ghost', 'Previous save'));
      // A new save fills the form, unless the person is typing in it.
      if (latest && latest.at !== appliedAt) {
        appliedAt = latest.at;
        for (const [id, row] of rows) {
          if (doc.activeElement !== row.time) row.time.value = String(latest.time[id]);
          if (doc.activeElement !== row.value) row.value.value = String(latest.value[id]);
        }
      }
      refresh();
      return run.nodes
        .filter((node) => slotName(node) === 'note' && rows.has(node.tag ?? ''))
        .map((node): EntrySpec => {
          const i = ids.indexOf(node.tag!);
          return { node, host: rows.get(node.tag!)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${letter(i)}, ${modes[i].label}` };
        });
    }
  }, doc);
}
