import type { TrackDef } from '@/domain/maps-layout';
import type { MapLine, MapStation, MapTick, TransitMap } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { projectPageHash } from '@/domain/cards';
import {
  activateMapItem,
  deleteMapItemProject,
  mapItemPageHash,
  planningOf,
  planMapItem
} from '@/domain/maps-planning';
import { parseHubPrefs, type SchoolYearTerms } from '@/domain/hub-prefs';
import { tasksApi } from '@/services/client-api';
import { exportMapHtml, mapsOrSeed, pickCurrentYearMap } from '@/domain/maps';
import { createFilteredPicker, type MapIndexItem, type PickerGroup } from '@/views/map-nav';
import { mountMapCardIndex, type MapCardModel } from '@/views/map-cards';
import { createMapToolbar } from '@/views/map-chrome';
import {
  applyDateSpanToStation,
  applyDateToTickAttach,
  dateToY,
  mapTerms,
  termMarksInOrder,
  lineTrackDefs,
  LINE_COLORS,
  lineColorsNeedWriteback,
  moveLine,
  attachTracksOf,
  nearestLaidTrack,
  nextLineLetter,
  nextLineX,
  normalizeLineColors,
  orthogonalPath,
  resolveLineAttachTracks,
  yearLinePoints,
  yToDate,
  type MapCanvasLayout,
  type TermMarks
} from '@/domain/maps-layout';
import { layoutMap, renderTransitSvg, type TransitLayout } from '@/domain/maps-transit';
import { swatch } from '@/domain/maps-colors';
import { createHubField, createHubFilter } from '@/views/hub-kit';
import { mapItemKindLabel } from '@/domain/maps-planning';
import {
  buildLineEditor,
  createMapInspector,
  inspectorButton,
  inspectorField,
  inspectorText,
  yearTrackPicker
} from '@/views/map-inspector';
import { showViewLoading } from '@/views/feedback';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export { mapsOrSeed };

