/**
 * A real street map under each day's photo stops, drawn once and kept.
 *
 * The story never runs a live map per day, so scrolling stays light. One
 * hidden MapLibre map draws each day in turn, and the picture is saved on
 * the phone (in memory and IndexedDB), so it shows again after a reload and
 * offline. The stops and route are drawn on top as SVG from the map's own
 * projection, so they sit on the right streets. With no WebGL, no signal or
 * no tiles, the day keeps its plain drawing.
 */
import type { MapSegment, PhotoStop } from '@/journal/map-connections';

export const DAY_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Raise when the style or the framing changes, so old pictures are drawn again. */
const PICTURE_VERSION = 1;
/** How long the style, then a day's tiles, get before the day keeps its drawing. */
export const DAY_MAP_PICTURE_TIMEOUT_MS = 10_000;
/** The hidden map closes once nothing has asked for a picture for this long. */
const CLOSE_AFTER_MS = 30_000;
/** A day that could not be drawn is tried again on a later paint after this long. */
const RETRY_AFTER_MS = 60_000;
const MAX_PIXEL_RATIO = 2;

export interface DayMapPicturePoint {
  momentId: string;
  x: number;
  y: number;
}

export interface DayMapPicture {
  /** Object URL of the JPEG. */
  url: string;
  /** CSS pixels the picture was drawn at; points and paths are in the same space. */
  width: number;
  height: number;
  points: DayMapPicturePoint[];
  paths: string[];
}

export interface DayMapPictureRequest {
  stops: PhotoStop[];
  segments: MapSegment[];
  width: number;
  height: number;
}

export interface StoredDayMapPicture {
  key: string;
  blob: Blob;
  width: number;
  height: number;
  points: DayMapPicturePoint[];
  paths: string[];
  at: number;
}

export interface DayMapPictureStore {
  get(key: string): Promise<StoredDayMapPicture | undefined>;
  put(row: StoredDayMapPicture): Promise<void>;
}

/** The parts of a MapLibre map this file uses. */
interface PictureMapLike {
  on(event: string, handler: (event?: unknown) => void): unknown;
  off(event: string, handler: (event?: unknown) => void): unknown;
  resize(): unknown;
  fitBounds(bounds: [[number, number], [number, number]], options?: unknown): unknown;
  jumpTo(options: unknown): unknown;
  triggerRepaint(): unknown;
  project(lngLat: [number, number]): { x: number; y: number };
  getCanvas(): HTMLCanvasElement;
  remove(): void;
}

export interface PictureMapLibrary {
  Map: new (options: Record<string, unknown>) => PictureMapLike;
}

export interface DayMapPicturer {
  picture(request: DayMapPictureRequest): Promise<DayMapPicture | null>;
}

export interface DayMapPicturerOptions {
  loadLibrary: () => Promise<PictureMapLibrary>;
  store?: DayMapPictureStore;
  timeoutMs?: number;
  closeAfterMs?: number;
  pixelRatio?: () => number;
  online?: () => boolean;
}

export function dayMapPictureKey(request: DayMapPictureRequest): string {
  const stops = request.stops.map((s) => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).join(';');
  return `v${PICTURE_VERSION}|${Math.round(request.width)}x${Math.round(request.height)}|${stops}`;
}

/** Resolves true on `event`, false on an `error` first or when time runs out. */
function waitFor(map: PictureMapLike, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean): void => {
      clearTimeout(timer);
      map.off(event, onEvent);
      map.off('error', onError);
      resolve(ok);
    };
    const onEvent = (): void => done(true);
    const onError = (): void => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    map.on(event, onEvent);
    map.on('error', onError);
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    } catch {
      resolve(null);
    }
  });
}

function toPicture(row: StoredDayMapPicture): DayMapPicture {
  return {
    url: URL.createObjectURL(row.blob),
    width: row.width,
    height: row.height,
    points: row.points,
    paths: row.paths,
  };
}

/**
 * Frame the day: every stop in view, clear of the "Open photo stops" label
 * along the bottom and the credit at the top right (UI register W15).
 */
function frame(map: PictureMapLike, stops: PhotoStop[]): void {
  if (stops.length === 1) {
    map.jumpTo({ center: [stops[0]!.lon, stops[0]!.lat], zoom: 14 });
    return;
  }
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const s of stops) {
    west = Math.min(west, s.lon);
    east = Math.max(east, s.lon);
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: { top: 26, bottom: 50, left: 28, right: 28 }, maxZoom: 15, duration: 0 },
  );
}

