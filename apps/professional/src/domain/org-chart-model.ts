/**
 * Pure model for the drag-and-connect org chart editor.
 *
 * Every box on the chart is a Position (a role that outlasts its holder)
 * with, optionally, the person who holds it. Every line is an explicit
 * structure link between two boxes. Nothing here talks to the network.
 */

import type { OrgStructurePayload } from '@/api/org-structure';

export type ChartLineKind = 'reports_to' | 'works_with' | 'shares_authority_with';

export const CHART_LINE_KINDS: ChartLineKind[] = ['reports_to', 'works_with', 'shares_authority_with'];

export interface ChartBox {
  ref: string;
  id: string;
  title: string;
  holderRef: string | null;
  holderName: string | null;
  holderLinkId: string | null;
  unitRef: string | null;
  unitName: string | null;
}

export interface ChartLine {
  id: string;
  kind: ChartLineKind;
  /** For `reports_to`, the person/role who reports. */
  source: string;
  /** For `reports_to`, the person/role they report to. */
  target: string;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export const BOX_W = 184;
export const BOX_H = 84;
const GAP_X = 36;
const GAP_Y = 72;
const MARGIN = 32;
export const GRID = 8;

function isCurrent(link: Record<string, unknown>): boolean {
  return link.status === 'current' || link.status === 'active';
}

export function buildChartModel(
  structure: OrgStructurePayload,
  peopleNames: Record<string, string> = {}
): { boxes: ChartBox[]; lines: ChartLine[] } {
  const unitNames = new Map(structure.units.map((u) => [`shared:unit:${u.id}`, u.name]));
  const links = (structure.links ?? []).filter(isCurrent);
  const nodeByRef = new Map(structure.graph.nodes.map((n) => [n.ref, n]));

  const boxes: ChartBox[] = structure.positions
    .filter((p) => p.lifecycle_status === 'active')
    .map((p) => {
      const ref = `shared:position:${p.id}`;
      const holds = links.find((l) => l.relationship_type === 'holds_position' && l.target_ref === ref);
      const holderRef = typeof holds?.source_ref === 'string' ? holds.source_ref : null;
      const holderId = holderRef?.split(':')[2] ?? '';
      const graphName = nodeByRef.get(ref)?.holder?.display_name ?? null;
      return {
        ref,
        id: p.id,
        title: p.title,
        holderRef,
        holderName: holderRef ? graphName || peopleNames[holderId] || 'Someone' : null,
        holderLinkId: typeof holds?.id === 'string' ? holds.id : null,
        unitRef: p.unit_ref,
        unitName: p.unit_ref ? unitNames.get(p.unit_ref) ?? null : null
      };
    });

  const boxRefs = new Set(boxes.map((b) => b.ref));
  const lines: ChartLine[] = [];
  for (const link of links) {
    const kind = link.relationship_type as ChartLineKind;
    if (!CHART_LINE_KINDS.includes(kind)) continue;
    const source = String(link.source_ref ?? '');
    const target = String(link.target_ref ?? '');
    if (!boxRefs.has(source) || !boxRefs.has(target) || source === target) continue;
    lines.push({ id: String(link.id), kind, source, target });
  }
  return { boxes, lines };
}

/**
 * Rows by reporting depth: whoever reports to nobody sits on the top row,
 * their reports one row down, and so on. Cycles are cut, never looped.
 */
export function reportingDepths(boxes: ChartBox[], lines: ChartLine[]): Map<string, number> {
  const bossOf = new Map<string, string>();
  for (const line of lines) {
    if (line.kind === 'reports_to' && !bossOf.has(line.source)) bossOf.set(line.source, line.target);
  }
  const depth = new Map<string, number>();
  for (const box of boxes) {
    const seen = new Set<string>([box.ref]);
    let d = 0;
    let cur = bossOf.get(box.ref);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      d += 1;
      cur = bossOf.get(cur);
    }
    depth.set(box.ref, d);
  }
  return depth;
}

/**
 * Tidy tree-ish layout: rows by reporting depth, reports grouped under their
 * boss, bosses with the biggest teams first. Boxes with no lines at all sit
 * on their own row at the bottom, waiting to be connected.
 */
export function autoLayout(boxes: ChartBox[], lines: ChartLine[]): Record<string, ChartPoint> {
  const depth = reportingDepths(boxes, lines);
  const bossOf = new Map<string, string>();
  const reportCount = new Map<string, number>();
  const connected = new Set<string>();
  for (const line of lines) {
    connected.add(line.source);
    connected.add(line.target);
    if (line.kind !== 'reports_to') continue;
    if (!bossOf.has(line.source)) bossOf.set(line.source, line.target);
    reportCount.set(line.target, (reportCount.get(line.target) ?? 0) + 1);
  }
  const rows = new Map<number, ChartBox[]>();
  const loose: ChartBox[] = [];
  for (const box of boxes) {
    if (!connected.has(box.ref) && boxes.length > 1) {
      loose.push(box);
      continue;
    }
    const d = depth.get(box.ref) ?? 0;
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d)!.push(box);
  }
  const out: Record<string, ChartPoint> = {};
  const order = [...rows.keys()].sort((a, b) => a - b);
  for (const d of order) {
    const row = rows.get(d)!;
    // Keep each boss's reports together, in the boss's left-to-right order.
    row.sort((a, b) => {
      const ax = out[bossOf.get(a.ref) ?? '']?.x ?? 0;
      const bx = out[bossOf.get(b.ref) ?? '']?.x ?? 0;
      return (
        ax - bx ||
        (reportCount.get(b.ref) ?? 0) - (reportCount.get(a.ref) ?? 0) ||
        a.title.localeCompare(b.title)
      );
    });
    row.forEach((box, i) => {
      out[box.ref] = { x: MARGIN + i * (BOX_W + GAP_X), y: MARGIN + d * (BOX_H + GAP_Y) };
    });
  }
  const looseRow = order.length ? order[order.length - 1]! + 1 : 0;
  loose
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((box, i) => {
      out[box.ref] = { x: MARGIN + i * (BOX_W + GAP_X), y: MARGIN + looseRow * (BOX_H + GAP_Y) };
    });
  return out;
}

