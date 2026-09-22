import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { isProjectArchived } from '@/schemas/project';
import {
  nodeState,
  pace,
  projectRoute,
  serviceStatus,
  serviceStatusOrder,
  type Pace,
  type RouteStation,
  type ServiceStatus
} from '@/domain/graph-model';
import type { GraphInsight } from '@/domain/graph-insights';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { domainColor } from '@/services/task-properties';
import {
  TRANSIT_G,
  branchPath,
  fitText,
  terminusWidth,
  transitStep,
  transitTerminusX,
  transitXs,
  verticalBranchPath
} from '../../../life/js/app/chart-kit/transit-lines.js';
import { el } from '@/views/hub-kit';
import { drawIn, popIn, svgEl, token } from '@/views/graph-svg';

export type LinesMount = {
  root: HTMLElement;
  update: (input: LinesInput) => void;
  focus: (id: string) => void;
  teardown: () => void;
};

export type LinesInput = {
  tasks: Task[];
  projects: Project[];
  now: Date;
  selectedId: string | null;
  search: string;
  insights: GraphInsight[];
  scale: boolean;
  focusedProjectId: string | null;
  reducedMotion: boolean;
  onSelect: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onFocusProject: (projectId: string | null) => void;
  onAddStation: (projectId: string, stepOrder: number) => void;
  onReorder?: (taskId: string, stepOrder: number) => void;
  onReviewInsight: (id: string) => void;
  onDismissInsight?: (id: string) => void;
  onToggleScale: () => void;
};

type VisualState = 'done' | 'current' | 'open' | 'waiting' | 'blocked' | 'suggested' | 'milestone';

type StationView = {
  id: string;
  title: string;
  state: VisualState;
  sub: string;
  tone: 'here' | 'danger' | 'warn' | 'clare' | null;
  kind: 'task' | 'milestone' | 'suggested';
  stepOrder: number;
  warn?: boolean;
  danger?: boolean;
  branch?: { title: string; stations: StationView[] };
};

type LineModel = {
  project: Project;
  tasks: Task[];
  pace: Pace | null;
  service: ServiceStatus;
  stations: StationView[];
  terminus: { label: string; date: string };
  ghostAt: number | null;
  colour: string;
  shade: number;
};

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const A = parse(a);
  const B = parse(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function lineColour(domain: string | undefined, shade: number): string {
  const base = (domain && domainColor(domain)) || token('--wave', '#376fb7');
  if (!shade || !base.startsWith('#')) return base;
  return mixHex(base, '#0a1536', 0.3);
}

function daysSince(from: string | null | undefined, now: Date): number {
  if (!from) return 0;
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / 86_400_000));
}

function visualState(task: Task, all: Task[], now: Date): VisualState {
  const row = nodeState(task, all, now);
  if (row.state === 'done') return 'done';
  if (row.state === 'blocked' && daysSince(task.blocked_since, now) > 0) return 'blocked';
  if (row.state === 'waiting') return 'waiting';
  if (row.state === 'current' || row.state === 'stalled') return 'current';
  return 'open';
}

function stationCopy(task: Task, all: Task[], now: Date, state: VisualState): { sub: string; tone: StationView['tone'] } {
  const row = nodeState(task, all, now);
  if (state === 'suggested') return { sub: 'Clare suggests', tone: 'clare' };
  if (state === 'done') return { sub: 'done', tone: null };
  if (state === 'current' && row.state !== 'stalled') return { sub: 'you are here', tone: 'here' };
  if (state === 'blocked') {
    const days = daysSince(task.blocked_since, now);
    return { sub: days ? `blocked ${days} day${days === 1 ? '' : 's'}` : 'blocked', tone: 'danger' };
  }
  if (state === 'waiting') return { sub: task.waiting_on ? `waiting on ${task.waiting_on}` : 'waiting', tone: null };
  if (row.state === 'stalled') {
    const days = daysSince(task.updated_at, now);
    return { sub: days ? `stalled ${days} days` : 'stalled', tone: 'danger' };
  }
  if (!task.due_date) {
    if (task.estimated_duration) return { sub: `${task.estimated_duration} min · ready`, tone: null };
    return { sub: 'no date', tone: 'warn' };
  }
  return { sub: `due ${formatDisplayDate(task.due_date)}`, tone: row.overdue ? 'danger' : null };
}

