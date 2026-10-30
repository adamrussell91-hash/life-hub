import type { ChartSeriesColor } from '@/schemas/block';

export const CHART_SERIES_COLOR_OPTIONS: Array<{ id: ChartSeriesColor; label: string }> = [
  { id: 'wave', label: 'Wave' },
  { id: 'danger', label: 'High contrast red' },
  { id: 'success', label: 'Sage' },
  { id: 'high-sea', label: 'High sea' },
  { id: 'pastel-lilac-ink', label: 'Lilac' },
  { id: 'navy-2', label: 'Navy' }
];

export type ChartContent = {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter';
  title?: string;
  x_label?: string;
  y_label?: string;
  series: Array<{
    id: string;
    name: string;
    color?: ChartSeriesColor;
    points: Array<{ x: string | number; y: number }>;
  }>;
};

type Series = ChartContent['series'][number] & { fill: string };

/** What a hover or tap on one hit area shows. */
export type ChartHoverEntry = {
  title: string;
  rows: Array<{ label: string; value: string; fill?: string }>;
};

const VIEW_W = 400;
const VIEW_H = 240;
const X_LABEL_ROOM = 16;
const PAD = { top: 14, right: 16, bottom: 30 };
const TICK_COUNT = 5;

const numberFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 });

export function formatChartNumber(value: number): string {
  return numberFormat.format(value);
}

function formatTick(value: number, step: number): string {
  // Compact (12k) only when it loses nothing at this step size.
  return Math.abs(step) >= 1000 ? compactFormat.format(value) : numberFormat.format(value);
}

