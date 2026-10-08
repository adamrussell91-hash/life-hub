import { BLOCK, blockOrigin, GROUND, pointAlong, type CityLayout, type Point } from '@/domain/city/layout';

export type { Point };
import type { CityCatchUp, CityChange, CityService, CitySnapshot } from '@/domain/city/types';
import { depotText, haloText, serviceText, skyText, stopText, vehicleText } from './copy';

export const TILE = 1;
export const DEPOT: Point = { x: 1, y: 1 };
const BUS_SPEED = 1.6;
const REPLAY_MS = 3000;

/** Catch-up clock. A backgrounded tab can report a negative gap; never index with it. */
export function replayProgress(now: number, start: number, skipped: boolean): number {
  if (skipped) return 1;
  return Math.min(1, Math.max(0, now - start) / REPLAY_MS);
}

export type Dir = 'n' | 's' | 'e' | 'w';
export type RoadKind = 'straight' | 'bend' | 'end' | 'tee' | 'cross';

export type RoadPiece = { at: Point; kind: RoadKind; quarter: number };
export type Marker = { id: string; at: Point; text: string; href: string | null };

/** Kenney pieces at quarter 0, and which tile-edges they open onto. +x is west. */
const BASE_OPENINGS: Record<RoadKind, Dir[]> = {
  straight: ['e', 'w'],
  bend: ['e', 'n'],
  end: ['w'],
  tee: ['e', 'w', 'n'],
  cross: ['n', 's', 'e', 'w']
};

const CCW: Dir[] = ['e', 'n', 'w', 's'];

function rotateDir(dir: Dir, quarter: number): Dir {
  return CCW[(CCW.indexOf(dir) + (quarter % 4)) % 4];
}

function sameDirs(a: Dir[], b: Dir[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort().join('');
  return left === [...b].sort().join('');
}

export function roadPiece(open: Dir[]): { kind: RoadKind; quarter: number } {
  const kinds: RoadKind[] =
    open.length >= 4 ? ['cross'] : open.length === 3 ? ['tee'] : open.length === 2 ? ['straight', 'bend'] : ['end'];
  for (const kind of kinds) {
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const got = BASE_OPENINGS[kind].map((dir) => rotateDir(dir, quarter));
      if (sameDirs(got, open)) return { kind, quarter };
    }
  }
  return { kind: 'straight', quarter: 0 };
}

export function tilesAlong(path: Point[]): Point[] {
  const out: Point[] = [];
  const seen = new Set<string>();
  const push = (point: Point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x: point.x, y: point.y });
  };
  if (!path.length) return out;
  push(path[0]);
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let x = from.x;
    let y = from.y;
    while (x !== to.x || y !== to.y) {
      x += dx;
      y += dy;
      push({ x, y });
    }
  }
  return out;
}

export function roadsFromLayout(layout: CityLayout): RoadPiece[] {
  const tiles = new Map<string, Point>();
  for (const route of layout.routes) {
    for (const tile of tilesAlong(route.path)) tiles.set(`${tile.x},${tile.y}`, tile);
  }
  const pieces: RoadPiece[] = [];
  for (const tile of tiles.values()) {
    const open: Dir[] = [];
    for (const dir of CCW) {
      const next = step(tile, dir);
      if (tiles.has(`${next.x},${next.y}`)) open.push(dir);
    }
    const piece = roadPiece(open);
    pieces.push({ at: tile, kind: piece.kind, quarter: piece.quarter });
  }
  return pieces;
}

function step(point: Point, dir: Dir): Point {
  if (dir === 'n') return { x: point.x, y: point.y + 1 };
  if (dir === 's') return { x: point.x, y: point.y - 1 };
  if (dir === 'w') return { x: point.x + 1, y: point.y };
  return { x: point.x - 1, y: point.y };
}

export function parkedRouteIds(snapshot: CitySnapshot): Set<string> {
  const ids = new Set<string>();
  for (const wall of snapshot.suspensions) {
    if (!wall.active) continue;
    for (const id of wall.affectedRouteIds) ids.add(id);
  }
  return ids;
}

export function movingIds(snapshot: CitySnapshot, layout: CityLayout, reducedMotion: boolean): string[] {
  if (reducedMotion) return [];
  const parked = parkedRouteIds(snapshot);
  const ids = snapshot.vehicles.filter((vehicle) => !parked.has(vehicle.routeId)).map((vehicle) => vehicle.id);
  for (const tram of layout.trams) ids.push(`tram:${tram.district}`);
  return ids;
}

export type ReplayMask = {
  hiddenStopIds: Set<string>;
  forceLitStopIds: Set<string>;
  hiddenServiceIds: Set<string>;
  hiddenLineIds: Set<string>;
};