function spineStations(route: ReturnType<typeof projectRoute>): RouteStation[] {
  const seen = new Set<number>();
  return route.mainline.filter((station) => {
    if (station.kind !== 'task' || !station.task) return false;
    if (seen.has(station.task.step_order)) return false;
    seen.add(station.task.step_order);
    return true;
  });
}

function toStationView(station: RouteStation, tasks: Task[], now: Date): StationView {
  const task = station.task!;
  const state = visualState(task, tasks, now);
  const copy = stationCopy(task, tasks, now, state);
  const kids = tasks
    .filter((item) => item.parent_task_id === task.id)
    .sort((a, b) => a.step_order - b.step_order);
  return {
    id: task.id,
    title: task.title,
    state,
    sub: copy.sub,
    tone: copy.tone,
    kind: 'task',
    stepOrder: task.step_order,
    warn: copy.tone === 'warn',
    danger: copy.tone === 'danger',
    branch: kids.length
      ? {
          title: 'Excursion admin',
          stations: kids.map((child) => {
            const childState = visualState(child, tasks, now);
            const childCopy = stationCopy(child, tasks, now, childState);
            return {
              id: child.id,
              title: child.title,
              state: childState,
              sub: childCopy.sub,
              tone: childCopy.tone,
              kind: 'task' as const,
              stepOrder: child.step_order,
              warn: childCopy.tone === 'warn',
              danger: childCopy.tone === 'danger'
            };
          })
        }
      : undefined
  };
}

function buildLines(projects: Project[], tasks: Task[], now: Date, insights: GraphInsight[]): LineModel[] {
  const active = projects.filter((p) => !isProjectArchived(p.status));
  return active
    .map((project, index) => {
      const children = tasks.filter((t) => t.parent_project_id === project.id);
      const route = projectRoute(project, tasks);
      const spine = spineStations(route);
      const stations = spine.map((station) => toStationView(station, tasks, now));
      const suggest = insights.find(
        (ins) =>
          ins.view === 'lines' &&
          ins.anchor.kind === 'project' &&
          ins.anchor.id === project.id &&
          ins.proposal?.some((item) => item.kind === 'task_create')
      );
      if (suggest) {
        const title =
          suggest.proposal?.find((item) => item.kind === 'task_create' && 'patch' in item)?.patch &&
          'title' in (suggest.proposal.find((item) => item.kind === 'task_create') as { patch?: { title?: string } }).patch!
            ? String(
                (suggest.proposal.find((item) => item.kind === 'task_create') as { patch?: { title?: string } }).patch
                  ?.title
              )
            : 'Staff consult?';
        stations.push({
          id: `suggest-${project.id}`,
          title: title.includes('Check in') ? 'Staff consult?' : title,
          state: 'suggested',
          sub: 'Clare suggests',
          tone: 'clare',
          kind: 'suggested',
          stepOrder: stations.length + 1
        });
      }
      const milestone = route.stations.find((s) => s.kind === 'milestone');
      const measured = pace(project, tasks, now);
      const domain = children[0]?.domain ?? project.type;
      return {
        project,
        tasks: children,
        pace: measured,
        service: serviceStatus(project, tasks, now),
        stations,
        terminus: {
          label: milestone?.title ?? 'End',
          date: formatDisplayDate(milestone?.milestone?.due_date ?? project.current_end_date)
        },
        ghostAt: measured && measured.behind > 0 ? measured.ghostAt : null,
        colour: lineColour(domain, index % 2),
        shade: index % 2
      };
    })
    .filter((line) => line.stations.length)
    .sort((a, b) => {
      const ae = a.project.current_end_date ?? '9999';
      const be = b.project.current_end_date ?? '9999';
      if (ae !== be) return ae.localeCompare(be);
      return serviceStatusOrder(a.service.status) - serviceStatusOrder(b.service.status);
    })
    .map((line, index) => ({
      ...line,
      shade: index % 2,
      colour: lineColour(line.tasks[0]?.domain ?? line.project.type, index % 2)
    }));
}

