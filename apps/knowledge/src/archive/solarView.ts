import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "../stars/schema";
import { attachGraphSearch, type GraphMount } from "./forceGraphBehavior";
import { hashUnit, worldPositions, type Body, type BodyKind, type SolarModel } from "./solarModel";
import { alignedTriple, drawAlignment, ALIGNMENT_MS } from "./universeAlignment";
import { bridgeTargets, dialPhase, drawBridge, drawChevrons, drawKawoosh } from "./universeBridges";
import { decayInertia, glideAt, lensMap, startGlide, LENS_RADIUS, type Glide } from "./universeCamera";
import { ambientDelay, universeChimes, type AmbientLevel } from "./universeChimes";
import { buildComets, cometMeanAnomaly, cometOffset, COMET_TAIL_WINDOW } from "./universeComets";
import { drawCorona, FLARE_MS } from "./universeCorona";
import { drawPlanetBody, paintPlanetIcon, planetIconBox, planetName } from "./universePlanets";
import {
  clearEdgePoint,
  escapeText,
  orreryIconRadius,
  orreryOrder,
  planetByline,
  notesLabel,
  planetTip,
  readOrreryOpen,
  readReplayFolded,
  subtreeEnd,
  systemCounts,
  systemExits,
  systemFitK,
  systemPlanetScale,
  writeOrreryOpen,
  writeReplayFolded,
  type Rect,
  type SystemExit,
} from "./universeSystem";
import { easeInOut, easeOut, paintDot } from "./universeDraw";
import { buildSkyLayers, drawSky, skyFigures, type SkyFigure } from "./universeSky";
import {
  CAPTURE_MS,
  DAY_MS,
  INFALL_MS,
  REPLAY_MS,
  nextReplaySpeed,
  replaySpeedLabel,
  SHOWER_FLIGHT_MS,
  SHOWER_STAGGER_MS,
  buildDustField,
  buildTimeline,
  capturedRocks,
  countUpTo,
  dustOffset,
  infallOffset,
  notesThisWeek,
  readVisit,
  shouldFlare,
  showerPageIds,
  writeVisit,
} from "./universeTime";

export const UNIVERSE_BUILD = 22;

export type SolarNotePayload = { pageId: string; title: string; excerpt: string };

export type SolarViewOptions = {
  search: string;
  onNoteSelect: (note: SolarNotePayload | null) => void;
  clock?: { speed: number };
  /** Manifest rows behind the model: creation dates and connected links drive replay, shower, corona and bridges. */
  entries?: PageManifestEntry[];
  lens?: boolean;
  ambient?: AmbientLevel;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
};

export type SolarMount = GraphMount & {
  setLens: (on: boolean) => void;
  setAmbient: (level: AmbientLevel) => void;
  setConstellations: (saved: SavedConstellation[]) => void;
  followNextComet: () => void;
  startScreensaver: () => void;
  /** Glide to the search hit nearest the view centre and select it. False when nothing matches. */
  flyToNearestHit: () => boolean;
};

export const KIND_DEPTH: Record<BodyKind, number> = {
  sun: 0,
  planet: 0,
  rock: 0,
  minor: 0,
  moon: 0,
  page: 1,
};

export const searchResolveStats = { calls: 0 };

const TAU = Math.PI * 2;

export function zoomBand(z: number) {
  if (z < 2.4) return 0;
  if (z < 9) return 1;
  if (z < 45) return 2;
  return 3;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Screen-space floor per kind, in pixels — the minimum size a body renders
// at even when it's too small (or too zoomed out) to read at true scale.
// These mirror the actual world-space size hierarchy from solarModel.ts
// (sun r=26 > planet/giant > minor > moon > page/rock), compressed enough
// that debris stays visible without making the sun the same size as a note.
// Getting this ordering wrong is exactly what made fit-zoom look like a flat
// pile of same-size dots instead of a solar system.
const SUN_FLOOR_PX = 15;
const PLANET_FLOOR_PX = 8.6;
const MINOR_FLOOR_PX = 6.2;
const MOON_FLOOR_PX = 4.2;
const DEBRIS_FLOOR_PX = 2.4;

export function presence(body: Body, z: number, k: number, maxTag: number) {
  const safeK = Math.max(k, 1e-9);
  const tag = Math.max(maxTag, 1);
  if (body.kind === "sun") {
    return Math.max(body.r, SUN_FLOOR_PX / safeK);
  }
  if (body.kind === "page" || body.kind === "rock") {
    return Math.max(body.r, DEBRIS_FLOOR_PX / safeK);
  }
  if (body.kind === "moon") {
    return Math.max(body.r, MOON_FLOOR_PX / safeK);
  }
  let t: number;
  let big: number;
  if (body.kind === "planet") {
    t = clamp01((z - 2.4) / 7);
    big = (PLANET_FLOOR_PX + Math.sqrt(body.count / tag) * 5) / safeK;
    if (body.giant) big *= 1.7;
  } else if (body.kind === "minor") {
    t = clamp01((z - 2.4) / 12);
    big = (MINOR_FLOOR_PX + Math.sqrt(body.count / tag) * 6) / safeK;
  } else {
    return Math.max(body.r, DEBRIS_FLOOR_PX / safeK);
  }
  return Math.max(big + (body.r - big) * t, 3 / safeK);
}

export function solarScales(reach: number, tightest: number, width: number, height: number) {
  const span = Math.min(width, height);
  const fitK = (span * 0.9) / Math.max(reach * 2, 1);
  const kMin = fitK * 0.85;
  const derived = (span * 0.7) / Math.max(tightest * 2, 1e-6);
  const kMax = Math.max(kMin * 1.0001, Math.min(derived, fitK * 400));
  return { fitK, kMin, kMax };
}

export function solarZoomClamp(k: number, kMin: number, kMax: number) {
  return Math.min(kMax, Math.max(kMin, k));
}

export function solarCamera(focus: { x: number; y: number }, k: number, width: number, height: number) {
  return { k, x: width / 2 - focus.x * k, y: height / 2 - focus.y * k };
}

export type SolarStageCamera = {
  width: number;
  height: number;
  fitK: number;
  kMin: number;
  kMax: number;
  k: number;
  x: number;
  y: number;
};

/** Keep the same world focus and relative zoom when the stage is resized (fullscreen). */
export function applySolarStageResize(
  prev: SolarStageCamera,
  nextSize: { width: number; height: number },
  reach: number,
  tightest: number,
): SolarStageCamera {
  if (nextSize.width < 32 || nextSize.height < 32) return prev;
  if (nextSize.width === prev.width && nextSize.height === prev.height) return prev;
  const z = prev.k / Math.max(prev.fitK, 1e-9);
  const focusX = (prev.width / 2 - prev.x) / Math.max(prev.k, 1e-9);
  const focusY = (prev.height / 2 - prev.y) / Math.max(prev.k, 1e-9);
  const scales = solarScales(reach, tightest, nextSize.width, nextSize.height);
  const k = solarZoomClamp(z * scales.fitK, scales.kMin, scales.kMax);
  return {
    width: nextSize.width,
    height: nextSize.height,
    ...scales,
    k,
    x: nextSize.width / 2 - focusX * k,
    y: nextSize.height / 2 - focusY * k,
  };
}

const NARROW_VIEWPORT_PX = 720;

export function isNarrowViewport(innerWidth: number) {
  return innerWidth <= NARROW_VIEWPORT_PX;
}

/** Desktop canvas size is unchanged. Phones use the leftover viewport, not a 720px floor. */
export function solarStageSize(
  host: { clientWidth: number; clientHeight: number },
  viewport: { innerWidth: number; innerHeight: number },
) {
  const width = host.clientWidth || 1100;
  if (isNarrowViewport(viewport.innerWidth)) {
    const fallback = Math.max(360, Math.floor(viewport.innerHeight * 0.58));
    return { width, height: Math.max(host.clientHeight || 0, fallback) };
  }
  return { width, height: Math.max(720, Math.floor(viewport.innerHeight * 0.8)) };
}

export function cameraFromWorld(
  world: { x: number; y: number },
  nextK: number,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
) {
  return {
    k: nextK,
    x: clientX - rect.left - world.x * nextK,
    y: clientY - rect.top - world.y * nextK,
  };
}

export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinchMidpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function advanceOrbitClock(seconds: number, deltaMs: number, speed: number, freeze: boolean) {
  if (freeze) return 0;
  return seconds + (Math.max(deltaMs, 0) / 1000) * speed;
}

export function isSolarSearching(query: string) {
  return query.trim().length > 0;
}

export function resolveSearchHits(model: SolarModel, query: string) {
  searchResolveStats.calls += 1;
  const hits = new Set<number>();
  const needle = query.trim().toLowerCase();
  if (!needle) return hits;
  for (const body of model.bodies) {
    if (body.kind === "sun") continue;
    if (body.label.toLowerCase().includes(needle) || (body.excerpt ?? "").toLowerCase().includes(needle)) {
      hits.add(body.idx);
    }
  }
  return hits;
}

export function glowSpread(z: number, giant: boolean) {
  if (z < 2.4) return 0;
  return giant ? 2.6 : 2.1;
}

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function kindLabel(kind: BodyKind) {
  if (kind === "minor") return "minor planet";
  return kind;
}

const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string) {
  const cached = glowSprites.get(color);
  if (cached) return cached;
  const sprite = document.createElement("canvas");
  const size = 64;
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.4, color);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, TAU);
    g.fill();
  }
  glowSprites.set(color, sprite);
  return sprite;
}

