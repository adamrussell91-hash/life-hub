import type { TrackDef } from '@/domain/maps-layout';
import type { MapColorToken, MapLine, MapStation, MapTick, TransitMap } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { projectPageHash } from '@/domain/cards';
import {
  activateMapItem,
  deleteMapItemProject,
  mapItemPageHash,
  planningOf,
  planMapItem
} from '@/domain/maps-planning';
import { tasksApi } from '@/services/client-api';
import { exportMapHtml, mapsOrSeed, pickCurrentYearMap } from '@/domain/maps';
import { createFilteredPicker, type MapIndexItem, type PickerGroup } from '@/views/map-nav';
import { mountMapCardIndex, type MapCardModel } from '@/views/map-cards';
import { createMapToolbar } from '@/views/map-chrome';
import {
  applyDateSpanToStation,
  applyDateToTickAttach,
  addExtraYearTrack,
  addStandardYearTrack,
  dateToY,
  layoutMap,
  lineTrackDefs,
  LINE_COLORS,
  lineColorsNeedWriteback,
  missingStandardYearTracks,
  moveLine,
  nextLineLetter,
  nextLineX,
  normalizeLineColors,
  orthogonalPath,
  schoolTerms,
  wrapEventLines,
  yearLinePoints,
  yToDate,
  type MapCanvasLayout
} from '@/domain/maps-layout';
import { discCss, fillCss, letterCss, strokeCss } from '@/domain/maps-colors';
import { createHubField } from '@/views/hub-kit';
import { showViewLoading } from '@/views/feedback';

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

function strokeOf(color: MapColorToken): string {
  return strokeCss(color);
}

function fillOf(color: MapColorToken): string {
  return fillCss(color);
}

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