function subClass(tone: StationView['tone']): string {
  if (tone === 'here') return 'sub sub--here';
  if (tone === 'danger') return 'sub sub--danger';
  if (tone === 'warn') return 'sub sub--warn';
  if (tone === 'clare') return 'sub sub--clare';
  return 'sub';
}

function paintStation(
  parent: SVGElement,
  st: StationView,
  x: number,
  y: number,
  col: string,
  isBranch: boolean,
  input: LinesInput
): SVGGElement {
  const g = TRANSIT_G;
  const grp = svgEl(
    'g',
    {
      class: 'graph-station stn',
      tabindex: '0',
      role: 'button',
      'aria-label': `${st.title}, ${st.sub}`,
      'data-part': 'station',
      'data-state': st.state,
      'data-station-id': st.id
    },
    parent
  );
  const r = isBranch ? g.r.branch : st.kind === 'milestone' ? g.r.milestone : g.r[st.state] || g.r.open;
  svgEl('circle', { class: 'ring-focus', cx: x, cy: y, r: r + 7 }, grp);
  if (st.state === 'current' && !isBranch) {
    const ring = svgEl(
      'circle',
      {
        class: `graph-here${input.reducedMotion ? '' : ' is-breathing'}`,
        cx: x,
        cy: y,
        r: g.hereR,
        fill: 'none',
        stroke: col,
        'stroke-width': 2,
        'data-part': 'here-ring'
      },
      grp
    );
    ring.style.transformBox = 'fill-box';
    ring.style.transformOrigin = 'center';
  }
  const pop = svgEl('g', { class: 'graph-pop pop' }, grp);
  if (st.state === 'done') {
    svgEl(
      'circle',
      {
        class: 'st graph-station__mark',
        'data-part': 'station-mark',
        cx: x,
        cy: y,
        r,
        fill: col,
        stroke: '#fff',
        'stroke-width': g.stroke.halo
      },
      pop
    );
  } else if (st.state === 'suggested') {
    svgEl(
      'circle',
      {
        class: 'st graph-station__mark',
        'data-part': 'station-mark',
        cx: x,
        cy: y,
        r,
        fill: '#fff',
        stroke: token('--pastel-lilac-ink', '#5d4e70'),
        'stroke-width': 2,
        'stroke-dasharray': '3 3'
      },
      pop
    );
  } else {
    const sw = st.state === 'current' ? g.stroke.current : isBranch ? 3 : g.stroke.open;
    svgEl(
      'circle',
      {
        class: 'st graph-station__mark',
        'data-part': 'station-mark',
        cx: x,
        cy: y,
        r,
        fill: '#fff',
        stroke: col,
        'stroke-width': sw
      },
      pop
    );
    if (st.state === 'waiting') {
      svgEl(
        'path',
        {
          d: `M${x} ${y - 4}V${y}L${x + 3} ${y + 2}`,
          fill: 'none',
          stroke: col,
          'stroke-width': 1.6,
          'stroke-linecap': 'round'
        },
        pop
      );
    }
  }
  if (st.state === 'blocked') {
    svgEl(
      'rect',
      {
        'data-part': 'barrier',
        x: x - 3.5,
        y: y - 15,
        width: g.barrierW,
        height: g.barrierH,
        rx: g.barrierRx,
        fill: token('--danger', '#9b2c2c'),
        stroke: '#fff',
        'stroke-width': 2
      },
      pop
    );
  }
  if (st.kind === 'task') {
    grp.addEventListener('click', () => input.onSelect(st.id));
    grp.addEventListener('dblclick', () => {
      location.hash = `#/task/${st.id}`;
    });
    grp.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.onSelect(st.id);
      if (event.key === 'c' || event.key === 'C') input.onComplete(st.id);
    });
  }
  return grp;
}

