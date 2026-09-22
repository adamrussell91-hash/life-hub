import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  criticalPath,
  doFirst,
  nodeState,
  projectedDates,
  serviceStatus,
  wouldCreateCycle
} from '@/domain/graph-model';
import { canLink, layoutBranchFlow, type BranchLayout } from '@/domain/graph-branch-layout';
import type { GraphInsight } from '@/domain/graph-insights';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  FLOW_BADGE_FILL,
  FLOW_BOX_SHADOW,
  FLOW_BOX_STROKE,
  FLOW_CLARE_FILL,
  FLOW_G,
  FLOW_LANE_FILL,
  FLOW_OPEN_STRIPE,
  FLOW_SELECT_HALO,
  orthogonalPath,
  portOffsetFor
} from '../../../life/js/app/chart-kit/flowchart-lanes.js';
import { domainColor } from '@/services/task-properties';
import { el } from '@/views/hub-kit';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';
import { drawIn, popIn, svgEl, token } from '@/views/graph-svg';
import { measureText, fitText } from '../../../life/js/app/chart-kit/transit-lines.js';

export type BranchMount = {
  root: HTMLElement;
  update: (input: BranchInput) => void;
  focus: (id: string) => void;
  teardown: () => void;
};

export type BranchInput = {
  tasks: Task[];
  projects: Project[];
  now: Date;
  selectedId: string | null;
  search: string;
  insights: GraphInsight[];
  hideDone: boolean;
  reducedMotion: boolean;
  onSelect: (taskId: string) => void;
  onLink: (fromId: string, toId: string) => void;
  onUnlink: (fromId: string, toId: string) => void;
  onToggleHideDone: () => void;
  onReviewInsight: (id: string) => void;
  onWhatIf: (taskId: string, date: string) => void;
  onApplyWhatIf: () => void;
};

function landsCopy(task: Task, projected: ReturnType<typeof projectedDates>, state: string): { text: string; tone: string } {
  const row = projected.get(task.id);
  if (state === 'done') return { text: 'done', tone: '' };
  if (state === 'blocked') return { text: 'blocked by quote', tone: 'danger' };
  if (state === 'waiting') return { text: task.waiting_on ? `waiting on ${task.waiting_on}` : 'waiting', tone: '' };
  if (state === 'stalled') return { text: 'stalled', tone: 'danger' };
  if (state === 'current') return { text: 'you are here', tone: '' };
  if (!task.due_date && !row) return { text: task.estimated_duration ? `${task.estimated_duration} min · ready` : 'no date', tone: task.due_date ? '' : 'warn' };
  if (!task.due_date) return { text: task.estimated_duration ? `${task.estimated_duration} min · ready` : 'no date', tone: 'warn' };
  if (!row) return { text: task.status.replace('_', ' '), tone: '' };
  const land = `lands ${formatDisplayDate(row.finish)}`;
  return row.late ? { text: `${land} · late`, tone: 'danger' } : { text: land, tone: '' };
}

function stripeFill(state: string): string {
  if (state === 'ready' || state === 'current') return token('--wave', '#376fb7');
  if (state === 'blocked' || state === 'stalled' || state === 'overdue') return token('--danger', '#9b2c2c');
  if (state === 'waiting') return token('--muted', '#6b7788');
  if (state === 'done') return token('--success', '#2f7a4f');
  if (state === 'suggested' || state === 'clare') return token('--pastel-lilac-ink', '#5d4e70');
  return FLOW_OPEN_STRIPE;
}

function laneColour(project: Project, tasks: Task[], index: number): string {
  const domain = tasks.find((t) => t.parent_project_id === project.id)?.domain;
  const base = (domain && domainColor(domain)) || token('--wave', '#376fb7');
  return index % 2 === 0 || !base.startsWith('#')
    ? base
    : `color-mix(in srgb, ${base} 78%, #0a1536)`;
}

function markerId(key: string): string {
  return `graph-arrow-${key.replace(/[^a-z0-9-]/gi, '')}`;
}