function seriesFill(series: { color?: ChartSeriesColor }, index: number): string {
  const token =
    series.color ?? CHART_SERIES_COLOR_OPTIONS[index % CHART_SERIES_COLOR_OPTIONS.length]!.id;
  return `var(--${token})`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Series with their unusable points dropped (blank x, missing y). A series left
 * with no points goes too, so a half-filled "Series 2" adds no zero and no
 * empty slot. Colours follow the series' place in the saved list.
 */
export function chartSeries(content: ChartContent): Series[] {
  return content.series
    .map((series, index) => ({
      ...series,
      fill: seriesFill(series, index),
      points: series.points.filter(
        (p) => String(p.x ?? '').trim() !== '' && typeof p.y === 'number' && Number.isFinite(p.y)
      )
    }))
    .filter((series) => series.points.length > 0);
}

export function buildChartTableRows(
  content: ChartContent
): Array<{ series: string; x: string; y: string }> {
  const rows: Array<{ series: string; x: string; y: string }> = [];
  for (const series of chartSeries(content)) {
    for (const point of series.points) {
      rows.push({ series: series.name, x: String(point.x), y: String(point.y) });
    }
  }
  return rows;
}

function categoryLabels(series: Series[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of series) {
    for (const point of s.points) {
      const key = String(point.x);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(key);
    }
  }
  return labels;
}

function niceStep(span: number, count: number): number {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

type Scale = { min: number; max: number; step: number; ticks: number[] };

/** Rounded axis range around the values. Bars start at zero; lines and dots fit the data. */
function niceScale(values: number[], includeZero: boolean): Scale {
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo = includeZero && lo >= 0 ? 0 : lo - pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, TICK_COUNT);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { min, max, step, ticks };
}

type Bounds = { x0: number; y0: number; x1: number; y1: number; width: number; height: number };

function plotBounds(content: ChartContent, scale: Scale | null): Bounds {
  const tickChars = scale ? Math.max(...scale.ticks.map((t) => formatTick(t, scale.step).length)) : 0;
  const left = (scale ? tickChars * 6 + 10 : 8) + (content.y_label?.trim() ? 18 : 0);
  return {
    x0: left,
    y0: PAD.top,
    x1: VIEW_W - PAD.right,
    y1: VIEW_H - PAD.bottom,
    width: VIEW_W - left - PAD.right,
    height: VIEW_H - PAD.top - PAD.bottom
  };
}

function yAt(value: number, scale: Scale, b: Bounds): number {
  return b.y1 - ((value - scale.min) / (scale.max - scale.min || 1)) * b.height;
}

function yAxis(scale: Scale, b: Bounds): string {
  return scale.ticks
    .map((t) => {
      const y = yAt(t, scale, b).toFixed(2);
      const base = t === 0 || t === scale.min;
      return (
        `<line class="block-chart__grid${base ? ' block-chart__grid--base' : ''}" x1="${b.x0}" x2="${b.x1}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="${base ? 0.3 : 0.1}" />` +
        `<text class="block-chart__tick" fill="currentColor" fill-opacity="0.72" x="${b.x0 - 6}" y="${y}" dy="0.32em" text-anchor="end" font-size="10">${escapeXml(formatTick(t, scale.step))}</text>`
      );
    })
    .join('');
}

/**
 * Category labels along the bottom, thinned so they never overlap. Phones draw
 * them larger, so labels that would collide there carry --thin and CSS hides them.
 */
function xCategoryLabels(cats: string[], xOf: (i: number) => number, b: Bounds): string {
  const longest = Math.max(1, ...cats.map((c) => c.length));
  const room = b.width / Math.max(cats.length, 1);
  const every = Math.max(1, Math.ceil((longest * 6.2 + 6) / room));
  const everyOnPhone = every * Math.max(1, Math.ceil((longest * 7.4 + 6) / (room * every)));
  return cats
    .map((cat, i) =>
      i % every === 0
        ? `<text class="block-chart__tick${i % everyOnPhone ? ' block-chart__tick--thin' : ''}" fill="currentColor" fill-opacity="0.72" x="${xOf(i).toFixed(2)}" y="${b.y1 + 18}" text-anchor="middle" font-size="11">${escapeXml(cat)}</text>`
        : ''
    )
    .join('');
}

function hitRect(index: number, x: number, w: number, b: Bounds, guideX?: number): string {
  const gx = guideX != null ? ` data-gx="${guideX.toFixed(2)}"` : '';
  return `<rect class="block-chart__hit" data-hit="${index}"${gx} x="${x.toFixed(2)}" y="${b.y0}" width="${w.toFixed(2)}" height="${b.height}" fill="transparent" />`;
}

function buildBarSvg(content: ChartContent): string {
  const series = chartSeries(content);
  const cats = categoryLabels(series);
  const scale = niceScale(series.flatMap((s) => s.points.map((p) => p.y)), true);
  const b = plotBounds(content, scale);
  const groupWidth = b.width / Math.max(cats.length, 1);
  const slot = groupWidth / Math.max(series.length, 1);
  const barWidth = slot * (series.length > 1 ? 0.86 : 0.62);
  const zero = yAt(0, scale, b);
  const parts: string[] = [yAxis(scale, b)];

  cats.forEach((cat, catIndex) => {
    series.forEach((s, seriesIndex) => {
      const point = s.points.find((p) => String(p.x) === cat);
      if (!point) return;
      const y = yAt(point.y, scale, b);
      const x = b.x0 + catIndex * groupWidth + (groupWidth - slot * series.length) / 2 + seriesIndex * slot + (slot - barWidth) / 2;
      parts.push(
        `<rect class="block-chart__mark" data-col="${catIndex}" x="${x.toFixed(2)}" y="${Math.min(y, zero).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.abs(zero - y).toFixed(2)}" rx="1.5" fill="${s.fill}" />`
      );
    });
  });
  parts.push(xCategoryLabels(cats, (i) => b.x0 + i * groupWidth + groupWidth / 2, b));
  cats.forEach((_, i) => parts.push(hitRect(i, b.x0 + i * groupWidth, groupWidth, b)));
  return parts.join('');
}

function buildLineSvg(content: ChartContent): string {
  const series = chartSeries(content);
  const cats = categoryLabels(series);
  const scale = niceScale(series.flatMap((s) => s.points.map((p) => p.y)), false);
  const b = plotBounds(content, scale);
  // Half a step of room at each end so the first and last dots sit inside the plot.
  const step = b.width / Math.max(cats.length, 1);
  const xOf = (i: number) => b.x0 + step / 2 + i * step;
  const parts: string[] = [yAxis(scale, b)];
  parts.push(
    `<line class="block-chart__guide" x1="0" x2="0" y1="${b.y0}" y2="${b.y1}" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="3 3" visibility="hidden" />`
  );

  series.forEach((s) => {
    const coords = cats
      .map((cat, i) => {
        const point = s.points.find((p) => String(p.x) === cat);
        return point ? { i, x: xOf(i), y: yAt(point.y, scale, b) } : null;
      })
      .filter((p): p is { i: number; x: number; y: number } => p != null);
    if (!coords.length) return;
    parts.push(
      `<polyline class="block-chart__line" fill="none" stroke="${s.fill}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" points="${coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')}" />`
    );
    for (const c of coords) {
      parts.push(
        `<circle class="block-chart__dot" data-col="${c.i}" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3" fill="${s.fill}" />`
      );
    }
  });
  parts.push(xCategoryLabels(cats, xOf, b));
  cats.forEach((_, i) => parts.push(hitRect(i, b.x0 + i * step, step, b, xOf(i))));
  return parts.join('');
}

function buildScatterSvg(content: ChartContent): string {
  const series = chartSeries(content);
  const scale = niceScale(series.flatMap((s) => s.points.map((p) => p.y)), false);
  const b = plotBounds(content, scale);
  const xs = series.flatMap((s) => s.points.map((p) => Number(p.x))).filter(Number.isFinite);
  const xScale = xs.length ? niceScale(xs, false) : null;
  const xOf = (value: number) =>
    xScale ? b.x0 + ((value - xScale.min) / (xScale.max - xScale.min || 1)) * b.width : b.x0;
  const parts: string[] = [yAxis(scale, b)];

  if (xScale) {
    for (const t of xScale.ticks) {
      parts.push(
        `<text class="block-chart__tick" fill="currentColor" fill-opacity="0.72" x="${xOf(t).toFixed(2)}" y="${b.y1 + 18}" text-anchor="middle" font-size="11">${escapeXml(formatTick(t, xScale.step))}</text>`
      );
    }
  }

  let hit = 0;
  series.forEach((s) => {
    for (const point of s.points) {
      const numericX = Number(point.x);
      const x = Number.isFinite(numericX) ? xOf(numericX) : b.x0;
      const y = yAt(point.y, scale, b);
      parts.push(
        `<circle class="block-chart__dot" data-col="${hit}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${s.fill}" fill-opacity="0.85" />`,
        `<circle class="block-chart__hit" data-hit="${hit}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="10" fill="transparent" />`
      );
      if (typeof point.x === 'string' && !Number.isFinite(numericX)) {
        parts.push(
          `<text class="block-chart__tick" fill="currentColor" fill-opacity="0.72" x="${x.toFixed(2)}" y="${(y - 8).toFixed(2)}" text-anchor="middle" font-size="10">${escapeXml(point.x)}</text>`
        );
      }
      hit += 1;
    }
  });
  return parts.join('');
}

function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r
  };
}