function applied(changes: CityChange[], index: number, t: number): boolean {
  if (index < 0) return true;
  return t >= (index + 1) / changes.length;
}

/** What the catch-up has not revealed yet. Positions stay put; only presence and light change. */
export function replayMask(catchUp: CityCatchUp, t: number): ReplayMask {
  const hiddenStopIds = new Set<string>();
  const forceLitStopIds = new Set<string>();
  const hiddenServiceIds = new Set<string>();
  const hiddenLineIds = new Set<string>();
  const changes = catchUp.quiet ? [] : catchUp.changes;
  changes.forEach((change, index) => {
    if (applied(changes, index, t)) return;
    if (change.kind === 'stop_added') hiddenStopIds.add(change.id);
    if (change.kind === 'stop_done') forceLitStopIds.add(change.id);
    if (change.kind === 'route_opened') hiddenServiceIds.add(`crane:${change.id}`);
    if (change.kind === 'line_opened') hiddenLineIds.add(change.id);
  });
  return { hiddenStopIds, forceLitStopIds, hiddenServiceIds, hiddenLineIds };
}

export function vehiclePose(
  path: Point[],
  index: number,
  count: number,
  elapsedSeconds: number
): { at: Point; ahead: Point } {
  const length = Math.max(path.length ? pathLengthOf(path) : 1, 1);
  const spacing = length / Math.max(count, 1);
  const distance = (Math.max(0, elapsedSeconds) * BUS_SPEED + index * spacing) % length;
  return { at: pointAlong(path, distance), ahead: pointAlong(path, distance + 0.35) };
}

function pathLengthOf(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  }
  return total;
}

/** Low buildings first: scenery is background, never a wall between the camera and a route (C10). */
const BUILDINGS = [
  'suburban-a.glb',
  'suburban-b.glb',
  'suburban-a.glb',
  'suburban-b.glb',
  'commercial-a.glb',
  'commercial-b.glb',
  'industrial-a.glb',
  'industrial-b.glb'
] as const;

/** Tiles kept clear around everything that carries data. */
export const SCENERY_CORRIDOR = 2;
/** Share of the remaining district tiles that get a building, in percent. */
export const SCENERY_FILL_PCT = 35;

function tileHash(x: number, y: number): number {
  let hash = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return hash;
}

export type SceneryTile = { at: Point; file: (typeof BUILDINGS)[number]; quarter: number };

export function sceneryTiles(layout: CityLayout, roads: RoadPiece[], extra: Point[] = []): SceneryTile[] {
  const marks: Point[] = [...roads.map((road) => road.at), ...layout.stops.map((stop) => stop.at), ...extra];
  for (const line of layout.lines) for (const station of line.stations) marks.push(station.at);
  for (const mark of layout.landmarks) marks.push(mark.at);
  for (const tram of layout.trams) marks.push(...tilesAlong(tram.loop));
  const blocked = new Set<string>();
  for (const mark of marks) {
    for (let dy = -SCENERY_CORRIDOR; dy <= SCENERY_CORRIDOR; dy += 1) {
      for (let dx = -SCENERY_CORRIDOR; dx <= SCENERY_CORRIDOR; dx += 1) blocked.add(`${mark.x + dx},${mark.y + dy}`);
    }
  }

  const tiles: SceneryTile[] = [];
  for (const district of layout.districts) {
    for (const block of district.blocks) {
      const origin = blockOrigin(block);
      for (let y = origin.y; y < origin.y + BLOCK; y += 1) {
        for (let x = origin.x; x < origin.x + BLOCK; x += 1) {
          if (x < 1 || y < 1) continue;
          if (blocked.has(`${x},${y}`)) continue;
          const hash = tileHash(x, y);
          if (hash % 100 >= SCENERY_FILL_PCT) continue;
          tiles.push({
            at: { x, y },
            file: BUILDINGS[(hash >>> 8) % BUILDINGS.length],
            quarter: (hash >>> 4) % 4
          });
        }
      }
    }
  }
  return tiles;
}

export type ServicePlacement = Marker & { kind: CityService['kind']; file: string };

const SERVICE_FILE: Record<CityService['kind'], string> = {
  ambulance: 'ambulance.glb',
  mail_van: 'van.glb',
  food_truck: 'delivery.glb',
  school_bus: 'van.glb',
  crane: 'construction-fence.glb'
};

function beside(point: Point, slot: number): Point {
  return { x: point.x + 1 + (slot % 3), y: point.y + Math.floor(slot / 3) };
}