/** Hide rail + page header so the map can fill the viewport. */
export function setMapFullscreenChrome(on: boolean): void {
  document.documentElement.classList.toggle('is-map-fullscreen', on);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

type Mode = 'view' | 'edit';

function findLine(map: TransitMap, id: string): MapLine | undefined {
  return map.lines.find((l) => l.id === id);
}

function lineForTick(map: TransitMap, tick: MapTick | undefined): MapLine | undefined {
  if (!tick) return undefined;
  if (tick.attach.kind === 'line') return findLine(map, tick.attach.line_id);
  if (tick.attach.kind === 'station') {
    const stationId = tick.attach.station_id;
    const station = map.stations.find((item) => item.id === stationId);
    return station ? findLine(map, station.line_id) : undefined;
  }
  const hostId = tick.attach.event_id;
  return lineForTick(
    map,
    map.ticks.find((item) => item.id === hostId)
  );
}

function targetPickerGroups(map: TransitMap, skipId?: string | null): PickerGroup[] {
  return [
    {
      label: 'Lines',
      options: map.lines.map((item) => ({
        value: `line:${item.id}`,
        label: `${item.letter} · ${item.name}`
      }))
    },
    {
      label: 'Stations',
      options: map.stations.map((item) => {
        const line = findLine(map, item.line_id);
        return {
          value: `station:${item.id}`,
          label: `${line?.letter ?? '?'} · ${item.label}`
        };
      })
    },
    {
      label: 'Competitions',
      options: map.ticks
        .filter((item) => item.id !== skipId)
        .map((item) => ({ value: `event:${item.id}`, label: item.label }))
    }
  ];
}

function buildMapIndexItems(
  map: TransitMap,
  layout: MapCanvasLayout
): MapIndexItem[] {
  const items: MapIndexItem[] = [];
  for (const station of map.stations) {
    const line = findLine(map, station.line_id);
    const laid = layout.stations.find((item) => item.id === station.id);
    items.push({
      id: station.id,
      kind: 'station',
      label: station.label,
      group: line ? `${line.letter} · ${line.name}` : 'Programs',
      y: laid ? laid.y + laid.h / 2 : station.y
    });
  }
  for (const tick of map.ticks) {
    const line = lineForTick(map, tick);
    const laid = layout.ticks.find((item) => item.id === tick.id);
    items.push({
      id: tick.id,
      kind: 'event',
      label: tick.label,
      group: line ? `${line.letter} · competitions` : 'Competitions',
      y: laid?.cy ?? 200
    });
  }
  return items.sort((a, b) => a.y - b.y || a.label.localeCompare(b.label));
}

function focusCameraOnY(layout: MapCanvasLayout, targetY: number, zoom: number): number {
  const viewH = layout.height / zoom;
  return Math.max(0, Math.min(layout.height - viewH, targetY - viewH / 3));
}

/** The canvas is 3–4k units wide, so a narrow stage needs well past 2× to read. */
const MAP_MAX_ZOOM = 5;

/** On-screen px per map unit we aim for on load, so 18-unit labels read at ~13px. */
const READABLE_SCALE = 0.75;

/**
 * Starting zoom: the whole-year canvas is ~3–4k units wide, so fitting it to the
 * stage drew every label at 5–7px. Zoom in until text is readable; − still shows it all.
 */
function stageFit(svg: SVGSVGElement, layout: MapCanvasLayout): number {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0;
  return Math.max(rect.width / layout.width, rect.height / layout.height);
}

function readableZoom(svg: SVGSVGElement, layout: MapCanvasLayout): number {
  const fit = stageFit(svg, layout);
  if (!fit) return 1;
  return Math.min(MAP_MAX_ZOOM, Math.max(1, READABLE_SCALE / fit));
}

/**
 * Map units actually on screen. The SVG slices (fills the stage and crops), so on a tall
 * phone stage far less than the viewBox width shows; panning must clamp to this, not the viewBox.
 */
function visibleUnits(svg: SVGSVGElement, layout: MapCanvasLayout, zoom: number): { w: number; h: number } {
  const rect = svg.getBoundingClientRect();
  const fit = stageFit(svg, layout);
  if (!fit) return { w: layout.width / zoom, h: layout.height / zoom };
  const scale = fit * zoom;
  return { w: rect.width / scale, h: rect.height / scale };
}

/** Stage at most this wide (px) opens on one whole strand instead of the left of the map. */
const PHONE_STAGE_PX = 720;
const STRAND_MARGIN = 20;
/** On-screen px per map unit allowed when fitting a whole strand to a phone (labels ≥ ~10px). */
const PHONE_MIN_SCALE = 0.58;
const PHONE_MAX_SCALE = 1.1;

type StrandExtent = { lineId: string; x0: number; x1: number };

function isPhoneStage(svg: SVGSVGElement): boolean {
  const width = svg.getBoundingClientRect().width;
  return width > 0 && width <= PHONE_STAGE_PX;
}

/** Zoom that fits one whole strand across a narrow stage, kept within readable bounds. */
function strandZoom(svg: SVGSVGElement, layout: MapCanvasLayout, strand: StrandExtent): number | null {
  const rect = svg.getBoundingClientRect();
  const fit = stageFit(svg, layout);
  if (!fit || !rect.width) return null;
  const scale = rect.width / (strand.x1 - strand.x0 + STRAND_MARGIN * 2);
  const clamped = Math.min(PHONE_MAX_SCALE, Math.max(PHONE_MIN_SCALE, scale));
  return Math.min(MAP_MAX_ZOOM, Math.max(0.5, clamped / fit));
}

/** Left edge of the camera that centres a strand, or starts at its left edge when it is wider than the view. */
function strandCamX(svg: SVGSVGElement, layout: MapCanvasLayout, zoom: number, strand: StrandExtent): number {
  const view = visibleUnits(svg, layout, zoom).w;
  const width = strand.x1 - strand.x0;
  return width + STRAND_MARGIN * 2 <= view ? (strand.x0 + strand.x1) / 2 - view / 2 : strand.x0 - STRAND_MARGIN;
}

function attachSelectValue(tick: MapTick): string {
  if (tick.attach.kind === 'station') return `station:${tick.attach.station_id}`;
  if (tick.attach.kind === 'event') return `event:${tick.attach.event_id}`;
  return `line:${tick.attach.line_id}`;
}

function connectSelectValue(map: TransitMap, connectsTo: string | null): string {
  if (!connectsTo) return '';
  const text = connectsTo.toLowerCase();
  const event = map.ticks.find(
    (tick) => tick.id.toLowerCase() === text || tick.label.toLowerCase() === text || text.includes(tick.label.toLowerCase())
  );
  if (event) return `event:${event.id}`;
  const line = map.lines.find(
    (item) => text.includes(item.name.toLowerCase()) || text.includes(item.id.toLowerCase())
  );
  return line ? `line:${line.id}` : '';
}

function parseAttachValue(
  value: string,
  fallbackLineId: string,
  fallbackY: number,
  previous?: MapTick['attach']
): MapTick['attach'] {
  const [kind, id] = value.split(':');
  const tracks =
    previous && (previous.kind === 'line' || previous.kind === 'station')
      ? attachTracksOf(previous)
      : [];
  if (kind === 'station' && id) {
    const side = previous?.kind === 'station' && previous.station_id === id ? previous.side : 'right';
    const offset = previous?.kind === 'station' && previous.station_id === id ? previous.offset : 0.5;
    return {
      kind: 'station',
      station_id: id,
      side,
      offset,
      ...(tracks.length ? { tracks } : {})
    };
  }
  if (kind === 'event' && id) return { kind: 'event', event_id: id, side: 'right' };
  const lineId = id || fallbackLineId;
  const y = previous?.kind === 'line' && previous.line_id === lineId ? previous.y : fallbackY;
  return { kind: 'line', line_id: lineId, y, ...(tracks.length ? { tracks } : {}) };
}

function parseConnectValue(value: string, map: TransitMap): string | null {
  if (!value) return null;
  const [kind, id] = value.split(':');
  if (kind === 'event') return map.ticks.find((tick) => tick.id === id)?.label ?? id ?? null;
  if (kind === 'line') return map.lines.find((item) => item.id === id)?.name ?? null;
  return null;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

type ConnectorLiveRef = {
  el: Element;
  from: { x: number; y: number };
  to: { x: number; y: number };
  shiftFrom: boolean;
  shiftTo: boolean;
};

function connectorRefs(
  svg: SVGSVGElement,
  layout: MapCanvasLayout,
  ownerId: string
): ConnectorLiveRef[] {
  const refs: ConnectorLiveRef[] = [];
  for (const connector of layout.connectors) {
    const shiftFrom = connector.from.ownerId === ownerId;
    const shiftTo = connector.to.ownerId === ownerId;
    if (!shiftFrom && !shiftTo) continue;
    svg.querySelectorAll(`[data-connector-id="${connector.id}"]`).forEach((el) => {
      refs.push({
        el,
        from: { x: connector.from.x, y: connector.from.y },
        to: { x: connector.to.x, y: connector.to.y },
        shiftFrom,
        shiftTo
      });
    });
  }
  return refs;
}

function liveShiftConnectors(refs: ConnectorLiveRef[], dx: number, dy: number): void {
  for (const ref of refs) {
    const from = ref.shiftFrom ? { x: ref.from.x + dx, y: ref.from.y + dy } : ref.from;
    const to = ref.shiftTo ? { x: ref.to.x + dx, y: ref.to.y + dy } : ref.to;
    ref.el.setAttribute('d', orthogonalPath(from, to));
  }
}

function ownerLineId(layout: MapCanvasLayout, ownerId: string, owner: string): string | null {
  if (owner === 'line') return ownerId;
  if (owner === 'station') return layout.stations.find((item) => item.id === ownerId)?.line_id ?? null;
  return layout.ticks.find((item) => item.id === ownerId)?.lineId ?? null;
}

const DRAG_THRESHOLD = 4;

/** Selection id for the map's term-dates panel (never a real item id). */
const TERMS_SELECTION = '__terms__';

type MapHit =
  | JoinPick
  | { kind: 'station-resize'; id: string; edge: 'top' | 'bottom' }
  | { kind: 'terms'; id: string }
  | null;

function renderMapSvg(
  host: SVGSVGElement,
  layout: TransitLayout,
  selectedId: string | null,
  showPorts: boolean,
  editMode: boolean
): void {
  host.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  host.innerHTML = renderTransitSvg(layout, {
    selectedId,
    editMode,
    showPorts,
    termsSelected: selectedId === TERMS_SELECTION
  });
}

/**
 * After a repaint, start each strand, program and competition where it was and let it glide
 * to its new place (FLIP). Lines that bend to make room snap; everything else moves.
 */
function slideFromPrevious(svg: SVGSVGElement, before: TransitLayout, after: TransitLayout): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const moves: Array<{ el: SVGGElement; dx: number; dy: number }> = [];
  const strandShift = new Map<string, number>();
  for (const line of after.lines) {
    const old = before.lines.find((item) => item.id === line.id);
    const dx = old && old.tracks[0] && line.tracks[0] ? old.tracks[0].x - line.tracks[0].x : 0;
    strandShift.set(line.id, dx);
    const group = svg.querySelector<SVGGElement>(`.map-line-group[data-line="${CSS.escape(line.id)}"]`);
    if (group && Math.abs(dx) > 0.5) moves.push({ el: group, dx, dy: 0 });
  }
  for (const station of after.stations) {
    const old = before.stations.find((item) => item.id === station.id);
    if (!old || !old.bodies[0] || !station.bodies[0]) continue;
    const dx = old.bodies[0].x - station.bodies[0].x - (strandShift.get(station.line_id) ?? 0);
    const dy = old.y - station.y;
    const group = svg.querySelector<SVGGElement>(`.map-station[data-id="${CSS.escape(station.id)}"]`);
    if (group && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) moves.push({ el: group, dx, dy });
  }
  for (const tick of after.ticks) {
    const old = before.ticks.find((item) => item.id === tick.id);
    if (!old) continue;
    const dx = old.cx - tick.cx - (strandShift.get(tick.lineId) ?? 0);
    const dy = old.cy - tick.cy;
    const group = svg.querySelector<SVGGElement>(`.map-tick[data-id="${CSS.escape(tick.id)}"]`);
    if (group && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) moves.push({ el: group, dx, dy });
  }
  if (!moves.length) return;
  for (const move of moves) {
    move.el.style.transition = 'none';
    move.el.style.transform = `translate(${move.dx}px, ${move.dy}px)`;
  }
  void svg.getBoundingClientRect();
  requestAnimationFrame(() => {
    for (const move of moves) {
      move.el.style.transition = 'transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)';
      move.el.style.transform = '';
    }
  });
}

type JoinPick = { kind: 'event' | 'station' | 'line'; id: string };

function clientToMap(svg: SVGSVGElement, event: PointerEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

function hitMap(
  layout: MapCanvasLayout,
  x: number,
  y: number,
  showPorts: boolean,
  editMode: boolean
): MapHit {
  if (showPorts) {
    const port = layout.ports.find((item) => Math.hypot(x - item.x, y - item.y) < 12);
    if (port) {
      if (port.owner === 'event') return { kind: 'event', id: port.ownerId };
      if (port.owner === 'station') return { kind: 'station', id: port.ownerId };
      return { kind: 'line', id: port.ownerId };
    }
  }
  if (editMode && x < 150 && layout.terms.some((term) => y >= term.y && y <= term.y + 58)) {
    return { kind: 'terms', id: TERMS_SELECTION };
  }
  for (const tick of layout.ticks) {
    if (Math.hypot(x - tick.cx, y - tick.cy) <= 20) return { kind: 'event', id: tick.id };
    const box = tick.labelBox;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      return { kind: 'event', id: tick.id };
    }
  }
  for (const station of layout.stations) {
    for (const body of station.bodies) {
      const left = body.x - body.w / 2 - 6;
      const right = body.x + body.w / 2 + 6;
      const top = body.y;
      const bottom = body.y + body.h;
      if (x < left || x > right || y < top || y > bottom) continue;
      if (editMode) {
        if (y <= top + 10) return { kind: 'station-resize', id: station.id, edge: 'top' };
        if (y >= bottom - 10) return { kind: 'station-resize', id: station.id, edge: 'bottom' };
      }
      return { kind: 'station', id: station.id };
    }
  }
  for (const line of layout.lines) {
    if (Math.abs(y - line.disc.cy) <= 26 && Math.abs(x - line.disc.cx) <= 110) {
      return { kind: 'line', id: line.id };
    }
    if (
      line.tracks.some(
        (track) =>
          Math.hypot(x - track.disc.cx, y - track.disc.cy) <= track.disc.r + 6 ||
          Math.hypot(x - track.end.cx, y - track.end.cy) <= track.end.r + 6
      )
    ) {
      return { kind: 'line', id: line.id };
    }
    if (
      showPorts &&
      line.tracks.some((track) => Math.abs(x - track.x) <= 12 && y >= line.y0 - 8 && y <= line.y1 + 8)
    ) {
      return { kind: 'line', id: line.id };
    }
  }
  return null;
}

function applyJoin(map: TransitMap, from: JoinPick, to: JoinPick, y: number, year: number): boolean {
  if (from.kind === to.kind && from.id === to.id) return false;
  const eventFrom = from.kind === 'event' ? map.ticks.find((tick) => tick.id === from.id) : undefined;
  const eventTo = to.kind === 'event' ? map.ticks.find((tick) => tick.id === to.id) : undefined;
  if (eventFrom && eventTo) {
    eventFrom.connects_to = eventTo.label;
    return true;
  }
  if (eventFrom && to.kind === 'station') {
    const tracks = attachTracksOf(eventFrom.attach);
    eventFrom.attach = {
      kind: 'station',
      station_id: to.id,
      side: 'right',
      offset: 0.5,
      ...(tracks.length ? { tracks } : {})
    };
    return true;
  }
  if (eventFrom && to.kind === 'line') {
    const tracks = attachTracksOf(eventFrom.attach);
    eventFrom.attach = { kind: 'line', line_id: to.id, y, ...(tracks.length ? { tracks } : {}) };
    eventFrom.starts_on = yToDate(y, year);
    return true;
  }
  if (eventTo && from.kind === 'station') {
    const tracks = attachTracksOf(eventTo.attach);
    eventTo.attach = {
      kind: 'station',
      station_id: from.id,
      side: 'right',
      offset: 0.5,
      ...(tracks.length ? { tracks } : {})
    };
    return true;
  }
  if (eventTo && from.kind === 'line') {
    const tracks = attachTracksOf(eventTo.attach);
    eventTo.attach = { kind: 'line', line_id: from.id, y, ...(tracks.length ? { tracks } : {}) };
    eventTo.starts_on = yToDate(y, year);
    return true;
  }
  return false;
}

function shiftStationDates(station: MapStation, dy: number, year: number): void {
  const startY = station.starts_on ? dateToY(station.starts_on, year) : station.y;
  const endY = station.ends_on ? dateToY(station.ends_on, year) : startY + station.height;
  station.starts_on = yToDate(startY + dy, year);
  station.ends_on = yToDate(endY + dy, year);
  const next = applyDateSpanToStation(station, year);
  station.y = next.y;
  station.height = next.height;
}

function resizeStationDates(
  station: MapStation,
  dy: number,
  edge: 'top' | 'bottom',
  year: number
): void {
  const startY = station.starts_on ? dateToY(station.starts_on, year) : station.y;
  const endY = station.ends_on ? dateToY(station.ends_on, year) : startY + station.height;
  const minSpan = 14;
  if (edge === 'top') {
    station.starts_on = yToDate(Math.min(startY + dy, endY - minSpan), year);
  } else {
    station.ends_on = yToDate(Math.max(endY + dy, startY + minSpan), year);
  }
  const next = applyDateSpanToStation(station, year);
  station.y = next.y;
  station.height = next.height;
  station.starts_on = next.starts_on;
  station.ends_on = next.ends_on;
}

function joinPick(hit: MapHit): JoinPick | null {
  if (!hit || hit.kind === 'station-resize' || hit.kind === 'terms') return null;
  return hit;
}

function hitOwnerId(hit: MapHit): string | null {
  if (!hit) return null;
  return hit.id;
}

function downloadHtml(map: TransitMap, years: readonly SchoolYearTerms[] | null): void {
  const blob = new Blob([exportMapHtml(map, years)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.title.replace(/\s+/g, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function dateInput(value: string, aria: string): { el: HTMLLabelElement; input: HTMLInputElement } {
  return createHubField({ type: 'date', ariaLabel: aria, value });
}

function trackPicker(selected: string[], available: TrackDef[]): { root: HTMLElement; value: () => string[] } {
  const root = el('div', 'map-tracks');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Year lines');
  const boxes = available.map((track) => {
    const label = el('label', 'map-tracks__item');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = track.id;
    box.checked = selected.includes(track.id);
    label.append(box, document.createTextNode(track.label));
    root.append(label);
    return box;
  });
  return {
    root,
    value: () => {
      const picked = boxes.filter((box) => box.checked).map((box) => box.value);
      return picked.length ? picked : [available[0]?.id ?? 'junior'];
    }
  };
}

export async function renderMapsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading maps…', '.map-body');
  const [listed, projects, prefs] = await Promise.all([
    tasksApi.listMaps().catch(() => [] as TransitMap[]),
    tasksApi.listProjects().catch(() => [] as Project[]),
    tasksApi.getHubPrefs().then(parseHubPrefs).catch(() => null)
  ]);
  const termYears: readonly SchoolYearTerms[] | null = prefs?.school_terms ?? null;
  const maps = mapsOrSeed(listed);
  const yearNow = new Date().getFullYear();
  let current = pickCurrentYearMap(maps, yearNow) ?? maps[0]!;
  for (const map of maps) {
    const raw = listed.find((item) => item.id === map.id);
    if (!raw || !lineColorsNeedWriteback(raw, map)) continue;
    void tasksApi
      .updateMap(map.id, { title: map.title, year: map.year, lines: map.lines, stations: map.stations, ticks: map.ticks })
      .then((saved) => {
        const idx = maps.findIndex((item) => item.id === saved.id);
        if (idx >= 0) maps[idx] = saved;
        if (current.id === saved.id) current = saved;
      })
      .catch(() => {
        /* keep the corrected colours on screen even if Blobs write fails */
      });
  }
  let mode: Mode = 'view';
  let fullscreen = false;
  let selectedId: string | null = null;
  let zoom = 1;
  let camX = 0;
  let camY = 0;
  let joining = false;
  let toast = '';
  let indexQuery = '';
  let indexOpen = false;
  /** Map id whose starting zoom has been set; a new map gets a fresh readable zoom. */
  let zoomReadyFor: string | null = null;
  /** Stage px per map unit at zoom 1 on the last paint. */
  let lastFit = 0;
  /** Last painted layout, so an edit can slide strands and items to their new places. */
  let previousLayout: { mapId: string; layout: TransitLayout } | null = null;
  /** Last selected id after paint — used to skip auto-scroll on save remounts. */
  let lastSelectedId: string | null = null;

  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  function touchDistance(): number {
    const pts = [...activeTouches.values()];
    return pts.length < 2 ? 0 : Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  }

  const applyCamera = (svg: SVGSVGElement, layout: MapCanvasLayout) => {
    const vw = layout.width / zoom;
    const vh = layout.height / zoom;
    const shown = visibleUnits(svg, layout, zoom);
    camX = Math.min(Math.max(0, layout.width - shown.w), Math.max(0, camX));
    camY = Math.min(Math.max(0, layout.height - shown.h), Math.max(0, camY));
    svg.setAttribute('viewBox', `${camX} ${camY} ${vw} ${vh}`);
  };

  const applyFullscreen = (on: boolean) => {
    fullscreen = on;
    setMapFullscreenChrome(on);
  };

  const leaveFullscreen = () => {
    if (!fullscreen) return;
    applyFullscreen(false);
    paint();
  };

  const onFullscreenKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !fullscreen) return;
    event.preventDefault();
    leaveFullscreen();
  };

  const onFullscreenHash = () => {
    if (location.hash.startsWith('#/maps')) return;
    applyFullscreen(false);
    window.removeEventListener('keydown', onFullscreenKey);
    window.removeEventListener('hashchange', onFullscreenHash);
  };

  window.addEventListener('keydown', onFullscreenKey);
  window.addEventListener('hashchange', onFullscreenHash);
  setMapFullscreenChrome(false);

  const paint = () => {
    canvas.classList.toggle('map-page', true);
    canvas.classList.toggle('map-page--fullscreen', fullscreen);
    setMapFullscreenChrome(fullscreen);
    const year = current.year ?? yearNow;
    const terms = mapTerms(current, termYears);
    const layout = layoutMap(current, termYears);
    // Remount wipes scroll hosts; keep the page (and side panels) where they were.
    const scrollHost = canvas.closest('.hub-canvas');
    const saved = {
      canvasTop: canvas.scrollTop,
      hostTop: scrollHost instanceof HTMLElement ? scrollHost.scrollTop : 0,
      windowX: window.scrollX,
      windowY: window.scrollY,
      indexTop: canvas.querySelector<HTMLElement>('.map-index__list')?.scrollTop ?? 0,
      inspectorTop: canvas.querySelector<HTMLElement>('.map-inspector')?.scrollTop ?? 0
    };
    const selectionChanged = selectedId !== lastSelectedId;
    canvas.replaceChildren();
    const toolbar = createMapToolbar({
      maps,
      currentId: current.id,
      mode,
      fullscreen,
      joining,
      handlers: {
        onSelectMap: (value) => {
          const next = maps.find((m) => m.id === value);
          if (next) {
            current = next;
            selectedId = null;
            paint();
          }
        },
        onMode: (next) => {
          mode = next;
          if (next === 'view') joining = false;
          if (next === 'view' && selectedId && current.lines.some((line) => line.id === selectedId)) selectedId = null;
          toast = '';
          paint();
        },
        onRenameMap: (title) => {
          current.title = title;
          paint();
          void persist();
        },
        onExport: () => downloadHtml(current, termYears),
        onNewMap: () => {
          void tasksApi.createMap({ title: 'Untitled map', year }).then((created) => {
            maps.push(created);
            current = created;
            mode = 'edit';
            paint();
          });
        },
        onFullscreen: () => {
          applyFullscreen(!fullscreen);
          paint();
        },
        onAddLine: () => addLineNow(),
        onAddProgram: () => addStationNow(),
        onAddCompetition: () => addEventNow(),
        onEditTerms: () => {
          selectedId = selectedId === TERMS_SELECTION ? null : TERMS_SELECTION;
          paint();
        },
        onJoin: () => {
          joining = !joining;
          toast = joining ? 'Drag from one item to another to join them. Ports show only in this mode.' : '';
          paint();
        }
      }
    });
    canvas.append(toolbar);

    const body = el('div', 'map-body');
    const stage = el('div', `map-stage${joining ? ' is-joining' : ''}${mode === 'edit' ? ' is-edit' : ''}`);
    const svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      preserveAspectRatio: 'xMinYMin slice',
      'aria-label': `${current.title} · ${year} calendar year`
    });
    renderMapSvg(svg, layout, selectedId, joining, mode === 'edit');
    if (previousLayout?.mapId === current.id) slideFromPrevious(svg, previousLayout.layout, layout);
    previousLayout = { mapId: current.id, layout };
    applyCamera(svg, layout);

    const zoomBar = el('div', 'map-zoom');
    zoomBar.setAttribute('role', 'group');
    zoomBar.setAttribute('aria-label', 'Zoom');
    const out = el('button', 'hub-icon-btn', '−');
    const reset = el('button', 'btn btn--ghost', 'Reset');
    const inn = el('button', 'hub-icon-btn', '+');
    out.type = 'button';
    reset.type = 'button';
    inn.type = 'button';
    out.setAttribute('aria-label', 'Zoom out');
    inn.setAttribute('aria-label', 'Zoom in');
    const setZoomAt = (next: number, anchor?: { x: number; y: number }) => {
      const old = zoom;
      const nextZoom = Math.min(MAP_MAX_ZOOM, Math.max(0.5, next));
      if (nextZoom === old) return;
      const vw0 = layout.width / old;
      const vh0 = layout.height / old;
      const focus = anchor ?? { x: camX + vw0 / 2, y: camY + vh0 / 2 };
      const fx = (focus.x - camX) / vw0;
      const fy = (focus.y - camY) / vh0;
      zoom = nextZoom;
      const vw1 = layout.width / zoom;
      const vh1 = layout.height / zoom;
      camX = focus.x - fx * vw1;
      camY = focus.y - fy * vh1;
      applyCamera(svg, layout);
    };
    out.addEventListener('click', () => setZoomAt(zoom - 0.15));
    inn.addEventListener('click', () => setZoomAt(zoom + 0.15));
    reset.title = 'Back to the readable starting view';
    reset.addEventListener('click', () => {
      startView();
      applyCamera(svg, layout);
    });
    zoomBar.append(out, reset, inn);

    // Strand roundels: jump the view to a strand (on a phone only one strand fits at a time).
    const strands = layout.draw.strands;
    const strandBar = el('div', 'map-strands');
    strandBar.setAttribute('role', 'group');
    strandBar.setAttribute('aria-label', 'Go to strand');
    for (const strand of strands) {
      const line = findLine(current, strand.lineId);
      if (!line) continue;
      const tone = swatch(line.color);
      const chip = el('button', 'map-strands__chip', line.letter);
      chip.type = 'button';
      chip.title = line.name;
      chip.setAttribute('aria-label', `Go to ${line.name}`);
      chip.style.setProperty('--strand-disc', tone.disc);
      chip.style.setProperty('--strand-letter', tone.letter);
      chip.addEventListener('click', () => {
        camX = strandCamX(svg, layout, zoom, strand);
        applyCamera(svg, layout);
      });
      strandBar.append(chip);
    }
    if (strands.length > 1) zoomBar.prepend(strandBar);
    toolbar.insertBefore(zoomBar, toolbar.querySelector('.map-editbar'));

    /**
     * Desktop opens readable from the left. A phone opens on the whole first strand, at one
     * zoom that fits the widest strand, so text stays the same size as the chips move between them.
     */
    function startView(): void {
      camX = 0;
      camY = 0;
      zoom = readableZoom(svg, layout);
      const first = strands[0];
      if (!first || !isPhoneStage(svg)) return;
      const fits = strands.map((strand) => strandZoom(svg, layout, strand)).filter((value): value is number => value !== null);
      if (fits.length) zoom = Math.min(...fits);
      camX = strandCamX(svg, layout, zoom, first);
    }
    stage.append(svg);

    const indexItems = buildMapIndexItems(current, layout);
    const cardModels = buildCardModels(current, projects);
    const index = mountMapCardIndex(
      cardModels,
      selectedId,
      (model) => ({
        onOpenPage: () => {
          location.hash = mapItemPageHash(current.id, model.kind, model.id);
        },
        onDelete: () => void deleteItemNow(model.id),
        onTogglePlanning: () => void togglePlanningNow(model.id),
        onExpand: () => {
          selectedId = model.id;
          const jump = indexItems.find((item) => item.id === model.id);
          if (jump) camY = focusCameraOnY(layout, jump.y, zoom);
          paint();
        },
        onCollapse: () => {
          if (selectedId === model.id) selectedId = null;
        }
      }),
      () => null,
      {
        query: indexQuery,
        open: indexOpen,
        onQuery: (value) => {
          indexQuery = value;
        },
        onOpen: (open) => {
          indexOpen = open;
        }
      }
    );
    stage.append(index);
    body.append(stage);
    const inspector = buildInspector(year, terms);
    if (inspector) body.append(inspector);
    body.classList.toggle('has-inspector', Boolean(inspector));

    svg.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const anchor = clientToMap(svg, event as unknown as PointerEvent);
        if (event.ctrlKey) setZoomAt(zoom * (1 - event.deltaY * 0.01), anchor);
        else setZoomAt(zoom + (event.deltaY > 0 ? -0.08 : 0.08), anchor);
      },
      { passive: false }
    );

    svg.style.touchAction = 'none';

    function touchMidpointMap(): { x: number; y: number } {
      const pts = [...activeTouches.values()];
      return clientToMap(svg, {
        clientX: (pts[0]!.x + pts[1]!.x) / 2,
        clientY: (pts[0]!.y + pts[1]!.y) / 2
      } as PointerEvent);
    }

    function startConnectorDrag(originPick: JoinPick, originPort: { x: number; y: number }): void {
      const preview = svgEl('path', {
        d: orthogonalPath(originPort, originPort),
        class: 'map-connector-preview',
        fill: 'none',
        stroke: 'var(--ink)',
        'stroke-width': '2',
        'stroke-dasharray': '4 4'
      });
      svg.querySelector('.map-root')?.append(preview);
      let snapTarget: JoinPick | null = null;
      let lastPoint = originPort;

      const onMove = (move: PointerEvent) => {
        const point = clientToMap(svg, move);
        lastPoint = point;
        preview.setAttribute('d', orthogonalPath(originPort, point));
        const candidate = joinPick(hitMap(layout, point.x, point.y, true, mode === 'edit'));
        const valid = candidate && !(candidate.kind === originPick.kind && candidate.id === originPick.id);
        snapTarget = valid ? candidate : null;
        svg.querySelectorAll('.is-snap-target').forEach((n) => n.classList.remove('is-snap-target'));
        if (snapTarget) svg.querySelector(`[data-id="${snapTarget.id}"]`)?.classList.add('is-snap-target');
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        preview.remove();
        svg.querySelectorAll('.is-snap-target').forEach((n) => n.classList.remove('is-snap-target'));
        if (snapTarget && applyJoin(current, originPick, snapTarget, lastPoint.y, year)) {
          toast = 'Joined.';
          void persist();
        }
        paint();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }

    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.pointerType === 'touch' && activeTouches.size >= 1) return;
      event.preventDefault();
      const start = clientToMap(svg, event);
      const hit = hitMap(layout, start.x, start.y, joining, mode === 'edit' && !joining);
      if (joining) {
        const joinHit = joinPick(hit);
        if (!joinHit) return;
        selectedId = joinHit.kind === 'line' ? null : joinHit.id;
        startConnectorDrag(joinHit, start);
        return;
      }

      const dragKind =
        mode === 'edit' && hit
          ? hit.kind === 'station-resize'
            ? 'resize-station'
            : hit.kind === 'event' || hit.kind === 'station' || hit.kind === 'line'
              ? `move-${hit.kind}`
              : null
          : null;
      let moved = false;
      let lastX = event.clientX;
      let lastY = event.clientY;
      const originX = event.clientX;
      const originY = event.clientY;
      const startCamX = camX;
      const startCamY = camY;
      const rect = svg.getBoundingClientRect();
      const ctm = svg.getScreenCTM();
      const unitX = ctm ? 1 / ctm.a : layout.width / zoom / Math.max(1, rect.width);
      const unitY = ctm ? 1 / ctm.d : layout.height / zoom / Math.max(1, rect.height);
      const ownerId = hitOwnerId(hit);
      const dragged =
        ownerId && dragKind?.startsWith('move-') && hit?.kind !== 'line'
          ? svg.querySelector(`[data-id="${ownerId}"]`)
          : null;
      const lineGroups =
        hit?.kind === 'line' ? [...svg.querySelectorAll(`[data-line="${hit.id}"]`)] : [];
      const connectorLinks =
        ownerId && dragKind && dragKind !== 'move-line' ? connectorRefs(svg, layout, ownerId) : [];
      const resizeEdge = hit?.kind === 'station-resize' ? hit.edge : null;
      const resizeStation =
        resizeEdge && ownerId ? (svg.querySelector(`[data-id="${ownerId}"]`) as SVGGElement | null) : null;
      const resizeBodies = resizeStation ? [...resizeStation.querySelectorAll('.map-station__body')] : [];
      const resizeBase = resizeBodies.map((body) => ({
        y: Number(body.getAttribute('y') ?? 0),
        h: Number(body.getAttribute('height') ?? 0)
      }));

      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (move: PointerEvent) => {
        move.preventDefault();
        lastX = move.clientX;
        lastY = move.clientY;
        const dx = lastX - originX;
        const dy = lastY - originY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          stage.classList.add('is-dragging');
          if (dragKind === 'move-line') {
            for (const node of lineGroups) node.classList.add('is-live-drag');
          }
          dragged?.classList.add('is-live-drag');
        }
        const mapDy = dy * unitY;
        const mapDx = dx * unitX;
        if (dragKind === 'move-line') {
          for (const node of lineGroups) node.setAttribute('transform', `translate(${mapDx} 0)`);
          return;
        }
        if (dragKind === 'resize-station' && resizeStation && resizeEdge) {
          for (const [index, body] of resizeBodies.entries()) {
            const base = resizeBase[index];
            if (!base) continue;
            if (resizeEdge === 'top') {
              body.setAttribute('y', String(base.y + mapDy));
              body.setAttribute('height', String(Math.max(14, base.h - mapDy)));
            } else {
              body.setAttribute('height', String(Math.max(14, base.h + mapDy)));
            }
          }
          liveShiftConnectors(connectorLinks, 0, mapDy);
          return;
        }
        if (dragged) {
          dragged.setAttribute('transform', `translate(0 ${mapDy})`);
          liveShiftConnectors(connectorLinks, 0, mapDy);
          return;
        }
        stage.classList.add('is-panning');
        camX = startCamX - mapDx;
        camY = startCamY - mapDy;
        applyCamera(svg, layout);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        stage.classList.remove('is-panning', 'is-dragging');
        for (const node of lineGroups) node.classList.remove('is-live-drag');
        dragged?.classList.remove('is-live-drag');
        try {
          stage.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        const dx = (lastX - originX) * unitX;
        const dy = (lastY - originY) * unitY;
        if (!moved) {
          selectedId = hit && (hit.kind !== 'line' || mode === 'edit') ? hit.id : null;
          paint();
          return;
        }
        if (!dragKind || !hit) return;
        if (hit.kind === 'line') {
          const lane = layout.lines.length > 1 ? Math.abs(layout.lines[1]!.x - layout.lines[0]!.x) : 280;
          if (Math.abs(dx) >= lane / 2) {
            current.lines = moveLine(current.lines, hit.id, dx > 0 ? 1 : -1);
            void persist();
          }
          paint();
          return;
        }
        if (hit.kind === 'station-resize') {
          const station = current.stations.find((item) => item.id === hit.id);
          if (station) resizeStationDates(station, dy, hit.edge, year);
          selectedId = hit.id;
          void persist();
          paint();
          return;
        }
        if (hit.kind === 'station') {
          const station = current.stations.find((item) => item.id === hit.id);
          if (station) shiftStationDates(station, dy, year);
          selectedId = hit.id;
          void persist();
          paint();
          return;
        }
        const tick = current.ticks.find((item) => item.id === hit.id);
        if (tick) {
          const laid = layout.ticks.find((item) => item.id === tick.id);
          const nextY = (laid?.cy ?? start.y) + dy;
          tick.starts_on = yToDate(nextY, year);
          if (tick.attach.kind === 'line') {
            const nearest = nearestLaidTrack(layout.lines, start.x + dx);
            const lineId = nearest?.lineId ?? tick.attach.line_id;
            // Drag picks the nearest year line; multi-select stays in the inspector.
            tick.attach = {
              kind: 'line',
              line_id: lineId,
              y: nextY,
              tracks: nearest?.trackId ? [nearest.trackId] : attachTracksOf(tick.attach)
            };
          }
          const next = applyDateToTickAttach(tick, year);
          tick.attach = next.attach;
          selectedId = hit.id;
          void persist();
        }
        paint();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    });

    svg.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size === 2) {
        pinchStartDist = touchDistance();
        pinchStartZoom = zoom;
      }
    });
    svg.addEventListener('pointermove', (event) => {
      if (!activeTouches.has(event.pointerId)) return;
      activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouches.size === 2 && pinchStartDist > 0) {
        event.preventDefault();
        setZoomAt(pinchStartZoom * (touchDistance() / pinchStartDist), touchMidpointMap());
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      svg.addEventListener(type, (event) => {
        activeTouches.delete(event.pointerId);
        if (activeTouches.size < 2) pinchStartDist = 0;
      });
    }

    canvas.append(body);
    const fit = stageFit(svg, layout);
    if (zoomReadyFor !== current.id) {
      zoomReadyFor = current.id;
      startView();
    } else if (fit && lastFit && fit !== lastFit) {
      // The stage changed width (side panel opened or closed): keep text the same size on screen.
      zoom = Math.min(MAP_MAX_ZOOM, Math.max(0.5, (zoom * lastFit) / fit));
    }
    if (fit) lastFit = fit;
    applyCamera(svg, layout);
    canvas.scrollTop = saved.canvasTop;
    if (scrollHost instanceof HTMLElement) scrollHost.scrollTop = saved.hostTop;
    window.scrollTo(saved.windowX, saved.windowY);
    const nextIndex = index.querySelector<HTMLElement>('.map-index__list');
    if (nextIndex) nextIndex.scrollTop = saved.indexTop;
    if (inspector && !selectionChanged) inspector.scrollTop = saved.inspectorTop;
    // Only auto-scroll when the selection itself changed — not on every save remount.
    if (selectionChanged && selectedId) {
      index
        .querySelector<HTMLElement>(`.map-card-slot[data-map-item-id="${selectedId}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
    if (inspector && selectionChanged && window.matchMedia?.('(max-width: 720px)').matches) {
      inspector.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    lastSelectedId = selectedId;
    const hint =
      toast ||
      (mode === 'edit' && !selectedId
        ? 'Click a line, program or competition to edit it. Drag to move; drag a program’s top or bottom edge to change its dates.'
        : '');
    if (hint) canvas.insertBefore(el('p', 'canvas-status map-hint', hint), body);
  };

  function buildCardModels(map: TransitMap, projectList: Project[]): MapCardModel[] {
    const models: MapCardModel[] = [];
    for (const station of map.stations) {
      const line = findLine(map, station.line_id) ?? null;
      const linked = station.link ? projectList.find((project) => project.id === station.link!.id) : null;
      models.push({
        id: station.id,
        kind: 'station',
        label: station.label,
        planning: planningOf(station),
        starts_on: station.starts_on,
        ends_on: station.ends_on,
        tracks: station.tracks,
        updated_at: map.updated_at,
        line,
        lines: map.lines,
        linkedTitle: linked?.title ?? null
      });
    }
    for (const tick of map.ticks) {
      const line = lineForTick(map, tick) ?? null;
      const linked = tick.link ? projectList.find((project) => project.id === tick.link!.id) : null;
      models.push({
        id: tick.id,
        kind: 'event',
        label: tick.label,
        planning: planningOf(tick),
        starts_on: tick.starts_on,
        ends_on: tick.ends_on,
        tracks: [],
        updated_at: map.updated_at,
        line,
        lines: map.lines,
        linkedTitle: linked?.title ?? null
      });
    }
    return models;
  }

  function liveItem(id: string): { station: MapStation | null; tick: MapTick | null } {
    return {
      station: current.stations.find((item) => item.id === id) ?? null,
      tick: current.ticks.find((item) => item.id === id) ?? null
    };
  }

  function closeInspector(): void {
    selectedId = null;
    paint();
  }

  function buildInspector(year: number, terms: TermMarks): HTMLElement | null {
    if (!selectedId) return null;
    if (selectedId === TERMS_SELECTION) return mode === 'edit' ? buildTermsInspector(year, terms) : null;
    const line = current.lines.find((item) => item.id === selectedId);
    if (line) return mode === 'edit' ? buildLineInspector(line) : null;
    const { station, tick } = liveItem(selectedId);
    if (!station && !tick) return null;
    return mode === 'edit' ? buildItemInspector(selectedId, year, terms) : buildItemSummary(selectedId);
  }

  function buildLineInspector(line: MapLine): HTMLElement {
    const id = line.id;
    const index = current.lines.findIndex((item) => item.id === id);
    const itemCount =
      current.stations.filter((item) => item.line_id === id).length +
      current.ticks.filter((tick) => lineForTick(current, tick)?.id === id).length;
    return createMapInspector({
      eyebrow: 'Line',
      title: `${line.letter} · ${line.name}`,
      onClose: closeInspector,
      body: buildLineEditor(
        line,
        { index, count: current.lines.length, itemCount },
        {
          onChange: (next, settled) => {
            current.lines = current.lines.map((item) => (item.id === id ? { ...item, ...next, id } : item));
            if (settled) {
              paint();
              void persist();
            } else schedulePersist();
          },
          onMove: (delta) => {
            current.lines = moveLine(current.lines, id, delta);
            paint();
            void persist();
          },
          onDelete: () => {
            current.lines = current.lines.filter((item) => item.id !== id);
            selectedId = null;
            paint();
            void persist();
          }
        }
      )
    });
  }

  function buildItemSummary(id: string): HTMLElement | null {
    const { station, tick } = liveItem(id);
    const item = station ?? tick;
    if (!item) return null;
    const kind = station ? 'station' : 'event';
    const line = station ? findLine(current, station.line_id) : lineForTick(current, tick ?? undefined);
    const facts = el('dl', 'map-inspector__facts');
    const fact = (label: string, value: string | null | undefined) => {
      if (!value) return;
      facts.append(el('dt', '', label), el('dd', '', value));
    };
    fact('Line', line ? `${line.letter} · ${line.name}` : null);
    fact(station ? 'Starts' : 'Date', item.starts_on ? formatDisplayDate(item.starts_on) : null);
    if (station) fact('Ends', item.ends_on ? formatDisplayDate(item.ends_on) : null);
    fact('Status', planningOf(item) === 'active' ? 'Active' : 'Planned');
    const actions = el('div', 'map-inspector__actions');
    actions.append(
      inspectorButton('Edit', 'btn--primary', () => {
        mode = 'edit';
        paint();
      }),
      inspectorButton('Full page', 'btn--ghost', () => {
        location.hash = mapItemPageHash(current.id, kind, id);
      })
    );
    return createMapInspector({
      eyebrow: mapItemKindLabel(kind),
      title: item.label,
      onClose: closeInspector,
      body: [facts, actions]
    });
  }

  /** Per-map term dates: the shaded term bands follow these, not the Settings defaults. */
  function buildTermsInspector(year: number, terms: TermMarks): HTMLElement {
    const fields: Array<{ key: keyof TermMarks; label: string; optional?: boolean }> = [
      { key: 't1', label: 'Term 1 starts' },
      { key: 't1_end', label: 'Term 1 ends', optional: true },
      { key: 't2', label: 'Term 2 starts' },
      { key: 't2_end', label: 'Term 2 ends', optional: true },
      { key: 't3', label: 'Term 3 starts' },
      { key: 't3_end', label: 'Term 3 ends', optional: true },
      { key: 't4', label: 'Term 4 starts' },
      { key: 't4_end', label: 'Term 4 ends', optional: true },
      { key: 'e', label: 'Year ends' }
    ];
    const error = el('p', 'map-inspector__hint map-inspector__error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    const inputs = fields.map((field) => ({ ...field, control: dateInput(terms[field.key] ?? '', field.label) }));
    const apply = () => {
      const next = Object.fromEntries(
        inputs.filter((item) => item.control.input.value).map((item) => [item.key, item.control.input.value])
      ) as TermMarks;
      if (inputs.some((item) => !item.optional && !item.control.input.value) || !termMarksInOrder(next)) {
        error.textContent = 'Each date must be after the one above it. Term ends can be left blank.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      current.terms = next;
      paint();
      void persist();
    };
    const body: HTMLElement[] = [];
    for (const item of inputs) item.control.input.addEventListener('change', apply);
    // Each term's start and end share a row; the year end sits on its own.
    for (let i = 0; i < inputs.length; i += 1) {
      const item = inputs[i]!;
      const pair = inputs[i + 1];
      if (pair?.optional) {
        const row = el('div', 'map-inspector__row');
        row.append(inspectorField(item.label, item.control.el), inspectorField(pair.label, pair.control.el));
        body.push(row);
        i += 1;
      } else {
        body.push(inspectorField(item.label, item.control.el));
      }
    }
    body.push(error);
    const note = current.terms
      ? `These dates are saved on this map only.`
      : `Showing the ${year} dates from Settings. Change any date to save them on this map.`;
    body.push(el('p', 'map-inspector__hint', 'With term ends filled in, the holidays show as gaps between the bands.'));
    body.push(el('p', 'map-inspector__hint', note));
    if (current.terms) {
      const actions = el('div', 'map-inspector__actions');
      actions.append(
        inspectorButton('Use Settings dates', 'btn--ghost', () => {
          current.terms = null;
          paint();
          void persist();
        })
      );
      body.push(actions);
    }
    return createMapInspector({
      eyebrow: 'Terms',
      title: `Term dates ${year}`,
      onClose: closeInspector,
      body
    });
  }

  function buildItemInspector(id: string, year: number, terms: TermMarks): HTMLElement | null {
    const initial = liveItem(id);
    const initialItem = initial.station ?? initial.tick;
    if (!initialItem) return null;
    const isStation = Boolean(initial.station);
    const kind = isStation ? 'station' : 'event';
    const body: HTMLElement[] = [];

    const name = inspectorText({
      value: initialItem.label,
      ariaLabel: 'Name',
      onDraft: (value) => {
        const { station, tick } = liveItem(id);
        const item = station ?? tick;
        if (!item) return;
        item.label = value;
        svgLabelFor(id, value);
        schedulePersist();
      },
      onCommit: (value) => {
        const { station, tick } = liveItem(id);
        const item = station ?? tick;
        if (!item) return;
        item.label = value;
        paint();
        void persist();
      }
    });
    body.push(inspectorField('Name', name));

    if (initial.station) {
      const lineFilter = createHubFilter({
        key: 'Line',
        label: 'Line',
        defaultValue: initial.station.line_id,
        options: current.lines.map((entry) => ({ value: entry.id, label: `${entry.letter} · ${entry.name}` })),
        value: initial.station.line_id,
        onChange: (value) => {
          const station = liveItem(id).station;
          if (!station || !value) return;
          station.line_id = value;
          const nextLine = findLine(current, value);
          if (nextLine) {
            const allowed = new Set(lineTrackDefs(nextLine).map((track) => track.id));
            const kept = station.tracks.filter((track) => allowed.has(track));
            station.tracks = kept.length ? kept : [lineTrackDefs(nextLine)[0]?.id ?? 'junior'];
          }
          paint();
          void persist();
        }
      });
      body.push(inspectorField('Line', lineFilter.el));
    }

    const start = dateInput(initialItem.starts_on ?? terms.t1, isStation ? 'Starts' : 'Date');
    const end = dateInput(initialItem.ends_on ?? initialItem.starts_on ?? terms.e, 'Ends');
    const applyDates = () => {
      const { station, tick } = liveItem(id);
      const item = station ?? tick;
      if (!item) return;
      item.starts_on = start.input.value || null;
      item.ends_on = station ? end.input.value || null : end.input.value || start.input.value || null;
      if (station) {
        const next = applyDateSpanToStation(station, year);
        station.starts_on = next.starts_on;
        station.ends_on = next.ends_on;
        station.y = next.y;
        station.height = next.height;
      } else if (tick) {
        tick.attach = applyDateToTickAttach(tick, year).attach;
      }
      paint();
      void persist();
    };
    start.input.addEventListener('change', applyDates);
    end.input.addEventListener('change', applyDates);
    const dates = el('div', 'map-inspector__row');
    dates.append(inspectorField(isStation ? 'Starts' : 'Date', start.el));
    if (isStation) dates.append(inspectorField('Ends', end.el));
    body.push(dates);

    if (initial.station) {
      const stationLine = findLine(current, initial.station.line_id) ?? current.lines[0];
      if (stationLine) {
        const tracks = trackPicker(initial.station.tracks, lineTrackDefs(stationLine));
        tracks.root.addEventListener('change', () => {
          const station = liveItem(id).station;
          if (!station) return;
          station.tracks = tracks.value();
          paint();
          void persist();
        });
        body.push(inspectorField('Year lines', tracks.root, 'Which year lines this program runs on.'));
      }
    }

    if (initial.tick) {
      const attachPicker = createFilteredPicker(
        targetPickerGroups(current, id),
        attachSelectValue(initial.tick),
        { ariaLabel: 'Attach to', placeholder: 'Search lines, programs…' }
      );
      const alsoPicker = createFilteredPicker(
        targetPickerGroups(current, id),
        connectSelectValue(current, initial.tick.connects_to),
        { ariaLabel: 'Also connect to', blankLabel: 'No extra connection', placeholder: 'Search connections…' }
      );
      let lastAttach = attachPicker.getValue();
      let lastAlso = alsoPicker.getValue();
      const applyAttach = () => {
        const tick = liveItem(id).tick;
        if (!tick) return;
        const attachValue = attachPicker.getValue();
        const alsoValue = alsoPicker.getValue();
        if (attachValue === lastAttach && alsoValue === lastAlso) return;
        lastAttach = attachValue;
        lastAlso = alsoValue;
        tick.attach = parseAttachValue(
          attachValue,
          current.lines[0]?.id ?? '',
          tick.attach.kind === 'line' ? tick.attach.y : 200,
          tick.attach
        );
        // Keep year lines the new host still offers; otherwise fall back.
        const next = tick.attach;
        if (next.kind === 'line' || next.kind === 'station') {
          let allowed: readonly string[] = [];
          if (next.kind === 'line') {
            const host = findLine(current, next.line_id);
            allowed = host ? lineTrackDefs(host).map((track) => track.id) : [];
          } else {
            allowed = current.stations.find((item) => item.id === next.station_id)?.tracks ?? [];
          }
          const tracks = resolveLineAttachTracks(attachTracksOf(next), allowed);
          if (tracks.length) {
            const { track: _legacy, ...rest } = next;
            tick.attach = { ...rest, tracks };
          }
        }
        tick.connects_to = parseConnectValue(alsoValue, current);
        tick.attach = applyDateToTickAttach(tick, year).attach;
        paint();
        void persist();
      };
      attachPicker.root.addEventListener('click', applyAttach);
      alsoPicker.root.addEventListener('click', applyAttach);
      // Attach → year line → also-connect: year lines sit next to the host, not under the fold.
      body.push(inspectorField('Attach to', attachPicker.root));

      const attach = initial.tick.attach;
      let yearDefs: TrackDef[] | null = null;
      let yearHint = '';
      if (attach.kind === 'line') {
        const host = findLine(current, attach.line_id) ?? current.lines[0];
        if (host) {
          yearDefs = lineTrackDefs(host);
          yearHint = 'Which year lines on this strand the competition sits on.';
        }
      } else if (attach.kind === 'station') {
        const host = current.stations.find((item) => item.id === attach.station_id);
        const hostLine = host ? findLine(current, host.line_id) : null;
        if (host && hostLine) {
          const filtered = lineTrackDefs(hostLine).filter((track) => host.tracks.includes(track.id));
          yearDefs = filtered.length ? filtered : lineTrackDefs(hostLine);
          yearHint = 'Which year lines on this program the competition sits on.';
        }
      }
      if (yearDefs && (attach.kind === 'line' || attach.kind === 'station')) {
        const tracks = yearTrackPicker(
          resolveLineAttachTracks(
            attachTracksOf(attach),
            yearDefs.map((track) => track.id)
          ),
          yearDefs
        );
        tracks.root.addEventListener('change', () => {
          const tick = liveItem(id).tick;
          if (!tick || (tick.attach.kind !== 'line' && tick.attach.kind !== 'station')) return;
          const { track: _legacy, ...rest } = tick.attach;
          tick.attach = { ...rest, tracks: tracks.value() };
          paint();
          void persist();
        });
        body.push(inspectorField('Year lines', tracks.root, yearHint));
      }

      body.push(inspectorField('Also connect to', alsoPicker.root));

      // Open all year only applies to a competition on a year line (rounds chained to it follow).
      if (attach.kind === 'line') {
        const allYear = el('label', 'map-tracks__item');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = initial.tick.all_year;
        allYear.append(box, document.createTextNode('Open all year'));
        box.addEventListener('change', () => {
          const tick = liveItem(id).tick;
          if (!tick) return;
          tick.all_year = box.checked;
          paint();
          void persist();
        });
        const row = el('div', 'map-tracks');
        row.append(allYear);
        body.push(
          inspectorField('Runs', row, 'Draws this competition and the rounds chained to it on a dotted line beside the year line.')
        );

        // The same competition on other strands' year lines: one interchange, a stop on each strand.
        const hostId = attach.line_id;
        const others = current.lines.filter((line) => line.id !== hostId);
        if (others.length) {
          const strands = el('div', 'map-tracks');
          for (const line of others) {
            const item = el('label', 'map-tracks__item');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.value = line.id;
            check.checked = (initial.tick.also_lines ?? []).includes(line.id);
            item.append(check, document.createTextNode(line.name));
            strands.append(item);
          }
          strands.addEventListener('change', () => {
            const tick = liveItem(id).tick;
            if (!tick) return;
            const picked = [...strands.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value);
            tick.also_lines = picked.length ? picked : undefined;
            paint();
            void persist();
          });
          body.push(
            inspectorField(
              'Also on strands',
              strands,
              'Same year lines and date on these strands too. Drawn as one interchange with a stop on each strand.'
            )
          );
        }
      }
    }

    const actions = el('div', 'map-inspector__actions');
    actions.append(
      inspectorButton(planningOf(initialItem) === 'active' ? 'Make planned' : 'Make active', 'btn--ghost', () => {
        void togglePlanningNow(id);
      }),
      inspectorButton('Full page', 'btn--ghost', () => {
        location.hash = mapItemPageHash(current.id, kind, id);
      })
    );
    if (planningOf(initialItem) === 'active' && initialItem.link) {
      const linked = projects.find((project) => project.id === initialItem.link!.id);
      if (linked) {
        actions.append(
          inspectorButton(`Open ${linked.title}`, 'btn--ghost', () => {
            location.hash = projectPageHash(linked.id);
          })
        );
      }
    }
    body.push(actions);

    const danger = el('div', 'map-inspector__actions map-inspector__actions--end');
    danger.append(
      inspectorButton(`Delete ${mapItemKindLabel(kind).toLowerCase()}`, 'btn--ghost map-inspector__danger', () => {
        void deleteItemNow(id);
      })
    );
    body.push(danger);

    return createMapInspector({
      eyebrow: mapItemKindLabel(kind),
      title: initialItem.label,
      onClose: closeInspector,
      body
    });
  }

  /** Live-update the drawn label while typing so the map follows the name field. */
  function svgLabelFor(id: string, label: string): void {
    const group = canvas.querySelector(`.map-svg [data-id="${CSS.escape(id)}"]`);
    group?.querySelectorAll('.map-station__label').forEach((node) => {
      node.textContent = label;
    });
    const title = canvas.querySelector('.map-inspector__title');
    if (title) title.textContent = label;
  }

  function addLineNow(): void {
    const x = nextLineX(current.lines);
    const letter = nextLineLetter(current.lines);
    current.lines.push({
      id: newId('line'),
      name: `${letter} Line`,
      letter,
      color: LINE_COLORS[current.lines.length % LINE_COLORS.length] ?? 'blue',
      points: yearLinePoints(x),
      extra_tracks: []
    });
    paint();
    void persist();
  }

  function addStationNow(): void {
    const year = current.year ?? yearNow;
    const terms = mapTerms({ year, terms: current.terms }, termYears);
    if (!current.lines.length) {
      toast = 'Add a line first.';
      paint();
      return;
    }
    const draft: MapStation = {
      id: newId('st'),
      line_id: current.lines[0]!.id,
      label: 'New program',
      y: 80,
      height: 110,
      tracks: ['junior'],
      in_stroke: 'solid',
      out_stroke: 'solid',
      starts_on: terms.t1,
      ends_on: terms.e,
      link: null,
      planning: 'planned'
    };
    current.stations.push(applyDateSpanToStation(draft, year));
    selectedId = draft.id;
    mode = 'edit';
    paint();
    void persist();
  }

  function addEventNow(): void {
    const year = current.year ?? yearNow;
    const terms = mapTerms({ year, terms: current.terms }, termYears);
    if (!current.lines.length) {
      toast = 'Add a line first.';
      paint();
      return;
    }
    const firstLine = current.lines[0]!;
    const draft: MapTick = {
      id: newId('tk'),
      label: 'New competition',
      attach: {
        kind: 'line',
        line_id: firstLine.id,
        y: 200,
        tracks: [lineTrackDefs(firstLine)[0]?.id ?? 'junior']
      },
      stroke: 'solid',
      connects_to: null,
      starts_on: terms.t1,
      ends_on: null,
      link: null,
      planning: 'planned',
      all_year: false
    };
    current.ticks.push(applyDateToTickAttach(draft, year));
    selectedId = draft.id;
    mode = 'edit';
    joining = false;
    paint();
    void persist();
  }

  async function deleteItemNow(id: string): Promise<void> {
    const item =
      current.stations.find((entry) => entry.id === id) ?? current.ticks.find((entry) => entry.id === id);
    if (!item) return;
    try {
      await deleteMapItemProject(item, projects);
      current.stations = current.stations.filter((entry) => entry.id !== id);
      current.ticks = current.ticks.filter((entry) => entry.id !== id);
      selectedId = selectedId === id ? null : selectedId;
      await persist();
      paint();
    } catch {
      toast = 'Could not delete that card.';
      paint();
    }
  }

  async function togglePlanningNow(id: string): Promise<void> {
    const station = current.stations.find((entry) => entry.id === id);
    const tick = current.ticks.find((entry) => entry.id === id);
    const item = station ?? tick;
    if (!item) return;
    const kind = station ? 'station' : 'event';
    const line = station ? findLine(current, station.line_id) : lineForTick(current, tick);
    try {
      if (planningOf(item) === 'planned') {
        const project = await activateMapItem(item, kind, line?.name, projects);
        if (project && !projects.some((entry) => entry.id === project.id)) projects.push(project);
      } else {
        await planMapItem(item, projects);
      }
      selectedId = id;
      await persist();
      paint();
    } catch {
      toast = 'Could not update planning.';
      paint();
    }
  }

  let saveChain: Promise<void> = Promise.resolve();
  let saveTimer: number | undefined;

  /** Quiet save while typing: no redraw, so the field keeps focus. */
  function schedulePersist(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void persist(), 500);
  }

  /** Saves run one at a time so an older reply never lands over a newer edit. */
  function persist(): Promise<void> {
    window.clearTimeout(saveTimer);
    saveChain = saveChain.then(saveNow);
    return saveChain;
  }

  async function saveNow(): Promise<void> {
    const target = current;
    try {
      const saved = await tasksApi.updateMap(target.id, {
        title: target.title,
        year: target.year,
        terms: target.terms ?? null,
        lines: target.lines,
        stations: target.stations,
        ticks: target.ticks
      });
      const idx = maps.findIndex((m) => m.id === saved.id);
      if (idx >= 0) maps[idx] = saved;
      if (current.id === saved.id) current = saved;
      toast = '';
    } catch {
      toast = 'Could not save — last good map is still on screen.';
      paint();
    }
  }

  paint();
}
