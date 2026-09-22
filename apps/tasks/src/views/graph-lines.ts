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
  type ServiceStatus
} from '@/domain/graph-model';
import type { GraphInsight } from '@/domain/graph-insights';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { domainColor } from '@/services/task-properties';
import { buildTransitLine, wrapTransitStations } from '../../../life/js/app/chart-kit/transit-lines.js';
import { el } from '@/views/hub-kit';

export type LinesMount = {
  root: HTMLElement;
  focus: (id: string) => void;
  teardown: () => void;
};

type LineModel = {
  project: Project;
  tasks: Task[];
  pace: Pace | null;
  service: ServiceStatus;
  stations: ReturnType<typeof projectRoute>['stations'];
};

function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function lineColour(domain: string | undefined, step: number): string {
  const base = (domain && domainColor(domain)) || token('--wave', '#376fb7');
  return step % 2 === 0 ? base : `color-mix(in srgb, ${base} 72%, var(--depth))`;
}

/** Keep terminus / ghost copy inside the painted SVG, not hanging off the page. */
export function lineLabelX(x: number, viewWidth: number): { x: number; anchor: 'start' | 'end' } {
  const pad = 8;
  const maxX = Math.max(pad, viewWidth - pad);
  const clamped = Math.min(Math.max(x, pad), maxX);
  const anchor = clamped > viewWidth / 2 ? 'end' : 'start';
  return { x: clamped, anchor };
}

export function lineViewWidth(clientWidth: number): number {
  const measured = Math.floor(clientWidth);
  return Math.max(measured || 720, 320);
}

function buildLines(projects: Project[], tasks: Task[], now: Date): LineModel[] {
  const active = projects.filter((p) => !isProjectArchived(p.status));
  return active
    .map((project) => {
      const children = tasks.filter((t) => t.parent_project_id === project.id);
      return {
        project,
        tasks: children,
        pace: pace(project, tasks, now),
        service: serviceStatus(project, tasks, now),
        stations: projectRoute(project, tasks).stations
      };
    })
    .filter((line) => line.stations.length)
    .sort((a, b) => {
      const ae = a.project.current_end_date ?? '9999';
      const be = b.project.current_end_date ?? '9999';
      if (ae !== be) return ae.localeCompare(be);
      return serviceStatusOrder(a.service.status) - serviceStatusOrder(b.service.status);
    });
}

