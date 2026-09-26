/**
 * "Your time with …" multi-lane SVG (BUILD-PLAN 1.5).
 * Height = rows × 32px + 24px axis (C3). Collision pass on labels (C1).
 */

import type { OrganisationPeopleStep, OrganisationTimelineLane } from './organisation-model';

const ROW_H = 32;
const AXIS_H = 24;
const PAD_X = 72;
const PAD_R = 16;

export interface TimelineLayout {
  width: number;
  height: number;
  lanes: Array<{
    id: string;
    label: string;
    y: number;
    bars: Array<{ x: number; w: number; label: string; labelX: number; showLabel: boolean }>;
    points: Array<{ x: number; label: string; labelX: number; showLabel: boolean }>;
  }>;
  peopleLine: Array<{ x: number; y: number; count: number }>;
  peoplePath: string;
  axisLabels: Array<{ x: number; text: string }>;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function layoutOrganisationTimeline(input: {
  lanes: OrganisationTimelineLane[];
  peopleSteps: OrganisationPeopleStep[];
  domainStart: string;
  domainEnd: string;
  width?: number;
}): TimelineLayout {
  const width = input.width ?? 900;
  const startMs = Date.parse(input.domainStart);
  const endMs = Date.parse(input.domainEnd);
  const span = Math.max(1, endMs - startMs);
  const xAt = (iso: string) => PAD_X + ((Date.parse(iso) - startMs) / span) * (width - PAD_X - PAD_R);

  const laneOrder: Array<'work_study' | 'events' | 'roles'> = ['work_study', 'events', 'roles'];
  const laneLabels: Record<string, string> = {
    work_study: 'WORK',
    events: 'EVENTS',
    roles: 'ROLES'
  };

  const grouped = laneOrder.map((kind, row) => {
    const items = input.lanes.filter((l) => l.kind === kind);
    const y = row * ROW_H + ROW_H / 2;
    const bars: TimelineLayout['lanes'][0]['bars'] = [];
    const points: TimelineLayout['lanes'][0]['points'] = [];

    for (const item of items) {
      const x0 = xAt(item.start);
      if (kind === 'events' || !item.end) {
        points.push({ x: x0, label: item.label, labelX: x0, showLabel: true });
      } else {
        const x1 = xAt(item.end);
        const w = Math.max(4, x1 - x0);
        bars.push({ x: x0, w, label: item.label, labelX: x0 + w / 2, showLabel: true });
      }
    }

    // Collision: hide overlapping labels
    const approx = (label: string) => Math.min(120, 6 + label.length * 5.5);
    const all = [
      ...bars.map((b) => ({ x: b.labelX, set: (v: boolean) => (b.showLabel = v), label: b.label })),
      ...points.map((p) => ({ x: p.labelX, set: (v: boolean) => (p.showLabel = v), label: p.label }))
    ].sort((a, b) => a.x - b.x);
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1]!;
      const cur = all[i]!;
      if (Math.abs(cur.x - prev.x) < (approx(prev.label) + approx(cur.label)) / 2) {
        cur.set(false);
      }
    }

    return {
      id: kind,
      label: laneLabels[kind]!,
      y,
      bars,
      points
    };
  });

  const chartBottom = laneOrder.length * ROW_H;
  const peopleBaseline = chartBottom + 4;
  const peopleMax = input.peopleSteps.reduce((m, s) => Math.max(m, s.count), 1);
  const peopleLine = input.peopleSteps.map((s) => ({
    x: clamp(xAt(s.at), PAD_X, width - PAD_R),
    y: peopleBaseline + AXIS_H - 8 - (s.count / peopleMax) * (AXIS_H - 10),
    count: s.count
  }));

  const peoplePath =
    peopleLine.length === 0
      ? ''
      : peopleLine.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const startY = new Date(input.domainStart).getUTCFullYear();
  const endY = new Date(input.domainEnd).getUTCFullYear();
  const axisLabels = [
    { x: PAD_X, text: String(startY) },
    { x: width - PAD_R, text: endY >= new Date().getUTCFullYear() ? 'now' : String(endY) }
  ];

  return {
    width,
    height: laneOrder.length * ROW_H + AXIS_H,
    lanes: grouped,
    peopleLine,
    peoplePath,
    axisLabels
  };
}

export function renderOrganisationTimelineSvg(input: {
  lanes: OrganisationTimelineLane[];
  peopleSteps: OrganisationPeopleStep[];
  domainStart: string;
  domainEnd: string;
  width?: number;
}): SVGSVGElement {
  const layout = layoutOrganisationTimeline(input);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(layout.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Your time with this organisation');
  svg.style.height = `${layout.height}px`;

  for (const lane of layout.lanes) {
    const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lab.setAttribute('x', '8');
    lab.setAttribute('y', String(lane.y + 4));
    lab.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    lab.setAttribute('font-size', '10');
    lab.setAttribute('font-weight', '600');
    lab.setAttribute('fill', 'var(--muted)');
    lab.textContent = lane.label;
    svg.append(lab);

    for (const bar of lane.bars) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(bar.x));
      r.setAttribute('y', String(lane.y - 8));
      r.setAttribute('width', String(bar.w));
      r.setAttribute('height', '16');
      r.setAttribute('rx', '4');
      r.setAttribute('fill', 'var(--wave)');
      r.setAttribute('fill-opacity', '0.35');
      r.setAttribute('stroke', 'var(--wave)');
      r.setAttribute('stroke-width', '1');
      svg.append(r);
      if (bar.showLabel) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(bar.labelX));
        t.setAttribute('y', String(lane.y - 12));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', 'var(--ink)');
        t.textContent = bar.label;
        svg.append(t);
      }
    }

    for (const pt of lane.points) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(pt.x));
      c.setAttribute('cy', String(lane.y));
      c.setAttribute('r', '4');
      c.setAttribute('fill', 'var(--depth)');
      svg.append(c);
      if (pt.showLabel) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(pt.labelX));
        t.setAttribute('y', String(lane.y - 10));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', 'var(--muted)');
        t.textContent = pt.label;
        svg.append(t);
      }
    }
  }

  if (layout.peoplePath) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', layout.peoplePath);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'var(--depth)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.append(line);
    for (const p of layout.peopleLine) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(p.x));
      c.setAttribute('cy', String(p.y));
      c.setAttribute('r', '2.5');
      c.setAttribute('fill', 'var(--depth)');
      svg.append(c);
    }
  }

  for (const ax of layout.axisLabels) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(ax.x));
    t.setAttribute('y', String(layout.height - 4));
    t.setAttribute('text-anchor', ax.text === 'now' ? 'end' : 'start');
    t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    t.setAttribute('font-size', '10');
    t.setAttribute('fill', 'var(--muted)');
    t.textContent = ax.text;
    svg.append(t);
  }

  return svg;
}

export const TIMELINE_ROW_H = ROW_H;
export const TIMELINE_AXIS_H = AXIS_H;