function sliceFill(index: number): string {
  const token = CHART_SERIES_COLOR_OPTIONS[index % CHART_SERIES_COLOR_OPTIONS.length]!.id;
  return `var(--${token})`;
}

function buildPieSvg(content: ChartContent): string {
  const series = chartSeries(content)[0];
  const parts: string[] = [];
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2 + 4;
  const r = 70;
  const total = series?.points.reduce((sum, p) => sum + Math.abs(p.y), 0) ?? 0;

  if (!series || total <= 0) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--line)" />`);
    return parts.join('');
  }

  let angle = -Math.PI / 2;
  series.points.forEach((point, index) => {
    const sweep = (Math.abs(point.y) / total) * Math.PI * 2;
    const start = polar(cx, cy, r, angle);
    const end = polar(cx, cy, r, angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d =
      sweep >= Math.PI * 2 - 1e-6
        ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
        : [
            `M ${cx} ${cy}`,
            `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
            `A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
            'Z'
          ].join(' ');
    parts.push(
      `<path class="block-chart__mark block-chart__hit" data-col="${index}" data-hit="${index}" d="${d}" fill="${sliceFill(index)}" stroke="var(--paper, #fff)" stroke-width="1.5" />`
    );

    const mid = angle + sweep / 2;
    const labelPos = polar(cx, cy, r + 18, mid);
    parts.push(
      `<text class="block-chart__tick" fill="currentColor" fill-opacity="0.72" x="${labelPos.x.toFixed(2)}" y="${labelPos.y.toFixed(2)}" dy="0.32em" text-anchor="${Math.cos(mid) > 0.3 ? 'start' : Math.cos(mid) < -0.3 ? 'end' : 'middle'}" font-size="11">${escapeXml(String(point.x))}</text>`
    );
    angle += sweep;
  });

  return parts.join('');
}

