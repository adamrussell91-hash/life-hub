/**
 * Transit lines — geometry and motion constants for Tasks Graph Lines.
 * Numbers come from docs/proposals/graph-reference/lines.html (port exactly).
 */
import { fx } from './scene.js';

/** Port exactly from the Lines reference `G` block. */
export const TRANSIT_G = {
  padL: 44,
  termGap: 22,
  trackW: 7,
  branchW: 4.5,
  travelledOpacity: 0.32,
  labelY: -24,
  subY: 30,
  ghostLabelY: 50,
  branchDrop: 78,
  branchElbow: 16,
  r: { done: 8, open: 8, current: 11, waiting: 8, blocked: 8, suggested: 8, milestone: 12, branch: 6 },
  stroke: { open: 3.5, current: 4.5, halo: 2.5 },
  termH: 30,
  termPadX: 14,
  minStep: 118,
  vStep: 64,
  vTrackX: 22,
  vTrackW: 6,
  barrierW: 7,
  barrierH: 30,
  barrierRx: 3.5,
  hereR: 18,
  ghostR: 13,
  addR: 20,
  linePadTop: 22
};

export const TRANSIT_EASE = 'cubic-bezier(.2,.8,.2,1)';
export const TRANSIT_OVERSHOOT = 'cubic-bezier(.34,1.3,.64,1)';

const measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

export function measureText(text, font) {
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export function fitText(text, font, max) {
  if (measureText(text, font) <= max) return text;
  let next = text;
  while (next.length > 1 && measureText(`${next}…`, font) > max) next = next.slice(0, -1);
  return `${next}…`;
}

export function terminusWidth(label, date) {
  return Math.ceil(measureText(`${label} · ${date}`, '600 13px Inter, ui-sans-serif, sans-serif')) + TRANSIT_G.termPadX * 2;
}

export function transitStep(width, stationCount, termW) {
  const n = Math.max(stationCount, 1);
  const trackEnd = width - termW - 4;
  return (trackEnd - TRANSIT_G.termGap - TRANSIT_G.padL) / (n - 0.5);
}

export function transitXs(count, step) {
  return Array.from({ length: count }, (_, i) => TRANSIT_G.padL + i * step);
}

export function transitTerminusX(lastX, step) {
  return lastX + step * 0.5 + TRANSIT_G.termGap;
}

export function branchPath(x, y, endX) {
  const e = TRANSIT_G.branchElbow;
  const by = y + TRANSIT_G.branchDrop;
  return `M${fx(x)} ${fx(y)}V${fx(by - e)}Q${fx(x)} ${fx(by)} ${fx(x + e)} ${fx(by)}H${fx(endX)}`;
}

export function verticalBranchPath(x0, y, count) {
  const bx = x0 + 30;
  const by = y + 44;
  return `M${fx(x0)} ${fx(y)}V${fx(y + 26)}Q${fx(x0)} ${fx(y + 36)} ${fx(x0 + 10)} ${fx(y + 36)}H${fx(bx)}V${fx(by + (count - 1) * 52)}`;
}

/** Kept for older callers. Lines now paints from TRANSIT_G directly. */
export function buildTransitLine(input, { width = 720, height = 88 } = {}) {
  const stations = input.stations ?? [];
  const n = Math.max(1, stations.length);
  const termW = terminusWidth(input.terminusLabel ?? 'End', input.terminusDate ?? '');
  const step = transitStep(width, n, termW);
  const xs = transitXs(n, step);
  const y = step < TRANSIT_G.minStep ? 52 : 40;
  const placed = stations.map((station, i) => ({
    ...station,
    x: xs[i],
    y,
    r: station.kind === 'milestone' ? TRANSIT_G.r.milestone : TRANSIT_G.r.open
  }));
  return { width, height, stations: placed, path: placed.map((s, i) => `${i ? 'L' : 'M'}${s.x} ${s.y}`).join(' ') };
}

export function wrapTransitStations(stations, width) {
  return buildTransitLine({ stations }, { width }).stations.map((s) => ({ ...s, row: 0 }));
}