function parseAttachValue(value: string, fallbackLineId: string, fallbackY: number): MapTick['attach'] {
  const [kind, id] = value.split(':');
  if (kind === 'station' && id) return { kind: 'station', station_id: id, side: 'right', offset: 0.5 };
  if (kind === 'event' && id) return { kind: 'event', event_id: id, side: 'right' };
  return { kind: 'line', line_id: id || fallbackLineId, y: fallbackY };
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

function verticalText(
  x: number,
  y: number,
  label: string,
  className: string,
  fill: string
): SVGTextElement {
  const text = svgEl('text', {
    x: String(x),
    y: String(y),
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    transform: `rotate(-90 ${x} ${y})`,
    class: className,
    fill
  });
  text.textContent = label;
  return text;
}

function horizontalText(
  x: number,
  y: number,
  label: string,
  className: string,
  fill: string,
  boxH: number
): SVGTextElement {
  const lines = wrapEventLines(label);
  const text = svgEl('text', {
    x: String(x),
    y: String(y),
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    class: className,
    fill
  });
  if (lines.length === 1) {
    text.textContent = lines[0]!;
    return text;
  }
  const lineH = 16;
  const start = y - ((lines.length - 1) * lineH) / 2;
  for (const [index, line] of lines.entries()) {
    const tspan = svgEl('tspan', {
      x: String(x),
      y: String(start + index * lineH)
    });
    tspan.textContent = line;
    text.append(tspan);
  }
  void boxH;
  return text;
}

function portDot(x: number, y: number, id: string, color: string): SVGCircleElement {
  return svgEl('circle', {
    cx: String(x),
    cy: String(y),
    r: '4',
    fill: 'var(--paper)',
    stroke: color,
    class: 'map-port',
    'data-port': id
  });
}

function connectorPath(
  id: string,
  d: string,
  color: string,
  dash: boolean,
  under = false
): SVGPathElement {
  const path = svgEl('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': '3',
    class: under ? 'map-connector map-connector--under' : 'map-connector',
    'data-connector-id': id
  });
  if (dash) path.setAttribute('stroke-dasharray', '5 4');
  return path;
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

type MapHit =
  | JoinPick
  | { kind: 'station-resize'; id: string; edge: 'top' | 'bottom' }
  | null;

function letterFill(color: MapColorToken): string {
  return letterCss(color);
}

function discFill(color: MapColorToken): string {
  return discCss(color);
}

function renderMapSvg(
  host: SVGSVGElement,
  layout: MapCanvasLayout,
  selectedId: string | null,
  showPorts: boolean,
  editMode: boolean
): void {
  host.replaceChildren();
  host.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  const root = svgEl('g', { class: 'map-root' });

  for (const term of layout.terms) {
    root.append(
      svgEl('line', {
        x1: '72',
        y1: String(term.y),
        x2: String(layout.width - 24),
        y2: String(term.y),
        class: 'map-term__rule'
      })
    );
    const disc = svgEl('g', { class: 'map-term' });
    disc.append(
      svgEl('circle', {
        cx: '36',
        cy: String(term.y),
        r: '15',
        class: 'map-term__disc'
      })
    );
    const label = svgEl('text', {
      x: '36',
      y: String(term.y + 5),
      'text-anchor': 'middle',
      class: 'map-term__label'
    });
    label.textContent = term.label;
    disc.append(label);
    root.append(disc);
  }

  const localConnectors = new Set<string>();
  for (const line of layout.lines) {
    const color = strokeOf(line.color);
    const track = svgEl('g', {
      class: 'map-line-group map-line-group--track',
      'data-line': line.id
    });
    for (const item of line.tracks) {
      for (const cut of item.cuts) {
        track.append(
          svgEl('line', {
            x1: String(item.x),
            y1: String(cut.y0),
            x2: String(item.x),
            y2: String(cut.y1),
            stroke: color,
            'stroke-width': '8',
            'stroke-linecap': 'round',
            class: 'map-line'
          })
        );
      }
      const labelY = item.disc.cy - item.disc.r - 36;
      const pillW = Math.max(56, item.label.length * 9 + 20);
      const pillH = 24;
      track.append(
        svgEl('rect', {
          x: String(item.disc.cx - pillW / 2),
          y: String(labelY - pillH / 2),
          width: String(pillW),
          height: String(pillH),
          rx: String(pillH / 2),
          class: 'map-track-label__pill',
          fill: 'var(--paper)',
          stroke: color,
          'stroke-width': '2'
        })
      );
      const label = svgEl('text', {
        x: String(item.disc.cx),
        y: String(labelY + 5),
        'text-anchor': 'middle',
        class: 'map-track-label',
        fill: color
      });
      label.textContent = item.label;
      const disc = svgEl('circle', {
        cx: String(item.disc.cx),
        cy: String(item.disc.cy),
        r: String(item.disc.r),
        fill: discFill(line.color),
        class: 'map-line-disc'
      });
      const letter = svgEl('text', {
        x: String(item.disc.cx),
        y: String(item.disc.cy + 6),
        'text-anchor': 'middle',
        class: 'map-line-letter',
        fill: letterFill(line.color)
      });
      letter.textContent = line.letter;
      track.append(label, disc, letter);
    }
    root.append(track);
  }

  for (const connector of layout.connectors) {
    if (!connector.under) continue;
    localConnectors.add(connector.id);
    root.append(
      connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash, true)
    );
  }

  for (const line of layout.lines) {
    const group = svgEl('g', {
      class: 'map-line-group',
      'data-line': line.id
    });

    for (const connector of layout.connectors) {
      if (connector.under) continue;
      const fromLine = ownerLineId(layout, connector.from.ownerId, connector.from.owner);
      const toLine = ownerLineId(layout, connector.to.ownerId, connector.to.owner);
      if (fromLine !== line.id || toLine !== line.id) continue;
      localConnectors.add(connector.id);
      group.append(
        connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash, false)
      );
    }

    for (const station of layout.stations.filter((item) => item.line_id === line.id)) {
      const stationColor = strokeOf(station.color);
      const g = svgEl('g', {
        class: `map-station${selectedId === station.id ? ' is-selected' : ''}`,
        'data-id': station.id
      });
      for (const body of station.bodies) {
        g.append(
          svgEl('rect', {
            x: String(body.x - body.w / 2),
            y: String(body.y),
            width: String(body.w),
            height: String(body.h),
            rx: String(body.w / 2),
            fill: fillOf(station.color),
            stroke: stationColor,
            'stroke-width': '3.5',
            class: 'map-station__body'
          })
        );
        if (editMode) {
          g.append(
            svgEl('rect', {
              x: String(body.x - body.w / 2),
              y: String(body.y),
              width: String(body.w),
              height: '10',
              class: 'map-station__resize map-station__resize--top',
              'data-resize': 'top'
            }),
            svgEl('rect', {
              x: String(body.x - body.w / 2),
              y: String(body.y + body.h - 10),
              width: String(body.w),
              height: '10',
              class: 'map-station__resize map-station__resize--bottom',
              'data-resize': 'bottom'
            })
          );
        }
        g.append(verticalText(body.x, body.y + body.h / 2, station.label, 'map-station__label', stationColor));
      }
      if (showPorts) {
        for (const port of station.ports) {
          g.append(portDot(port.x, port.y, port.id, stationColor));
        }
      }
      group.append(g);
    }

    for (const tick of layout.ticks.filter((item) => item.lineId === line.id)) {
      const tickColor = strokeOf(tick.color);
      const g = svgEl('g', {
        class: `map-tick${selectedId === tick.id ? ' is-selected' : ''}`,
        'data-id': tick.id
      });
      g.append(
        svgEl('circle', {
          cx: String(tick.cx),
          cy: String(tick.cy),
          r: '14',
          fill: 'var(--paper)',
          stroke: tickColor,
          'stroke-width': '3.5',
          class: 'map-tick__mark'
        })
      );
      const clipId = `tick-clip-${tick.id}`;
      const clip = svgEl('clipPath', { id: clipId });
      clip.append(
        svgEl('rect', {
          x: String(tick.labelBox.x),
          y: String(tick.labelBox.y),
          width: String(tick.labelBox.w),
          height: String(tick.labelBox.h),
          rx: '8'
        })
      );
      g.append(clip);
      g.append(
        svgEl('rect', {
          x: String(tick.labelBox.x),
          y: String(tick.labelBox.y),
          width: String(tick.labelBox.w),
          height: String(tick.labelBox.h),
          rx: '8',
          class: 'map-tick__chip'
        })
      );
      const label = horizontalText(
        tick.labelBox.x + tick.labelBox.w / 2,
        tick.labelBox.y + tick.labelBox.h / 2,
        tick.label,
        'map-tick__label',
        tickColor,
        tick.labelBox.h
      );
      label.setAttribute('clip-path', `url(#${clipId})`);
      g.append(label);
      if (showPorts) {
        for (const port of tick.ports) {
          g.append(portDot(port.x, port.y, port.id, tickColor));
        }
      }
      group.append(g);
    }
    root.append(group);
  }

  for (const connector of layout.connectors) {
    if (localConnectors.has(connector.id)) continue;
    root.insertBefore(
      connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash),
      root.querySelector('.map-line-group')
    );
  }

  host.append(root);
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
    if (line.tracks.some((track) => Math.hypot(x - track.disc.cx, y - track.disc.cy) <= track.disc.r + 6)) {
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
    eventFrom.attach = { kind: 'station', station_id: to.id, side: 'right', offset: 0.5 };
    return true;
  }
  if (eventFrom && to.kind === 'line') {
    eventFrom.attach = { kind: 'line', line_id: to.id, y };
    eventFrom.starts_on = yToDate(y, year);
    return true;
  }
  if (eventTo && from.kind === 'station') {
    eventTo.attach = { kind: 'station', station_id: from.id, side: 'right', offset: 0.5 };
    return true;
  }
  if (eventTo && from.kind === 'line') {
    eventTo.attach = { kind: 'line', line_id: from.id, y };
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
  if (!hit || hit.kind === 'station-resize') return null;
  return hit;
}

