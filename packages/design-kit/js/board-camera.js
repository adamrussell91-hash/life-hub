/**
 * Pan, zoom, pinch, keyboard and animated focus for an SVG or canvas board.
 * A camera is { k, x, y }: screen = world · k + (x, y). Pure functions on a plain object, so a
 * view drives an SVG transform from it. Reduced motion jumps straight to the end state.
 */
import { EASE, MOTION } from './hub-motion-engine.js';
import { prefersReducedMotion } from './hub-motion.js';

export const MIN_K = 0.1;
export const MAX_K = 4;
export const KEY_PAN = 60;

export const createCamera = (partial = {}) => ({ k: 1, x: 0, y: 0, ...partial });
export const cloneCamera = (c) => ({ k: c.k, x: c.x, y: c.y });
export const assignCamera = (dest, src) => { dest.k = src.k; dest.x = src.x; dest.y = src.y; };
export const toWorld = (cam, sx, sy) => [(sx - cam.x) / cam.k, (sy - cam.y) / cam.k];
export const toScreen = (cam, wx, wy) => [wx * cam.k + cam.x, wy * cam.k + cam.y];
export const clampK = (k, min = MIN_K, max = MAX_K) => Math.min(max, Math.max(min, k));

/** Zoom about a screen point. */
export function zoomAt(cam, sx, sy, factor, min = MIN_K, max = MAX_K) {
  const k = clampK(cam.k * factor, min, max);
  cam.x = sx - (sx - cam.x) * (k / cam.k);
  cam.y = sy - (sy - cam.y) * (k / cam.k);
  cam.k = k;
}

export function panBy(cam, dx, dy) {
  cam.x += dx;
  cam.y += dy;
}

export function wheelZoom(cam, sx, sy, deltaY, min = MIN_K, max = MAX_K) {
  zoomAt(cam, sx, sy, Math.exp(-deltaY * 0.0015), min, max);
}

/** A camera that fits a { x, y, w, h } world frame inside the viewport. */
export function fitFrameCamera(frame, viewport, pad = 16, min = MIN_K, max = MAX_K) {
  const k = clampK(Math.min((viewport.w - pad * 2) / frame.w, (viewport.h - pad * 2) / frame.h), min, max);
  return { k, x: (viewport.w - frame.w * k) / 2 - frame.x * k, y: (viewport.h - frame.h * k) / 2 - frame.y * k };
}

/** The camera that centres a world point at zoom k, leaving `offsetX` for a side panel. */
export function focusPoint(cam, viewport, wx, wy, k = cam.k, offsetX = 0) {
  return { k, x: (viewport.w - offsetX) / 2 - wx * k, y: viewport.h / 2 - wy * k };
}

/** Keep the world point under the viewport centre when the viewport resizes. */
export function retainCentre(cam, prev, next) {
  const cx = (prev.w / 2 - cam.x) / cam.k;
  const cy = (prev.h / 2 - cam.y) / cam.k;
  cam.x = next.w / 2 - cx * cam.k;
  cam.y = next.h / 2 - cy * cam.k;
}

/**
 * Move to a target camera. Reduced motion snaps and returns null; otherwise returns the
 * animation record for `tickCamera`.
 */
export function animateTo(cam, target, { reduceMotion = prefersReducedMotion(), now = performance.now(), dur = MOTION.settle * 1.6 } = {}) {
  if (reduceMotion) {
    assignCamera(cam, target);
    return null;
  }
  return { from: cloneCamera(cam), to: { ...target }, t0: now, dur };
}

/** Advance an animation; true when it has finished. */
export function tickCamera(cam, anim, now) {
  const p = Math.min(1, (now - anim.t0) / anim.dur);
  const e = EASE(p);
  cam.k = anim.from.k + (anim.to.k - anim.from.k) * e;
  cam.x = anim.from.x + (anim.to.x - anim.from.x) * e;
  cam.y = anim.from.y + (anim.to.y - anim.from.y) * e;
  return p >= 1;
}

/** + − 0 arrows Esc. Arrows move the camera now; the caller applies zoom, fit and escape. */
export function cameraKey(key, cam, step = KEY_PAN) {
  switch (key) {
    case '+':
    case '=':
      return { kind: 'zoom', factor: 1.3 };
    case '-':
      return { kind: 'zoom', factor: 1 / 1.3 };
    case '0':
      return { kind: 'fit' };
    case 'ArrowLeft': cam.x += step; return { kind: 'pan' };
    case 'ArrowRight': cam.x -= step; return { kind: 'pan' };
    case 'ArrowUp': cam.y += step; return { kind: 'pan' };
    case 'ArrowDown': cam.y -= step; return { kind: 'pan' };
    case 'Escape': return { kind: 'escape' };
    default: return { kind: 'none' };
  }
}
