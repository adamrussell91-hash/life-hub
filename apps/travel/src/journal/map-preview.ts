import type { JournalMoment } from '@/journal/types';
import {
  buildPhotoStops,
  buildSegments,
  type PhotoStop,
  type MapSegment,
} from '@/journal/map-connections';
import { openJournalDayMap, type JournalDayMapHandle } from '@/journal/map-expanded';

const SCHEMATIC_W = 320;
const SCHEMATIC_H = 72;
const SCHEMATIC_PAD = 8;

export interface SchematicLayout {
  points: { momentId: string; x: number; y: number }[];
  paths: string[];
}

/** Project lat/lon stops into schematic SVG space (y increases downward). */
export function layoutPhotoStopSchematic(
  stops: PhotoStop[],
  segments: MapSegment[],
): SchematicLayout {
  if (stops.length === 0) return { points: [], paths: [] };

  let minLat = stops[0]!.lat;
  let maxLat = stops[0]!.lat;
  let minLon = stops[0]!.lon;
  let maxLon = stops[0]!.lon;
  for (const s of stops) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLon = Math.min(minLon, s.lon);
    maxLon = Math.max(maxLon, s.lon);
  }

  const innerW = SCHEMATIC_W - SCHEMATIC_PAD * 2;
  const innerH = SCHEMATIC_H - SCHEMATIC_PAD * 2;
  const spanLat = Math.max(maxLat - minLat, 0.0001);
  const spanLon = Math.max(maxLon - minLon, 0.0001);
  const scale = Math.min(innerW / spanLon, innerH / spanLat);

  const project = (lat: number, lon: number): { x: number; y: number } => {
    const x = SCHEMATIC_PAD + (lon - minLon) * scale + (innerW - spanLon * scale) / 2;
    const y =
      SCHEMATIC_H -
      SCHEMATIC_PAD -
      (lat - minLat) * scale -
      (innerH - spanLat * scale) / 2;
    return { x, y };
  };

  const points = stops.map((stop) => {
    const { x, y } = project(stop.lat, stop.lon);
    return { momentId: stop.momentId, x, y };
  });

  const paths: string[] = [];
  for (const segment of segments) {
    const coords = segment.coordinates.map(([lon, lat]) => project(lat, lon));
    if (coords.length < 2) continue;
    const d = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    paths.push(d);
  }

  return { points, paths };
}

function schematicSvg(layout: SchematicLayout): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'journal-day__map-preview-schematic');
  svg.setAttribute('viewBox', `0 0 ${SCHEMATIC_W} ${SCHEMATIC_H}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const d of layout.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('opacity', '0.55');
    svg.append(path);
  }

  for (const point of layout.points) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', 'var(--wave, #2a6f97)');
    circle.setAttribute('stroke', 'var(--paper, #fff)');
    circle.setAttribute('stroke-width', '1.5');
    svg.append(circle);
  }

  return svg;
}

export interface CreateDayMapPreviewOptions {
  moments: JournalMoment[];
  dayId: string;
  localDate: string;
  anchor: HTMLElement;
  onOpen?: (handle: JournalDayMapHandle) => void;
  onClose?: () => void;
}

/** One accessible preview control per day (static schematic, no WebGL). */
export function createDayMapPreview(options: CreateDayMapPreviewOptions): HTMLButtonElement {
  const stops = buildPhotoStops(options.moments);
  const segments = buildSegments(stops, { steps: 12, wrapLongitude: true });
  const layout = layoutPhotoStopSchematic(stops, segments);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'journal-day__map-preview';
  btn.setAttribute('data-journal-day-map', options.dayId);
  btn.setAttribute('aria-label', 'Open photo stops for this day');

  const label = document.createElement('span');
  label.className = 'journal-day__map-preview-label';
  label.textContent = 'Open photo stops for this day';

  btn.append(schematicSvg(layout), label);

  btn.addEventListener('click', () => {
    const handle = openJournalDayMap({
      moments: options.moments,
      localDate: options.localDate,
      anchor: options.anchor,
      onClose: options.onClose,
    });
    options.onOpen?.(handle);
  });

  return btn;
}
