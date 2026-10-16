import type { MapStation, Point, TickAttach, TransitMap } from '@/schemas/map';
import type { SchoolYearTerms } from '@/domain/hub-prefs';
import { normalizeLineColors } from '@/domain/maps-layout';
import { layoutMap, transitSvgDocument } from '@/domain/maps-transit';
import { mindWorks2026Map } from '@/domain/maps-seed';

export function isOrthogonalPath(points: Point[]): boolean {
  if (points.length < 2) return false;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

export type LineRef = { id: string; points: Point[] };
export type StationRef = { id: string; line_id: string; y: number; height: number };

export type Crossing = {
  point: Point;
  a_line_id: string;
  b_line_id: string;
};

function segments(line: LineRef): Array<{ a: Point; b: Point }> {
  const out: Array<{ a: Point; b: Point }> = [];
  for (let i = 1; i < line.points.length; i += 1) {
    out.push({ a: line.points[i - 1]!, b: line.points[i]! });
  }
  return out;
}

function intersect(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): Point | null {
  const aVert = a1.x === a2.x;
  const bVert = b1.x === b2.x;
  if (aVert === bVert) return null;
  const v = aVert ? { x: a1.x, y0: Math.min(a1.y, a2.y), y1: Math.max(a1.y, a2.y) } : null;
  const h = aVert
    ? { y: b1.y, x0: Math.min(b1.x, b2.x), x1: Math.max(b1.x, b2.x) }
    : { y: a1.y, x0: Math.min(a1.x, a2.x), x1: Math.max(a1.x, a2.x) };
  const vert = v ?? { x: b1.x, y0: Math.min(b1.y, b2.y), y1: Math.max(b1.y, b2.y) };
  if (vert.x < h.x0 || vert.x > h.x1) return null;
  if (h.y < vert.y0 || h.y > vert.y1) return null;
  return { x: vert.x, y: h.y };
}

export function segmentCrossings(lines: LineRef[], _stations: StationRef[]): Crossing[] {
  const found: Crossing[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i]!;
      const b = lines[j]!;
      for (const sa of segments(a)) {
        for (const sb of segments(b)) {
          const point = intersect(sa.a, sa.b, sb.a, sb.b);
          if (point) found.push({ point, a_line_id: a.id, b_line_id: b.id });
        }
      }
    }
  }
  return found;
}

export function capsuleOccupies(station: StationRef, point: Point): boolean {
  return point.y >= station.y && point.y <= station.y + station.height;
}

export function crossingKind(crossing: Crossing, stations: StationRef[]): 'tunnel' | 'interchange' {
  const hit = stations.some(
    (s) =>
      (s.line_id === crossing.a_line_id || s.line_id === crossing.b_line_id) &&
      capsuleOccupies(s, crossing.point)
  );
  return hit ? 'interchange' : 'tunnel';
}

export function attachTick(attach: TickAttach): TickAttach {
  return attach;
}

export type LineCut = { x: number; y0: number; y1: number };

export function stationLineCuts(
  line: { points: Point[] },
  stations: Array<{ y: number; height: number }>
): LineCut[] {
  const first = line.points[0];
  const last = line.points[line.points.length - 1];
  if (!first || !last) return [];
  const x = first.x;
  const yMin = Math.min(...line.points.map((p) => p.y));
  const yMax = Math.max(...line.points.map((p) => p.y));
  const blocked = [...stations]
    .map((s) => ({ y0: s.y, y1: s.y + s.height }))
    .sort((a, b) => a.y0 - b.y0);
  const cuts: LineCut[] = [];
  let cursor = yMin;
  for (const block of blocked) {
    if (block.y0 > cursor) cuts.push({ x, y0: cursor, y1: block.y0 });
    cursor = Math.max(cursor, block.y1);
  }
  if (cursor < yMax) cuts.push({ x, y0: cursor, y1: yMax });
  return cuts;
}

export function pickCurrentYearMap<T extends { id: string; year: number | null }>(
  maps: T[],
  year: number
): T | null {
  return maps.find((m) => m.year === year) ?? maps[0] ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderExportSvg(map: TransitMap, years?: readonly SchoolYearTerms[] | null): string {
  return transitSvgDocument(layoutMap(map, years));
}

export function exportMapHtml(map: TransitMap, years?: readonly SchoolYearTerms[] | null): string {
  return `<!DOCTYPE html>
<html lang="en" data-hub="tasks">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(map.title)}</title>
  <style>
    :root { --wave:#376fb7; --ink:#13233a; --muted:#6b7788; --paper:#fbf8f2; --cotton:#f5f1e9; }
    body { margin:0; font-family:Inter,ui-sans-serif,sans-serif; background:var(--paper); color:var(--ink); }
    .wrap { padding:24px; }
    .eyebrow { margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
    h1 { margin:6px 0 16px; font-size:32px; font-weight:600; }
    .canvas { background:var(--cotton); border-radius:12px; min-height:70vh; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="eyebrow">MindWorks Pathways</p>
    <h1>${escapeHtml(map.title)}</h1>
    <div class="canvas">${renderExportSvg(map, years)}</div>
  </div>
</body>
</html>`;
}

export function emptyMapDraft(title = 'Untitled map'): Omit<
  TransitMap,
  'schema_version' | 'id' | 'created_at' | 'updated_at'
> {
  return { title, year: null, terms: null, lines: [], stations: [], ticks: [] };
}

export { lineX } from '@/domain/maps-layout';

export function stationAt(stations: MapStation[], id: string): MapStation | undefined {
  return stations.find((s) => s.id === id);
}

export function mapsOrSeed(maps: TransitMap[] | null | undefined): TransitMap[] {
  const list = maps && maps.length > 0 ? maps : [mindWorks2026Map()];
  return list.map((map) => foldStrandLinks(normalizeLineColors(map)));
}

/** What a free-text "connects to" names: a competition first, else a strand. */
export function connectTargetOf(
  map: TransitMap,
  connectsTo: string | null
): { kind: 'event' | 'line'; id: string } | null {
  if (!connectsTo) return null;
  const text = connectsTo.toLowerCase();
  const event = map.ticks.find(
    (tick) => tick.id.toLowerCase() === text || tick.label.toLowerCase() === text || text.includes(tick.label.toLowerCase())
  );
  if (event) return { kind: 'event', id: event.id };
  const line = map.lines.find((item) => text.includes(item.name.toLowerCase()) || text.includes(item.id.toLowerCase()));
  return line ? { kind: 'line', id: line.id } : null;
}

/**
 * Older cards linked a competition to another strand with "Also connect to". A competition on a
 * year line now simply sits on several strands, so such a link becomes one more strand.
 * Returns the same map when nothing changes.
 */
export function foldStrandLinks(map: TransitMap): TransitMap {
  let changed = false;
  const ticks = map.ticks.map((tick) => {
    if (tick.attach.kind !== 'line' || tick.all_year) return tick;
    const target = connectTargetOf(map, tick.connects_to);
    if (target?.kind !== 'line') return tick;
    changed = true;
    const host = tick.attach.line_id;
    const also = new Set(tick.also_lines ?? []);
    if (target.id !== host) also.add(target.id);
    return { ...tick, connects_to: null, ...(also.size ? { also_lines: [...also] } : {}) };
  });
  return changed ? { ...map, ticks } : map;
}