function renderHorizontal(line: LineModel, host: HTMLElement, width: number, input: LinesInput, lineIndex: number): void {
  const g = TRANSIT_G;
  const col = line.colour;
  const n = line.stations.length;
  const termText = `${line.terminus.label} · ${line.terminus.date}`;
  const termW = terminusWidth(line.terminus.label, line.terminus.date);
  const step = transitStep(width, n, termW);
  const xs = transitXs(n, step);
  const termX = transitTerminusX(xs[n - 1]!, step);
  const alt = step < g.minStep;
  const hasBranch = line.stations.some((st) => st.branch);
  const y = alt ? 52 : 40;
  const H = y + (hasBranch ? g.branchDrop + 40 : line.ghostAt != null ? 62 : 44);
  const svg = svgEl(
    'svg',
    { class: 'graph-line__svg track', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img', 'aria-label': `${line.project.title} line` },
    host
  );
  const cur = line.stations.findIndex((st) => st.state === 'current');
  const cx = cur >= 0 ? xs[cur]! : g.padL;
  const travelled = svgEl(
    'path',
    {
      d: `M${g.padL} ${y}H${cx}`,
      fill: 'none',
      stroke: col,
      'stroke-width': g.trackW,
      'stroke-linecap': 'round',
      opacity: 1,
      'data-part': 'track-travelled',
      class: 'graph-line__track'
    },
    svg
  );
  const ahead = svgEl(
    'path',
    {
      d: `M${cx} ${y}H${termX}`,
      fill: 'none',
      stroke: col,
      'stroke-width': g.trackW,
      'stroke-linecap': 'round',
      'data-part': 'track-ahead',
      class: 'graph-line__track'
    },
    svg
  );
  const base = lineIndex * 90;
  drawIn(travelled, base, 350, input.reducedMotion);
  drawIn(ahead, base + 350 * 0.9, 500, input.reducedMotion);
  if (!input.reducedMotion && typeof travelled.animate === 'function') {
    travelled.animate([{ opacity: 1 }, { opacity: g.travelledOpacity }], {
      duration: 300,
      delay: base + 900,
      fill: 'forwards',
      easing: 'cubic-bezier(.2,.8,.2,1)'
    });
    window.setTimeout(() => travelled.setAttribute('opacity', String(g.travelledOpacity)), base + 1200);
  } else {
    travelled.setAttribute('opacity', String(g.travelledOpacity));
  }

  line.stations.forEach((st, i) => {
    if (!st.branch) return;
    const bx = xs[i]!;
    const by = y + g.branchDrop;
    const bn = st.branch.stations.length;
    const bstep = Math.min(step * 0.8, 150);
    const endX = bx + g.branchElbow + bstep * bn;
    const branch = svgEl(
      'g',
      { 'data-part': 'branch' },
      svg
    );
    const bp = svgEl(
      'path',
      {
        d: branchPath(bx, y, endX),
        fill: 'none',
        stroke: col,
        'stroke-width': g.branchW,
        'stroke-linecap': 'round'
      },
      branch
    );
    drawIn(bp, base + 760, 420, input.reducedMotion);
    st.branch.stations.forEach((bs, j) => {
      const x = bx + g.branchElbow + bstep * (j + 0.6);
      const grp = paintStation(branch, bs, x, by, col, true, input);
      const t1 = svgEl('text', { class: 'lbl', x, y: by + 22, 'text-anchor': 'middle', 'data-part': 'station-title' }, grp);
      t1.textContent = fitText(bs.title, '500 13px Inter, ui-sans-serif, sans-serif', bstep - 10);
      t1.style.fill = 'var(--ink)';
      t1.style.fontWeight = '500';
      t1.style.fontSize = '13px';
      const t2 = svgEl('text', { class: subClass(bs.tone), x, y: by + 37, 'text-anchor': 'middle', 'data-part': 'station-sub' }, grp);
      t2.textContent = bs.sub;
      popIn(grp, base + 900 + j * 80, 'pop', input.reducedMotion);
    });
    const nm = svgEl('text', { class: 'sub', x: endX + 12, y: by + 4 }, svg);
    nm.textContent = st.branch.title;
    nm.style.fontWeight = '600';
    nm.style.fill = col;
    nm.style.fontSize = '12px';
    popIn(nm, base + 1100, 'pop', input.reducedMotion);
  });

  if (line.ghostAt != null) {
    const gi = Math.floor(line.ghostAt);
    const gf = line.ghostAt - gi;
    const gx = xs[gi]! + ((xs[Math.min(gi + 1, n - 1)] ?? xs[gi]!) - xs[gi]!) * gf;
    const gg = svgEl('g', { class: 'pop', 'data-part': 'ghost' }, svg);
    svgEl(
      'circle',
      { cx: gx, cy: y, r: g.ghostR, fill: 'none', stroke: token('--muted', '#6b7788'), 'stroke-width': 1.5, 'stroke-dasharray': '3 3' },
      gg
    );
    svgEl(
      'line',
      {
        x1: gx,
        y1: y + 15,
        x2: gx,
        y2: y + g.ghostLabelY - 12,
        stroke: token('--muted', '#6b7788'),
        'stroke-width': 1,
        'stroke-dasharray': '2 3'
      },
      gg
    );
    const gt = svgEl('text', { class: 'sub graph-ghost__label', x: gx, y: y + g.ghostLabelY, 'text-anchor': 'middle' }, gg);
    gt.textContent = (line.pace?.behind ?? 0) < 0 ? 'ahead of pace' : 'pace says be here by today';
    popIn(gg, base + 1000, 'pop', input.reducedMotion);
  }

  line.stations.forEach((st, i) => {
    const x = xs[i]!;
    const grp = paintStation(svg, st, x, y, col, false, input);
    const up = !alt || i % 2 === 0;
    const title = svgEl(
      'text',
      {
        class: 'lbl',
        x,
        y: up ? y + g.labelY : y + g.subY,
        'text-anchor': 'middle',
        'data-part': 'station-title'
      },
      grp
    );
    title.textContent = fitText(st.title, '500 13px Inter, ui-sans-serif, sans-serif', (alt ? step * 2 : step) - 14);
    const subAnchor = st.branch ? 'end' : 'middle';
    const subX = st.branch ? x - 14 : x;
    const sub = svgEl(
      'text',
      {
        class: subClass(st.tone),
        x: subX,
        y: up ? y + g.subY : y + g.subY + 16,
        'text-anchor': subAnchor,
        'data-part': 'station-sub'
      },
      grp
    );
    sub.textContent = st.sub;
    popIn(grp, base + ((x - g.padL) / Math.max(1, termX - g.padL)) * 700, 'pop', input.reducedMotion);

    const next = line.stations[i + 1];
    if (next && st.kind === 'task') {
      const midX = (x + xs[i + 1]!) / 2;
      const gap = svgEl('g', { class: 'graph-add-gap' }, svg);
      svgEl('rect', { class: 'graph-add-hit', x: x + 12, y: y - 22, width: Math.max(16, xs[i + 1]! - x - 24), height: 36 }, gap);
      const plus = svgEl(
        'g',
        { class: 'graph-add-station', tabindex: '0', role: 'button', 'aria-label': 'Add station' },
        gap
      );
      svgEl('circle', { cx: midX, cy: y - 18, r: 10, fill: token('--wave', '#376fb7') }, plus);
      const mark = svgEl('text', { x: midX, y: y - 14, 'text-anchor': 'middle', fill: '#fff' }, plus);
      mark.textContent = '+';
      mark.style.font = '600 14px Inter, ui-sans-serif, sans-serif';
      plus.addEventListener('click', (event) => {
        event.stopPropagation();
        input.onAddStation(line.project.id, st.stepOrder + 1);
      });
    }
  });

  const tg = svgEl('g', { class: 'pop', 'data-part': 'terminus' }, svg);
  svgEl('rect', { x: termX, y: y - g.termH / 2, width: termW, height: g.termH, rx: g.termH / 2, fill: col }, tg);
  const tt = svgEl('text', { class: 'term', x: termX + termW / 2, y: y + 4.5, 'text-anchor': 'middle' }, tg);
  tt.textContent = termText;
  popIn(tg, base + 720, 'slide', input.reducedMotion);
}

function renderVertical(line: LineModel, host: HTMLElement, width: number, input: LinesInput, lineIndex: number): void {
  const g = TRANSIT_G;
  const col = line.colour;
  const x0 = g.vTrackX;
  const n = line.stations.length;
  const extra = line.stations.reduce((a, st) => a + (st.branch ? st.branch.stations.length * 52 : 0), 0);
  const H = n * g.vStep + extra + 56;
  const svg = svgEl(
    'svg',
    { class: 'graph-line__svg track', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img', 'aria-label': `${line.project.title} line` },
    host
  );
  let yy = 22;
  const ys: number[] = [];
  line.stations.forEach((st) => {
    ys.push(yy);
    yy += g.vStep + (st.branch ? st.branch.stations.length * 52 - 8 : 0);
  });
  const endY = yy;
  const cur = line.stations.findIndex((st) => st.state === 'current');
  const travelled = svgEl(
    'path',
    {
      d: `M${x0} ${ys[0]}V${ys[Math.max(cur, 0)]}`,
      fill: 'none',
      stroke: col,
      'stroke-width': g.vTrackW,
      'stroke-linecap': 'round',
      'data-part': 'track-travelled',
      class: 'graph-line__track'
    },
    svg
  );
  const ahead = svgEl(
    'path',
    {
      d: `M${x0} ${ys[Math.max(cur, 0)]}V${endY}`,
      fill: 'none',
      stroke: col,
      'stroke-width': g.vTrackW,
      'stroke-linecap': 'round',
      'data-part': 'track-ahead',
      class: 'graph-line__track'
    },
    svg
  );
  const base = lineIndex * 90;
  drawIn(travelled, base, 300, input.reducedMotion);
  drawIn(ahead, base + 270, 400, input.reducedMotion);
  if (!input.reducedMotion && typeof travelled.animate === 'function') {
    travelled.animate([{ opacity: 1 }, { opacity: g.travelledOpacity }], {
      duration: 300,
      delay: base + 900,
      fill: 'forwards'
    });
    window.setTimeout(() => travelled.setAttribute('opacity', String(g.travelledOpacity)), base + 1200);
  } else travelled.setAttribute('opacity', String(g.travelledOpacity));

  line.stations.forEach((st, i) => {
    const y = ys[i]!;
    const grp = paintStation(svg, st, x0, y, col, false, input);
    const t = svgEl('text', { class: 'lbl', x: x0 + 26, y: y + 1, 'data-part': 'station-title' }, grp);
    t.textContent = fitText(st.title, '500 13px Inter, ui-sans-serif, sans-serif', width - x0 - 40);
    const sb = svgEl('text', { class: subClass(st.tone), x: x0 + 26, y: y + 18, 'data-part': 'station-sub' }, grp);
    sb.textContent = st.sub;
    popIn(grp, base + i * 90, 'pop', input.reducedMotion);
    if (st.branch) {
      const bx = x0 + 30;
      const by = y + 44;
      const branch = svgEl('g', { 'data-part': 'branch' }, svg);
      svgEl(
        'path',
        {
          d: verticalBranchPath(x0, y, st.branch.stations.length),
          fill: 'none',
          stroke: col,
          'stroke-width': 4,
          'stroke-linecap': 'round'
        },
        branch
      );
      st.branch.stations.forEach((bs, j) => {
        const yb = by + j * 52;
        const bg = paintStation(branch, bs, bx, yb, col, true, input);
        const a = svgEl('text', { class: 'lbl', x: bx + 18, y: yb + 1, 'data-part': 'station-title' }, bg);
        a.textContent = bs.title;
        a.style.fontSize = '13px';
        const b = svgEl('text', { class: subClass(bs.tone), x: bx + 18, y: yb + 17, 'data-part': 'station-sub' }, bg);
        b.textContent = bs.sub;
        popIn(bg, base + 500 + j * 80, 'pop', input.reducedMotion);
      });
    }
  });
  const tg = svgEl('g', { class: 'pop', 'data-part': 'terminus' }, svg);
  const tw = terminusWidth(line.terminus.label, line.terminus.date);
  svgEl('rect', { x: x0 - 12, y: endY, width: tw, height: 30, rx: 15, fill: col }, tg);
  const tt = svgEl('text', { class: 'term', x: x0 - 12 + tw / 2, y: endY + 19.5, 'text-anchor': 'middle' }, tg);
  tt.textContent = `${line.terminus.label} · ${line.terminus.date}`;
  popIn(tg, base + 600, 'slide', input.reducedMotion);
}

function metaHtml(line: LineModel): { html: string } {
  const done = line.pace?.actualDone ?? line.stations.filter((s) => s.state === 'done').length;
  const total = line.stations.filter((s) => s.kind !== 'suggested').length || line.stations.length;
  const days = line.pace?.daysRemaining;
  const behind = line.pace?.behind ?? 0;
  const stall = line.service.status === 'suspended';
  let paceBit = 'on pace';
  if (stall) paceBit = `<span class="is-stalled">no movement in 12 days</span>`;
  else if (behind > 0) paceBit = `<span class="is-behind">${behind} station${behind === 1 ? '' : 's'} behind pace</span>`;
  else if (behind < 0) paceBit = 'ahead of pace';
  return {
    html: `<b>${done} of ${total}</b>${days != null ? ` · ${days} days to go` : ''} · ${paceBit}`
  };
}

export function mountLinesView(host: HTMLElement, first: LinesInput): LinesMount {
  host.replaceChildren();
  const root = el('div', 'graph-lines');
  const live = el('p', 'visually-hidden');
  live.setAttribute('aria-live', 'polite');
  const board = el('div', 'graph-service-board');
  board.setAttribute('role', 'list');
  const stage = el('div', 'graph-lines__stage');
  const tools = el('div', 'graph-lines__tools');
  const toggle = el('button', 'btn btn--ghost');
  toggle.type = 'button';
  tools.append(toggle);
  const foot = el('p', 'graph-loose-footer');
  root.append(board, tools, stage, foot, live);
  host.append(root);

  let input = first;
  let ro: ResizeObserver | null = null;
  let lastWidth = 0;
  let entrancePlayed = false;

  const paint = (): void => {
    const models = buildLines(input.projects, input.tasks, input.now, input.insights);
    const finished = models.filter((m) => m.service.status === 'arrived');
    const open = models.filter((m) => m.service.status !== 'arrived');
    const ordered = [...open, ...finished];
    const measured = root.clientWidth || host.clientWidth || 0;
    if (measured < 280) return;
    const width = measured;
    const vertical = width < 560;
    root.classList.toggle('is-mobile', vertical);
    toggle.textContent = input.scale ? 'Schematic' : 'To scale';
    toggle.setAttribute('aria-label', input.scale ? 'Switch to schematic layout' : 'Switch to to-scale layout');
    toggle.onclick = input.onToggleScale;

    const pillIds = new Set(ordered.map((l) => l.project.id));
    for (const child of [...board.children]) {
      const id = (child as HTMLElement).dataset.projectId;
      if (!id || !pillIds.has(id)) child.remove();
    }
    for (const line of ordered) {
      let pill = board.querySelector<HTMLButtonElement>(`[data-part="service-pill"][data-project-id="${CSS.escape(line.project.id)}"]`);
      if (!pill) {
        pill = el('button', '') as HTMLButtonElement;
        pill.type = 'button';
        pill.setAttribute('role', 'listitem');
        board.append(pill);
      }
      pill.className = `graph-service-pill graph-service-pill--${line.service.status}`;
      pill.dataset.part = 'service-pill';
      pill.dataset.status = line.service.status;
      pill.dataset.projectId = line.project.id;
      pill.title = line.service.reason;
      pill.innerHTML = `<i></i><b>${line.project.title}</b>${line.service.label}`;
      pill.onclick = () => {
        input.onFocusProject(line.project.id);
        stage.querySelector(`[data-project-id="${CSS.escape(line.project.id)}"]`)?.scrollIntoView({
          behavior: input.reducedMotion ? 'auto' : 'smooth',
          block: 'center'
        });
      };
    }

    const lineIds = new Set(ordered.map((l) => l.project.id));
    for (const child of [...stage.children]) {
      const id = (child as HTMLElement).dataset.projectId;
      if (!id || !lineIds.has(id)) child.remove();
    }
    ordered.forEach((line, li) => {
      let row = stage.querySelector<HTMLElement>(`[data-part="line"][data-project-id="${CSS.escape(line.project.id)}"]`);
      if (!row) {
        row = el('article', 'graph-line');
        stage.append(row);
      }
      row.dataset.part = 'line';
      row.dataset.projectId = line.project.id;
      row.dataset.orientation = vertical ? 'vertical' : 'horizontal';
      row.classList.toggle('is-dim', Boolean(input.focusedProjectId && input.focusedProjectId !== line.project.id));
      const header = row.querySelector<HTMLButtonElement>('.graph-line__header') ?? el('button', 'graph-line__header');
      header.type = 'button';
      header.innerHTML = `<span class="graph-line__name"><i class="graph-line__chip" style="background:${line.colour}"></i>${line.project.title}</span><span class="graph-line__metrics">${metaHtml(line).html}</span>`;
      header.onclick = () =>
        input.onFocusProject(input.focusedProjectId === line.project.id ? null : line.project.id);
      if (!header.isConnected) row.append(header);
      let svgHost = row.querySelector<HTMLElement>('.graph-line__svg-host');
      if (!svgHost) {
        svgHost = el('div', 'graph-line__svg-host');
        row.append(svgHost);
      }
      svgHost.replaceChildren();
      const renderInput = entrancePlayed ? { ...input, reducedMotion: true } : input;
      if (vertical) renderVertical(line, svgHost, width, renderInput, li);
      else renderHorizontal(line, svgHost, width, renderInput, li);

      const alert = input.insights.find(
        (ins) => ins.view === 'lines' && ins.anchor.kind === 'project' && ins.anchor.id === line.project.id && ins.id.startsWith('lines-service')
      );
      row.querySelector('[data-part="clare-alert"]')?.remove();
      if (alert) {
        const card = el('div', `graph-clare-alert${alert.severity === 'high' ? ' graph-clare-alert--danger' : ''}`);
        card.dataset.part = 'clare-alert';
        const primary = el('button', 'btn btn--primary', alert.draft ? 'Review draft' : 'See steps');
        primary.type = 'button';
        primary.addEventListener('click', () => input.onReviewInsight(alert.id));
        const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
        dismiss.type = 'button';
        dismiss.addEventListener('click', () => input.onDismissInsight?.(alert.id));
        card.innerHTML = `<div class="graph-clare-alert__avatar" aria-hidden="true">C</div><div class="graph-clare-alert__txt"><b>${alert.headline.replace(/^.*?(The delay|HPGE|.*is |.*has )/, (m) => (m.includes('delay') || m.includes('still') || m.includes('suspended') ? '' : ''))}</b> <span>${alert.detail}</span></div>`;
        const head = card.querySelector('b');
        if (head) {
          head.textContent =
            line.service.status === 'suspended'
              ? `${line.project.title} has been still for 12 days.`
              : alert.detail.split('.')[0] + '.';
        }
        card.append(primary, dismiss);
        row.append(card);
        window.setTimeout(() => card.classList.add('is-in'), input.reducedMotion ? 0 : li * 90 + 1150);
      }
    });

    if (!ordered.length) {
      stage.replaceChildren();
      stage.append(el('h2', 'empty-state__title', 'No projects in motion'));
      stage.append(el('p', 'empty-state', "Give tasks a project and they'll appear as lines."));
    }
    const loose = input.tasks.filter((t) => !t.parent_project_id && t.status !== 'done' && t.status !== 'dead');
    foot.innerHTML = loose.length ? `${loose.length} tasks without a project · <a href="#/list">Open Backlog</a>` : '';
    lastWidth = width;
    if (measured >= 280) entrancePlayed = true;
  };

  const kick = () => {
    paint();
    if (!entrancePlayed) requestAnimationFrame(kick);
  };
  kick();
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      const next = root.clientWidth;
      if (next < 280) return;
      if (entrancePlayed && Math.abs(next - lastWidth) < 8) return;
      paint();
    });
    ro.observe(root);
  }

  return {
    root,
    update: (next) => {
      input = next;
      paint();
    },
    focus: (id) => {
      const node = root.querySelector(`[data-station-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: 'center', behavior: input.reducedMotion ? 'auto' : 'smooth' });
      node?.classList.add('is-pulse');
    },
    teardown: () => {
      ro?.disconnect();
      host.replaceChildren();
    }
  };
}
