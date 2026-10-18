/**
 * The Discern "tail": dots joined by a line, settled at the top and uneasy at
 * the bottom. Labels are HTML laid over an SVG line so they stay readable at
 * phone width. Peaks label above, troughs below, so a label sits outside the
 * bend of the line.
 */

export type TailLine = { values: number[]; key: string; colour?: string };

export type TailGraphOptions = {
  /** Column names along the bottom. Their count sets the number of columns. */
  columns: readonly string[];
  /** One student's dots (0 = not yet), drawn bold with labels. */
  values?: number[];
  labels?: string[];
  /** Dashed line out to an empty last dot that comes later in the lesson. */
  ghostLast?: string;
  /** Many tails at once (class spread). */
  lines?: TailLine[];
  highlight?: string | null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderTailGraph(options: TailGraphOptions): HTMLElement {
  const n = options.columns.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v - 1) * 25;
  const top = (v: number) => `calc(var(--discern-pad) + (100% - 2 * var(--discern-pad)) * ${y(v) / 100})`;

  const frame = document.createElement('div');
  frame.className = 'discern-tail';
  const settled = document.createElement('span');
  settled.className = 'discern-tail__cap';
  settled.textContent = '↑ settled';
  const plot = document.createElement('div');
  plot.className = 'discern-tail__plot';
  plot.style.setProperty('--discern-cols', String(n));
  const grid = document.createElement('div');
  grid.className = 'discern-tail__grid';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'discern-tail__svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  plot.append(grid, svg);

  const path = (points: Array<[number, number]>, cls: string, extra: Record<string, string> = {}) => {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' '));
    el.setAttribute('class', cls);
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
    svg.append(el);
  };

  options.lines?.forEach((line, index) => {
    const on = !options.highlight || options.highlight === line.key;
    // A small offset per tail so identical tails read as a bundle, not one line.
    const jitter = (((index * 37) % 9) - 4) * 0.9;
    const pts = line.values.map((v, i) => (v ? [x(i), y(v) + jitter] as [number, number] : null)).filter(Boolean) as Array<[number, number]>;
    if (pts.length < 2) return;
    const cls = `discern-tail__line${on ? (options.highlight ? ' is-picked' : '') : ' is-faded'}`;
    path(pts, cls, line.colour ? { style: `stroke:${line.colour}` } : {});
  });

  const values = options.values ?? [];
  const real = values.map((v, i) => (v ? [i, v] : null)).filter(Boolean) as Array<[number, number]>;
  if (real.length > 1) path(real.map(([i, v]) => [x(i), y(v)]), 'discern-tail__own');
  if (options.ghostLast && real.length) {
    const [li, lv] = real[real.length - 1]!;
    path([[x(li), y(lv)], [x(n - 1), y(lv)]], 'discern-tail__ghost-line');
  }

  values.forEach((v, i) => {
    if (!v) return;
    const dot = document.createElement('span');
    dot.className = 'discern-tail__dot';
    dot.style.left = `${x(i)}%`;
    dot.style.top = top(v);
    plot.append(dot);
    const text = options.labels?.[i]?.trim();
    if (!text) return;
    const near = [values[i - 1], values[i + 1]].filter((d): d is number => !!d);
    const avg = near.length ? near.reduce((a, b) => a + b, 0) / near.length : v;
    const above = v === 5 ? false : v === 1 ? true : v >= avg;
    const label = document.createElement('span');
    label.className = `discern-tail__label${above ? ' is-above' : ''}`;
    label.style.left = `${x(i)}%`;
    label.style.top = top(v);
    label.style.maxWidth = `${Math.min(30, 100 / n - 1)}%`;
    label.textContent = text;
    plot.append(label);
  });

  if (options.ghostLast) {
    const lv = real.length ? real[real.length - 1]![1] : 3;
    const ghost = document.createElement('span');
    ghost.className = 'discern-tail__dot is-ghost';
    ghost.style.left = `${x(n - 1)}%`;
    ghost.style.top = top(lv);
    const label = document.createElement('span');
    label.className = 'discern-tail__label is-ghost';
    label.style.left = `${x(n - 1)}%`;
    label.style.top = top(lv);
    label.style.maxWidth = `${Math.min(30, 100 / n - 1)}%`;
    label.textContent = options.ghostLast;
    plot.append(ghost, label);
  }

  const uneasy = document.createElement('span');
  uneasy.className = 'discern-tail__cap';
  uneasy.textContent = '↓ uneasy';
  const axis = document.createElement('div');
  axis.className = 'discern-tail__x';
  axis.style.setProperty('--discern-cols', String(n));
  for (const name of options.columns) {
    const col = document.createElement('span');
    col.textContent = name;
    axis.append(col);
  }
  frame.append(settled, plot, uneasy, axis);
  return frame;
}
