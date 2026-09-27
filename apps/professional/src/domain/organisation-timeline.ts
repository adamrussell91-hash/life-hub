/**
 * "Your time with …" multi-lane SVG (BUILD-PLAN 1.5; FIX-BRIEF-01 A3/A4).
 * Height = rows × 32px + 24px axis (C3). Labels inside bars (C1). Open-ended
 * work/roles bars run to now (C6). People line is a stepped area behind lanes.
 */

import type { OrganisationPeopleStep, OrganisationTimelineLane } from './organisation-model';

const ROW_H = 32;
const AXIS_H = 24;
const PAD_X = 72;
const PAD_R = 48;
const BAR_H = 16;
const LABEL_INSET = 8;

export interface TimelineLayout {
  width: number;
  height: number;
  lanes: Array<{
    id: string;
    label: string;
    y: number;
    bars: Array<{
      x: number;
      w: number;
      label: string;
      labelX: number;
      labelY: number;
      labelAnchor: 'start' | 'middle' | 'end';
      labelInside: boolean;
      showLabel: boolean;
    }>;
    points: Array<{
      x: number;
      label: string;
      labelX: number;
      labelY: number;
      labelAnchor: 'start' | 'middle' | 'end';
      showLabel: boolean;
    }>;
  }>;
  peopleLine: Array<{ x: number; y: number; count: number }>;
  peoplePath: string;
  peopleAreaPath: string;
  peopleCountLabel: { x: number; y: number; text: string } | null;
  axisLabels: Array<{ x: number; text: string }>;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function approxLabelW(label: string): number {
  return Math.min(220, 6 + label.length * 5.5);
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
  const plotR = width - PAD_R;
  const xAt = (iso: string) =>
    clamp(PAD_X + ((Date.parse(iso) - startMs) / span) * (plotR - PAD_X), PAD_X, plotR);
  const nowX = xAt(input.domainEnd);

  const laneOrder: Array<'work_study' | 'events' | 'roles'> = ['work_study', 'events', 'roles'];
  const laneLabels: Record<string, string> = {
    work_study: 'WORK',
    events: 'EVENTS',
    roles: 'ROLES'
  };

  const chartBottom = laneOrder.length * ROW_H;
  const peopleBaseline = chartBottom;
  const peopleMax = Math.max(1, ...input.peopleSteps.map((s) => s.count), 1);
  // People area sits behind lanes: y rises toward the top of the chart.
  const peopleY = (count: number) =>
    peopleBaseline - 4 - (count / peopleMax) * (chartBottom - 10);

  const peopleSorted = [...input.peopleSteps].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at)
  );
  const peopleLine = peopleSorted.map((s) => ({
    x: xAt(s.at),
    y: peopleY(s.count),
    count: s.count
  }));

  let peoplePath = '';
  let peopleAreaPath = '';
  let peopleCountLabel: TimelineLayout['peopleCountLabel'] = null;
  if (peopleLine.length > 0) {
    const first = peopleLine[0]!;
    const last = peopleLine[peopleLine.length - 1]!;
    // Hold the final count across to "now" so the area doesn't end mid-chart (A4).
    const endX = nowX;
    peoplePath = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    for (let i = 1; i < peopleLine.length; i++) {
      const cur = peopleLine[i]!;
      peoplePath += ` H${cur.x.toFixed(1)} V${cur.y.toFixed(1)}`;
    }
    if (endX > last.x + 0.5) {
      peoplePath += ` H${endX.toFixed(1)}`;
    }
    peopleAreaPath = `${peoplePath} V${peopleBaseline.toFixed(1)} H${first.x.toFixed(1)} Z`;
    const labelText = `${last.count} ${last.count === 1 ? 'person' : 'people'}`;
    const labelW = approxLabelW(labelText);
    // Sit the count just right of the line end, clear of lane label row (A4).
    peopleCountLabel = {
      x: Math.min(endX + 6, width - 4 - labelW),
      y: Math.min(peopleBaseline - 2, Math.max(chartBottom - 6, last.y + 4)),
      text: labelText
    };
  }

  const grouped = laneOrder.map((kind, row) => {
    const items = input.lanes.filter((l) => l.kind === kind);
    const y = row * ROW_H + ROW_H / 2;
    const bars: TimelineLayout['lanes'][0]['bars'] = [];
    const points: TimelineLayout['lanes'][0]['points'] = [];

    for (const item of items) {
      const x0 = xAt(item.start);
      if (kind === 'events') {
        // Events lane only: open-ended or point marks are dots (A3).
        points.push({
          x: x0,
          label: item.label,
          labelX: x0 + 8,
          labelY: y + 4,
          labelAnchor: 'start',
          showLabel: true
        });
        continue;
      }

      // Work & study / Roles: end null → bar to now (C6 / A3).
      const x1 = item.end ? xAt(item.end) : nowX;
      const w = Math.max(4, x1 - x0);
      const need = approxLabelW(item.label) + LABEL_INSET;
      const labelInside = w >= need;
      let labelX: number;
      let labelAnchor: 'start' | 'middle' | 'end' = 'start';
      if (labelInside) {
        labelX = x0 + LABEL_INSET;
      } else if (x1 + 6 + approxLabelW(item.label) <= width - 4) {
        labelX = x1 + 6;
      } else {
        // Prefer left of the bar when the right edge is flush with now.
        labelX = Math.max(PAD_X, x0 - 6);
        labelAnchor = 'end';
      }
      bars.push({
        x: x0,
        w,
        label: item.label,
        labelX,
        labelY: y + 4,
        labelAnchor,
        labelInside,
        showLabel: true
      });
    }

    // Collision: hide overlapping labels within the lane (C1).
    const all = [
      ...bars.map((b) => ({
        x: b.labelX,
        w: approxLabelW(b.label),
        set: (v: boolean) => {
          b.showLabel = v;
        },
        label: b.label
      })),
      ...points.map((p) => ({
        x: p.labelX,
        w: approxLabelW(p.label),
        set: (v: boolean) => {
          p.showLabel = v;
        },
        label: p.label
      }))
    ].sort((a, b) => a.x - b.x);
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1]!;
      const cur = all[i]!;
      if (cur.x < prev.x + prev.w / 2 + cur.w / 2) {
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

  const startY = new Date(input.domainStart).getUTCFullYear();
  const endY = new Date(input.domainEnd).getUTCFullYear();
  const axisLabels = [
    { x: PAD_X, text: String(startY) },
    { x: plotR, text: endY >= new Date().getUTCFullYear() ? 'now' : String(endY) }
  ];

  return {
    width,
    height: laneOrder.length * ROW_H + AXIS_H,
    lanes: grouped,
    peopleLine,
    peoplePath,
    peopleAreaPath,
    peopleCountLabel,
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
  svg.classList.add('orgs-time-svg');

  // People area behind lanes (A4).
  if (layout.peopleAreaPath) {
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', layout.peopleAreaPath);
    area.setAttribute('fill', 'var(--wave)');
    area.setAttribute('fill-opacity', '0.08');
    area.setAttribute('stroke', 'none');
    svg.append(area);
  }
  if (layout.peoplePath) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', layout.peoplePath);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'var(--wave)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-opacity', '0.55');
    svg.append(line);
  }
  if (layout.peopleCountLabel) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(layout.peopleCountLabel.x));
    t.setAttribute('y', String(layout.peopleCountLabel.y));
    t.setAttribute('text-anchor', 'start');
    t.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
    t.setAttribute('font-size', '11');
    t.setAttribute('font-weight', '600');
    t.setAttribute('fill', 'var(--wave)');
    t.textContent = layout.peopleCountLabel.text;
    svg.append(t);
  }

  for (const lane of layout.lanes) {
    const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lab.setAttribute('x', '8');
    lab.setAttribute('y', String(lane.y + 4));
    lab.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
    lab.setAttribute('font-size', '10');
    lab.setAttribute('font-weight', '600');
    lab.setAttribute('fill', 'var(--muted)');
    lab.textContent = lane.label;
    svg.append(lab);

    for (const bar of lane.bars) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(bar.x));
      r.setAttribute('y', String(lane.y - BAR_H / 2));
      r.setAttribute('width', String(bar.w));
      r.setAttribute('height', String(BAR_H));
      r.setAttribute('rx', '4');
      r.setAttribute('fill', 'var(--depth)');
      r.setAttribute('fill-opacity', bar.labelInside ? '0.85' : '0.35');
      r.setAttribute('stroke', 'var(--wave)');
      r.setAttribute('stroke-width', '1');
      svg.append(r);
      if (bar.showLabel) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(bar.labelX));
        t.setAttribute('y', String(bar.labelY));
        t.setAttribute('text-anchor', bar.labelAnchor);
        t.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
        t.setAttribute('font-size', '10');
        t.setAttribute('font-weight', '600');
        t.setAttribute('fill', bar.labelInside ? 'var(--on-dark, #fff)' : 'var(--ink)');
        t.textContent = bar.label;
        svg.append(t);
      }
    }

    for (const pt of lane.points) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(pt.x));
      c.setAttribute('cy', String(lane.y));
      c.setAttribute('r', '4');
      c.setAttribute('fill', 'var(--wave)');
      svg.append(c);
      if (pt.showLabel) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(pt.labelX));
        t.setAttribute('y', String(pt.labelY));
        t.setAttribute('text-anchor', pt.labelAnchor);
        t.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', 'var(--muted)');
        t.textContent = pt.label;
        svg.append(t);
      }
    }
  }

  // Axis labels on their own row below the chart (A4 / C1).
  for (const ax of layout.axisLabels) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(ax.x));
    t.setAttribute('y', String(layout.height - 4));
    t.setAttribute('text-anchor', ax.text === 'now' ? 'end' : 'start');
    t.setAttribute('font-family', 'var(--font-ui, Inter, system-ui, sans-serif)');
    t.setAttribute('font-size', '10');
    t.setAttribute('fill', 'var(--muted)');
    t.textContent = ax.text;
    svg.append(t);
  }

  return svg;
}

export const TIMELINE_ROW_H = ROW_H;
export const TIMELINE_AXIS_H = AXIS_H;
