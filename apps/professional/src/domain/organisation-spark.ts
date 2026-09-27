/**
 * Crest-tile people spark (FIX-BRIEF-01 A1 / C5).
 * Shared 2019→now x-scale; y = cumulative people as a step line.
 * Axis labels only. Dot on the last point only. No per-point labels.
 */

export interface SparkPoint {
  id: string;
  at: string;
}

export interface SparkWorkMark {
  start: string;
  end: string | null;
}

export interface SparkEventMark {
  at: string;
}

export interface SparkLayout {
  width: number;
  height: number;
  path: string;
  areaPath: string;
  points: Array<{ id: string; x: number; y: number; isLast: boolean }>;
  workBars: Array<{ x: number; w: number }>;
  eventMarks: Array<{ x: number }>;
  axisLabels: Array<{ x: number; text: string; anchor: 'start' | 'end' }>;
}

const WIDTH = 300;
const HEIGHT = 36;
const PAD_L = 30;
const PAD_R = 28;
const PAD_TOP = 6;
const PAD_BOTTOM = 14;
const DOMAIN_START = '2019-01-01T00:00:00.000Z';

export const ORG_SPARK_DOMAIN_START = DOMAIN_START;
export const ORG_SPARK_HEIGHT_PX = HEIGHT;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Shared-scale x for a date — same x on every tile for the same instant. */
export function organisationSparkX(
  at: string,
  nowIso: string,
  width: number = WIDTH
): number {
  const startMs = Date.parse(DOMAIN_START);
  const endMs = Date.parse(nowIso);
  const span = Math.max(1, endMs - startMs);
  const t = clamp01((Date.parse(at) - startMs) / span);
  return PAD_L + t * (width - PAD_L - PAD_R);
}

function yForCount(count: number, max: number): number {
  if (max <= 0) return HEIGHT - PAD_BOTTOM;
  const t = count / max;
  return HEIGHT - PAD_BOTTOM - t * (HEIGHT - PAD_TOP - PAD_BOTTOM);
}

/**
 * Build a step path: horizontal to next x, then vertical to next y.
 */
function stepPaths(
  placed: Array<{ x: number; y: number }>
): { path: string; areaPath: string } {
  if (placed.length === 0) return { path: '', areaPath: '' };
  const first = placed[0]!;
  const baseY = HEIGHT - PAD_BOTTOM;
  let path = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]!;
    const cur = placed[i]!;
    path += ` H${cur.x.toFixed(1)} V${cur.y.toFixed(1)}`;
    void prev;
  }
  const last = placed[placed.length - 1]!;
  const areaPath = `${path} V${baseY.toFixed(1)} H${first.x.toFixed(1)} Z`;
  return { path, areaPath };
}

export function layoutOrganisationSpark(input: {
  points: SparkPoint[];
  now?: string;
  width?: number;
  workMarks?: SparkWorkMark[];
  eventMarks?: SparkEventMark[];
}): SparkLayout {
  const width = input.width ?? WIDTH;
  const nowIso = input.now ?? new Date().toISOString();
  const sorted = [...input.points]
    .filter((p) => p.at && Number.isFinite(Date.parse(p.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const seen = new Set<string>();
  const unique: Array<{ id: string; at: string; count: number }> = [];
  for (const p of sorted) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push({ id: p.id, at: p.at, count: seen.size });
  }

  const max = unique.length;
  const placed = unique.map((p, i) => ({
    id: p.id,
    x: organisationSparkX(p.at, nowIso, width),
    y: yForCount(p.count, max),
    isLast: i === unique.length - 1
  }));

  const { path, areaPath } = stepPaths(placed);

  const workBars = (input.workMarks ?? [])
    .filter((m) => m.start && Number.isFinite(Date.parse(m.start)))
    .map((m) => {
      const x0 = organisationSparkX(m.start, nowIso, width);
      const x1 = organisationSparkX(m.end ?? nowIso, nowIso, width);
      return { x: x0, w: Math.max(2, x1 - x0) };
    });

  const eventMarks = (input.eventMarks ?? [])
    .filter((m) => m.at && Number.isFinite(Date.parse(m.at)))
    .map((m) => ({ x: organisationSparkX(m.at, nowIso, width) }));

  return {
    width,
    height: HEIGHT,
    path,
    areaPath,
    points: placed,
    workBars,
    eventMarks,
    axisLabels: [
      { x: 0, text: '2019', anchor: 'start' },
      { x: width, text: 'now', anchor: 'end' }
    ]
  };
}

export function renderOrganisationSparkSvg(input: {
  points: SparkPoint[];
  now?: string;
  width?: number;
  workMarks?: SparkWorkMark[];
  eventMarks?: SparkEventMark[];
  undatedCount?: number;
}): SVGSVGElement {
  const layout = layoutOrganisationSpark(input);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(HEIGHT));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.height = `${HEIGHT}px`;
  svg.classList.add('orgs-spark');

  for (const bar of layout.workBars) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', String(bar.x));
    r.setAttribute('y', String(HEIGHT / 2 - 3));
    r.setAttribute('width', String(bar.w));
    r.setAttribute('height', '6');
    r.setAttribute('rx', '3');
    r.setAttribute('fill', 'var(--depth)');
    r.setAttribute('fill-opacity', '0.35');
    svg.append(r);
  }

  if (layout.areaPath) {
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', layout.areaPath);
    area.setAttribute('fill', 'var(--wave)');
    area.setAttribute('fill-opacity', '0.12');
    area.setAttribute('stroke', 'none');
    svg.append(area);
  }

  if (layout.path) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', layout.path);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'var(--wave)');
    line.setAttribute('stroke-width', '1.5');
    svg.append(line);
  }

  for (const p of layout.points) {
    if (!p.isLast) continue;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '3');
    c.setAttribute('fill', 'var(--depth)');
    svg.append(c);
  }

  for (const ev of layout.eventMarks) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(ev.x));
    c.setAttribute('cy', String(HEIGHT / 2));
    c.setAttribute('r', '2.5');
    c.setAttribute('fill', 'var(--wave)');
    svg.append(c);
  }

  for (const ax of layout.axisLabels) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(ax.x));
    t.setAttribute('y', String(HEIGHT - 2));
    t.setAttribute('text-anchor', ax.anchor);
    t.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
    t.setAttribute('font-size', '9');
    t.setAttribute('font-weight', '600');
    t.setAttribute('fill', 'var(--muted)');
    t.textContent = ax.text;
    svg.append(t);
  }

  return svg;
}