/** One entry per `data-hit` index in the drawing, in the same order. */
export function chartHoverModel(content: ChartContent): ChartHoverEntry[] {
  const series = chartSeries(content);
  if (content.chart_type === 'pie') {
    const s = series[0];
    if (!s) return [];
    const total = s.points.reduce((sum, p) => sum + Math.abs(p.y), 0) || 1;
    return s.points.map((p, i) => ({
      title: String(p.x),
      rows: [
        {
          label: content.y_label?.trim() || s.name,
          value: `${formatChartNumber(p.y)} (${Math.round((Math.abs(p.y) / total) * 100)}%)`,
          fill: sliceFill(i)
        }
      ]
    }));
  }
  if (content.chart_type === 'scatter') {
    return series.flatMap((s) =>
      s.points.map((p) => ({
        title: s.name,
        rows: [
          { label: content.x_label?.trim() || 'X', value: typeof p.x === 'number' ? formatChartNumber(p.x) : String(p.x) },
          { label: content.y_label?.trim() || 'Y', value: formatChartNumber(p.y), fill: s.fill }
        ]
      }))
    );
  }
  return categoryLabels(series).map((cat) => ({
    title: cat,
    rows: series.flatMap((s) => {
      const point = s.points.find((p) => String(p.x) === cat);
      if (!point) return [];
      const label = series.length === 1 ? content.y_label?.trim() || s.name : s.name;
      return [{ label, value: formatChartNumber(point.y), fill: s.fill }];
    })
  }));
}

/** The readable data table: one row per category, one column per series. */
export function buildChartPivot(content: ChartContent): { head: string[]; rows: string[][] } {
  const series = chartSeries(content);
  const xHead = content.x_label?.trim() || (content.chart_type === 'pie' ? 'Label' : 'X');
  const yHead = content.y_label?.trim() || 'Y';
  if (content.chart_type === 'pie') {
    const s = series[0];
    const total = s?.points.reduce((sum, p) => sum + Math.abs(p.y), 0) || 1;
    return {
      head: [xHead, content.y_label?.trim() || s?.name || 'Value', 'Share'],
      rows: (s?.points ?? []).map((p) => [
        String(p.x),
        formatChartNumber(p.y),
        `${Math.round((Math.abs(p.y) / total) * 100)}%`
      ])
    };
  }
  if (content.chart_type === 'scatter') {
    const many = series.length > 1;
    return {
      head: [...(many ? ['Series'] : []), xHead, yHead],
      rows: series.flatMap((s) =>
        s.points.map((p) => [
          ...(many ? [s.name] : []),
          typeof p.x === 'number' ? formatChartNumber(p.x) : String(p.x),
          formatChartNumber(p.y)
        ])
      )
    };
  }
  return {
    head: [xHead, ...series.map((s) => (series.length === 1 ? content.y_label?.trim() || s.name : s.name))],
    rows: categoryLabels(series).map((cat) => [
      cat,
      ...series.map((s) => {
        const point = s.points.find((p) => String(p.x) === cat);
        return point ? formatChartNumber(point.y) : '–';
      })
    ])
  };
}

export function chartAriaLabel(content: ChartContent): string {
  const kind = `${content.chart_type} chart`;
  const title = content.title?.trim();
  return title ? `${title}, ${kind}` : kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function buildChartSvg(content: ChartContent): string {
  let body = '';
  switch (content.chart_type) {
    case 'bar':
      body = buildBarSvg(content);
      break;
    case 'line':
      body = buildLineSvg(content);
      break;
    case 'pie':
      body = buildPieSvg(content);
      break;
    case 'scatter':
      body = buildScatterSvg(content);
      break;
  }

  const xLabel = content.chart_type !== 'pie' ? content.x_label?.trim() : undefined;
  const yLabel = content.chart_type !== 'pie' ? content.y_label?.trim() : undefined;
  const viewH = VIEW_H + (xLabel ? X_LABEL_ROOM : 0);
  const b = plotBounds(content, null);
  if (xLabel) {
    body += `<text class="block-chart__axis-label" x="${((b.x0 + b.x1) / 2).toFixed(2)}" y="${viewH - 4}" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">${escapeXml(xLabel)}</text>`;
  }
  if (yLabel) {
    const cy = ((b.y0 + b.y1) / 2).toFixed(2);
    body += `<text class="block-chart__axis-label" transform="translate(10 ${cy}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor">${escapeXml(yLabel)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${viewH}" overflow="visible" role="img" aria-label="${escapeXml(chartAriaLabel(content))}">${body}</svg>`;
}
