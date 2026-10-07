/**
 * Life City layout engine: where every district, route, stop and line sits on the ground.
 *
 * Prime rule (P10, mental map): once placed, a thing never moves unless its own record
 * changes. The engine is incremental. Pass the previous layout and every element in it
 * keeps its place; new elements take free space, and the map grows at its north and west
 * edges. With no previous layout, routes are placed in creation order, which gives the same
 * answer as placing them one at a time as they were created.
 *
 * Coordinates are whole tiles. x grows WEST from the river, y grows NORTH from the harbour.
 * The renderer maps them to world space; the layout knows nothing about pixels or models.
 *
 * Ground (interim, docs/future-build-ideas/life-city-ground.md): a harbour along the south
 * edge, a river along the east edge, and a public promenade along both shores that no route
 * or line may use.
 */
import type { CitySnapshot } from './types';

export const BLOCK = 24;
export const GAP = 2;
export const LANES_PER_BLOCK = 6;
export const STOPS_PER_LANE = 7;
export const MIN_ROUTE_TILES = 12;
export const MIN_STOP_GAP = 2;

/** First land tile on each axis. Row 0 and column 0 are the promenade. */
export const LAND_START = 1;

export const GROUND = Object.freeze({
  /** River water, east of the promenade. */
  river: { fromX: -3, toX: -1 },
  /** Harbour water, south of the promenade. */
  harbour: { fromY: -4, toY: -1 },
  /** The public edge: x = 0 along the river, y = 0 along the harbour. */
  promenade: { x: 0, y: 0 }
});

const LANE_START = 2;
const LANE_END = 21;
const LANE_ROW = (lane: number) => 2 + lane * 4;

export type Point = { x: number; y: number };
export type BlockRef = { bx: number; by: number };
export type LaneRef = BlockRef & { lane: number };

export type LayoutDistrict = { id: string; blocks: BlockRef[] };

/** A route, or a goal's own lane for tasks hosted on the goal directly (`line:<goalId>`). */
export type LayoutRoute = {
  id: string;
  district: string;
  lanes: LaneRef[];
  path: Point[];
  length: number;
  /** Stop order when the stops were placed. Stops only move when this changes. */
  stopIds: string[];
};

export type LayoutStop = { id: string; routeId: string; at: Point };
export type LayoutStation = { routeId: string; at: Point };
export type LayoutLine = { id: string; stations: LayoutStation[]; path: Point[] };
export type LayoutTramLoop = { district: string; loop: Point[] };
export type LayoutLandmark = { lineId: string; at: Point };

export type CityLayout = {
  version: 1;
  bounds: { maxX: number; maxY: number };
  districts: LayoutDistrict[];
  routes: LayoutRoute[];
  stops: LayoutStop[];
  lines: LayoutLine[];
  trams: LayoutTramLoop[];
  landmarks: LayoutLandmark[];
};

export function blockOrigin(block: BlockRef): Point {
  return { x: LANE_START + block.bx * (BLOCK + GAP), y: LANE_START + block.by * (BLOCK + GAP) };
}

/** Blocks in ring order out from the harbour and river corner, so the map grows north and west evenly. */
export function* blockRing(): Generator<BlockRef> {
  for (let k = 0; ; k += 1) {
    for (let bx = 0; bx <= k; bx += 1) yield { bx, by: k };
    for (let by = k - 1; by >= 0; by -= 1) yield { bx: k, by };
  }
}

const blockKey = (b: BlockRef) => `${b.bx},${b.by}`;
const laneKey = (l: LaneRef) => `${l.bx},${l.by},${l.lane}`;

function laneSegment(lane: LaneRef, reverse: boolean): [Point, Point] {
  const o = blockOrigin(lane);
  const y = o.y + LANE_ROW(lane.lane);
  const a = { x: o.x + LANE_START, y };
  const b = { x: o.x + LANE_END, y };
  return reverse ? [b, a] : [a, b];
}

function pushPoint(path: Point[], p: Point): void {
  const last = path[path.length - 1];
  if (!last || last.x !== p.x || last.y !== p.y) path.push(p);
}

/** Lanes snake back and forth; hops between lanes go north or south first, then across. */
export function pathForLanes(lanes: LaneRef[]): Point[] {
  const path: Point[] = [];
  lanes.forEach((lane, index) => {
    const [start, end] = laneSegment(lane, index % 2 === 1);
    const last = path[path.length - 1];
    if (last) pushPoint(path, { x: last.x, y: start.y });
    pushPoint(path, start);
    pushPoint(path, end);
  });
  return path;
}