export function placeServices(snapshot: CitySnapshot, layout: CityLayout): ServicePlacement[] {
  const routePath = new Map(layout.routes.map((route) => [route.id, route.path]));
  const stopAt = new Map(layout.stops.map((stop) => [stop.id, stop.at]));
  const slots = new Map<string, number>();
  return snapshot.services.map((service) => {
    let anchor: Point | null = stopAt.get(service.recordId) ?? null;
    if (!anchor) {
      const path = routePath.get(service.recordId);
      anchor = path?.[0] ?? null;
    }
    if (!anchor && service.kind === 'school_bus') {
      const district = layout.districts.find((item) => item.id === 'teaching') ?? layout.districts[0];
      const origin = district ? blockOrigin(district.blocks[0]) : DEPOT;
      anchor = { x: origin.x, y: origin.y };
    }
    anchor = anchor ?? { x: DEPOT.x + 3, y: DEPOT.y };
    const key = `${anchor.x},${anchor.y}`;
    const slot = slots.get(key) ?? 0;
    slots.set(key, slot + 1);
    return {
      id: service.id,
      at: beside(anchor, slot),
      text: serviceText(service),
      href: service.href,
      kind: service.kind,
      file: SERVICE_FILE[service.kind]
    };
  });
}

export type DistrictTint = { id: string; x0: number; y0: number; x1: number; y1: number };

export function districtTints(layout: CityLayout): DistrictTint[] {
  const tints: DistrictTint[] = [];
  for (const district of layout.districts) {
    for (const block of district.blocks) {
      const origin = blockOrigin(block);
      tints.push({
        id: district.id,
        x0: origin.x,
        y0: origin.y,
        x1: origin.x + BLOCK - 1,
        y1: origin.y + BLOCK - 1
      });
    }
  }
  return tints;
}

export type CityPlan = {
  roads: RoadPiece[];
  scenery: SceneryTile[];
  services: ServicePlacement[];
  stops: Marker[];
  barriers: Marker[];
  rings: Marker[];
  stations: Marker[];
  landmarks: Marker[];
  trams: { id: string; district: string; loop: Point[]; text: string; href: string | null }[];
  vehicles: { id: string; routeId: string; path: Point[]; index: number; count: number; parked: boolean; at: Point; text: string; href: string }[];
  signs: { id: string; at: Point; text: string }[];
  halo: Marker | null;
  depot: Marker;
  lines: { id: string; path: Point[]; text: string; href: string }[];
  tints: DistrictTint[];
  /** Where each catch-up change happens, in replay order, so the scene can show it happening. */
  changeMarks: { index: number; count: number; at: Point }[];
  bounds: { maxX: number; maxY: number };
  movingIds: string[];
  skyLabel: string;
  skyFamily: string;
  skyKnown: boolean;
  isNight: boolean;
};

