import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { criticalPath, doFirst, nodeState, projectedDates, wouldCreateCycle } from '@/domain/graph-model';
import { canLink, layoutBranchFlow } from '@/domain/graph-branch-layout';
import type { GraphInsight } from '@/domain/graph-insights';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { orthogonalPath } from '../../../life/js/app/chart-kit/flowchart-lanes.js';
import { el } from '@/views/hub-kit';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';

export type BranchMount = {
  root: HTMLElement;
  focus: (id: string) => void;
  teardown: () => void;
};

function landsCopy(task: Task, projected: ReturnType<typeof projectedDates>): string {
  const row = projected.get(task.id);
  if (!row) return task.status.replace('_', ' ');
  const land = `lands ${formatDisplayDate(row.finish)}`;
  return row.late ? `${land} · late` : land;
}

export function mountBranchView(
  host: HTMLElement,
  input: {
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
  }
): BranchMount {
  host.replaceChildren();
  const root = el('div', 'graph-branch');
  const tools = el('div', 'graph-branch__tools');
  const hide = el('button', 'btn btn--ghost', input.hideDone ? 'Show done' : 'Hide done');
  hide.type = 'button';
  hide.addEventListener('click', input.onToggleHideDone);
  const fit = el('button', 'btn btn--ghost', 'Fit');
  fit.type = 'button';
  tools.append(hide, fit);

  const viewport = el('div', 'graph-branch__viewport');
  const stage = el('div', 'graph-branch__stage');
  viewport.append(stage);
  root.append(tools, viewport);

  const visible = input.hideDone
    ? input.tasks.filter((t) => t.status !== 'done' && t.status !== 'dead')
    : input.tasks;
  const crit = new Set(input.projects.flatMap((p) => criticalPath(p.id, input.tasks)));
  const firsts = new Set(
    input.projects
      .map((p) => doFirst(input.tasks.filter((t) => t.parent_project_id === p.id), input.now)[0]?.taskId)
      .filter((id): id is string => Boolean(id))
  );
  const projected = projectedDates(visible, input.projects, input.now);
  const layout = layoutBranchFlow(visible, input.projects, { criticalIds: crit, hideDone: input.hideDone });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'branch-flow');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.style.width = `${layout.width}px`;
  svg.style.height = `${layout.height}px`;

  for (const lane of layout.lanes) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(lane.x));
    rect.setAttribute('y', String(lane.y));
    rect.setAttribute('width', String(lane.width));
    rect.setAttribute('height', String(lane.height));
    rect.setAttribute('class', 'fl-lane');
    svg.append(rect);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(lane.x + 16));
    label.setAttribute('y', String(lane.y + 20));
    label.setAttribute('class', 'fl-lane__label');
    label.textContent = lane.label;
    svg.append(label);
  }

  const selected = input.selectedId;
  const related = new Set<string>();
  if (selected) {
    related.add(selected);
    for (const edge of layout.edges) {
      if (edge.from === selected || edge.to === selected) {
        related.add(edge.from);
        related.add(edge.to);
      }
    }
  }

  for (const edge of layout.edges) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', orthogonalPath(edge.x0, edge.y0, edge.x1, edge.y1));
    path.setAttribute(
      'class',
      `fl-edge${edge.critical ? ' fl-edge--critical' : ''}${selected && !related.has(edge.from) ? ' is-dim' : ''}`
    );
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    path.tabIndex = 0;
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') input.onUnlink(edge.from, edge.to);
    });
    svg.append(path);
  }

  for (const insight of input.insights.filter((ins) => ins.view === 'branch' && ins.anchor.kind === 'link')) {
    const anchor = insight.anchor;
    if (anchor.kind !== 'link') continue;
    const from = layout.boxes.find((b) => b.id === anchor.from);
    const to = layout.boxes.find((b) => b.id === anchor.to);
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', orthogonalPath(from.x + from.width, from.y + from.height / 2, to.x, to.y + to.height / 2));
    path.setAttribute('class', 'fl-edge fl-edge--suggested');
    path.addEventListener('click', () => input.onReviewInsight(insight.id));
    svg.append(path);
  }

  for (const box of layout.boxes) {
    const task = visible.find((t) => t.id === box.id);
    if (!task) continue;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const state = nodeState(task, input.tasks, input.now);
    g.setAttribute('transform', `translate(${box.x} ${box.y})`);
    g.setAttribute('class', `fl-box${box.id === selected ? ' is-selected' : ''}${selected && !related.has(box.id) ? ' is-dim' : ''}`);
    g.dataset.boxId = box.id;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', task.title);
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shape.setAttribute('width', String(box.width));
    shape.setAttribute('height', String(box.height));
    shape.setAttribute('class', 'fl-box__shape');
    const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    stripe.setAttribute('width', '4');
    stripe.setAttribute('height', String(box.height));
    stripe.setAttribute('class', `fl-box__stripe fl-box__stripe--${state.state}`);
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', '14');
    title.setAttribute('y', '20');
    title.setAttribute('class', 'fl-box__title');
    title.textContent = task.title;
    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('x', '14');
    sub.setAttribute('y', '38');
    sub.setAttribute('class', `fl-box__sub${projected.get(task.id)?.late ? ' is-late' : ''}`);
    sub.textContent = `${state.state} · ${landsCopy(task, projected)}`;
    g.append(shape, stripe, title, sub);
    if (firsts.has(task.id)) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', '14');
      badge.setAttribute('y', '-6');
      badge.setAttribute('class', 'fl-box__badge');
      const unlock = doFirst([task, ...input.tasks], input.now)[0];
      badge.textContent = `Do first · frees ${unlock?.unlockCount ?? 0}`;
      g.append(badge);
    }
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.setAttribute('cx', String(box.width));
    handle.setAttribute('cy', String(box.height / 2));
    handle.setAttribute('r', '6');
    handle.setAttribute('class', 'fl-box__handle');
    g.append(handle);
    g.addEventListener('click', () => input.onSelect(task.id));
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.onSelect(task.id);
      if (event.key === 'l' || event.key === 'L') handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    handle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const rubber = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rubber.setAttribute('class', 'fl-edge fl-edge--rubber');
      svg.append(rubber);
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
    const q = input.search.trim().toLowerCase();
    if (q && !task.title.toLowerCase().includes(q)) g.classList.add('is-search-dim');
    svg.append(g);
  }

  let scale = 1;
  let panX = 0;
  let panY = 0;
  const applyPan = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };
  fit.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    applyPan();
  });
  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < 40) return;
    event.preventDefault();
    scale = Math.min(2.2, Math.max(0.4, scale + (event.deltaY > 0 ? -0.08 : 0.08)));
    applyPan();
  }, { passive: false });
  let drag: { x: number; y: number } | null = null;
  viewport.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('[data-box-id], .fl-box__handle')) return;
    drag = { x: event.clientX - panX, y: event.clientY - panY };
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    panX = event.clientX - drag.x;
    panY = event.clientY - drag.y;
    applyPan();
  });
  window.addEventListener('pointerup', () => {
    drag = null;
  });

  stage.append(svg);
  const minimap = el('div', 'graph-minimap');
  minimap.setAttribute('aria-hidden', 'true');
  viewport.append(minimap);
  host.append(root);
  void input.onWhatIf;
  void input.onApplyWhatIf;
  return {
    root,
    focus: (id) => {
      const node = root.querySelector(`[data-box-id="${CSS.escape(id)}"]`);
      node?.scrollIntoView({ block: 'center', inline: 'center', behavior: input.reducedMotion ? 'auto' : 'smooth' });
      node?.classList.add('is-pulse');
    },
    teardown: () => host.replaceChildren()
  };
}