export function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  }
  return total;
}

/** The tile at a given distance along an axis-aligned path. */
export function pointAlong(path: Point[], distance: number): Point {
  let left = distance;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
    }
    left -= seg;
  }
  return { ...path[path.length - 1] };
}

/** Stops spread evenly along the whole route, so even a short project gets a real journey. */
export function stopPoints(path: Point[], count: number): Point[] {
  if (count === 0) return [];
  const length = pathLength(path);
  if (count === 1) return [pointAlong(path, Math.round(length / 2))];
  return Array.from({ length: count }, (_, i) => pointAlong(path, 1 + (i * (length - 2)) / (count - 1)));
}

function lanesNeeded(stopCount: number): number {
  return Math.max(1, Math.ceil(stopCount / STOPS_PER_LANE));
}

function lhop(path: Point[], to: Point): void {
  const last = path[path.length - 1];
  if (last) pushPoint(path, { x: to.x, y: last.y });
  pushPoint(path, to);
}

type Placeable = { id: string; district: string; createdAt: string; stopIds: string[] };

export function layoutCity(snapshot: CitySnapshot, previous: CityLayout | null = null): CityLayout {
  const byCreated = <T extends { createdAt: string; id: string }>(items: T[]) =>
    [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  // ---- What needs a lane: every route, plus a lane for each goal that hosts tasks directly
  const directStops = new Map<string, string[]>();
  for (const stop of snapshot.stops) {
    if (stop.routeId || !stop.lineId) continue;
    const list = directStops.get(stop.lineId) ?? [];
    list.push(stop.id);
    directStops.set(stop.lineId, list);
  }
  const placeables: Placeable[] = byCreated([
    ...snapshot.routes.map((route) => ({ id: route.id, district: route.district, createdAt: route.createdAt, stopIds: route.stopIds })),
    ...snapshot.lines
      .filter((line) => directStops.has(line.id))
      .map((line) => ({
        id: `line:${line.id}`,
        district: line.district,
        createdAt: line.createdAt,
        stopIds: [...(directStops.get(line.id) ?? [])].sort()
      }))
  ]);
  const wanted = new Set(placeables.map((p) => p.id));

  // ---- Keep everything the previous layout placed that still exists
  const districts = new Map<string, BlockRef[]>();
  const usedBlocks = new Set<string>();
  const usedLanes = new Set<string>();
  const kept = new Map<string, LayoutRoute>();
  for (const route of previous?.routes ?? []) {
    if (!wanted.has(route.id)) continue;
    kept.set(route.id, route);
    for (const lane of route.lanes) usedLanes.add(laneKey(lane));
  }
  const liveDistricts = new Set([...placeables.map((p) => p.district), ...snapshot.trams.map((t) => t.district)]);
  for (const kr of kept.values()) liveDistricts.add(kr.district);
  for (const district of previous?.districts ?? []) {
    if (!liveDistricts.has(district.id)) continue;
    districts.set(district.id, [...district.blocks]);
    for (const block of district.blocks) usedBlocks.add(blockKey(block));
  }

  /**
   * A new district takes the first free block in ring order. A district that is full
   * takes the free block nearest its own ground, so it spreads into its neighbourhood
   * instead of jumping across the city. Ties go to ring order.
   */
  const claimBlock = (district: string): BlockRef => {
    const own = districts.get(district) ?? [];
    const frontier = Math.max(0, ...[...usedBlocks].map((key) => Math.max(...key.split(',').map(Number)))) + 1;
    let best: BlockRef | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let index = 0;
    for (const block of blockRing()) {
      if (Math.max(block.bx, block.by) > frontier) break;
      index += 1;
      if (usedBlocks.has(blockKey(block))) continue;
      const distance = own.length ? Math.min(...own.map((o) => Math.abs(o.bx - block.bx) + Math.abs(o.by - block.by))) : 0;
      const score = distance * 10_000 + index;
      if (score < bestScore) {
        bestScore = score;
        best = block;
      }
    }
    const chosen = best as BlockRef;
    usedBlocks.add(blockKey(chosen));
    districts.set(district, [...own, chosen]);
    return chosen;
  };
  const ensureDistrict = (district: string) => {
    if (!districts.has(district)) claimBlock(district);
  };

  const freeLane = (district: string, after: LaneRef | null): LaneRef => {
    if (after && after.lane + 1 < LANES_PER_BLOCK) {
      const next = { bx: after.bx, by: after.by, lane: after.lane + 1 };
      if (!usedLanes.has(laneKey(next))) return next;
    }
    ensureDistrict(district);
    for (const block of districts.get(district) ?? []) {
      for (let lane = 0; lane < LANES_PER_BLOCK; lane += 1) {
        const ref = { ...block, lane };
        if (!usedLanes.has(laneKey(ref))) return ref;
      }
    }
    return { ...claimBlock(district), lane: 0 };
  };

  // ---- Place routes in creation order
  const routes: LayoutRoute[] = [];
  const stops: LayoutStop[] = [];
  for (const item of placeables) {
    const prior = kept.get(item.id);
    const district = prior?.district ?? item.district;
    const lanes = prior ? [...prior.lanes] : [];
    while (lanes.length < lanesNeeded(item.stopIds.length)) {
      const lane = freeLane(district, lanes[lanes.length - 1] ?? null);
      usedLanes.add(laneKey(lane));
      lanes.push(lane);
    }
    const path = prior && prior.lanes.length === lanes.length ? prior.path : pathForLanes(lanes);
    const sameStops = Boolean(prior && prior.stopIds.join('|') === item.stopIds.join('|') && prior.lanes.length === lanes.length);
    const previousStops = sameStops ? new Map((previous?.stops ?? []).filter((s) => s.routeId === item.id).map((s) => [s.id, s.at])) : null;
    const points = stopPoints(path, item.stopIds.length);
    item.stopIds.forEach((id, index) => {
      stops.push({ id, routeId: item.id, at: previousStops?.get(id) ?? points[index] });
    });
    routes.push({ id: item.id, district, lanes, path, length: pathLength(path), stopIds: [...item.stopIds] });
  }
  const routeById = new Map(routes.map((route) => [route.id, route]));

  // ---- Lines: a station at the start of each of the goal's routes, joined in creation order
  const routeCreated = new Map(snapshot.routes.map((route) => [route.id, route.createdAt]));
  const lines: LayoutLine[] = [];
  const landmarks: LayoutLandmark[] = [];
  for (const line of byCreated(snapshot.lines)) {
    const ids = [...line.routeIds].sort(
      (a, b) => (routeCreated.get(a) ?? '').localeCompare(routeCreated.get(b) ?? '') || a.localeCompare(b)
    );
    if (directStops.has(line.id)) ids.unshift(`line:${line.id}`);
    const stations = ids
      .map((id) => routeById.get(id))
      .filter((route): route is LayoutRoute => Boolean(route))
      .map((route) => ({ routeId: route.id, at: { ...route.path[0] } }));
    const path: Point[] = [];
    for (const station of stations) lhop(path, station.at);
    lines.push({ id: line.id, stations, path });
    if (line.landmark && stations[0]) {
      landmarks.push({ lineId: line.id, at: { x: stations[0].at.x, y: stations[0].at.y + 2 } });
    }
  }

  // ---- Trams loop around the first block of their district
  const trams: LayoutTramLoop[] = [];
  for (const district of [...new Set(snapshot.trams.map((t) => t.district))].sort()) {
    ensureDistrict(district);
    const o = blockOrigin((districts.get(district) ?? [])[0]);
    const far = { x: o.x + BLOCK - 1, y: o.y + BLOCK - 1 };
    trams.push({ district, loop: [o, { x: far.x, y: o.y }, far, { x: o.x, y: far.y }, { ...o }] });
  }

  const allBlocks = [...districts.values()].flat();
  const maxX = Math.max(LANE_START, ...allBlocks.map((b) => blockOrigin(b).x + BLOCK));
  const maxY = Math.max(LANE_START, ...allBlocks.map((b) => blockOrigin(b).y + BLOCK));

  return {
    version: 1,
    bounds: { maxX, maxY },
    districts: [...districts.entries()].map(([id, blocks]) => ({ id, blocks })).sort((a, b) => a.id.localeCompare(b.id)),
    routes,
    stops,
    lines,
    trams,
    landmarks
  };
}

// ======================================================================== Layout rules

export type LayoutNoticeCode =
  | 'layout_reflow'
  | 'public_edge_closed'
  | 'route_too_short'
  | 'stops_too_close'
  | 'lane_shared'
  | 'layout_missing';

export type LayoutNotice = { code: LayoutNoticeCode; id: string; message: string };

function onLand(p: Point): boolean {
  return p.x >= LAND_START && p.y >= LAND_START;
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function validateLayout(snapshot: CitySnapshot, layout: CityLayout, previous: CityLayout | null = null): LayoutNotice[] {
  const notices: LayoutNotice[] = [];
  const add = (code: LayoutNoticeCode, id: string, message: string) => notices.push({ code, id, message });

  // public_edge_closed: axis-aligned segments between land points stay on land, so vertices suffice
  const points: Array<[string, Point]> = [
    ...layout.routes.flatMap((r) => r.path.map((p) => [r.id, p] as [string, Point])),
    ...layout.stops.map((s) => [s.id, s.at] as [string, Point]),
    ...layout.lines.flatMap((l) => l.path.map((p) => [l.id, p] as [string, Point])),
    ...layout.trams.flatMap((t) => t.loop.map((p) => [`tram:${t.district}`, p] as [string, Point])),
    ...layout.landmarks.map((m) => [m.lineId, m.at] as [string, Point])
  ];
  for (const [id, p] of points) {
    if (!onLand(p)) add('public_edge_closed', id, `(${p.x}, ${p.y}) is on the water or the promenade.`);
  }

  // route_too_short and stops_too_close
  const stopsByRoute = new Map<string, LayoutStop[]>();
  for (const stop of layout.stops) stopsByRoute.set(stop.routeId, [...(stopsByRoute.get(stop.routeId) ?? []), stop]);
  for (const route of layout.routes) {
    if (route.length < MIN_ROUTE_TILES) add('route_too_short', route.id, `Route is ${route.length} tiles; minimum is ${MIN_ROUTE_TILES}.`);
    const own = (stopsByRoute.get(route.id) ?? []).sort((a, b) => route.stopIds.indexOf(a.id) - route.stopIds.indexOf(b.id));
    for (let i = 1; i < own.length; i += 1) {
      const gap = Math.abs(own[i].at.x - own[i - 1].at.x) + Math.abs(own[i].at.y - own[i - 1].at.y);
      if (gap < MIN_STOP_GAP) add('stops_too_close', own[i].id, `Only ${gap} tiles from the previous stop.`);
    }
  }

  // lane_shared
  const owners = new Map<string, string>();
  for (const route of layout.routes) {
    for (const lane of route.lanes) {
      const key = laneKey(lane);
      const other = owners.get(key);
      if (other && other !== route.id) add('lane_shared', route.id, `Shares lane ${key} with ${other}.`);
      owners.set(key, route.id);
    }
  }

  // layout_missing: every route and stop in the snapshot has a place
  const placedRoutes = new Set(layout.routes.map((r) => r.id));
  const placedStops = new Set(layout.stops.map((s) => s.id));
  for (const route of snapshot.routes) if (!placedRoutes.has(route.id)) add('layout_missing', route.id, 'Route has no place.');
  for (const stop of snapshot.stops) {
    if ((stop.routeId || stop.lineId) && !placedStops.has(stop.id)) add('layout_missing', stop.id, 'Stop has no place.');
  }

  // layout_reflow: nothing that existed before moved without its own change
  if (previous) {
    const now = new Map(layout.routes.map((r) => [r.id, r]));
    for (const before of previous.routes) {
      const after = now.get(before.id);
      if (!after) continue;
      const prefix = after.lanes.slice(0, before.lanes.length);
      if (after.district !== before.district || prefix.map(laneKey).join('|') !== before.lanes.map(laneKey).join('|')) {
        add('layout_reflow', before.id, 'A route moved.');
      }
      if (before.stopIds.join('|') === after.stopIds.join('|') && before.lanes.length === after.lanes.length) {
        const beforeStops = previous.stops.filter((s) => s.routeId === before.id);
        for (const stop of beforeStops) {
          const moved = layout.stops.find((s) => s.id === stop.id);
          if (moved && !samePoint(moved.at, stop.at)) add('layout_reflow', stop.id, 'A stop moved on an unchanged route.');
        }
      }
    }
    const blocksNow = new Map(layout.districts.map((d) => [d.id, new Set(d.blocks.map(blockKey))]));
    for (const district of previous.districts) {
      const after = blocksNow.get(district.id);
      if (!after) continue;
      for (const block of district.blocks) {
        if (!after.has(blockKey(block))) add('layout_reflow', district.id, 'A district lost ground.');
      }
    }
    const linesNow = new Map(layout.lines.map((l) => [l.id, l]));
    for (const before of previous.lines) {
      const after = linesNow.get(before.id);
      if (!after) continue;
      for (const station of before.stations) {
        const match = after.stations.find((s) => s.routeId === station.routeId);
        if (match && !samePoint(match.at, station.at)) add('layout_reflow', `${before.id}:${station.routeId}`, 'A station moved.');
      }
    }
  }

  return notices;
}