export function planCity(
  snapshot: CitySnapshot,
  layout: CityLayout,
  catchUp: CityCatchUp,
  t: number,
  reducedMotion: boolean
): CityPlan {
  const mask = replayMask(catchUp, t);
  const parked = parkedRouteIds(snapshot);
  const roads = roadsFromLayout(layout);
  const routeById = new Map(snapshot.routes.map((route) => [route.id, route]));
  const layoutRoute = new Map(layout.routes.map((route) => [route.id, route]));
  const lineById = new Map(snapshot.lines.map((line) => [line.id, line]));

  const stops: Marker[] = [];
  const barriers: Marker[] = [];
  const rings: Marker[] = [];
  for (const stop of snapshot.stops) {
    if (mask.hiddenStopIds.has(stop.id)) continue;
    const at = layout.stops.find((item) => item.id === stop.id)?.at;
    if (!at) continue;
    const text = stopText(stop);
    stops.push({ id: stop.id, at, text, href: stop.href });
    if (stop.blocked) barriers.push({ id: `barrier:${stop.id}`, at, text, href: stop.href });
    if (stop.late) rings.push({ id: `ring:${stop.id}`, at, text, href: stop.href });
  }

  const vehiclesOnRoute = new Map<string, number>();
  for (const vehicle of snapshot.vehicles) {
    vehiclesOnRoute.set(vehicle.routeId, (vehiclesOnRoute.get(vehicle.routeId) ?? 0) + 1);
  }
  const seenOnRoute = new Map<string, number>();
  const vehicles = snapshot.vehicles.flatMap((vehicle) => {
    const path = layoutRoute.get(vehicle.routeId)?.path ?? [];
    if (!path.length) return [];
    const index = seenOnRoute.get(vehicle.routeId) ?? 0;
    seenOnRoute.set(vehicle.routeId, index + 1);
    const isParked = parked.has(vehicle.routeId);
    const count = vehiclesOnRoute.get(vehicle.routeId) ?? 1;
    return [{
      id: vehicle.id,
      routeId: vehicle.routeId,
      path,
      index,
      count,
      parked: isParked,
      at: isParked ? { x: DEPOT.x + index, y: DEPOT.y } : path[0],
      text: vehicleText(snapshot, vehicle.routeId, isParked),
      href: routeById.get(vehicle.routeId)?.href ?? '#/projects'
    }];
  });

  const signs = snapshot.suspensions
    .filter((wall) => wall.active)
    .map((wall, index) => ({
      id: `sign:${wall.id}`,
      // The gate stands across the start of the closed route, so it marks the route itself.
      at: gateAt(wall.affectedRouteIds, layoutRoute) ?? { x: DEPOT.x, y: DEPOT.y + 1 + index },
      text: `${wall.label} · not running · ${formatRoutes(wall.affectedRouteIds, routeById)}`
    }));

  const trams = layout.trams.map((loop) => {
    const routines = snapshot.trams.filter((tram) => tram.district === loop.district);
    const names = routines.map((tram) => tram.title).join(', ') || 'Routine';
    return {
      id: `tram:${loop.district}`,
      district: loop.district,
      loop: loop.loop,
      text: `${names} · tram loop`,
      href: routines[0]?.href ?? null
    };
  });

  const stations: Marker[] = [];
  const lines = layout.lines.flatMap((line) => {
    const record = lineById.get(line.id);
    if (!record || mask.hiddenLineIds.has(line.id)) return [];
    for (const station of line.stations) {
      const route = routeById.get(station.routeId);
      stations.push({
        id: `station:${line.id}:${station.routeId}`,
        at: station.at,
        text: `${record.title} · ${route?.title ?? 'station'}`,
        href: record.href
      });
    }
    return [{ id: line.id, path: line.path, text: record.title, href: record.href }];
  });

  const landmarks = layout.landmarks.flatMap((mark) => {
    const record = lineById.get(mark.lineId);
    if (!record) return [];
    return [{ id: `landmark:${mark.lineId}`, at: mark.at, text: `${record.title} · achieved`, href: record.href }];
  });

  const halo = snapshot.halo
    ? { id: `halo:${snapshot.halo.id}`, at: DEPOT, text: haloText(snapshot) ?? '', href: snapshot.halo.href }
    : null;

  const changes = catchUp.quiet ? [] : catchUp.changes;
  const stopAt = new Map(layout.stops.map((stop) => [stop.id, stop.at]));
  const changeMarks = changes.flatMap((change, index) => {
    let at: Point | undefined;
    if (change.kind === 'stop_added' || change.kind === 'stop_done') at = stopAt.get(change.id);
    if (change.kind === 'route_opened') at = layoutRoute.get(change.id)?.path[0];
    if (change.kind === 'line_opened') at = layout.lines.find((line) => line.id === change.id)?.stations[0]?.at;
    return at ? [{ index, count: changes.length, at }] : [];
  });

  const allServices = placeServices(snapshot, layout);
  const clearOf = [DEPOT, ...allServices.map((service) => service.at), ...signs.map((sign) => sign.at)];
  for (const vehicle of vehicles) if (vehicle.parked) clearOf.push(vehicle.at);

  return {
    roads,
    scenery: sceneryTiles(layout, roads, clearOf),
    services: allServices.filter((service) => !mask.hiddenServiceIds.has(service.id)),
    stops,
    barriers,
    rings,
    stations,
    landmarks,
    trams,
    vehicles,
    signs,
    halo,
    depot: { id: 'depot', at: DEPOT, text: depotText(snapshot), href: null },
    lines,
    tints: districtTints(layout),
    changeMarks,
    bounds: layout.bounds,
    movingIds: movingIds(snapshot, layout, reducedMotion),
    skyLabel: skyText(snapshot),
    skyFamily: snapshot.sky.family,
    skyKnown: snapshot.sky.known,
    isNight: snapshot.clock.isNight
  };
}

function gateAt(routeIds: string[], routes: Map<string, { path: Point[] }>): Point | null {
  const start = routeIds.map((id) => routes.get(id)?.path[0]).find((point): point is Point => Boolean(point));
  return start ? { x: start.x, y: start.y + 1 } : null;
}

function formatRoutes(ids: string[], routes: Map<string, { title: string }>): string {
  const names = ids.map((id) => routes.get(id)?.title).filter((title): title is string => Boolean(title));
  return names.length ? names.join(', ') : 'the affected route';
}

export function litStopIds(snapshot: CitySnapshot, mask: ReplayMask): Set<string> {
  const lit = new Set<string>();
  for (const stop of snapshot.stops) {
    if (mask.hiddenStopIds.has(stop.id)) continue;
    if (stop.lit || mask.forceLitStopIds.has(stop.id)) lit.add(stop.id);
  }
  return lit;
}

export const GROUND_EXTENT = GROUND;

/** World position of a tile centre. Layout +x is west, +y is north. */
export function tileWorld(point: Point): { x: number; z: number } {
  return { x: -point.x * TILE, z: -point.y * TILE };
}