export function createDayMapPicturer(options: DayMapPicturerOptions): DayMapPicturer {
  const timeoutMs = options.timeoutMs ?? DAY_MAP_PICTURE_TIMEOUT_MS;
  const closeAfterMs = options.closeAfterMs ?? CLOSE_AFTER_MS;
  const online = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const pixelRatio =
    options.pixelRatio ?? (() => Math.min(MAX_PIXEL_RATIO, Math.max(1, globalThis.devicePixelRatio || 1)));

  const memory = new Map<string, Promise<DayMapPicture | null>>();
  /** This phone cannot draw a map (no WebGL): stop asking for this visit. */
  let unavailable = false;
  let map: PictureMapLike | null = null;
  let host: HTMLDivElement | null = null;
  let opening: Promise<PictureMapLike | null> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function close(): void {
    closeTimer = null;
    map?.remove();
    host?.remove();
    map = null;
    host = null;
    opening = null;
  }

  function scheduleClose(): void {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(close, closeAfterMs);
  }

  async function openMap(request: DayMapPictureRequest): Promise<PictureMapLike | null> {
    if (map) return map;
    if (unavailable) return null;
    opening ??= (async () => {
      let lib: PictureMapLibrary;
      try {
        lib = await options.loadLibrary();
      } catch {
        unavailable = true;
        return null;
      }
      const div = document.createElement('div');
      div.className = 'journal-day-map-picture-host';
      div.setAttribute('aria-hidden', 'true');
      // Inline, so MapLibre's own .maplibregl-map rule cannot resize it (UI register S7).
      Object.assign(div.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: `${request.width}px`,
        height: `${request.height}px`,
        pointerEvents: 'none',
      });
      document.body.append(div);
      let created: PictureMapLike;
      try {
        created = new lib.Map({
          container: div,
          style: DAY_MAP_STYLE_URL,
          center: [request.stops[0]!.lon, request.stops[0]!.lat],
          zoom: 12,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          pixelRatio: pixelRatio(),
          // Kept after drawing, so the picture can be read off the canvas.
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
      } catch {
        div.remove();
        unavailable = true;
        return null;
      }
      if (!(await waitFor(created, 'load', timeoutMs))) {
        created.remove();
        div.remove();
        return null;
      }
      host = div;
      map = created;
      return created;
    })();
    const result = await opening;
    if (!result) opening = null;
    return result;
  }

  async function draw(request: DayMapPictureRequest, key: string): Promise<DayMapPicture | null> {
    if (closeTimer) clearTimeout(closeTimer);
    try {
      const live = await openMap(request);
      if (!live || !host) return null;
      host.style.width = `${request.width}px`;
      host.style.height = `${request.height}px`;
      live.resize();
      frame(live, request.stops);
      const drawn = waitFor(live, 'idle', timeoutMs);
      live.triggerRepaint();
      // A tile that failed or never came would leave a hole: keep the drawing instead.
      if (!(await drawn)) return null;
      const project = (lon: number, lat: number): { x: number; y: number } => live.project([lon, lat]);
      const points = request.stops.map((s) => ({ momentId: s.momentId, ...project(s.lon, s.lat) }));
      const paths = request.segments
        .filter((seg) => seg.coordinates.length >= 2)
        .map((seg) =>
          seg.coordinates
            .map(([lon, lat], i) => {
              const p = project(lon, lat);
              return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            })
            .join(' '),
        );
      const blob = await canvasBlob(live.getCanvas());
      if (!blob) return null;
      const row: StoredDayMapPicture = {
        key,
        blob,
        width: request.width,
        height: request.height,
        points,
        paths,
        at: Date.now(),
      };
      void options.store?.put(row).catch(() => undefined);
      return toPicture(row);
    } finally {
      scheduleClose();
    }
  }

  return {
    picture(request) {
      if (request.stops.length === 0 || request.width < 8 || request.height < 8) return Promise.resolve(null);
      const key = dayMapPictureKey(request);
      const known = memory.get(key);
      if (known) return known;
      const job = (async () => {
        const stored = await options.store?.get(key).catch(() => undefined);
        if (stored) return toPicture(stored);
        if (unavailable || !online()) return null;
        // One day at a time on the one hidden map.
        const run = queue.then(() => draw(request, key));
        queue = run.catch(() => undefined);
        return run.catch(() => null);
      })();
      memory.set(key, job);
      void job.then((picture) => {
        if (!picture) setTimeout(() => memory.delete(key), RETRY_AFTER_MS);
      });
      return job;
    },
  };
}

const IDB_NAME = 'lifehub-travel-journal-maps';
const IDB_STORE = 'day_pictures';
const KEEP_PICTURES = 80;

function openPictureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Pictures kept on this phone only, newest 80. */
export function idbDayMapPictureStore(): DayMapPictureStore {
  return {
    async get(key) {
      const db = await openPictureDb();
      try {
        return await new Promise<StoredDayMapPicture | undefined>((resolve, reject) => {
          const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
          req.onsuccess = () => resolve(req.result as StoredDayMapPicture | undefined);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    async put(row) {
      const db = await openPictureDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          store.put(row);
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = (all.result as StoredDayMapPicture[]).sort((a, b) => b.at - a.at);
            for (const old of rows.slice(KEEP_PICTURES)) store.delete(old.key);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