export function mountLinesView(
  host: HTMLElement,
  input: {
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
    onToggleScale: () => void;
  }
): LinesMount {
  host.replaceChildren();
  const root = el('div', `graph-lines${host.clientWidth && host.clientWidth < 430 ? ' is-mobile' : ''}`);
  const live = el('p', 'visually-hidden');
  live.setAttribute('aria-live', 'polite');
  const board = el('div', 'graph-service-board');
  board.setAttribute('role', 'list');
  const stage = el('div', 'graph-lines__stage');
  const toggle = el('button', 'btn btn--ghost', input.scale ? 'Schematic' : 'To scale');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', input.scale ? 'Switch to schematic layout' : 'Switch to to-scale layout');
  toggle.addEventListener('click', input.onToggleScale);
  const tools = el('div', 'graph-lines__tools');
  tools.append(toggle);
  root.append(board, tools, stage, live);

  const models = buildLines(input.projects, input.tasks, input.now);
  const finished = models.filter((m) => m.service.status === 'arrived');
  const open = models.filter((m) => m.service.status !== 'arrived');
  const ordered = [...open, ...finished];
  const q = input.search.trim().toLowerCase();
  const loose = input.tasks.filter((t) => !t.parent_project_id && t.status !== 'done' && t.status !== 'dead');

  for (const line of ordered) {
    const pill = el(
      'button',
      `graph-service-pill graph-service-pill--${line.service.status}`,
      `${line.project.title}: ${line.service.label}`
    );
    pill.type = 'button';
    pill.title = line.service.reason;
    pill.addEventListener('click', () => {
      input.onFocusProject(line.project.id);
      row.scrollIntoView({ behavior: input.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
    board.append(pill);

    const row = el('article', 'graph-line');
    row.dataset.projectId = line.project.id;
    if (input.focusedProjectId && input.focusedProjectId !== line.project.id) row.classList.add('is-dim');
    const header = el('button', 'graph-line__header');
    header.type = 'button';
    const done = line.pace?.actualDone ?? line.stations.filter((s) => s.task?.status === 'done').length;
    const total = line.stations.length;
    const days = line.pace?.daysRemaining;
    const behind = line.pace?.behind ?? 0;
    const behindLabel =
      behind > 0 ? `${behind} station${behind === 1 ? '' : 's'} behind pace` : behind < 0 ? 'ahead of pace' : 'on pace';
    header.append(el('strong', 'graph-line__name', line.project.title));
    header.append(
      el(
        'span',
        'graph-line__metrics hub-count',
        `${done} of ${total}${days != null ? ` · ${days} days` : ''} · ${behindLabel}`
      )
    );
    header.addEventListener('click', () =>
      input.onFocusProject(input.focusedProjectId === line.project.id ? null : line.project.id)
    );
    row.append(header);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-line__svg');
    const width = lineViewWidth(host.clientWidth);
    const rawStations = line.stations.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      dateKey: s.task?.due_date ?? s.milestone?.due_date ?? null,
      state: s.task ? nodeState(s.task, input.tasks, input.now).state : s.milestone?.status,
      stepOrder: s.task?.step_order ?? 0
    }));
    const collapsed: typeof rawStations = [];
    let skip = 0;
    for (let i = 0; i < rawStations.length; i += 1) {
      if (skip) {
        skip -= 1;
        continue;
      }
      let run = 0;
      while (i + run < rawStations.length && rawStations[i + run]?.state === 'done') run += 1;
      if (run >= 5) {
        collapsed.push({
          id: `done-${line.project.id}-${i}`,
          title: `${run} done`,
          kind: 'done-pill',
          dateKey: rawStations[i]!.dateKey,
          state: 'done',
          stepOrder: rawStations[i]!.stepOrder
        });
        skip = run - 1;
        continue;
      }
      collapsed.push(rawStations[i]!);
    }
    const wrapped = input.scale
      ? buildTransitLine({ stations: collapsed }, { width, scale: true }).stations.map((s: typeof collapsed[number] & { x: number; y: number }) => ({
          ...s,
          row: 0
        }))
      : wrapTransitStations(collapsed, width);
    const height = Math.max(88, (Math.max(...wrapped.map((s: { row?: number }) => s.row ?? 0), 0) + 1) * 56 + 24);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = '100%';
    svg.style.height = `${height}px`;
    const colour = lineColour(line.tasks[0]?.domain ?? line.project.type, open.indexOf(line));
    const path = wrapped.map((s, i) => `${i ? 'L' : 'M'}${s.x} ${s.y}`).join(' ');
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', path);
    track.setAttribute('class', 'graph-line__track');
    track.setAttribute('stroke', colour);
    svg.append(track);

    const current = line.stations.find((s) => s.task && nodeState(s.task, input.tasks, input.now).state === 'current');
    const ghost =
      line.pace && line.pace.behind !== 0
        ? wrapped[Math.max(0, Math.min(wrapped.length - 1, line.pace.ghostIndex))]
        : null;

    for (const station of wrapped) {
      const match = !q || station.title.toLowerCase().includes(q);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `graph-station${station.id === input.selectedId ? ' is-selected' : ''}${match ? '' : ' is-search-dim'}`);
      g.dataset.stationId = station.id;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', station.title);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(station.x));
      circle.setAttribute('cy', String(station.y));
      circle.setAttribute('r', station.kind === 'milestone' ? '10' : '7');
      circle.setAttribute('class', `graph-station__mark graph-station__mark--${station.state ?? 'open'}`);
      if (station.state !== 'done') circle.setAttribute('fill', 'transparent');
      g.append(circle);
      if (current?.id === station.id) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', String(station.x));
        ring.setAttribute('cy', String(station.y));
        ring.setAttribute('r', '14');
        ring.setAttribute('class', `graph-here${input.reducedMotion ? '' : ' is-breathing'}`);
        g.append(ring);
      }
      if (station.state === 'blocked') {
        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', String(station.x - 8));
        bar.setAttribute('y', String(station.y - 14));
        bar.setAttribute('width', '16');
        bar.setAttribute('height', '4');
        bar.setAttribute('class', 'graph-station__barrier');
        g.append(bar);
      }
      g.addEventListener('click', () => {
        if (station.kind === 'task') input.onSelect(station.id);
      });
      g.addEventListener('dblclick', () => {
        if (station.kind === 'task') location.hash = `#/task/${station.id}`;
      });
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && station.kind === 'task') input.onSelect(station.id);
        if ((event.key === 'c' || event.key === 'C') && station.kind === 'task') input.onComplete(station.id);
      });
      if (station.kind === 'task' && input.onReorder) {
        g.style.cursor = 'grab';
        g.addEventListener('pointerdown', (event) => {
          if ((event as PointerEvent).metaKey) return;
          const startX = (event as PointerEvent).clientX;
          const up = (ev: PointerEvent) => {
            window.removeEventListener('pointerup', up);
            const dx = ev.clientX - startX;
            if (Math.abs(dx) < 24) return;
            const next = Math.max(0, station.stepOrder + (dx > 0 ? 1 : -1));
            input.onReorder?.(station.id, next);
          };
          window.addEventListener('pointerup', up);
        });
      }
      svg.append(g);
      const next = wrapped[wrapped.indexOf(station) + 1];
      if (next && station.kind === 'task') {
        const plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        plus.setAttribute('x', String((station.x + next.x) / 2));
        plus.setAttribute('y', String((station.y + next.y) / 2 - 8));
        plus.setAttribute('class', 'graph-add-station');
        plus.setAttribute('tabindex', '0');
        plus.setAttribute('role', 'button');
        plus.setAttribute('aria-label', 'Add station');
        plus.textContent = '+';
        plus.addEventListener('click', (event) => {
          event.stopPropagation();
          input.onAddStation(line.project.id, station.stepOrder + 1);
        });
        svg.append(plus);
      }
    }

    if (ghost) {
      const ghostMark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ghostMark.setAttribute('cx', String(ghost.x));
      ghostMark.setAttribute('cy', String(ghost.y));
      ghostMark.setAttribute('r', '11');
      ghostMark.setAttribute('class', 'graph-ghost');
      svg.append(ghostMark);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const ghostLabel = lineLabelX(ghost.x + 14, width);
      label.setAttribute('x', String(ghostLabel.x));
      label.setAttribute('y', String(ghost.y - 12));
      label.setAttribute('text-anchor', ghostLabel.anchor);
      label.setAttribute('class', 'graph-ghost__label');
      label.textContent = (line.pace?.behind ?? 0) < 0 ? 'ahead of pace' : 'pace says be here by today';
      svg.append(label);
    }

    const terminus = line.project.current_end_date;
    if (terminus && wrapped.length) {
      const last = wrapped[wrapped.length - 1]!;
      const pill = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const dateLabel = lineLabelX(last.x, width);
      pill.setAttribute('x', String(dateLabel.x));
      pill.setAttribute('y', String(last.y + 22));
      pill.setAttribute('text-anchor', dateLabel.anchor);
      pill.setAttribute('class', 'graph-terminus');
      pill.textContent = formatDisplayDate(terminus);
      svg.append(pill);
    }

    row.append(svg);
    const alert = input.insights.find((ins) => ins.view === 'lines' && ins.anchor.kind === 'project' && ins.anchor.id === line.project.id);
    if (alert) {
      const card = el('button', 'graph-clare-alert', `${alert.headline}. ${alert.detail}`);
      card.type = 'button';
      card.addEventListener('click', () => input.onReviewInsight(alert.id));
      row.append(card);
    }
    stage.append(row);
  }

  if (!ordered.length) {
    stage.append(el('h2', 'empty-state__title', 'No projects in motion'));
    stage.append(el('p', 'empty-state', "Give tasks a project and they'll appear as lines."));
  }
  if (loose.length) {
    const foot = el('a', 'graph-loose-footer', `${loose.length} tasks without a project`);
    (foot as HTMLAnchorElement).href = '#/list';
    root.append(foot);
  }

  host.append(root);
  return {
    root,
    focus: (id) => {
      const node = root.querySelector(`[data-station-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: 'center', behavior: input.reducedMotion ? 'auto' : 'smooth' });
      node?.classList.add('is-pulse');
    },
    teardown: () => {
      host.replaceChildren();
    }
  };
}