export function mountBranchView(host: HTMLElement, first: BranchInput): BranchMount {
  host.replaceChildren();
  const root = el('div', 'graph-branch');
  const tools = el('div', 'graph-branch__tools');
  const hide = el('button', 'btn btn--ghost');
  hide.type = 'button';
  const fit = el('button', 'btn btn--ghost', 'Fit');
  fit.type = 'button';
  tools.append(hide, fit);
  const viewport = el('div', 'graph-branch__viewport');
  const stage = el('div', 'graph-branch__stage');
  viewport.append(stage);
  root.append(tools, viewport);
  host.append(root);

  let input = first;
  let layout: BranchLayout = layoutBranchFlow([], []);
  let scale = 1;
  let panX = 0;
  let panY = 0;
  const applyPan = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };

  const paint = (): void => {
    hide.textContent = input.hideDone ? 'Show done' : 'Hide done';
    hide.onclick = input.onToggleHideDone;
    const visible = input.hideDone
      ? input.tasks.filter((t) => t.status !== 'done' && t.status !== 'dead')
      : input.tasks;
    const crit = new Set(input.projects.flatMap((p) => criticalPath(p.id, input.tasks)));
    const firsts = new Map(
      input.projects.map((p) => {
        const top = doFirst(input.tasks.filter((t) => t.parent_project_id === p.id), input.now)[0];
        return [p.id, top] as const;
      })
    );
    const projected = projectedDates(visible, input.projects, input.now);
    layout = layoutBranchFlow(visible, input.projects, { criticalIds: crit, hideDone: input.hideDone });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'branch-flow');
    svg.setAttribute('viewBox', `-4 -4 ${layout.width + 8} ${layout.height + 8}`);
    svg.style.width = '100%';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Dependency flowchart');

    const defs = svgEl('defs', {}, svg);
    const colours: Record<string, string> = {
      edge: token('--shallow', '#a7abb9'),
      risk: token('--high-sea-ink', '#a85a0c'),
      wave: token('--wave', '#376fb7'),
      clare: token('--pastel-lilac-ink', '#5d4e70')
    };
    input.projects.forEach((project, i) => {
      colours[project.id] = laneColour(project, input.tasks, i);
    });
    for (const [key, colour] of Object.entries(colours)) {
      const m = svgEl(
        'marker',
        {
          id: markerId(key),
          viewBox: '0 0 10 10',
          refX: 9,
          refY: 5,
          markerWidth: 8,
          markerHeight: 8,
          orient: 'auto-start-reverse',
          markerUnits: 'userSpaceOnUse'
        },
        defs
      );
      svgEl('path', { d: 'M1 1 L9 5 L1 9 Z', fill: colour }, m);
    }

    const selected = input.selectedId;
    const related = new Set<string>();
    if (selected) {
      const walkUp = (id: string) => {
        related.add(id);
        for (const edge of layout.edges) {
          if (edge.to === id && !edge.suggested && !related.has(edge.from)) walkUp(edge.from);
        }
      };
      const walkDown = (id: string) => {
        related.add(id);
        for (const edge of layout.edges) {
          if (edge.from === id && !edge.suggested && !related.has(edge.to)) walkDown(edge.to);
        }
      };
      walkUp(selected);
      walkDown(selected);
    }

    layout.lanes.forEach((lane, i) => {
      const project = input.projects.find((p) => p.id === lane.id);
      const colour = colours[lane.id] ?? token('--wave', '#376fb7');
      const g = svgEl('g', { class: 'fl-lane', 'data-part': 'lane', 'data-lane-id': lane.id }, svg);
      svgEl('rect', { x: lane.x, y: lane.y, width: lane.width, height: lane.height, rx: 20, fill: FLOW_LANE_FILL }, g);
      svgEl('rect', { x: lane.x + FLOW_G.lanePadX, y: lane.y + 17, width: 10, height: 10, rx: 3, fill: colour }, g);
      const name = svgEl('text', { class: 'fl-lane__label', x: lane.x + FLOW_G.lanePadX + 18, y: lane.y + 26 }, g);
      name.textContent = lane.label;
      const kids = input.tasks.filter((t) => t.parent_project_id === lane.id);
      const done = kids.filter((t) => t.status === 'done').length;
      const end = project?.current_end_date ? formatDisplayDate(project.current_end_date) : '';
      const risk = project ? serviceStatus(project, input.tasks, input.now) : null;
      const metaText = `${done} of ${kids.length} done${end ? ` · ${end}` : ''}${
        risk?.status === 'suspended' ? ' · stalled' : risk?.status === 'major_delays' || risk?.status === 'minor_delays' ? ' · at risk' : ''
      }`;
      const nameW = measureText(lane.label, '600 13px Inter, ui-sans-serif, sans-serif');
      const meta = svgEl('text', { class: 'fl-lane__meta', x: lane.x + FLOW_G.lanePadX + 18 + nameW + 10, y: lane.y + 26 }, g);
      meta.textContent = metaText;
      popIn(g, i * 60, 'fade', input.reducedMotion);
    });

    const suggested = input.insights.filter((ins) => ins.view === 'branch' && ins.anchor.kind === 'link');
    const extraEdges = suggested
      .map((insight) => {
        if (insight.anchor.kind !== 'link') return null;
        const from = layout.boxes.find((b) => b.id === insight.anchor.from);
        const to = layout.boxes.find((b) => b.id === insight.anchor.to);
        if (!from || !to) return null;
        return {
          from: insight.anchor.from,
          to: insight.anchor.to,
          x0: from.x + from.width,
          y0: from.y + from.height / 2,
          x1: to.x,
          y1: to.y + to.height / 2,
          srcCol: from.column,
          dstCol: to.column,
          srcX: from.x,
          dstX: to.x,
          critical: false,
          suggested: true,
          chip: insight.headline
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const allEdges = [...layout.edges, ...extraEdges];
    const positions = new Map(
      layout.boxes.map((box) => [box.id, { col: box.column, y: box.y + box.height / 2, x: box.x }])
    );
    allEdges.forEach((edge) => {
      const off = portOffsetFor(edge, allEdges, positions);
      const d = orthogonalPath(edge.x0, edge.y0, edge.x1, edge.y1, {
        portOffset: off,
        srcCol: edge.srcCol,
        dstCol: edge.dstCol,
        srcX: edge.srcX,
        dstX: edge.dstX
      });
      const fromBox = layout.boxes.find((b) => b.id === edge.from);
      const project = input.projects.find((p) => p.id === fromBox?.projectId);
      const atRisk = project
        ? ['major_delays', 'suspended', 'minor_delays'].includes(serviceStatus(project, input.tasks, input.now).status)
        : false;
      const traced = Boolean(selected && related.has(edge.from) && related.has(edge.to) && !edge.suggested);
      let kind = 'normal';
      let stroke = colours.edge;
      let width = 1.5;
      let mk = 'edge';
      if (edge.critical) {
        if (atRisk) {
          kind = 'critical-risk';
          stroke = colours.risk;
          width = 3;
          mk = 'risk';
        } else {
          kind = 'critical';
          stroke = colours[fromBox?.projectId ?? ''] ?? colours.wave;
          width = 2.5;
          mk = fromBox?.projectId ?? 'wave';
        }
      }
      if (edge.suggested) {
        kind = 'suggested';
        stroke = colours.clare;
        width = 1.5;
        mk = 'clare';
      }
      if (traced) {
        kind = 'traced';
        stroke = colours.wave;
        width = 2.5;
        mk = 'wave';
      }
      const path = svgEl(
        'path',
        {
          d,
          fill: 'none',
          stroke,
          'stroke-width': width,
          'stroke-linejoin': 'round',
          'marker-end': `url(#${markerId(mk)})`,
          class: `fl-edge${selected && !traced ? ' is-dim' : ''}`,
          'data-part': 'edge',
          'data-kind': kind,
          'data-from': edge.from,
          'data-to': edge.to
        },
        svg
      );
      if (edge.suggested) path.setAttribute('stroke-dasharray', '5 4');
      if (traced && !input.reducedMotion) {
        svgEl(
          'path',
          { d, fill: 'none', stroke: '#fff', 'stroke-width': 1.2, class: 'fl-edge--traced-flow', opacity: 0.9 },
          svg
        );
      }
      const delay = (edge.dstCol ?? 0) * 40 + 320;
      if (edge.suggested) {
        if (!input.reducedMotion && typeof path.animate === 'function') {
          path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 200, fill: 'backwards' });
        }
      } else {
        drawIn(path, delay, 320, input.reducedMotion);
      }
      path.tabIndex = 0;
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Delete' || event.key === 'Backspace') input.onUnlink(edge.from, edge.to);
      });
      if (edge.suggested && 'chip' in edge && edge.chip) {
        const mx = edge.x0 + 10;
        const my = (Math.min(edge.y0, edge.y1) + Math.max(edge.y0, edge.y1)) / 2;
        const chip = svgEl('g', { 'data-part': 'clare-chip', class: selected ? 'is-dim' : '' }, svg);
        const cr = svgEl('rect', { x: mx, y: my - 10, height: 20, rx: 10, fill: token('--pastel-lilac', '#e8e0f1') }, chip);
        const ct = svgEl('text', { x: mx + 8, y: my + 4 }, chip);
        ct.textContent = String(edge.chip);
        const w = measureText(String(edge.chip), '600 11px Inter, ui-sans-serif, sans-serif') + 16;
        cr.setAttribute('width', String(w));
        popIn(chip, delay + 300, 'pop', input.reducedMotion);
        chip.addEventListener('click', () => {
          const insight = suggested.find((ins) => ins.anchor.kind === 'link' && ins.anchor.from === edge.from && ins.anchor.to === edge.to);
          if (insight) input.onReviewInsight(insight.id);
        });
      }
    });

    const clareBoxes = input.insights
      .filter((ins) => ins.view === 'lines' && ins.proposal?.some((item) => item.kind === 'task_create'))
      .map((ins) => {
        const projectId = ins.anchor.kind === 'project' ? ins.anchor.id : null;
        const lane = layout.lanes.find((l) => l.id === projectId);
        if (!lane || !projectId) return null;
        const col = Math.max(...layout.boxes.filter((b) => b.projectId === projectId).map((b) => b.column), 0) + 1;
        return {
          id: `suggest-${projectId}`,
          title: 'Staff consult?',
          subtitle: 'Clare suggests',
          state: 'suggested',
          projectId,
          x: FLOW_G.lanePadX + col * (FLOW_G.boxW + FLOW_G.colGap),
          y: lane.y + FLOW_G.laneHeadH + FLOW_G.rowPitch,
          width: FLOW_G.boxW,
          height: FLOW_G.boxH,
          column: col,
          row: 1,
          parentId: null,
          kind: 'task' as const
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const boxes = [...layout.boxes, ...clareBoxes];
    for (const box of boxes) {
      const task = visible.find((t) => t.id === box.id);
      const isMilestone = box.kind === 'milestone' || box.state === 'milestone';
      const state = task ? nodeState(task, input.tasks, input.now).state : box.state;
      const g = svgEl(
        'g',
        {
          class: `fl-box${box.id === selected ? ' is-selected' : ''}${selected && !related.has(box.id) && box.state !== 'suggested' ? ' is-dim' : ''}`,
          tabindex: '0',
          role: 'button',
          'aria-label': box.title,
          'data-part': 'box',
          'data-task-id': box.id,
          'data-box-id': box.id,
          'data-state': isMilestone ? 'milestone' : state,
          'data-dim': selected && !related.has(box.id) && box.state !== 'suggested' ? 'true' : 'false'
        },
        svg
      );
      const colour = colours[box.projectId ?? ''] ?? token('--wave', '#376fb7');
      const rx = isMilestone ? FLOW_G.milestoneR : FLOW_G.radius;
      if (box.id === selected) {
        svgEl(
          'rect',
          { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8, rx: rx + 4, fill: FLOW_SELECT_HALO },
          g
        );
      }
      svgEl('rect', { x: box.x, y: box.y + 1.5, width: box.width, height: box.height, rx, fill: FLOW_BOX_SHADOW }, g);
      const face = svgEl(
        'rect',
        {
          class: 'b-face',
          'data-part': 'box-face',
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rx,
          fill: isMilestone ? `color-mix(in srgb, ${colour} 10%, #fff)` : box.state === 'suggested' ? FLOW_CLARE_FILL : '#fff',
          stroke:
            box.id === selected
              ? token('--wave', '#376fb7')
              : isMilestone
                ? colour
                : box.state === 'suggested'
                  ? token('--pastel-lilac-ink', '#5d4e70')
                  : FLOW_BOX_STROKE,
          'stroke-width': box.id === selected || isMilestone ? 2 : 1
        },
        g
      );
      if (box.state === 'suggested') face.setAttribute('stroke-dasharray', '5 4');
      let tx = box.x + 22;
      if (isMilestone) {
        const cx = box.x + 24;
        const cy = box.y + box.height / 2;
        svgEl('path', { d: `M${cx} ${cy - 7}L${cx + 7} ${cy}L${cx} ${cy + 7}L${cx - 7} ${cy}Z`, fill: colour }, g);
        tx = box.x + 40;
      } else {
        svgEl(
          'rect',
          {
            'data-part': 'box-stripe',
            x: box.x + 10,
            y: box.y + 14,
            width: 4,
            height: box.height - 28,
            rx: 2,
            fill: stripeFill(box.state === 'suggested' ? 'suggested' : state)
          },
          g
        );
      }
      const copy = task ? landsCopy(task, projected, state) : { text: box.subtitle || 'Clare suggests', tone: box.state === 'suggested' ? 'clare' : '' };
      const title = svgEl('text', { class: 'fl-box__title', 'data-part': 'box-title', x: tx, y: box.y + 28 }, g);
      title.textContent = fitText(box.title, '600 14px Inter, ui-sans-serif, sans-serif', box.width - (tx - box.x) - 10);
      const sub = svgEl(
        'text',
        { class: `fl-box__sub${copy.tone ? ` sub--${copy.tone}` : ''}${copy.tone === 'danger' ? ' is-late' : ''}`, 'data-part': 'box-sub', x: tx, y: box.y + 46 },
        g
      );
      sub.textContent = fitText(copy.text, '12px Inter, ui-sans-serif, sans-serif', box.width - (tx - box.x) - 10);
      if (state === 'done') g.setAttribute('opacity', '0.45');
      const first = box.projectId ? firsts.get(box.projectId) : undefined;
      if (first && first.taskId === box.id) {
        const badge = svgEl('g', { 'data-part': 'do-first' }, g);
        const label = `Do first · frees ${first.unlockCount}`;
        const br = svgEl(
          'rect',
          { x: box.x + 10, y: box.y - 10, height: 20, rx: 10, fill: FLOW_BADGE_FILL, stroke: token('--high-sea-ink', '#a85a0c'), 'stroke-width': 1 },
          badge
        );
        const bt = svgEl('text', { x: box.x + 19, y: box.y + 4 }, badge);
        bt.textContent = label;
        br.setAttribute('width', String(measureText(label, '600 11px Inter, ui-sans-serif, sans-serif') + 18));
        popIn(badge, 700, 'pop', input.reducedMotion);
      }
      if (task) {
        const handle = svgEl('circle', { cx: box.x + box.width, cy: box.y + box.height / 2, r: 6, class: 'fl-box__handle' }, g);
        g.addEventListener('click', () => input.onSelect(task.id));
        g.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') input.onSelect(task.id);
        });
        handle.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          const rubber = svgEl('path', { class: 'fl-edge', 'stroke-dasharray': '5 4', fill: 'none', stroke: token('--wave', '#376fb7') }, svg);
          const move = (ev: PointerEvent) => {
            const rect = svg.getBoundingClientRect();
            const x = ((ev.clientX - rect.left) / rect.width) * layout.width;
            const y = ((ev.clientY - rect.top) / rect.height) * layout.height;
            rubber.setAttribute('d', orthogonalPath(box.x + box.width, box.y + box.height / 2, x, y));
          };
          const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            rubber.remove();
            const target = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el instanceof Element && el.closest('[data-box-id]'));
            const id = (target as Element | undefined)?.closest<HTMLElement>('[data-box-id]')?.dataset.boxId;
            if (!id || id === task.id) return;
            if (!canLink(task.id, id, input.tasks) || wouldCreateCycle(task.id, id, input.tasks)) {
              showHubToast('That link would create a cycle.');
              return;
            }
            input.onLink(task.id, id);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
      }
      const q = input.search.trim().toLowerCase();
      if (q && !box.title.toLowerCase().includes(q)) g.classList.add('is-search-dim');
      popIn(g, box.column * 40 + 80, 'rise', input.reducedMotion);
    }

    stage.replaceChildren(svg);
    viewport.querySelector('[data-part="minimap"]')?.remove();
    const fittedH = viewport.clientWidth > 0 ? layout.height * (viewport.clientWidth / Math.max(layout.width, 1)) : 0;
    const overflows = scale !== 1 || Math.abs(panX) > 2 || Math.abs(panY) > 2 || fittedH > viewport.clientHeight + 24;
    if (overflows) {
      const mini = el('div', 'graph-minimap');
      mini.dataset.part = 'minimap';
      mini.setAttribute('aria-hidden', 'true');
      viewport.append(mini);
    }
    void input.onWhatIf;
    void input.onApplyWhatIf;
  };

  paint();
  fit.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    applyPan();
  });
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < 40) return;
      event.preventDefault();
      scale = Math.min(2.2, Math.max(0.4, scale + (event.deltaY > 0 ? -0.08 : 0.08)));
      applyPan();
    },
    { passive: false }
  );
  let drag: { x: number; y: number } | null = null;
  viewport.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('[data-box-id], .fl-box__handle')) return;
    drag = { x: event.clientX - panX, y: event.clientY - panY };
  });
  const onMove = (event: PointerEvent) => {
    if (!drag) return;
    panX = event.clientX - drag.x;
    panY = event.clientY - drag.y;
    applyPan();
  };
  const onUp = () => {
    drag = null;
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  return {
    root,
    update: (next) => {
      input = next;
      paint();
    },
    focus: (id) => {
      const node = root.querySelector(`[data-box-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: 'center', inline: 'center', behavior: input.reducedMotion ? 'auto' : 'smooth' });
      node?.classList.add('is-pulse');
    },
    teardown: () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      host.replaceChildren();
    }
  };
}
