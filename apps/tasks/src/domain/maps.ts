import type { MapStation, Point, TickAttach, TransitMap } from '@/schemas/map';
import { layoutMap, MAP_LEFT, normalizeLineColors, wrapEventLines } from '@/domain/maps-layout';
import { swatch } from '@/domain/maps-colors';
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

function renderExportSvg(map: TransitMap): string {
  const layout = layoutMap(map);
  const parts: string[] = [];
  for (const term of layout.terms) {
    parts.push(
      `<line x1="${MAP_LEFT}" y1="${term.y}" x2="${layout.width - 24}" y2="${term.y}" stroke="#6b7788" stroke-width="1.5" stroke-dasharray="6 5"/>`,
      `<circle cx="36" cy="${term.y}" r="14" fill="#6b7788"/>`,
      `<text x="36" y="${term.y + 4}" text-anchor="middle" font-size="11" fill="#fbf8f2" font-weight="600">${term.label}</text>`
    );
  }
  for (const line of layout.lines) {
    const tone = swatch(line.color);
    for (const track of line.tracks) {
      for (const cut of track.cuts) {
        parts.push(
          `<line x1="${track.x}" y1="${cut.y0}" x2="${track.x}" y2="${cut.y1}" stroke="${tone.stroke}" stroke-width="8" stroke-linecap="round"/>`
        );
      }
      const labelY = track.disc.cy - track.disc.r - 36;
      const pillW = Math.max(56, track.label.length * 9 + 20);
      const pillH = 24;
      parts.push(
        `<rect x="${track.disc.cx - pillW / 2}" y="${labelY - pillH / 2}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#fbf8f2" stroke="${tone.stroke}" stroke-width="2"/>`,
        `<text x="${track.disc.cx}" y="${labelY + 5}" text-anchor="middle" font-size="15" fill="${tone.stroke}" font-weight="600">${escapeHtml(track.label)}</text>`,
        `<circle cx="${track.disc.cx}" cy="${track.disc.cy}" r="${track.disc.r}" fill="${tone.disc}"/>`,
        `<text x="${track.disc.cx}" y="${track.disc.cy + 5}" text-anchor="middle" font-size="16" fill="${tone.letter}" font-weight="700">${escapeHtml(line.letter)}</text>`
      );
    }
  }
  for (const connector of layout.connectors) {
    const color = swatch(connector.color).stroke;
    const opacity = connector.under ? ' stroke-opacity="0.9"' : '';
    parts.push(
      `<path d="${connector.path}" fill="none" stroke="${color}" stroke-width="3"${connector.dash ? ' stroke-dasharray="5 4"' : ''}${opacity}/>`
    );
  }
  for (const station of layout.stations) {
    const tone = swatch(station.color);
    for (const body of station.bodies) {
      parts.push(
        `<rect x="${body.x - body.w / 2}" y="${body.y}" width="${body.w}" height="${body.h}" rx="${body.w / 2}" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="3.5"/>`,
        `<text transform="rotate(-90 ${body.x} ${body.y + body.h / 2})" x="${body.x}" y="${body.y + body.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="${tone.stroke}" font-weight="600">${escapeHtml(station.label)}</text>`
      );
    }
  }
  for (const tick of layout.ticks) {
    const color = swatch(tick.color).stroke;
    parts.push(
      `<circle cx="${tick.cx}" cy="${tick.cy}" r="14" fill="#fbf8f2" stroke="${color}" stroke-width="3.5"/>`,
      `<rect x="${tick.labelBox.x}" y="${tick.labelBox.y}" width="${tick.labelBox.w}" height="${tick.labelBox.h}" rx="8" fill="#fbf8f2"/>`,
      `<text x="${tick.labelBox.x + tick.labelBox.w / 2}" y="${tick.labelBox.y + tick.labelBox.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="${color}" font-weight="600">${wrapEventLines(tick.label)
        .map((line, index, all) => {
          const y = tick.labelBox.y + tick.labelBox.h / 2 - ((all.length - 1) * 16) / 2 + index * 16;
          return `<tspan x="${tick.labelBox.x + tick.labelBox.w / 2}" y="${y}">${escapeHtml(line)}</tspan>`;
        })
        .join('')}</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="100%">${parts.join('')}</svg>`;
}

export function exportMapHtml(map: TransitMap): string {
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
    <div class="canvas">${renderExportSvg(map)}</div>
  </div>
</body>
</html>`;
}

export function emptyMapDraft(title = 'Untitled map'): Omit<
  TransitMap,
  'schema_version' | 'id' | 'created_at' | 'updated_at'
> {
  return { title, year: null, lines: [], stations: [], ticks: [] };
}

export { lineX } from '@/domain/maps-layout';

export function stationAt(stations: MapStation[], id: string): MapStation | undefined {
  return stations.find((s) => s.id === id);
}

export function mapsOrSeed(maps: TransitMap[] | null | undefined): TransitMap[] {
  const list = maps && maps.length > 0 ? maps : [mindWorks2026Map()];
  return list.map((map) => normalizeLineColors(map));
}