function ringDust(body: Body, x: number, y: number, pr: number, k: number, behind: boolean) {
  const dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [];
  const n = body.giant ? 170 : 110;
  const inner = pr * 1.38;
  const outer = pr * 2.28;
  const arm = hashUnit(`${body.id}:ring-arm`) * TAU;
  for (let i = 0; i < n; i++) {
    const u = hashUnit(`${body.id}:ring:${i}`);
    const frac = u;
    if (frac > 0.42 && frac < 0.54) continue;
    const clump = Math.floor(hashUnit(`${body.id}:rc:${i}`) * 4);
    const ang = arm + clump * (TAU / 4) + (hashUnit(`${body.id}:ringa:${i}`) - 0.5) * 0.7;
    const sin = Math.sin(ang);
    if (behind ? sin < 0 : sin >= 0) continue;
    const rad = inner + frac * (outer - inner);
    dots.push({
      x: x + Math.cos(ang) * rad,
      y: y + sin * rad * (0.34 + hashUnit(`${body.id}:ry:${i}`) * 0.22),
      r: (0.32 + u * 0.55) / k,
      color: body.color,
      alpha: 0.3 + u * 0.28,
    });
  }
  return dots;
}

// Each dot gets its own beginPath/arc/fill. Batching same-color dots into one
// Path2D and filling it once (the previous approach) makes the canvas fill
// their UNION as a single flat-alpha shape: overlapping circles read as a
// solid polygon with gaps punched out, not as a soft cluster of dots.
// Filling separately lets overlaps blend (stacked alpha), which is what
// actually reads as a cluster.
export function fillDots(
  ctx: CanvasRenderingContext2D,
  dots: Array<{ x: number; y: number; r: number; color: string; alpha: number }>,
) {
  for (const dot of dots) {
    ctx.fillStyle = dot.color;
    ctx.globalAlpha = dot.alpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

type Dot = { x: number; y: number; r: number; color: string; alpha: number };

const ENTER_MS = 2200;
const SYSTEM_FADE_MS = 700;
const SYSTEM_GLIDE_MS = 1500;
const HOLD_MS = 380;
const SAVER_MS = 14_000;
const ROCK_COLOR = "#c4b48a";

function monthLabel(day: number) {
  const date = new Date(day * DAY_MS);
  return date.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
}

function planetStep(model: SolarModel, planetIdx: number) {
  const i = model.planets.findIndex(planet => planet.idx === planetIdx);
  return i < 0 ? 3 : i % 10;
}

export function mountSolarView(host: HTMLElement, model: SolarModel, options: SolarViewOptions): SolarMount {
  const firstSize = solarStageSize(host, window);
  let width = firstSize.width;
  let height = firstSize.height;
  host.innerHTML = "";
  host.style.height = `${height}px`;
  const onNoteSelect = options.onNoteSelect;
  const freeze = prefersReducedMotion();
  const wallNow = options.now ?? (() => Date.now());
  const storage = options.storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : options.storage;
  const entries = options.entries ?? [];
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const B = model.bodies;
  const n = B.length;
  const sunIdx = model.sun.idx;
  const maxTag = Math.max(1, ...model.planets.map(planet => planet.count));
  let { fitK, kMin, kMax } = solarScales(model.reach, model.tightest, width, height);
  const view = { k: fitK, x: width / 2, y: height / 2 };
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;

  // ---------- derived data ----------
  const bodyOfPage = new Map<string, number>();
  const planetOf = new Int32Array(n).fill(-1);
  for (const body of B) {
    if (body.pageId) bodyOfPage.set(body.pageId, body.idx);
    if (body.kind === "planet") planetOf[body.idx] = body.idx;
    else if (body.parent >= 0 && planetOf[body.parent]! >= 0) planetOf[body.idx] = planetOf[body.parent]!;
  }
  const comets = buildComets(entries, model);
  const todayDay = Math.floor(wallNow() / DAY_MS);
  const timeline = buildTimeline(model, entries, todayDay);
  const coronaLoops = notesThisWeek(entries, wallNow());
  const sky = buildSkyLayers();
  const dust = buildDustField(n);
  const tailJitter = Array.from({ length: 35 }, (_, s) => hashUnit(`comet-tail:${s}`) - 0.5);
  let figures: SkyFigure[] = [];

  // ---------- DOM ----------
  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.setAttribute(
    "aria-label",
    "Universe view. Click a body to select it, double-click to fly to it (a planet opens its own system), press and hold a planet to gather its moons.",
  );
  host.appendChild(canvas);

  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  host.appendChild(tip);

  const narrow = isNarrowViewport(window.innerWidth);
  if (narrow) {
    const zoom = document.createElement("div");
    zoom.className = "universe-zoom";
    zoom.setAttribute("role", "group");
    zoom.setAttribute("aria-label", "Universe zoom");
    zoom.innerHTML = `
      <button class="btn btn--ghost" type="button" data-universe-zoom="in" aria-label="Zoom in">+</button>
      <button class="btn btn--ghost" type="button" data-universe-zoom="out" aria-label="Zoom out">−</button>
    `;
    host.appendChild(zoom);
  }

  const replayBar = document.createElement("div");
  replayBar.className = "universe-replay glass-panel";
  replayBar.setAttribute("role", "group");
  replayBar.setAttribute("aria-label", "Big Bang replay");
  replayBar.innerHTML = `
    <button class="universe-replay__title" type="button" data-replay-fold aria-expanded="true" aria-controls="universe-replay-controls" title="Hide the Big Bang controls">
      <span>Big Bang</span><span class="universe-replay__chevron" aria-hidden="true"></span>
    </button>
    <output class="universe-replay__label" data-replay-label>Today</output>
    <div class="universe-replay__controls" id="universe-replay-controls">
      <input class="universe-replay__scrub" type="range" min="0" max="1000" value="1000" aria-label="Replay position" data-replay-scrub />
      <button class="btn btn--ghost" type="button" data-replay-play>Play</button>
      <button class="btn btn--ghost" type="button" data-replay-speed aria-label="Replay speed">×1</button>
      <button class="btn btn--ghost" type="button" data-replay-exit hidden>Back to today</button>
    </div>
  `;
  host.appendChild(replayBar);

  // ---------- orrery drawer and system bar ----------
  const side = document.createElement("div");
  side.className = "universe-side";
  const orreryPlanets = orreryOrder(model);
  // One count per planet, used by the drawer, the hover tip and the system card alike.
  const planetCounts = new Map(model.planets.map(planet => [planet.idx, systemCounts(B, planet.idx)]));
  const notesIn = (planet: Body) => planetCounts.get(planet.idx)?.notes ?? 0;
  side.innerHTML = `
    <section class="universe-system glass-panel" aria-label="Planet system" hidden>
      <span class="universe-system__icon" aria-hidden="true"><canvas></canvas></span>
      <span class="universe-system__text">
        <small class="universe-system__topic" data-system-topic></small>
        <strong class="universe-system__name" data-system-name></strong>
        <small class="universe-system__byline" data-system-byline></small>
        <small class="universe-system__meta" data-system-meta></small>
      </span>
      <span class="universe-system__actions">
        <button class="btn btn--ghost" type="button" data-system-exit>← Universe</button>
        <button class="btn btn--ghost" type="button" data-system-pause aria-pressed="false">Pause</button>
      </span>
    </section>
    <nav class="universe-orrery glass-panel" aria-label="Solar map">
      <button class="universe-orrery__tab" type="button" data-orrery-toggle aria-expanded="false" aria-controls="universe-orrery-list" title="Open the solar map">
        <span class="universe-orrery__sun" aria-hidden="true"></span>
        <span class="universe-orrery__heading">Solar map</span>
        <span class="universe-orrery__chevron" aria-hidden="true"></span>
      </button>
      <ol class="universe-orrery__list" id="universe-orrery-list">
        <li><button class="universe-orrery__item universe-orrery__item--sun" type="button" data-orrery-hub title="The whole universe">
          <span class="universe-orrery__icon" aria-hidden="true"><span class="universe-orrery__sun"></span></span>
          <span class="universe-orrery__text"><strong>The Hub</strong><small>Whole universe</small></span>
        </button></li>
        ${orreryPlanets
          .map(
            planet => `<li><button class="universe-orrery__item" type="button" data-orrery-planet="${planet.idx}" title="${escapeText(planetTip(planet, notesIn(planet)))}">
          <span class="universe-orrery__icon" aria-hidden="true"><canvas></canvas></span>
          <span class="universe-orrery__text"><strong>${escapeText(planetName(planet.label))}</strong><small>${escapeText(planet.label)}</small></span>
          <span class="universe-orrery__count" title="${escapeText(notesLabel(notesIn(planet)))}">${notesIn(planet).toLocaleString("en-AU")}</span>
        </button></li>`,
          )
          .join("")}
      </ol>
    </nav>
  `;
  host.appendChild(side);
  const maxPlanetCount = Math.max(1, ...model.planets.map(planet => planet.count));
  side.querySelectorAll<HTMLButtonElement>("[data-orrery-planet]").forEach(button => {
    const planet = B[Number(button.dataset.orreryPlanet)]!;
    const r = orreryIconRadius(planet, maxPlanetCount);
    const box = planetIconBox(r, !!planet.ringed);
    button.style.setProperty("--icon", `${box}px`);
    const icon = button.querySelector("canvas");
    if (icon) paintPlanetIcon(icon, planet.label, planet.color, r, !!planet.ringed);
  });
  const exitLayer = document.createElement("div");
  exitLayer.className = "universe-exits";
  host.appendChild(exitLayer);

  const ctx = canvas.getContext("2d")!;

  // ---------- state ----------
  let hoverIdx = -1;
  let hoverComet = -1;
  let selectedIdx: number | null = null;
  let selectedComet = -1;
  let hot = new Uint8Array(n).fill(1);
  let raf = 0;
  let stopped = false;
  let orbitSeconds = 0;
  let realSeconds = 0;
  let lastFrame = performance.now();
  let lastQuery = options.search;
  let hits = resolveSearchHits(model, lastQuery);
  let lastClickIdx = -1;
  let lastClickAt = 0;
  let lens = !!options.lens;
  let ambient: AmbientLevel = options.ambient ?? 2;
  let nextAmbient = 0;
  let pointerAt: { x: number; y: number } | null = null;
  let glide: Glide | null = null;
  let inertia = { vx: 0, vy: 0 };
  let lock: { kind: "body" | "comet"; idx: number; k: number } | null = null;
  type Dial = { src: number; srcComet: number; targets: number[]; t0: number; framed: boolean };
  let dial: Dial | null = null;
  let gather = { planet: -1, g: 0, holding: false };
  let glint: { t0: number; planets: number[] } | null = null;
  let lastAlignCheck = 0;
  let flare: { t0: number; angle: number } | null = null;
  let shower: { t0: number; order: Map<number, number>; chimed: Set<number> } | null = null;
  const captures: Array<{ body: number; planet: number; t0: number; start: { x: number; y: number } }> = [];
  const replay = { on: false, playing: false, u: 1, prevDay: Infinity, speed: 1 };
  const born = new Float64Array(n).fill(-1e12);
  const cometLastM = new Float64Array(comets.length).fill(Number.NaN);
  let followIdx = -1;
  let saverTimer = 0;
  let frameCount = 0;
  const timers: number[] = [];
  // System view: the world is drawn in the frame of `focus` (its position subtracted), the rest of the
  // universe fades out, and the drawer/edge arrows navigate between systems.
  let focus = -1;
  const focusAt = { x: 0, y: 0 };
  let scope: {
    planet: number;
    end: number;
    fade: number;
    target: 0 | 1;
    prev: number;
    prevEnd: number;
    prevFade: number;
    scale: number;
  } | null = null;
  let sysK = { fitK, kMin, reach: model.reach };
  let paused = false;
  let exits: SystemExit[] = [];
  let exitsFor: Dial | null = null;

  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const SX = new Float32Array(n);
  const SY = new Float32Array(n);
  const SR = new Float32Array(n);
  const SA = new Float32Array(n);
  const DRAWN = new Uint8Array(n);
  const INF = new Float32Array(n).fill(-1);
  const cometScreen: Array<{ x: number; y: number }> = comets.map(() => ({ x: -1e6, y: -1e6 }));
  const cometWorld: Array<{ x: number; y: number }> = comets.map(() => ({ x: 0, y: 0 }));

  const chime = (step: number, velocity = 1, delay = 0) => universeChimes.chime(step, velocity, delay);
  const isDark = () => !!host.closest(".is-universe-dark");

  // ---------- visit memory: shower, captures, flare ----------
  const visit = readVisit(storage);
  const nowWall = wallNow();
  const showerIds = showerPageIds(entries, visit.lastVisit, nowWall);
  const captured = capturedRocks(visit.rocks, model).slice(0, 3);
  const flareToday = shouldFlare(entries, nowWall, visit.flaredDay);
  writeVisit(
    {
      lastVisit: nowWall,
      rocks: model.rocks.map(rock => rock.pageId!).filter(Boolean),
      flaredDay: flareToday ? todayDay : visit.flaredDay,
    },
    storage,
  );

  function recomputeHot() {
    hot = new Uint8Array(n);
    if (selectedIdx == null) {
      hot.fill(1);
      return;
    }
    hot[selectedIdx] = 1;
    if (B[selectedIdx]!.pageId) return;
    for (let i = selectedIdx + 1; i < n; i++) {
      if (hot[B[i]!.parent]) hot[i] = 1;
    }
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  }

  function toLocal(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const zNow = () => view.k / fitK;
  const centre = () => ({ cx: (width / 2 - view.x) / view.k, cy: (height / 2 - view.y) / view.k });

  /** Zoom limits: a system view may zoom in past the universe's floor-fit, but not out past its own. */
  function clampK(k: number) {
    return focus >= 0 ? solarZoomClamp(k, sysK.kMin, Math.max(kMax, sysK.fitK * 4)) : solarZoomClamp(k, kMin, kMax);
  }

  function inScope(i: number) {
    return !!scope && i >= scope.planet && i < scope.end;
  }

  /** Alpha the rest of the universe keeps while a system view fades in (1 = no system view). */
  function outsideAlpha(i: number) {
    if (!scope) return 1;
    const out = 1 - easeInOut(scope.fade);
    if (scope.prev >= 0 && i >= scope.prev && i < scope.prevEnd) return Math.max(out, scope.prevFade);
    return out;
  }

  function glideTo(cx: number, cy: number, k: number, dur = 1100) {
    const next = clampK(k);
    if (freeze) {
      Object.assign(view, solarCamera({ x: cx, y: cy }, next, width, height));
      return;
    }
    glide = startGlide({ k: view.k, ...centre() }, { k: next, cx, cy }, performance.now(), width, dur);
    inertia = { vx: 0, vy: 0 };
  }

  function frameBody(i: number) {
    lock = null;
    const body = B[i]!;
    glideTo(X[i]!, Y[i]!, (Math.min(width, height) * 0.85) / Math.max(body.sysR * 2, 1e-6));
  }

  function frameWorldPoints(points: Array<{ x: number; y: number }>) {
    if (lock || !points.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const span = Math.max(x1 - x0, (y1 - y0) * (width / height), 60);
    glideTo((x0 + x1) / 2, (y0 + y1) / 2, (width * 0.7) / span, 1400);
  }

  // ---------- camera step ----------
  function stepCamera(now: number, dt: number) {
    if (glide) {
      const g = glideAt(glide, now);
      Object.assign(view, solarCamera({ x: g.cx, y: g.cy }, g.k, width, height));
      if (g.done) glide = null;
      return;
    }
    if (lock) {
      const p = lock.kind === "comet" ? cometWorld[lock.idx]! : { x: X[lock.idx]!, y: Y[lock.idx]! };
      const a = 1 - Math.pow(0.9, dt / 16);
      view.k = Math.exp(Math.log(view.k) + (Math.log(lock.k) - Math.log(view.k)) * a * 0.6);
      view.x += (width / 2 - p.x * view.k - view.x) * a;
      view.y += (height / 2 - p.y * view.k - view.y) * a;
      return;
    }
    if (Math.abs(inertia.vx) + Math.abs(inertia.vy) > 0.01) {
      view.x += inertia.vx * dt;
      view.y += inertia.vy * dt;
      inertia = decayInertia(inertia, dt);
    }
  }

  // ---------- positions ----------
  function positions(now: number) {
    const pos = worldPositions(B, orbitSeconds);
    X.set(pos.x);
    Y.set(pos.y);
    if (focus >= 0) {
      focusAt.x = X[focus]!;
      focusAt.y = Y[focus]!;
      for (let i = 0; i < n; i++) {
        X[i] = X[i]! - focusAt.x;
        Y[i] = Y[i]! - focusAt.y;
      }
    }
    if (gather.g > 0.001 && gather.planet >= 0) {
      const p = gather.planet;
      const px = X[p]!;
      const py = Y[p]!;
      const g = easeInOut(gather.g);
      for (let i = p + 1; i < n && planetOf[i] === p; i++) {
        const dx = X[i]! - px;
        const dy = Y[i]! - py;
        const d = Math.hypot(dx, dy);
        const f = 1 - 0.68 * g;
        const a = (g * 1.6) / (1 + d / (B[p]!.r * 8));
        const c = Math.cos(a);
        const s = Math.sin(a);
        X[i] = px + f * (dx * c - dy * s);
        Y[i] = py + f * (dx * s + dy * c);
      }
    }
    for (const cap of captures) {
      const u = (now - cap.t0) / CAPTURE_MS;
      if (u < 0) {
        X[cap.body] = X[sunIdx]! + cap.start.x;
        Y[cap.body] = Y[sunIdx]! + cap.start.y;
      } else if (u < 1) {
        const o = infallOffset(cap.start, { x: X[cap.body]! - X[sunIdx]!, y: Y[cap.body]! - Y[sunIdx]! }, easeInOut(u));
        X[cap.body] = X[sunIdx]! + o.x;
        Y[cap.body] = Y[sunIdx]! + o.y;
      }
    }
    for (let c = 0; c < comets.length; c++) {
      const o = cometOffset(comets[c]!, orbitSeconds);
      cometWorld[c] = { x: X[sunIdx]! + o.x, y: Y[sunIdx]! + o.y };
    }
  }

  function inDial(i: number) {
    return !!dial && (dial.src === i || dial.targets.includes(i));
  }

  function capturing(i: number, now: number) {
    return captures.some(cap => cap.body === i && now - cap.t0 < CAPTURE_MS + 1500);
  }

  function alphaFor(i: number, searching: boolean) {
    if (searching) {
      if (B[i]!.kind === "sun") return 0.35;
      return hits.has(i) ? 1 : 0.2;
    }
    if (dial) {
      if (inDial(i)) return 1;
      if (B[i]!.kind === "sun") return 0.5;
      if (dial.srcComet >= 0) return 0.6;
      return 0.32;
    }
    if (selectedIdx != null) return hot[i] ? 1 : 0.22;
    return hoverIdx === i ? 1 : 0.92;
  }

  function screenPass(now: number, z: number, band: number, searching: boolean, tDay: number) {
    DRAWN.fill(0);
    INF.fill(-1);
    const cx = width / 2;
    const cy = height / 2;
    for (let i = 0; i < n; i++) {
      const b = B[i]!;
      if (replay.on && b.kind !== "sun" && timeline.firstDay[i]! > tDay) continue;
      const scopeAlpha = inScope(i) ? 1 : outsideAlpha(i);
      if (scopeAlpha < 0.01) continue;
      const forced =
        searching || replay.on || inDial(i) || i === selectedIdx || capturing(i, now) || (shower?.order.has(i) ?? false);
      if (KIND_DEPTH[b.kind] > band && !forced) continue;
      let pr = presence(b, z, view.k, maxTag);
      if (scope && i === scope.planet) pr = Math.max(pr, pr + (b.r * scope.scale - pr) * easeInOut(scope.fade));
      if (replay.on && (b.kind === "planet" || b.kind === "moon" || b.kind === "minor" || b.kind === "sun")) {
        const list = timeline.dayLists[i]!;
        pr *= Math.max(b.kind === "sun" ? 0.35 : 0.25, Math.sqrt(countUpTo(list, tDay) / Math.max(1, list.length)));
      }
      if (replay.on && b.kind === "page" && band < 1) pr *= 0.45;
      let wx = X[i]!;
      let wy = Y[i]!;
      if (replay.on && (b.kind === "page" || b.kind === "rock" || b.kind === "moon")) {
        const u = (now - born[i]!) / INFALL_MS;
        if (u >= 0 && u < 1 && !freeze) {
          const o = infallOffset(dustOffset(dust, i, model.reach, orbitSeconds), { x: wx - X[sunIdx]!, y: wy - Y[sunIdx]! }, u);
          wx = X[sunIdx]! + o.x;
          wy = Y[sunIdx]! + o.y;
          INF[i] = u;
        }
      }
      let sx = view.x + wx * view.k;
      let sy = view.y + wy * view.k;
      let sr = pr * view.k;
      const margin = sr + 60;
      if (sx < -margin || sy < -margin || sx > width + margin || sy > height + margin) continue;
      let a = alphaFor(i, searching) * scopeAlpha;
      if (replay.on && b.kind === "planet") a *= Math.min(1, Math.max(0.05, (now - born[i]!) / 4000));
      if (searching && b.kind !== "sun" && !hits.has(i)) {
        sx = cx + (sx - cx) * 0.9;
        sy = cy + (sy - cy) * 0.9;
        sr *= 0.5;
        a *= 0.6;
      }
      if (lens && pointerAt) {
        const m = lensMap(sx, sy, pointerAt);
        sx = m[0];
        sy = m[1];
        sr *= m[2];
      }
      SX[i] = sx;
      SY[i] = sy;
      SR[i] = sr;
      SA[i] = a;
      DRAWN[i] = 1;
    }
  }

  // ---------- drawing ----------
  function collectKind(kind: BodyKind, now: number) {
    const dots: Dot[] = [];
    for (let i = 0; i < n; i++) {
      if (!DRAWN[i] || B[i]!.kind !== kind) continue;
      if (showerProgress(i, now) != null) continue;
      dots.push({ x: SX[i]!, y: SY[i]!, r: SR[i]!, color: B[i]!.color, alpha: SA[i]! });
    }
    return dots;
  }

  function showerProgress(i: number, now: number): number | null {
    const order = shower?.order.get(i);
    if (order == null || !shower) return null;
    const u = (now - (shower.t0 + order * SHOWER_STAGGER_MS)) / SHOWER_FLIGHT_MS;
    return u < 1 ? u : null;
  }

  function drawShower(now: number) {
    if (!shower) return;
    let active = false;
    const diag = Math.hypot(width, height);
    for (const [i, order] of shower.order) {
      const u = showerProgress(i, now);
      if (u == null) {
        if (!shower.chimed.has(i) && now > shower.t0 + order * SHOWER_STAGGER_MS) {
          shower.chimed.add(i);
          chime(planetStep(model, planetOf[i]!) + 5, 0.3);
        }
        continue;
      }
      active = true;
      if (u < 0 || !DRAWN[i]) continue;
      const angle = 0.45 + (hashUnit(`meteor:${i}`) - 0.5) * 0.5;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const tx = SX[i]!;
      const ty = SY[i]!;
      const start = { x: tx - dx * diag * 0.55, y: ty - dy * diag * 0.55 };
      const e = easeInOut(Math.max(0, u));
      const hx = start.x + (tx - start.x) * e;
      const hy = start.y + (ty - start.y) * e;
      const fadeIn = Math.min(1, u / 0.25);
      // streak tail: long and tapering mid-flight, shrinking to nothing as the meteor settles
      const tail = 150 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 8;
      const color = B[i]!.color;
      for (let s = 24; s >= 1; s--) {
        const t = s / 24;
        paintDot(ctx, hx - dx * tail * t, hy - dy * tail * t, Math.max(0.35, 1.2 * (1 - t)), color, 0.4 * fadeIn * Math.pow(1 - t, 1.4));
      }
      paintDot(ctx, hx, hy, Math.max(1, SR[i]! * 0.9), color, 0.85 * fadeIn);
    }
    if (!active) shower = null;
  }

  function drawDust(tDay: number) {
    for (let i = 0; i < n; i++) {
      const b = B[i]!;
      if ((b.kind !== "page" && b.kind !== "rock") || timeline.day[i]! <= tDay) continue;
      const o = dustOffset(dust, i, model.reach, orbitSeconds);
      const x = view.x + (X[sunIdx]! + o.x) * view.k;
      const y = view.y + (Y[sunIdx]! + o.y) * view.k;
      if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
      paintDot(ctx, x, y, 0.6, b.color, 0.3);
    }
    for (let i = 0; i < n; i++) {
      const u = INF[i]!;
      if (u < 0 || !DRAWN[i]) continue;
      for (let s = 1; s <= 5; s++) {
        const o = infallOffset(
          dustOffset(dust, i, model.reach, orbitSeconds),
          { x: X[i]! - X[sunIdx]!, y: Y[i]! - Y[sunIdx]! },
          Math.max(0, u - s * 0.012),
        );
        paintDot(ctx, view.x + (X[sunIdx]! + o.x) * view.k, view.y + (Y[sunIdx]! + o.y) * view.k, SR[i]! * (1 - s / 6) * 0.8, B[i]!.color, 0.2 * (1 - s / 6));
      }
    }
  }

  function drawComets(dark: boolean, tDay: number) {
    for (let c = 0; c < comets.length; c++) {
      const comet = comets[c]!;
      const cometBody = bodyOfPage.get(comet.pageId);
      const cometDay = cometBody != null ? timeline.day[cometBody]! : timeline.minDay;
      if (replay.on && cometDay > tDay) {
        cometScreen[c] = { x: -1e6, y: -1e6 };
        continue;
      }
      const fadeOut = scope ? 1 - easeInOut(scope.fade) : 1;
      if (fadeOut < 0.02) {
        cometScreen[c] = { x: -1e6, y: -1e6 };
        continue;
      }
      const dim = ((dial && dial.srcComet >= 0 && dial.srcComet !== c) || (selectedIdx != null && selectedComet !== c) ? 0.35 : 1) * fadeOut;
      const window = comet.period * COMET_TAIL_WINDOW;
      for (let s = 34; s >= 1; s--) {
        const u = s / 34;
        const o = cometOffset(comet, orbitSeconds - window * u);
        let sx = view.x + (X[sunIdx]! + o.x) * view.k;
        let sy = view.y + (Y[sunIdx]! + o.y) * view.k;
        if (sx < -20 || sy < -20 || sx > width + 20 || sy > height + 20) continue;
        let size = 1;
        if (lens && pointerAt) [sx, sy, size] = lensMap(sx, sy, pointerAt);
        const band = comet.colors[Math.min(comet.colors.length - 1, Math.floor(u * comet.colors.length))] ?? "#ffffff";
        const spread = tailJitter[(s + c * 7) % tailJitter.length]! * u * 4;
        paintDot(ctx, sx + spread, sy - spread, (1.9 - u * 1.3) * size, band, Math.pow(1 - u, 1.3) * 0.8 * dim);
      }
      let hx = view.x + cometWorld[c]!.x * view.k;
      let hy = view.y + cometWorld[c]!.y * view.k;
      let size = 1;
      if (lens && pointerAt) [hx, hy, size] = lensMap(hx, hy, pointerAt);
      paintDot(ctx, hx, hy, 4.2 * size, comet.colors[0] ?? "#ffffff", 0.35 * dim);
      paintDot(ctx, hx, hy, (hoverComet === c ? 3 : 2.4) * size, dark ? "#ffffff" : "#17375e", dim);
      cometScreen[c] = { x: hx, y: hy };
    }
  }

  function drawCaptures(now: number) {
    for (const cap of captures) {
      if (!DRAWN[cap.body]) continue;
      const u = (now - cap.t0) / CAPTURE_MS;
      const e = easeInOut(Math.max(0, Math.min(1, u)));
      paintDot(ctx, SX[cap.body]!, SY[cap.body]!, SR[cap.body]!, ROCK_COLOR, (1 - e) * SA[cap.body]!);
      if (u > 1 && u < 1.5) {
        const v = (u - 1) / 0.5;
        for (let s = 0; s < 24; s++) {
          const a = (s / 24) * Math.PI * 2;
          paintDot(ctx, SX[cap.body]! + Math.cos(a) * (4 + v * 6), SY[cap.body]! + Math.sin(a) * (4 + v * 6), 0.5, B[cap.body]!.color, 0.35 * (1 - v));
        }
      }
    }
  }

  function drawDial(now: number, dark: boolean) {
    if (!dial) return;
    const src = dial.srcComet >= 0 ? cometScreen[dial.srcComet]! : DRAWN[dial.src] ? { x: SX[dial.src]!, y: SY[dial.src]! } : null;
    if (!src || src.x < -1e5) return;
    const phase = dialPhase(now - dial.t0, dial.targets.length, freeze || dial.srcComet >= 0);
    if (dial.srcComet < 0) drawChevrons(ctx, src.x, src.y, phase.locked, dial.targets.length, dark);
    if (phase.kawoosh < 0) return;
    if (phase.kawoosh < 1 && !freeze) {
      if (dial.srcComet < 0) drawKawoosh(ctx, src.x, src.y, phase.kawoosh, dark ? "#bfe3ff" : "#17375e", 15);
      for (const t of dial.targets) if (DRAWN[t]) drawKawoosh(ctx, SX[t]!, SY[t]!, phase.kawoosh, B[t]!.color, 8, 12);
    }
    if (!dial.framed && dial.srcComet < 0) {
      dial.framed = true;
      frameWorldPoints([dial.src, ...dial.targets].filter(i => !scope || inScope(i)).map(i => ({ x: X[i]!, y: Y[i]! })));
    }
    dial.targets.forEach((t, j) => {
      if (!DRAWN[t]) return;
      drawBridge(ctx, src, { x: SX[t]!, y: SY[t]! }, dark ? "#dff1ff" : B[t]!.color, phase.bridgeAlpha, now, j + dial!.src, !freeze);
    });
  }

  function drawPings(now: number) {
    let shown = 0;
    for (const i of hits) {
      if (!DRAWN[i] || shown >= 300) continue;
      shown++;
      const u = freeze ? 0.3 : ((now / 2200 + hashUnit(`ping:${i}`) * 0.3) % 1);
      const color = B[i]!.color;
      for (let s = 0; s < 10; s++) {
        const a = (s / 10) * Math.PI * 2;
        const d = SR[i]! + 3 + u * 16;
        paintDot(ctx, SX[i]! + Math.cos(a) * d, SY[i]! + Math.sin(a) * d, 0.9, color, (1 - u) * 0.8);
      }
    }
  }

  function drawLensRim(dark: boolean) {
    if (!pointerAt) return;
    for (let s = 0; s < 64; s++) {
      const a = (s / 64) * Math.PI * 2;
      paintDot(ctx, pointerAt.x + Math.cos(a) * LENS_RADIUS, pointerAt.y + Math.sin(a) * LENS_RADIUS, 0.8, dark ? "#ffffff" : "#17375e", 0.28);
    }
  }

  function draw(now: number) {
    const dt = Math.min(64, Math.max(0, now - lastFrame));
    if (!paused) orbitSeconds = advanceOrbitClock(orbitSeconds, now - lastFrame, options.clock?.speed ?? 1, freeze);
    lastFrame = now;
    realSeconds += dt / 1000;
    frameCount++;
    gather.g = Math.max(0, Math.min(1, gather.g + ((gather.holding ? 1 : -1) * dt) / 650));
    if (scope) {
      const step = freeze ? 1 : dt / SYSTEM_FADE_MS;
      scope.fade = clamp01(scope.fade + (scope.target ? step : -step));
      scope.prevFade = Math.max(0, scope.prevFade - step * 1.6);
      if (!scope.target && scope.fade <= 0) scope = null;
    }

    if (replay.on && replay.playing) {
      replay.u = Math.min(1, replay.u + (dt / REPLAY_MS) * replay.speed);
      if (replay.u >= 1) replay.playing = false;
      syncReplay();
    }
    const tDay = replay.on ? timeline.minDay + (timeline.maxDay - timeline.minDay) * replay.u : Infinity;
    if (replay.on && tDay > replay.prevDay) {
      for (let i = 0; i < n; i++) {
        const d = timeline.firstDay[i]!;
        if (B[i]!.kind !== "sun" && d > replay.prevDay && d <= tDay) born[i] = now;
      }
    }
    replay.prevDay = replay.on ? tDay : Infinity;

    positions(now);
    stepCamera(now, dt);

    // sound: ambient notes and comets rounding the Hub
    if (universeChimes.enabled && ambient > 0 && now > nextAmbient) {
      nextAmbient = now + ambientDelay(ambient, Math.random());
      const visible = model.planets.filter(planet => DRAWN[planet.idx]);
      const planet = visible[Math.floor(Math.random() * visible.length)];
      if (planet) {
        const step = planetStep(model, planet.idx);
        chime(step, 0.22);
        if (Math.random() < 0.35) chime(step + (Math.random() < 0.5 ? 2 : 3), 0.16, 0.55);
      }
    }
    for (let c = 0; c < comets.length; c++) {
      const m = cometMeanAnomaly(comets[c]!, orbitSeconds);
      if (cometLastM[c]! > 5.5 && m < 0.8) chime(12 + (c % 3), 0.18);
      cometLastM[c] = m;
    }
    if (!freeze && !glint && !scope && now - lastAlignCheck > 1000) {
      lastAlignCheck = now;
      const triple = alignedTriple(model.planets, orbitSeconds);
      if (triple) {
        glint = { t0: now, planets: triple };
        triple.forEach((p, j) => chime(5 + j * 2, 0.45, j * 0.6));
      }
    }

    const z = zNow();
    const band = zoomBand(z);
    const searching = isSolarSearching(options.search);
    const dark = isDark();
    screenPass(now, z, band, searching, tDay);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawSky(ctx, sky, figures, view, width, height, realSeconds, dark);

    fillDots(ctx, collectKind("rock", now));
    fillDots(ctx, collectKind("page", now));
    fillDots(ctx, collectKind("moon", now));
    fillDots(ctx, collectKind("minor", now));

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const body of model.planets) {
      const i = body.idx;
      if (!DRAWN[i]) continue;
      const glow = glowSpread(z, !!body.giant);
      if (glow <= 0) continue;
      const pr = SR[i]!;
      ctx.globalAlpha = SA[i]! * (body.giant ? 0.62 : 0.5);
      ctx.drawImage(glowSprite(body.color), SX[i]! - pr * glow, SY[i]! - pr * glow, pr * glow * 2, pr * glow * 2);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";

    for (const body of model.planets) {
      if (body.ringed && DRAWN[body.idx]) fillDots(ctx, ringDust(body, SX[body.idx]!, SY[body.idx]!, SR[body.idx]!, 1, true));
    }
    const sunX = view.x + X[sunIdx]! * view.k;
    const sunY = view.y + Y[sunIdx]! * view.k;
    for (const body of model.planets) {
      const i = body.idx;
      if (!DRAWN[i]) continue;
      const dx = sunX - SX[i]!;
      const dy = sunY - SY[i]!;
      const d = Math.hypot(dx, dy);
      drawPlanetBody(ctx, body.label, body.color, SX[i]!, SY[i]!, SR[i]!, SA[i]!, d > 1 ? { x: dx / d, y: dy / d } : null, dpr);
    }
    for (const body of model.planets) {
      if (body.ringed && DRAWN[body.idx]) fillDots(ctx, ringDust(body, SX[body.idx]!, SY[body.idx]!, SR[body.idx]!, 1, false));
    }

    if (DRAWN[sunIdx]) {
      const pr = SR[sunIdx]!;
      const sx = SX[sunIdx]!;
      const sy = SY[sunIdx]!;
      ctx.globalAlpha = SA[sunIdx]!;
      ctx.drawImage(glowSprite(model.sun.color), sx - pr * 1.8, sy - pr * 1.8, pr * 3.6, pr * 3.6);
      ctx.fillStyle = model.sun.color;
      ctx.beginPath();
      ctx.arc(sx, sy, pr, 0, TAU);
      ctx.fill();
      const flareU = flare && !freeze ? (now - flare.t0) / FLARE_MS : null;
      if (flareU != null && flareU >= 1) flare = null;
      if (!scope) drawCorona(ctx, sx, sy, pr, coronaLoops, freeze ? 0 : realSeconds, flare && flareU != null && flareU >= 0 ? { u: flareU, angle: flare.angle } : null, dark);
    }

    if (replay.on) drawDust(tDay);
    drawShower(now);
    drawCaptures(now);
    drawComets(dark, tDay);
    drawDial(now, dark);
    syncExits();
    if (searching && hits.size) {
      const pins: Dot[] = [];
      for (const i of hits) {
        if (!DRAWN[i]) continue;
        pins.push({ x: SX[i]!, y: SY[i]!, r: Math.max(SR[i]!, 3.2), color: B[i]!.color, alpha: 1 });
      }
      fillDots(ctx, pins);
      drawPings(now);
    }
    if (glint) {
      const u = (now - glint.t0) / ALIGNMENT_MS;
      if (u >= 1) glint = null;
      else if (DRAWN[sunIdx] && !scope) {
        drawAlignment(
          ctx,
          { x: SX[sunIdx]!, y: SY[sunIdx]! },
          glint.planets.filter(p => DRAWN[p]).map(p => ({ x: SX[p]!, y: SY[p]!, r: SR[p]! })),
          u,
          dark,
        );
      }
    }
    if (lens && pointerAt) drawLensRim(dark);
    ctx.globalAlpha = 1;
  }

  function loop(now: number) {
    if (stopped) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  // ---------- picking ----------
  function findBody(wx: number, wy: number, z: number) {
    let hit = -1;
    let best = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      const body = B[i]!;
      if (KIND_DEPTH[body.kind] > zoomBand(z) && !isSolarSearching(options.search)) continue;
      const pr = presence(body, z, view.k, maxTag);
      const dist = Math.hypot(X[i]! - wx, Y[i]! - wy);
      if (dist <= pr + 6 / view.k && dist < best) {
        best = dist;
        hit = i;
      }
    }
    return hit;
  }

  function pick(clientX: number, clientY: number): { body: number; comet: number } {
    const p = toLocal(clientX, clientY);
    let comet = -1;
    let bestComet = 12;
    cometScreen.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestComet) {
        bestComet = d;
        comet = i;
      }
    });
    if (comet >= 0) return { body: -1, comet };
    if (frameCount === 0) {
      positions(performance.now());
      const w = toWorld(clientX, clientY);
      return { body: findBody(w.x, w.y, zNow()), comet: -1 };
    }
    let body = -1;
    let best = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      if (!DRAWN[i]) continue;
      const d = Math.hypot(SX[i]! - p.x, SY[i]! - p.y);
      if (d <= SR[i]! + 6 && d - SR[i]! < best) {
        best = d - SR[i]!;
        body = i;
      }
    }
    return { body, comet: -1 };
  }

  // ---------- selection ----------
  function selectBody(i: number) {
    selectedIdx = i;
    selectedComet = -1;
    dial = null;
    recomputeHot();
    const body = B[i]!;
    if (body.pageId) {
      onNoteSelect({ pageId: body.pageId, title: body.label, excerpt: body.excerpt ?? "" });
      const targets = bridgeTargets(entryById.get(body.pageId)?.connected, i, bodyOfPage);
      if (targets.length) {
        dial = { src: i, srcComet: -1, targets, t0: performance.now(), framed: false };
        for (let j = 0; j < Math.min(7, targets.length); j++) chime(j, 0.7, (freeze ? 0 : 0.33) * (j + 1));
        if (!freeze) chime(-3, 0.9, 0.33 * Math.min(7, targets.length) + 0.15);
      }
    } else {
      onNoteSelect(null);
      if (planetOf[i]! >= 0) chime(planetStep(model, planetOf[i]!), 0.5);
    }
  }

  function selectComet(c: number) {
    const comet = comets[c]!;
    selectedIdx = null;
    selectedComet = c;
    recomputeHot();
    dial = { src: -1, srcComet: c, targets: comet.planets, t0: performance.now(), framed: true };
    onNoteSelect({ pageId: comet.pageId, title: comet.title, excerpt: comet.excerpt });
    chime(9, 0.6);
  }

  function clearSelection() {
    selectedIdx = null;
    selectedComet = -1;
    dial = null;
    recomputeHot();
    onNoteSelect(null);
  }

  // ---------- system view ----------
  const systemBar = side.querySelector<HTMLElement>(".universe-system")!;
  const systemIcon = systemBar.querySelector("canvas")!;
  const systemName = systemBar.querySelector<HTMLElement>("[data-system-name]")!;
  const systemTopic = systemBar.querySelector<HTMLElement>("[data-system-topic]")!;
  const systemByline = systemBar.querySelector<HTMLElement>("[data-system-byline]")!;
  const systemMeta = systemBar.querySelector<HTMLElement>("[data-system-meta]")!;
  const pauseBtn = systemBar.querySelector<HTMLButtonElement>("[data-system-pause]")!;
  const orrery = side.querySelector<HTMLElement>(".universe-orrery")!;
  const orreryToggle = side.querySelector<HTMLButtonElement>("[data-orrery-toggle]")!;
  const universeLabel = canvas.getAttribute("aria-label") ?? "";

  function setOrreryOpen(open: boolean, remember = true) {
    orrery.classList.toggle("is-open", open);
    orreryToggle.setAttribute("aria-expanded", String(open));
    orreryToggle.title = open ? "Close the solar map" : "Open the solar map";
    if (remember) writeOrreryOpen(open, storage);
  }

  function syncSystemUi() {
    const p = scope && scope.target ? scope.planet : -1;
    systemBar.hidden = p < 0;
    host.classList.toggle("is-in-system", p >= 0);
    side.querySelectorAll<HTMLButtonElement>("[data-orrery-planet]").forEach(button => {
      if (Number(button.dataset.orreryPlanet) === p) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    const hubBtn = side.querySelector<HTMLButtonElement>("[data-orrery-hub]");
    if (p < 0) hubBtn?.setAttribute("aria-current", "true");
    else hubBtn?.removeAttribute("aria-current");
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
    if (p < 0) {
      canvas.setAttribute("aria-label", universeLabel);
      return;
    }
    const planet = B[p]!;
    const counts = planetCounts.get(p) ?? systemCounts(B, p);
    const name = planetName(planet.label);
    systemName.textContent = name;
    systemByline.textContent = planetByline(planet.label);
    systemByline.hidden = !systemByline.textContent;
    systemTopic.textContent = planet.label;
    systemMeta.textContent = `${notesLabel(counts.notes)} · ${counts.moons} moon${counts.moons === 1 ? "" : "s"}`;
    paintPlanetIcon(systemIcon, planet.label, planet.color, 13, !!planet.ringed);
    systemBar.style.setProperty("--icon", `${planetIconBox(13, !!planet.ringed)}px`);
    canvas.setAttribute("aria-label", `${name} system: ${planet.label}. Click a note to see its links. Press Escape to return to the universe.`);
  }

  /** Re-centre the world on a planet and fly in. Nothing on screen jumps: the camera absorbs the change of frame. */
  function enterSystem(p: number) {
    const planet = B[p];
    if (!planet || planet.kind !== "planet") return;
    exitSaver();
    lock = null;
    inertia = { vx: 0, vy: 0 };
    if (scope && scope.target && scope.planet === p) {
      glideTo(0, 0, sysK.fitK, 900);
      return;
    }
    view.x += X[p]! * view.k;
    view.y += Y[p]! * view.k;
    glide = null;
    const end = subtreeEnd(B, p);
    let reach = planet.r * 3;
    for (let i = p + 1; i < end; i++) reach = Math.max(reach, Math.hypot(X[i]! - X[p]!, Y[i]! - Y[p]!) + B[i]!.r);
    reach *= 1.08;
    const fit = systemFitK(reach, width, height);
    sysK = { fitK: fit, kMin: fit * 0.45, reach };
    const prev = scope && scope.target ? scope : null;
    scope = {
      planet: p,
      end,
      fade: prev ? 1 : (scope?.fade ?? 0),
      target: 1,
      prev: prev?.planet ?? -1,
      prevEnd: prev?.end ?? -1,
      prevFade: prev ? 1 : 0,
      scale: systemPlanetScale(planet),
    };
    focus = p;
    if (!prev) paused = false;
    if (selectedIdx != null && !inScope(selectedIdx)) clearSelection();
    if (selectedComet >= 0) clearSelection();
    glideTo(0, 0, fit, SYSTEM_GLIDE_MS);
    chime(planetStep(model, p), 0.6);
    chime(planetStep(model, p) + 4, 0.35, 0.45);
    if (isNarrowViewport(window.innerWidth)) setOrreryOpen(false, false);
    syncSystemUi();
  }

  function exitSystem() {
    if (!scope || !scope.target) return;
    view.x -= focusAt.x * view.k;
    view.y -= focusAt.y * view.k;
    glide = null;
    focus = -1;
    scope.target = 0;
    scope.prev = -1;
    paused = false;
    clearExits();
    glideTo(0, 0, fitK, SYSTEM_GLIDE_MS);
    syncSystemUi();
  }

  function clearExits() {
    exits = [];
    exitsFor = null;
    exitLayer.replaceChildren();
  }

  /** Links from the selected note to other systems become arrows on the stage edge, pointing toward them. */
  function syncExits() {
    const active = !!scope && scope.target === 1 && scope.fade > 0.98 && !!dial && dial.src >= 0;
    if (!active) {
      if (exitsFor) clearExits();
      return;
    }
    if (exitsFor !== dial) {
      exitsFor = dial;
      exits = systemExits(dial!.targets, planetOf, B, scope!.planet);
      exitLayer.replaceChildren(
        ...exits.map(exit => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "universe-exit-arrow";
          button.dataset.exitPlanet = String(exit.planet);
          const links = `${exit.targets.length} link${exit.targets.length === 1 ? "" : "s"}`;
          button.setAttribute("aria-label", `${links} to ${exit.label}`);
          button.innerHTML = `<span class="universe-exit-arrow__dart" aria-hidden="true"></span><span class="universe-exit-arrow__text"><strong>${escapeText(exit.label)}</strong><small>${links}</small></span>`;
          if (exit.planet >= 0) button.style.setProperty("--planet", B[exit.planet]!.color);
          button.addEventListener("click", event => {
            event.stopPropagation();
            travel(exit);
          });
          return button;
        }),
      );
    }
    const panels = overlayPanels();
    const cx = DRAWN[scope!.planet] ? SX[scope!.planet]! : width / 2;
    const cy = DRAWN[scope!.planet] ? SY[scope!.planet]! : height / 2;
    exits.forEach((exit, j) => {
      const button = exitLayer.children[j] as HTMLElement | undefined;
      if (!button) return;
      let dx = 0;
      let dy = 0;
      if (exit.planet >= 0) {
        dx = X[exit.planet]!;
        dy = Y[exit.planet]!;
      } else {
        for (const t of exit.targets) {
          dx += X[t]!;
          dy += Y[t]!;
        }
      }
      const at = clearEdgePoint(cx, cy, dx, dy, width, height, 56, panels);
      button.style.left = `${at.x}px`;
      button.style.top = `${at.y}px`;
      button.style.setProperty("--angle", `${at.angle}rad`);
    });
  }

  /** Panels floating over the stage, in canvas coordinates, that exit arrows must not sit under. */
  function overlayPanels(): Rect[] {
    const wrap = host.closest(".graph-wrap") ?? host;
    const origin = canvas.getBoundingClientRect();
    const out: Rect[] = [];
    wrap.querySelectorAll<HTMLElement>(".graph-toolbar, .universe-system, .universe-orrery, .graph-preview, .universe-replay, .universe-key").forEach(el => {
      if (el.hidden || getComputedStyle(el).visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top });
    });
    return out;
  }

  /** Follow a link out of this system: fly to the system it lands in and select the linked note there. */
  function travel(exit: SystemExit) {
    const target = exit.targets[0];
    if (target == null) return;
    if (exit.planet >= 0) {
      enterSystem(exit.planet);
      selectBody(target);
    } else {
      exitSystem();
      selectBody(target);
    }
    if (dial) dial.framed = exit.planet >= 0;
  }

  function onSystemKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !scope || !scope.target) return;
    const el = event.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    exitSystem();
  }

  orreryToggle.addEventListener("click", () => setOrreryOpen(!orrery.classList.contains("is-open")));
  side.querySelectorAll<HTMLButtonElement>("[data-orrery-planet]").forEach(button => {
    button.addEventListener("click", () => enterSystem(Number(button.dataset.orreryPlanet)));
  });
  side.querySelector<HTMLButtonElement>("[data-orrery-hub]")!.addEventListener("click", () => {
    if (scope && scope.target) exitSystem();
    else {
      lock = null;
      glideTo(0, 0, fitK, 1200);
    }
  });
  systemBar.querySelector<HTMLButtonElement>("[data-system-exit]")!.addEventListener("click", () => exitSystem());
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    syncSystemUi();
  });
  setOrreryOpen(readOrreryOpen(storage) && !isNarrowViewport(window.innerWidth), false);
  syncSystemUi();
  window.addEventListener("keydown", onSystemKey, true);

  function selectAt(clientX: number, clientY: number) {
    const hit = pick(clientX, clientY);
    if (hit.comet >= 0) {
      selectComet(hit.comet);
      return;
    }
    if (hit.body < 0) {
      clearSelection();
      return;
    }
    const now = performance.now();
    const doubled = lastClickIdx === hit.body && now - lastClickAt < 400;
    lastClickIdx = hit.body;
    lastClickAt = now;
    if (doubled) {
      if (B[hit.body]!.kind === "planet") enterSystem(hit.body);
      else frameBody(hit.body);
      return;
    }
    selectBody(hit.body);
  }

  // ---------- comets: follow and screensaver ----------
  function followComet(c: number) {
    if (!comets.length) return;
    followIdx = c;
    glide = null;
    lock = { kind: "comet", idx: c, k: solarZoomClamp(fitK * 3.2, kMin, kMax) };
  }

  function exitSaver() {
    if (!saverTimer) return;
    clearInterval(saverTimer);
    saverTimer = 0;
    lock = null;
    document.body.classList.remove("is-universe-saver");
  }

  function onSaverKey(event: KeyboardEvent) {
    if (event.key === "Escape") exitSaver();
  }

  // ---------- zoom & gestures ----------
  function zoomAt(clientX: number, clientY: number, factor: number) {
    lock = null;
    glide = null;
    const world = toWorld(clientX, clientY);
    const next = clampK(view.k * factor);
    Object.assign(view, cameraFromWorld(world, next, clientX, clientY, canvas.getBoundingClientRect()));
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 0.92);
    },
    { passive: false },
  );

  host.querySelectorAll<HTMLButtonElement>("[data-universe-zoom]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, button.dataset.universeZoom === "in" ? 1.18 : 0.85);
    });
  });

  const pointers = new Map<number, { x: number; y: number }>();
  let gestureOrigin = { x: 0, y: 0 };
  let gestureStart = { x: 0, y: 0 };
  let gesturePointerId = 1;
  let panned = false;
  let velocity = { vx: 0, vy: 0, at: 0, x: 0, y: 0 };
  let holdTimer = 0;
  let pinch: { dist: number; k: number; world: { x: number; y: number } } | null = null;

  const pointerIdOf = (event: PointerEvent) => event.pointerId ?? 1;

  function beginPinch() {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const mid = pinchMidpoint(a, b);
    pinch = { dist: pinchDistance(a, b), k: view.k, world: toWorld(mid.x, mid.y) };
    panned = true;
    clearTimeout(holdTimer);
  }

  function applyPinch() {
    if (!pinch || pointers.size < 2 || pinch.dist < 1) return;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const mid = pinchMidpoint(a, b);
    const next = clampK(pinch.k * (pinchDistance(a, b) / pinch.dist));
    Object.assign(view, cameraFromWorld(pinch.world, next, mid.x, mid.y, canvas.getBoundingClientRect()));
  }

  const onGestureMove = (move: PointerEvent) => {
    const id = pointerIdOf(move);
    if (!pointers.has(id)) return;
    pointers.set(id, { x: move.clientX, y: move.clientY });
    if (pointers.size >= 2) {
      if (!pinch) beginPinch();
      applyPinch();
      return;
    }
    if (id !== gesturePointerId || gather.holding) return;
    if (Math.hypot(move.clientX - gestureStart.x, move.clientY - gestureStart.y) < 4 && !panned) return;
    if (!panned) clearTimeout(holdTimer);
    panned = true;
    lock = null;
    view.x = gestureOrigin.x + (move.clientX - gestureStart.x);
    view.y = gestureOrigin.y + (move.clientY - gestureStart.y);
    const t = performance.now();
    const dtv = Math.max(1, t - velocity.at);
    velocity = {
      vx: 0.7 * ((move.clientX - velocity.x) / dtv) + 0.3 * velocity.vx,
      vy: 0.7 * ((move.clientY - velocity.y) / dtv) + 0.3 * velocity.vy,
      at: t,
      x: move.clientX,
      y: move.clientY,
    };
  };

  const onGestureUp = (up: PointerEvent) => {
    const id = pointerIdOf(up);
    if (!pointers.has(id)) return;
    pointers.delete(id);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    clearTimeout(holdTimer);
    window.removeEventListener("pointermove", onGestureMove);
    window.removeEventListener("pointerup", onGestureUp);
    window.removeEventListener("pointercancel", onGestureUp);
    if (gather.holding) {
      gather.holding = false;
      return;
    }
    if (panned) {
      if (!freeze && performance.now() - velocity.at < 60) inertia = { vx: velocity.vx, vy: velocity.vy };
      return;
    }
    selectAt(up.clientX, up.clientY);
  };

  canvas.addEventListener("pointerdown", event => {
    exitSaver();
    const id = pointerIdOf(event);
    if (pointers.size === 0) {
      panned = false;
      pinch = null;
      glide = null;
      inertia = { vx: 0, vy: 0 };
      gesturePointerId = id;
      gestureStart = { x: event.clientX, y: event.clientY };
      gestureOrigin = { x: view.x, y: view.y };
      velocity = { vx: 0, vy: 0, at: performance.now(), x: event.clientX, y: event.clientY };
      window.addEventListener("pointermove", onGestureMove);
      window.addEventListener("pointerup", onGestureUp);
      window.addEventListener("pointercancel", onGestureUp);
      const hit = pick(event.clientX, event.clientY);
      const planet = hit.body >= 0 ? planetOf[hit.body]! : -1;
      if (planet >= 0) {
        holdTimer = window.setTimeout(() => {
          if (panned || pointers.size !== 1) return;
          gather = { planet, g: gather.planet === planet ? gather.g : 0, holding: true };
          chime(planetStep(model, planet), 0.6);
        }, HOLD_MS);
      }
    }
    pointers.set(id, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) beginPinch();
  });

  canvas.addEventListener("pointermove", event => {
    pointerAt = toLocal(event.clientX, event.clientY);
    if (pointers.size) return;
    const hit = pick(event.clientX, event.clientY);
    const previous = hoverIdx;
    hoverIdx = hit.body;
    hoverComet = hit.comet;
    canvas.style.cursor = hit.body >= 0 || hit.comet >= 0 ? "pointer" : "grab";
    const hostRect = host.getBoundingClientRect();
    if (hit.comet >= 0) {
      tip.hidden = false;
      tip.textContent = `${comets[hit.comet]!.title} · comet`;
    } else if (hit.body >= 0) {
      const body = B[hit.body]!;
      tip.hidden = false;
      tip.textContent = body.kind === "planet" ? planetTip(body, notesIn(body)) : `${body.label} · ${kindLabel(body.kind)} · ${body.count}`;
      if (body.kind === "planet" && previous !== hit.body) chime(planetStep(model, hit.body), 0.35);
    } else {
      tip.hidden = true;
    }
    tip.style.left = `${event.clientX - hostRect.left + 12}px`;
    tip.style.top = `${event.clientY - hostRect.top + 12}px`;
  });

  canvas.addEventListener("pointerleave", () => {
    hoverIdx = -1;
    hoverComet = -1;
    pointerAt = null;
    tip.hidden = true;
  });

  // ---------- replay bar ----------
  const scrub = replayBar.querySelector<HTMLInputElement>("[data-replay-scrub]")!;
  const label = replayBar.querySelector<HTMLOutputElement>("[data-replay-label]")!;
  const playBtn = replayBar.querySelector<HTMLButtonElement>("[data-replay-play]")!;
  const speedBtn = replayBar.querySelector<HTMLButtonElement>("[data-replay-speed]")!;
  const exitBtn = replayBar.querySelector<HTMLButtonElement>("[data-replay-exit]")!;
  let labelDay = Number.NaN;

  function syncReplay() {
    playBtn.textContent = replay.playing ? "Pause" : replay.on && replay.u >= 1 ? "Replay" : "Play";
    exitBtn.hidden = !replay.on;
    replayBar.classList.toggle("is-playing", replay.on);
    if (!replay.on) {
      label.textContent = "Today";
      scrub.value = "1000";
      return;
    }
    const day = Math.floor(timeline.minDay + (timeline.maxDay - timeline.minDay) * replay.u);
    scrub.value = String(Math.round(replay.u * 1000));
    if (day === labelDay) return;
    labelDay = day;
    const count = countUpTo(timeline.dayLists[sunIdx]!, day);
    label.textContent = `${monthLabel(day)} · ${count.toLocaleString("en-AU")} notes`;
  }

  playBtn.addEventListener("click", () => {
    if (!replay.on || replay.u >= 1) {
      replay.on = true;
      replay.u = 0;
      replay.prevDay = timeline.minDay - 1;
      born.fill(-1e12);
      lock = null;
      glideTo(0, 0, focus >= 0 ? sysK.fitK : fitK, 900);
      replay.playing = true;
    } else {
      replay.playing = !replay.playing;
    }
    labelDay = Number.NaN;
    syncReplay();
  });
  speedBtn.addEventListener("click", () => {
    replay.speed = nextReplaySpeed(replay.speed);
    speedBtn.textContent = replaySpeedLabel(replay.speed);
  });
  scrub.addEventListener("input", () => {
    if (!replay.on) {
      replay.prevDay = timeline.minDay - 1;
      born.fill(-1e12);
    }
    replay.on = true;
    replay.playing = false;
    replay.u = Number(scrub.value) / 1000;
    syncReplay();
  });
  exitBtn.addEventListener("click", () => {
    replay.on = false;
    replay.playing = false;
    replay.u = 1;
    syncReplay();
  });
  const foldBtn = replayBar.querySelector<HTMLButtonElement>("[data-replay-fold]")!;
  function setReplayFolded(folded: boolean) {
    replayBar.classList.toggle("is-folded", folded);
    foldBtn.setAttribute("aria-expanded", String(!folded));
    foldBtn.title = folded ? "Show the Big Bang controls" : "Hide the Big Bang controls";
  }
  setReplayFolded(readReplayFolded(storage));
  foldBtn.addEventListener("click", () => {
    const folded = !replayBar.classList.contains("is-folded");
    setReplayFolded(folded);
    writeReplayFolded(folded, storage);
  });

  // ---------- resize ----------
  function applyHostSize() {
    const next = applySolarStageResize(
      { width, height, fitK, kMin, kMax, k: view.k, x: view.x, y: view.y },
      { width: host.clientWidth, height: host.clientHeight },
      model.reach,
      model.tightest,
    );
    if (next.width === width && next.height === height) return;
    width = next.width;
    height = next.height;
    fitK = next.fitK;
    kMin = next.kMin;
    kMax = next.kMax;
    view.k = next.k;
    view.x = next.x;
    view.y = next.y;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const sysFit = systemFitK(sysK.reach, width, height);
    sysK = { fitK: sysFit, kMin: sysFit * 0.45, reach: sysK.reach };
  }

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => applyHostSize()) : null;
  resizeObserver?.observe(host);

  // ---------- entrance and arrivals ----------
  if (!freeze) {
    const target = view.k;
    view.k = solarZoomClamp(target * 9, kMin, kMax);
    Object.assign(view, solarCamera({ x: 0, y: 0 }, view.k, width, height));
    glide = startGlide({ k: view.k, cx: 0, cy: 0 }, { k: target, cx: 0, cy: 0 }, performance.now(), width, ENTER_MS);
    let delay = ENTER_MS + 200;
    const order = new Map<number, number>();
    showerIds.forEach(id => {
      const body = bodyOfPage.get(id);
      if (body != null) order.set(body, order.size);
    });
    if (order.size) {
      shower = { t0: performance.now() + delay, order, chimed: new Set() };
      delay += order.size * SHOWER_STAGGER_MS + SHOWER_FLIGHT_MS;
    }
    if (flareToday) flare = { t0: performance.now() + ENTER_MS, angle: Math.random() * TAU };
    if (captured.length) {
      const belt = [...model.planets].sort((a, b) => a.a - b.a)[1]?.a ?? model.reach * 0.3;
      timers.push(
        window.setTimeout(() => {
          captured.forEach((id, j) => {
            const body = bodyOfPage.get(id);
            if (body == null) return;
            const angle = hashUnit(`capture:${id}`) * TAU;
            captures.push({ body, planet: planetOf[body]!, t0: performance.now() + 1600 + j * 2500, start: { x: Math.cos(angle) * belt, y: Math.sin(angle) * belt } });
          });
          const first = captures[0];
          if (first && first.planet >= 0) frameBody(first.planet);
          timers.push(
            window.setTimeout(() => {
              const planet = captures[0]?.planet ?? -1;
              if (planet >= 0) {
                chime(planetStep(model, planet), 0.45);
                chime(planetStep(model, planet) + 2, 0.3, 0.5);
              }
            }, 1600 + CAPTURE_MS),
          );
        }, delay),
      );
    }
  }

  document.addEventListener("keydown", onSaverKey);
  raf = requestAnimationFrame(loop);

  const mount = attachGraphSearch(
    () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      clearTimeout(holdTimer);
      timers.forEach(timer => clearTimeout(timer));
      exitSaver();
      document.removeEventListener("keydown", onSaverKey);
      window.removeEventListener("keydown", onSystemKey, true);
      window.removeEventListener("pointermove", onGestureMove);
      window.removeEventListener("pointerup", onGestureUp);
      window.removeEventListener("pointercancel", onGestureUp);
      host.innerHTML = "";
    },
    query => {
      options.search = query;
      if (query === lastQuery) return;
      lastQuery = query;
      hits = resolveSearchHits(model, query);
    },
  ) as SolarMount;
  mount.setLens = on => {
    lens = on;
  };
  mount.setAmbient = level => {
    ambient = level;
    nextAmbient = 0;
  };
  mount.setConstellations = saved => {
    figures = skyFigures(saved);
  };
  mount.followNextComet = () => {
    if (!comets.length) return;
    exitSystem();
    const next = (followIdx + 1) % comets.length;
    selectComet(next);
    followComet(next);
  };
  mount.flyToNearestHit = () => {
    if (!hits.size) return false;
    const local = scope && scope.target ? [...hits].filter(inScope) : [];
    if (scope && scope.target && !local.length) exitSystem();
    const { cx, cy } = centre();
    let best = -1;
    let bestD = Infinity;
    for (const i of local.length ? local : hits) {
      const d = Math.hypot(X[i]! - cx, Y[i]! - cy);
      if (d > 1e-6 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) best = hits.values().next().value as number;
    lock = null;
    glideTo(X[best]!, Y[best]!, Math.max(view.k, fitK * 12));
    selectBody(best);
    return true;
  };
  mount.startScreensaver = () => {
    if (!comets.length || saverTimer) return;
    exitSystem();
    clearSelection();
    document.body.classList.add("is-universe-saver");
    let c = Math.floor(Math.random() * comets.length);
    const next = () => {
      followComet(c);
      c = (c + 1) % comets.length;
    };
    next();
    saverTimer = window.setInterval(next, SAVER_MS);
  };
  return mount;
}
