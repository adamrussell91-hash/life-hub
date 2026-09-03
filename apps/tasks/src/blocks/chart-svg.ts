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

const VIEW_W = 400;
const VIEW_H = 240;
const PAD = { top: 16, right: 20, bottom: 44, left: 44 };

function seriesFill(
  series: { color?: ChartSeriesColor },
  index: number
): string {
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

export function buildChartTableRows(
  content: ChartContent
): Array<{ series: string; x: string; y: string }> {
  const rows: Array<{ series: string; x: string; y: string }> = [];
  for (const series of content.series) {
    for (const point of series.points) {
      rows.push({ series: series.name, x: String(point.x), y: String(point.y) });
    }
  }
  return rows;
}

function plotBounds() {
  return {
    x0: PAD.left,
    y0: PAD.top,
    x1: VIEW_W - PAD.right,
    y1: VIEW_H - PAD.bottom,
    width: VIEW_W - PAD.left - PAD.right,
    height: VIEW_H - PAD.top - PAD.bottom
  };
}

function yExtent(content: ChartContent): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const series of content.series) {
    for (const point of series.points) {
      if (!Number.isFinite(point.y)) continue;
      min = Math.min(min, point.y);
      max = Math.max(max, point.y);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    return { min: Math.min(0, min), max: max === 0 ? 1 : max * 1.2 };
  }
  return { min: Math.min(0, min), max };
}

function categoryLabels(content: ChartContent): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const series of content.series) {
    for (const point of series.points) {
      const key = String(point.x);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(key);
    }
  }
  return labels;
}

function buildBarSvg(content: ChartContent): string {
  const bounds = plotBounds();
  const cats = categoryLabels(content);
  const { min, max } = yExtent(content);
  const range = max - min || 1;
  const groupWidth = bounds.width / Math.max(cats.length, 1);
  const barWidth = groupWidth / Math.max(content.series.length, 1) * 0.7;
  const parts: string[] = [];

  cats.forEach((cat, catIndex) => {
    content.series.forEach((series, seriesIndex) => {
      const point = series.points.find((p) => String(p.x) === cat);
      const y = point?.y ?? 0;
      const h = ((y - min) / range) * bounds.height;
      const x =
        bounds.x0 +
        catIndex * groupWidth +
        seriesIndex * (groupWidth / content.series.length) +
        (groupWidth / content.series.length - barWidth) / 2;
      const yPos = bounds.y1 - h;
      parts.push(
        `<rect x="${x.toFixed(2)}" y="${yPos.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(h, 0).toFixed(2)}" fill="${seriesFill(series, seriesIndex)}" />`
      );
    });
    const labelX = bounds.x0 + catIndex * groupWidth + groupWidth / 2;
    parts.push(
      `<text x="${labelX.toFixed(2)}" y="${VIEW_H - 12}" text-anchor="middle" font-size="11" fill="currentColor">${escapeXml(cat)}</text>`
    );
  });

  return parts.join('');
}

function buildLineSvg(content: ChartContent): string {
  const bounds = plotBounds();
  const cats = categoryLabels(content);
  const { min, max } = yExtent(content);
  const range = max - min || 1;
  const parts: string[] = [];

  content.series.forEach((series, seriesIndex) => {
    const points = cats
      .map((cat, index) => {
        const point = series.points.find((p) => String(p.x) === cat);
        if (!point) return null;
        const x = bounds.x0 + (index / Math.max(cats.length - 1, 1)) * bounds.width;
        const y = bounds.y1 - ((point.y - min) / range) * bounds.height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .filter((p): p is string => p != null);
    if (points.length) {
      parts.push(
        `<polyline fill="none" stroke="${seriesFill(series, seriesIndex)}" stroke-width="2" points="${points.join(' ')}" />`
      );
    }
  });

  cats.forEach((cat, index) => {
    const x = bounds.x0 + (index / Math.max(cats.length - 1, 1)) * bounds.width;
    parts.push(
      `<text x="${x.toFixed(2)}" y="${VIEW_H - 12}" text-anchor="middle" font-size="11" fill="currentColor">${escapeXml(cat)}</text>`
    );
  });

  return parts.join('');
}

function buildScatterSvg(content: ChartContent): string {
  const bounds = plotBounds();
  const { min, max } = yExtent(content);
  const range = max - min || 1;
  const xs = content.series.flatMap((s) => s.points.map((p) => Number(p.x))).filter(Number.isFinite);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const xRange = xMax - xMin || 1;
  const parts: string[] = [];

  content.series.forEach((series, seriesIndex) => {
    for (const point of series.points) {
      const numericX = typeof point.x === 'number' ? point.x : Number(point.x);
      const x = Number.isFinite(numericX)
        ? bounds.x0 + ((numericX - xMin) / xRange) * bounds.width
        : bounds.x0;
      const y = bounds.y1 - ((point.y - min) / range) * bounds.height;
      parts.push(
        `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${seriesFill(series, seriesIndex)}" />`
      );
      if (typeof point.x === 'string') {
        parts.push(
          `<text x="${x.toFixed(2)}" y="${(y - 8).toFixed(2)}" text-anchor="middle" font-size="10" fill="currentColor">${escapeXml(point.x)}</text>`
        );
      }
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
  const series = content.series[0];
  const parts: string[] = [];
  if (!series) return parts.join('');

  const total = series.points.reduce((sum, p) => sum + (Number.isFinite(p.y) ? Math.abs(p.y) : 0), 0);
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2 + 4;
  const r = 70;

  if (total <= 0) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--line)" />`);
    return parts.join('');
  }

  let angle = -Math.PI / 2;
  series.points.forEach((point, index) => {
    const value = Number.isFinite(point.y) ? Math.abs(point.y) : 0;
    const sweep = (value / total) * Math.PI * 2;
    const start = polar(cx, cy, r, angle);
    const end = polar(cx, cy, r, angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${cx} ${cy}`,
      `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      'Z'
    ].join(' ');
    parts.push(`<path d="${d}" fill="${sliceFill(index)}" />`);

    const mid = angle + sweep / 2;
    const labelPos = polar(cx, cy, r + 18, mid);
    parts.push(
      `<text x="${labelPos.x.toFixed(2)}" y="${labelPos.y.toFixed(2)}" text-anchor="middle" font-size="11" fill="currentColor">${escapeXml(String(point.x))}</text>`
    );
    angle += sweep;
  });

  return parts.join('');
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" overflow="visible" role="img">${body}</svg>`;
}