/** Saved positions win; any box without one gets a free spot below the rest. */
export function resolveLayout(
  boxes: ChartBox[],
  lines: ChartLine[],
  saved: Record<string, ChartPoint> = {}
): Record<string, ChartPoint> {
  const hasSaved = boxes.some((b) => saved[b.ref]);
  if (!hasSaved) return autoLayout(boxes, lines);
  const out: Record<string, ChartPoint> = {};
  let maxY = MARGIN - (BOX_H + GAP_Y);
  for (const box of boxes) {
    const p = saved[box.ref];
    if (p) {
      out[box.ref] = { x: p.x, y: p.y };
      maxY = Math.max(maxY, p.y);
    }
  }
  const newRowY = maxY + BOX_H + GAP_Y;
  let i = 0;
  for (const box of boxes) {
    if (out[box.ref]) continue;
    out[box.ref] = { x: MARGIN + i * (BOX_W + GAP_X), y: newRowY };
    i += 1;
  }
  return out;
}

/** A free spot for one new box: right of everything on the top-most free row. */
export function nextFreeSpot(positions: Record<string, ChartPoint>): ChartPoint {
  const points = Object.values(positions);
  if (!points.length) return { x: MARGIN, y: MARGIN };
  const maxY = Math.max(...points.map((p) => p.y));
  const onRow = points.filter((p) => p.y === maxY);
  const maxX = Math.max(...onRow.map((p) => p.x));
  return { x: maxX + BOX_W + GAP_X, y: maxY };
}

export function snap(value: number): number {
  return Math.max(0, Math.round(value / GRID) * GRID);
}

export function boardSize(positions: Record<string, ChartPoint>): { width: number; height: number } {
  const points = Object.values(positions);
  const width = Math.max(640, ...points.map((p) => p.x + BOX_W + MARGIN * 4));
  const height = Math.max(420, ...points.map((p) => p.y + BOX_H + MARGIN * 4));
  return { width, height };
}

/**
 * SVG path for a line. Reporting lines are org-chart elbows from the boss's
 * bottom edge to the report's top edge; peer lines join the nearest sides.
 */
export function linePath(kind: ChartLineKind, from: ChartPoint, to: ChartPoint): string {
  if (kind === 'reports_to') {
    // from = report, to = boss.
    const bx = to.x + BOX_W / 2;
    const by = to.y + BOX_H;
    const rx = from.x + BOX_W / 2;
    const ry = from.y;
    if (ry > by + 8) {
      const midY = Math.round((by + ry) / 2);
      return `M ${bx} ${by} V ${midY} H ${rx} V ${ry}`;
    }
    // Report drawn level with or above the boss: join the sides instead.
    return sidePath(to, from);
  }
  return sidePath(from, to);
}

function sidePath(a: ChartPoint, b: ChartPoint): string {
  const acx = a.x + BOX_W / 2;
  const acy = a.y + BOX_H / 2;
  const bcx = b.x + BOX_W / 2;
  const bcy = b.y + BOX_H / 2;
  if (Math.abs(acx - bcx) >= Math.abs(acy - bcy)) {
    const ax = acx < bcx ? a.x + BOX_W : a.x;
    const bx = acx < bcx ? b.x : b.x + BOX_W;
    const midX = Math.round((ax + bx) / 2);
    return `M ${ax} ${acy} H ${midX} V ${bcy} H ${bx}`;
  }
  const ay = acy < bcy ? a.y + BOX_H : a.y;
  const by = acy < bcy ? b.y : b.y + BOX_H;
  const midY = Math.round((ay + by) / 2);
  return `M ${acx} ${ay} V ${midY} H ${bcx} V ${by}`;
}

export function boxLabel(box: ChartBox): string {
  return box.holderName ? `${box.holderName} (${box.title})` : box.title;
}

/** One plain-English sentence per line, e.g. "Sam (Deputy) reports to Jo (Principal)". */
export function describeLine(line: ChartLine, boxes: ChartBox[]): string {
  const a = boxes.find((b) => b.ref === line.source);
  const b = boxes.find((x) => x.ref === line.target);
  const left = a ? boxLabel(a) : 'Unknown';
  const right = b ? boxLabel(b) : 'Unknown';
  if (line.kind === 'reports_to') return `${left} reports to ${right}`;
  if (line.kind === 'works_with') return `${left} works with ${right}`;
  return `${left} shares authority with ${right}`;
}

export const LINE_KIND_LABELS: Record<ChartLineKind, string> = {
  reports_to: 'Reports to',
  works_with: 'Works with',
  shares_authority_with: 'Shares authority'
};
