/**
 * Swimlane flowchart used by Tasks Branch.
 * Geometry from docs/proposals/graph-reference/branch.html (port exactly).
 */
import { fx } from './scene.js';

/** Port exactly from the Branch reference `G` block. */
export const FLOW_G = {
  boxW: 164,
  boxH: 64,
  colGap: 44,
  rowPitch: 84,
  laneHeadH: 46,
  lanePadX: 20,
  lanePadB: 22,
  laneGap: 14,
  radius: 12,
  milestoneR: 32,
  corner: 8,
  port: 10
};

/** Derived from --line (rgba(23,55,94,.10)); no new kit variable. */
export const FLOW_LANE_FILL = 'rgba(23,55,94,.035)';
/** Derived from --elev-1 shadow ink. */
export const FLOW_BOX_SHADOW = 'rgba(20,35,70,.06)';
/** Do-first badge fill — no kit token. */
export const FLOW_BADGE_FILL = '#fff3e6';
/** Selected halo — Wave at 16%. */
export const FLOW_SELECT_HALO = 'rgba(55,111,183,.16)';
export const FLOW_BOX_STROKE = 'rgba(23,55,94,.12)';
export const FLOW_OPEN_STRIPE = '#c9ccd6';
export const FLOW_CLARE_FILL = '#fbf9fd';

export const FLOW_EASE = 'cubic-bezier(.2,.8,.2,1)';
export const FLOW_OVERSHOOT = 'cubic-bezier(.34,1.3,.64,1)';

/**
 * Orthogonal route: exit source right-middle, run to the channel just before
 * the target column, turn with Q of radius 8, enter the target left side.
 * Same column: bottom-middle to top-middle.
 */
export function orthogonalPath(x0, y0, x1, y1, options = {}) {
  const g = { ...FLOW_G, ...options.g };
  const portOffset = options.portOffset ?? 0;
  const srcCol = options.srcCol;
  const dstCol = options.dstCol;
  const srcX = options.srcX ?? x0 - g.boxW;
  const dstX = options.dstX ?? x1;
  if (srcCol != null && dstCol != null && srcCol === dstCol) {
    const x = srcX + g.boxW / 2;
    const up = y1 < y0;
    const yStart = up ? y0 - g.boxH / 2 : y0 + g.boxH / 2;
    const yEnd = up ? y1 + g.boxH / 2 : y1 - g.boxH / 2;
    return `M${fx(x)} ${fx(yStart)}V${fx(yEnd)}`;
  }
  const xStart = x0;
  const yStart = y0;
  const xEnd = x1;
  const yEnd = y1 + portOffset;
  if (Math.abs(yStart - yEnd) < 1) return `M${fx(xStart)} ${fx(yStart)}H${fx(xEnd)}`;
  const cx = dstX - g.colGap / 2;
  const r = g.corner;
  const dir = yEnd > yStart ? 1 : -1;
  return `M${fx(xStart)} ${fx(yStart)}H${fx(cx - r)}Q${fx(cx)} ${fx(yStart)} ${fx(cx)} ${fx(yStart + dir * r)}V${fx(yEnd - dir * r)}Q${fx(cx)} ${fx(yEnd)} ${fx(cx + r)} ${fx(yEnd)}H${fx(xEnd)}`;
}

export function portOffsetFor(edge, incoming, positions) {
  const target = positions.get(edge.to);
  if (!target) return 0;
  const ins = incoming.filter((item) => {
    const src = positions.get(item.from);
    return src && src.col !== target.col;
  });
  const above = ins.filter((item) => (positions.get(item.from)?.y ?? 0) < target.y - 1);
  const below = ins.filter((item) => (positions.get(item.from)?.y ?? 0) > target.y + 1);
  if (above.includes(edge)) return -(above.indexOf(edge) + 1) * FLOW_G.port;
  if (below.includes(edge)) return (below.indexOf(edge) + 1) * FLOW_G.port;
  return 0;
}

export function buildFlowchartLanes(input, { width = 960, height = 640 } = {}) {
  return { width, height, label: input.label ?? 'Flowchart', nodes: [], hits: [] };
}
