/**
 * Pan / zoom / focus camera for the miniworld canvas.
 * Behaviour matches docs/professional-hub/network-ecology/mockups/miniworld.html
 */

import { OUTER, type TerrainHabitat } from './terrain';

export interface Camera {
  k: number;
  x: number;
  y: number;
}

export interface CamAnim {
  from: Camera;
  to: Camera;
  t0: number;
  dur: number;
}

export interface FitRegion {
  cx: number;
  cy: number;
  rTarget: number;
  habitat: TerrainHabitat;
}

export const MIN_K = 0.35;
export const MAX_K = 4;
export const DEFAULT_FOCUS_K = 1.5;
export const KEYBOARD_PAN = 60;

export function createCamera(partial?: Partial<Camera>): Camera {
  return { k: 1, x: 0, y: 0, ...partial };
}

export function cloneCamera(c: Camera): Camera {
  return { k: c.k, x: c.x, y: c.y };
}

export function assignCamera(dest: Camera, src: Camera): void {
  dest.k = src.k;
  dest.x = src.x;
  dest.y = src.y;
}

export function toWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.x) / cam.k, (sy - cam.y) / cam.k];
}

export function toScreen(cam: Camera, wx: number, wy: number): [number, number] {
  return [wx * cam.k + cam.x, wy * cam.k + cam.y];
}

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

/** Zoom centred on a screen point; clears any in-flight animation via caller. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): void {
  const nk = clampK(cam.k * factor);
  cam.x = sx - (sx - cam.x) * (nk / cam.k);
  cam.y = sy - (sy - cam.y) * (nk / cam.k);
  cam.k = nk;
}

/** Pan by screen-pixel deltas (drag). */
export function panBy(cam: Camera, dx: number, dy: number): void {
  cam.x += dx;
  cam.y += dy;
}

/** Wheel zoom: mockup uses Math.exp(-deltaY * 0.0015). */
export function wheelZoom(cam: Camera, sx: number, sy: number, deltaY: number): void {
  zoomAt(cam, sx, sy, Math.exp(-deltaY * 0.0015));
}

/** Pinch zoom: factor = newDistance / previousDistance. */
export function pinchZoom(
  cam: Camera,
  midSx: number,
  midSy: number,
  factor: number
): void {
  zoomAt(cam, midSx, midSy, factor);
}

/** Fit all live regions into the viewport with padding. */
export function fitTransform(
  width: number,
  height: number,
  regions: FitRegion[],
  pad = 40
): Camera {
  const vis = regions.filter((r) => r.rTarget > 0);
  if (!vis.length) {
    return { k: 1, x: width / 2, y: height / 2 };
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of vis) {
    const o = r.rTarget * (OUTER[r.habitat] ?? 1.32);
    x0 = Math.min(x0, r.cx - o);
    x1 = Math.max(x1, r.cx + o);
    y0 = Math.min(y0, r.cy - o - 30);
    y1 = Math.max(y1, r.cy + o);
  }
  const k = Math.min(
    3,
    Math.max(MIN_K, Math.min((width - pad * 2) / (x1 - x0), (height - pad * 2) / (y1 - y0)))
  );
  return {
    k,
    x: width / 2 - ((x0 + x1) / 2) * k,
    y: height / 2 - ((y0 + y1) / 2) * k
  };
}

/** Zoom target centred on viewport (for + / − buttons). */
export function zoomTarget(cam: Camera, width: number, height: number, factor: number): Camera {
  const nk = clampK(cam.k * factor);
  return {
    k: nk,
    x: width / 2 - (width / 2 - cam.x) * (nk / cam.k),
    y: height / 2 - (height / 2 - cam.y) * (nk / cam.k)
  };
}

/**
 * Start (or skip) a camera animation.
 * When reduceMotion is true, snaps immediately and returns null.
 */
export function animateTo(
  cam: Camera,
  target: Camera,
  reduceMotion: boolean,
  now = performance.now(),
  dur = 650
): CamAnim | null {
  if (reduceMotion) {
    assignCamera(cam, target);
    return null;
  }
  return { from: cloneCamera(cam), to: { ...target }, t0: now, dur };
}

/** Ease-in-out cubic step of an animation; returns true when finished. */
export function tickCameraAnim(cam: Camera, anim: CamAnim, now: number): boolean {
  const p = Math.min(1, (now - anim.t0) / anim.dur);
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  cam.k = anim.from.k + (anim.to.k - anim.from.k) * e;
  cam.x = anim.from.x + (anim.to.x - anim.from.x) * e;
  cam.y = anim.from.y + (anim.to.y - anim.from.y) * e;
  return p >= 1;
}

/** Focus on a world point (panel selection / Find me). */
export function focusOn(
  cam: Camera,
  width: number,
  height: number,
  wx: number,
  wy: number,
  reduceMotion: boolean,
  k = Math.max(cam.k, DEFAULT_FOCUS_K),
  now = performance.now(),
  panelOffsetX = 60
): CamAnim | null {
  return animateTo(
    cam,
    { k, x: width / 2 - panelOffsetX - wx * k, y: height / 2 - wy * k },
    reduceMotion,
    now
  );
}

export type CameraKeyResult =
  | { kind: 'none' }
  | { kind: 'handled'; clearAnim: boolean }
  | { kind: 'escape' }
  | { kind: 'fit' }
  | { kind: 'zoom'; factor: number };

/**
 * Keyboard: + − 0 arrows Esc (and = as alias for +).
 * Caller applies zoom / fit / escape; arrows mutate cam immediately.
 */
export function handleCameraKey(
  key: string,
  cam: Camera,
  width: number,
  height: number,
  step = KEYBOARD_PAN
): CameraKeyResult {
  switch (key) {
    case '+':
    case '=':
      return { kind: 'zoom', factor: 1.3 };
    case '-':
      return { kind: 'zoom', factor: 1 / 1.3 };
    case '0':
      return { kind: 'fit' };
    case 'ArrowLeft':
      cam.x += step;
      return { kind: 'handled', clearAnim: true };
    case 'ArrowRight':
      cam.x -= step;
      return { kind: 'handled', clearAnim: true };
    case 'ArrowUp':
      cam.y += step;
      return { kind: 'handled', clearAnim: true };
    case 'ArrowDown':
      cam.y -= step;
      return { kind: 'handled', clearAnim: true };
    case 'Escape':
      return { kind: 'escape' };
    default:
      return { kind: 'none' };
  }
}

/** Convenience: apply a keyboard zoom at viewport centre. */
export function applyKeyboardZoom(
  cam: Camera,
  width: number,
  height: number,
  factor: number
): void {
  zoomAt(cam, width / 2, height / 2, factor);
}

/**
 * Preserve world centre under the viewport when resizing.
 * Pass previous width/height; updates cam.x/y for the new size.
 */
export function retainWorldCentre(
  cam: Camera,
  prevW: number,
  prevH: number,
  nextW: number,
  nextH: number
): void {
  const cx = (prevW / 2 - cam.x) / cam.k;
  const cy = (prevH / 2 - cam.y) / cam.k;
  cam.x = nextW / 2 - cx * cam.k;
  cam.y = nextH / 2 - cy * cam.k;
}

/** Screen-space size factor used by creature / plant LOD (mockup sizeFactor). */
export function sizeFactor(k: number): number {
  return Math.pow(k, -0.4);
}
