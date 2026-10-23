// The continuum: one bar per scale (0–10) over its zone, a lean pin under it, earlier saves as
// dashed ghosts. Read-only on the card; editable (drag or arrow keys) when Adam sets the mix.
// Drawn from data like Decision Maker's charts; colours are `guide-tone--*` tokens in guides.css.
import type { GuideScale, Values } from './types';

export interface ContinuumOptions {
  scales: GuideScale[];
  values: Values;
  lean: (values: Values) => number;
  suggested?: Values | null;
  history?: Array<{ at: string; values: Values }>;
  editable?: boolean;
  onChange?: (values: Values) => void;
}

export interface ContinuumChart {
  el: HTMLElement;
  values(): Values;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (at: string): string => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

export function createContinuumChart(doc: Document, options: ContinuumOptions): ContinuumChart {
  const div = (className: string, text?: string) => {
    const node = doc.createElement('div');
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const values: Values = {};
  for (const scale of options.scales) values[scale.id] = clamp(options.values[scale.id] ?? 0);
  const history = (options.history ?? []).slice(0, 2);

  const root = div('guide-chart-wrap');
  const chart = div('guide-chart');
  const zones = div('guide-chart__zones');
  const zoneNames = div('guide-chart__zone-names');
  for (const zone of ['apart', 'controlled', 'autonomous'] as const) {
    const span = options.scales.filter((s) => s.zone === zone).length;
    const z = div(`guide-chart__zone guide-chart__zone--${zone}`);
    z.style.flexGrow = String(span);
    zones.append(z);
    const name = div('guide-chart__zone-name', zone === 'apart' ? '' : zone === 'controlled' ? 'Controlled' : 'Autonomous');
    name.style.flexGrow = String(span);
    zoneNames.append(name);
  }
  const bars = div('guide-chart__bars');
  const names = div('guide-chart__names');
  const barEls = new Map<string, HTMLElement>();
  const cols = new Map<string, HTMLElement>();

  for (const scale of options.scales) {
    const col = div('guide-chart__col');
    col.dataset.scale = scale.id;
    col.dataset.zone = scale.zone;
    history.forEach((h, i) => {
      const ghost = div(`guide-chart__ghost${i ? ' guide-chart__ghost--older' : ''}`);
      ghost.style.height = `${clamp(h.values[scale.id] ?? 0) * 10}%`;
      col.append(ghost);
    });
    if (options.suggested) {
      const sugg = div('guide-chart__sugg');
      sugg.style.bottom = `${clamp(options.suggested[scale.id] ?? 0) * 10}%`;
      col.append(sugg);
    }
    const bar = div(`guide-chart__bar guide-tone--${scale.tone}`);
    if (options.editable) {
      bar.append(div('guide-chart__handle'));
      col.setAttribute('role', 'slider');
      col.tabIndex = 0;
      col.setAttribute('aria-label', scale.label);
      col.setAttribute('aria-valuemin', '0');
      col.setAttribute('aria-valuemax', '10');
      col.addEventListener('keydown', (event) => {
        const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
        if (event.key in step) set(scale.id, values[scale.id]! + step[event.key]!);
        else if (event.key === 'Home') set(scale.id, 0);
        else if (event.key === 'End') set(scale.id, 10);
        else return;
        event.preventDefault();
      });
      const fromPointer = (event: PointerEvent) => {
        const rect = col.getBoundingClientRect();
        if (rect.height > 0) set(scale.id, ((rect.bottom - event.clientY) / rect.height) * 10);
      };
      col.addEventListener('pointerdown', (event) => {
        col.setPointerCapture?.(event.pointerId);
        fromPointer(event);
        const move = (e: PointerEvent) => fromPointer(e);
        const up = () => {
          col.removeEventListener('pointermove', move);
          col.removeEventListener('pointerup', up);
          col.removeEventListener('pointercancel', up);
        };
        col.addEventListener('pointermove', move);
        col.addEventListener('pointerup', up);
        col.addEventListener('pointercancel', up);
      });
    }
    col.append(bar);
    bars.append(col);
    names.append(div('guide-chart__name', scale.label));
    barEls.set(scale.id, bar);
    cols.set(scale.id, col);
  }
  chart.append(zones, zoneNames, bars);

  const lean = div('guide-lean');
  const track = div('guide-lean__track');
  if (history[0]) {
    const then = div('guide-lean__pin guide-lean__pin--then');
    then.style.left = `${Math.round(options.lean(history[0].values) * 100)}%`;
    track.append(then);
  }
  const pin = div('guide-lean__pin');
  track.append(pin);
  const ends = div('guide-lean__ends');
  ends.append(div('guide-lean__end guide-lean__end--controlled', 'Controlled'), div('guide-lean__end guide-lean__end--autonomous', 'Autonomous'));
  lean.append(track, ends);

  root.append(chart, names, lean);

  if (history.length || options.suggested) {
    const legend = div('guide-legend');
    if (options.suggested) legend.append(div('guide-legend__item guide-legend__item--sugg', 'Suggested from your taps'));
    legend.append(div('guide-legend__item guide-legend__item--now', options.suggested ? 'Your call' : 'Now'));
    for (const h of history) legend.append(div('guide-legend__item guide-legend__item--then', shortDate(h.at)));
    root.append(legend);
  }

  function paint(): void {
    for (const scale of options.scales) {
      barEls.get(scale.id)!.style.height = `${values[scale.id]! * 10}%`;
      if (options.editable) cols.get(scale.id)!.setAttribute('aria-valuenow', String(values[scale.id]));
    }
    pin.style.left = `${Math.round(options.lean(values) * 100)}%`;
  }

  function set(id: string, value: number): void {
    const next = clamp(value);
    if (next === values[id]) return;
    values[id] = next;
    paint();
    options.onChange?.({ ...values });
  }

  paint();
  return { el: root, values: () => ({ ...values }) };
}