function hitOwnerId(hit: MapHit): string | null {
  if (!hit) return null;
  return hit.id;
}

function downloadHtml(map: TransitMap): void {
  const blob = new Blob([exportMapHtml(map)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.title.replace(/\s+/g, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'map-field');
  wrap.append(el('span', 'map-field__label', label), control);
  return wrap;
}

function textInput(value: string, aria: string): { el: HTMLLabelElement; input: HTMLInputElement } {
  return createHubField({ ariaLabel: aria, value });
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
  const [listed, projects] = await Promise.all([
    tasksApi.listMaps().catch(() => [] as TransitMap[]),
    tasksApi.listProjects().catch(() => [] as Project[])
  ]);
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
    camX = Math.min(Math.max(0, layout.width - vw), Math.max(0, camX));
    camY = Math.min(Math.max(0, layout.height - vh), Math.max(0, camY));
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
    const terms = schoolTerms(year);
    const layout = layoutMap(current);
    canvas.replaceChildren();
    const toolbar = createMapToolbar({
      maps,
      currentId: current.id,
      mode,
      fullscreen,
      joining,
      lines: current.lines,
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
          paint();
        },
        onExport: () => downloadHtml(current),
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
        onJoin: () => {
          joining = !joining;
          toast = joining ? 'Drag from one element to another to join. Ports show only in this mode.' : '';
          paint();
        },
        onMove: (id, delta) => {
          current.lines = moveLine(current.lines, id, delta);
          paint();
          void persist();
        },
        onAddYearLine: (line) => {
          const missing = missingStandardYearTracks(line);
          if (missing.length) {
            current.lines = current.lines.map((entry) =>
              entry.id === line.id ? addStandardYearTrack(entry) : entry
            );
          } else {
            const label = window.prompt('Name for the extra year line on this strand:', 'Middle');
            if (!label?.trim()) return;
            current.lines = current.lines.map((entry) =>
              entry.id === line.id ? addExtraYearTrack(entry, label) : entry
            );
          }
          void persist().then(() => paint());
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
    applyCamera(svg, layout);

    const zoomBar = el('div', 'map-zoom');
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
      const nextZoom = Math.min(2.2, Math.max(0.5, next));
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
    reset.addEventListener('click', () => {
      zoom = 1;
      camX = 0;
      camY = 0;
      applyCamera(svg, layout);
    });
    zoomBar.append(out, reset, inn);
    stage.append(svg, zoomBar);

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
          if (jump) {
            camY = focusCameraOnY(layout, jump.y, zoom);
            applyCamera(svg, layout);
          }
        },
        onCollapse: () => {
          if (selectedId === model.id) selectedId = null;
        }
      }),
      (model) => (mode === 'edit' ? buildItemEditor(model.id, year, terms) : null),
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
    if (selectedId) {
      index
        .querySelector<HTMLElement>(`.map-card-slot[data-map-item-id="${selectedId}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }

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
          selectedId = hit && hit.kind !== 'line' && hit.kind !== 'station-resize' ? hit.id : null;
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
            const nearest = [...layout.lines].sort(
              (a, b) => Math.abs(a.x - (start.x + dx)) - Math.abs(b.x - (start.x + dx))
            )[0];
            tick.attach = { kind: 'line', line_id: nearest?.id ?? tick.attach.line_id, y: nextY };
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
    if (toast) canvas.append(el('p', 'canvas-status', toast));
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

  function buildItemEditor(id: string, year: number, terms: ReturnType<typeof schoolTerms>): HTMLElement | null {
    const selectedStation = current.stations.find((item) => item.id === id);
    const selectedTick = current.ticks.find((item) => item.id === id);
    const item = selectedStation ?? selectedTick;
    if (!item) return null;
    const form = el('div', 'map-card__editor');
    const name = textInput(item.label, 'Name');
    name.input.addEventListener('change', () => {
      item.label = name.input.value.trim() || item.label;
      void persist().then(() => paint());
    });
    const start = dateInput(item.starts_on ?? terms.t1, selectedStation ? 'Starts' : 'Date');
    const end = dateInput(item.ends_on ?? item.starts_on ?? terms.e, 'Ends');
    const applyDates = () => {
      item.starts_on = start.input.value || null;
      item.ends_on = selectedStation ? end.input.value || null : end.input.value || start.input.value || null;
      if (selectedStation) {
        const next = applyDateSpanToStation(selectedStation, year);
        selectedStation.starts_on = next.starts_on;
        selectedStation.ends_on = next.ends_on;
        selectedStation.y = next.y;
        selectedStation.height = next.height;
      } else if (selectedTick) {
        const next = applyDateToTickAttach(selectedTick, year);
        selectedTick.attach = next.attach;
      }
      void persist().then(() => paint());
    };
    start.input.addEventListener('change', applyDates);
    end.input.addEventListener('change', applyDates);
    const stationLine = selectedStation ? findLine(current, selectedStation.line_id) : null;
    const tracks = selectedStation
      ? trackPicker(selectedStation.tracks, stationLine ? lineTrackDefs(stationLine) : lineTrackDefs(current.lines[0]!))
      : null;
    tracks?.root.addEventListener('change', () => {
      selectedStation!.tracks = tracks.value();
      void persist().then(() => paint());
    });
    const attachPicker = selectedTick
      ? createFilteredPicker(targetPickerGroups(current, selectedTick.id), attachSelectValue(selectedTick), {
          ariaLabel: 'Attach to',
          placeholder: 'Search lines, stations…'
        })
      : null;
    const alsoPicker = selectedTick
      ? createFilteredPicker(
          targetPickerGroups(current, selectedTick.id),
          connectSelectValue(current, selectedTick.connects_to),
          {
            ariaLabel: 'Also connect to',
            blankLabel: 'No extra connection',
            placeholder: 'Search connections…'
          }
        )
      : null;
    const applyAttach = () => {
      if (!selectedTick || !attachPicker || !alsoPicker) return;
      selectedTick.attach = parseAttachValue(
        attachPicker.getValue(),
        current.lines[0]?.id ?? '',
        selectedTick.attach.kind === 'line' ? selectedTick.attach.y : 200
      );
      selectedTick.connects_to = parseConnectValue(alsoPicker.getValue(), current);
      const next = applyDateToTickAttach(selectedTick, year);
      selectedTick.attach = next.attach;
      void persist().then(() => paint());
    };
    attachPicker?.root.addEventListener('click', applyAttach);
    alsoPicker?.root.addEventListener('click', applyAttach);
    form.append(name.el);
    form.append(selectedStation ? field('Starts', start.el) : field('Date', start.el));
    if (selectedStation) {
      form.append(field('Ends', end.el));
      if (tracks) form.append(field('Year lines', tracks.root));
    }
    if (selectedTick && attachPicker && alsoPicker) {
      form.append(field('Attach to', attachPicker.root), field('Also connect to', alsoPicker.root));
    }
    if (planningOf(item) === 'active' && item.link) {
      const linked = projects.find((project) => project.id === item.link!.id);
      if (linked) {
        const open = el('button', 'btn btn--secondary', `Open ${linked.title}`);
        open.type = 'button';
        open.addEventListener('click', () => {
          location.hash = projectPageHash(linked.id);
        });
        form.append(open);
      }
    }
    return form;
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
    void persist().then(() => paint());
  }

  function addStationNow(): void {
    const year = current.year ?? yearNow;
    const terms = schoolTerms(year);
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
    void persist().then(() => paint());
  }

  function addEventNow(): void {
    const year = current.year ?? yearNow;
    const terms = schoolTerms(year);
    if (!current.lines.length) {
      toast = 'Add a line first.';
      paint();
      return;
    }
    const draft: MapTick = {
      id: newId('tk'),
      label: 'New competition',
      attach: { kind: 'line', line_id: current.lines[0]!.id, y: 200 },
      stroke: 'solid',
      connects_to: null,
      starts_on: terms.t1,
      ends_on: null,
      link: null,
      planning: 'planned'
    };
    current.ticks.push(applyDateToTickAttach(draft, year));
    selectedId = draft.id;
    mode = 'edit';
    joining = false;
    void persist().then(() => paint());
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

  async function persist(): Promise<void> {
    try {
      const saved = await tasksApi.updateMap(current.id, {
        title: current.title,
        year: current.year,
        lines: current.lines,
        stations: current.stations,
        ticks: current.ticks
      });
      const idx = maps.findIndex((m) => m.id === saved.id);
      if (idx >= 0) maps[idx] = saved;
      current = saved;
      toast = '';
    } catch {
      toast = 'Could not save — last good map is still on screen.';
      paint();
    }
  }

  paint();
}
