import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from 'd3-force';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { isBlocked } from '@/domain/board';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { showViewLoading } from '@/views/feedback';
import { renderGraphFamilyPills } from '@/views/stretch-pills';
import { renderBoardTaskTile, renderTaskLinkList } from '@/views/task-tile';
import { renderBlockerPipes } from '@/views/blocker-pipes';
import { createVizNodeList } from '@/views/viz-node-list';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubSearch, createHubToolbar } from '@/views/hub-kit';

type GraphMode = 'blockers' | 'workstreams';

function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

type GraphNode = {
  id: string;
  kind: 'task' | 'project';
  label: string;
  domain?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'blocker' | 'workstream';
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildWorkstreamModel(tasks: Task[], projects: Project[]): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = [
    ...projects.map((p) => ({
      id: p.id,
      kind: 'project' as const,
      label: p.title
    })),
    ...tasks
      .filter((t) => t.parent_project_id)
      .map((t) => ({
        id: t.id,
        kind: 'task' as const,
        label: t.title,
        domain: t.domain
      }))
  ];
  const projectIds = new Set(projects.map((p) => p.id));
  const links: GraphLink[] = tasks
    .filter((t) => t.parent_project_id && projectIds.has(t.parent_project_id))
    .map((t) => ({
      source: t.parent_project_id!,
      target: t.id,
      kind: 'workstream' as const
    }));
  return { nodes, links };
}

function renderBlockerDetail(task: Task, tasks: Task[]): HTMLElement {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const detail = el('div', 'task-tile__detail-body');
  const blockers = task.depends_on
    .map((id) => byId.get(id))
    .filter((item): item is Task => Boolean(item));
  const blocking = tasks.filter((item) => item.depends_on.includes(task.id));

  if (blockers.length) {
    detail.append(
      renderTaskLinkList(
        'Blocked by',
        blockers.map((blocker) => ({
          title: blocker.title,
          meta: blocker.status.replace('_', ' ')
        }))
      )
    );
  }
  if (blocking.length) {
    detail.append(
      renderTaskLinkList(
        'Blocking',
        blocking.map((blocked) => ({
          title: blocked.title,
          meta: isBlocked(blocked, byId) ? 'blocked' : blocked.status.replace('_', ' ')
        }))
      )
    );
  }
  if (!blockers.length && !blocking.length) {
    detail.append(el('p', 'hierarchy-meta', 'No blocker links on this task.'));
  }
  return detail;
}

function mountBlockerGraph(
  host: HTMLElement,
  tasks: Task[],
  projects: Project[],
  editorHost: HTMLElement,
  selectedId: string | null,
  expandedId: string | null,
  onSelect: (taskId: string | null) => void,
  onExpand: (taskId: string, open: boolean) => void,
  onRefresh: () => void
): void {
  host.replaceChildren();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const focusId = selectedId;

  if (focusId) {
    const back = el('button', 'btn btn--ghost blocker-pipe-back', '← Back to overview');
    back.type = 'button';
    back.addEventListener('click', () => onSelect(null));
    host.append(back);
  }

  host.append(
    renderBlockerPipes(focusId, tasks, (gateId) => {
      onSelect(selectedId === gateId ? null : gateId);
    })
  );

  const expandHost = el('div', 'task-stack blocker-expand');
  if (selectedId) {
    const task = byId.get(selectedId);
    if (task) {
      const waitingOn = task.depends_on
        .map((id) => byId.get(id)?.title)
        .filter(Boolean)
        .join(', ');
      expandHost.append(
        renderBoardTaskTile(
          task,
          waitingOn ? `waiting on ${waitingOn}` : 'blocker links',
          renderBlockerDetail(task, tasks),
          {
            editorHost,
            projects,
            onSaved: onRefresh,
            open: expandedId === selectedId,
            onToggle: (taskId, open) => onExpand(taskId, open)
          }
        )
      );
    }
  }
  host.append(expandHost);
}

function mountWorkstreamGraph(
  host: HTMLElement,
  tasks: Task[],
  projects: Project[],
  editorHost: HTMLElement,
  selectedId: string | null,
  expandedId: string | null,
  onSelect: (taskId: string | null) => void,
  onExpand: (taskId: string, open: boolean) => void,
  onRefresh: () => void
): void {
  const { nodes, links } = buildWorkstreamModel(tasks, projects);
  host.replaceChildren();

  if (!nodes.length) {
    host.append(
      el(
        'p',
        'empty-state',
        'No project workstreams match this filter. Assign tasks to a project.'
      )
    );
    return;
  }

  const width = host.clientWidth || 960;
  const height = Math.max(520, Math.floor(window.innerHeight * 0.62));
  const canvas = document.createElement('canvas');
  canvas.className = 'graph-canvas';
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.append(canvas);

  const tip = el('div', 'graph-tip');
  tip.hidden = true;
  host.append(tip);

  const ctx = canvas.getContext('2d')!;
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l }));

  let selected: string | null = selectedId;
  let hover: GraphNode | null = null;

  const simulation: Simulation<GraphNode, GraphLink> = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(simLinks)
        .id((n) => n.id)
        .distance(88)
        .strength(0.45)
    )
    .force('charge', forceManyBody<GraphNode>().strength(-640))
    .force('x', forceX(width / 2).strength(0.04))
    .force('y', forceY(height / 2).strength(0.04))
    .force('collide', forceCollide<GraphNode>().radius((n) => (n.kind === 'project' ? 46 : 28)))
    .on('tick', draw);

  function draw(): void {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1.25;
    for (const link of simLinks) {
      const s = typeof link.source === 'object' ? link.source : null;
      const t = typeof link.target === 'object' ? link.target : null;
      if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue;
      ctx.strokeStyle = tokenColor('--wave', '#376fb7');
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = node.kind === 'project' ? 16 : 11;
      ctx.beginPath();
      ctx.fillStyle =
        node.kind === 'project'
          ? tokenColor('--navy', '#17375e')
          : node.id === selected || node === hover
            ? tokenColor('--wave', '#376fb7')
            : tokenColor('--navy-2', '#244f7c');
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (node.id === selected || node === hover) {
        ctx.fillStyle = tokenColor('--ink', '#13233a');
        ctx.font = `${getComputedStyle(document.documentElement).getPropertyValue('--text-xs') || '12px'} ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'Inter, sans-serif'}`;
        ctx.fillText(node.label.slice(0, 28), node.x + r + 6, node.y + 4);
      }
    }
  }

  function nodeAt(mx: number, my: number): GraphNode | null {
    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = node.kind === 'project' ? 22 : 18;
      if (Math.hypot(node.x - mx, node.y - my) <= r) return node;
    }
    return null;
  }

  function showSelection(node: GraphNode): void {
    selected = node.id;
    if (node.kind === 'task') onSelect(node.id);
    else onSelect(null);
    draw();
  }

  const expandHost = el('div', 'task-stack graph-expand');
  if (selectedId) {
    const task = tasks.find((item) => item.id === selectedId);
    if (task) {
      const project = projects.find((item) => item.id === task.parent_project_id);
      const detail = el('div', 'task-tile__detail-body');
      detail.append(
        el(
          'p',
          'hierarchy-meta',
          project ? `Project · ${project.title}` : 'No project assigned'
        )
      );
      expandHost.append(
        renderBoardTaskTile(task, project?.title ?? task.domain, detail, {
          editorHost,
          projects,
          onSaved: onRefresh,
          open: expandedId === selectedId,
          onToggle: (taskId, open) => onExpand(taskId, open)
        })
      );
    }
  }
  host.append(expandHost);

  host.append(
    createVizNodeList(
      'Workstream nodes',
      simNodes.map((node) => ({ id: node.id, kind: node.kind, label: node.label })),
      (node) => {
        const hit = simNodes.find((entry) => entry.id === node.id);
        if (hit) showSelection(hit);
      },
      { selectedId: selected, collapsed: simNodes.length > 12 }
    )
  );

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const node = nodeAt(event.clientX - rect.left, event.clientY - rect.top);
    hover = node;
    if (node) {
      tip.hidden = false;
      tip.textContent = node.label;
      tip.style.left = `${event.clientX - rect.left + 12}px`;
      tip.style.top = `${event.clientY - rect.top + 12}px`;
    } else {
      tip.hidden = true;
    }
    draw();
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const node = nodeAt(event.clientX - rect.left, event.clientY - rect.top);
    if (node) showSelection(node);
  });

  simulation.alpha(1).restart();
}

function hashGraphMode(): GraphMode {
  return hashQuery().get('mode') === 'workstreams' ? 'workstreams' : 'blockers';
}

type LiveGraph = {
  canvas: HTMLElement;
  mode: GraphMode;
  setMode: (mode: GraphMode) => void;
};

let liveGraph: LiveGraph | null = null;

/** Graph rail page — readable blocker map plus workstream force layout. */
export async function renderGraphView(canvas: HTMLElement): Promise<void> {
  if (liveGraph && liveGraph.canvas === canvas && canvas.querySelector('.graph-host')) {
    liveGraph.setMode(hashGraphMode());
    return;
  }

  showViewLoading(canvas, 'Loading graph…', '.graph-host');
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);

  const session: LiveGraph = {
    canvas,
    mode: hashGraphMode(),
    setMode: () => undefined
  };
  liveGraph = session;

  canvas.replaceChildren();

  const toolbar = createHubToolbar('graph-toolbar');
  const search = createHubSearch({
    placeholder: session.mode === 'blockers' ? 'Filter gates…' : 'Filter nodes…',
    ariaLabel: 'Filter graph'
  });
  function onNavigate(href: string): void {
    if (href.startsWith('#/graph')) {
      session.setMode(href.includes('workstreams') ? 'workstreams' : 'blockers');
      if (location.hash !== href) location.hash = href;
      return;
    }
    location.hash = href;
  }

  function paintChrome(): void {
    const filters = createCollapsibleFilters({
      id: 'graph',
      ariaLabel: 'Filters',
      className: 'hub-filters--inline'
    });
    filters.panel.append(search.el);
    toolbar.replaceChildren(renderGraphFamilyPills('graph', session.mode, onNavigate), filters.root);
    search.input.placeholder = session.mode === 'blockers' ? 'Filter gates…' : 'Filter nodes…';
  }

  paintChrome();
  canvas.append(toolbar);

  const confirmHost = el('div', 'graph-confirm');
  canvas.append(confirmHost);

  const host = el('div', 'graph-host');
  const stage = el('div', 'graph-stage');
  host.append(stage);
  canvas.append(host);

  let selectedId: string | null = null;
  let expandedId: string | null = null;

  const paint = () => {
    confirmHost.replaceChildren();
    const q = search.input.value.trim().toLowerCase();
    const filteredTasks = q
      ? tasks.filter((task) => task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q))
      : tasks;
    const filteredProjects = q
      ? projects.filter((project) => project.title.toLowerCase().includes(q))
      : projects;
    const scopedTasks = filteredTasks.length ? filteredTasks : tasks;

    if (selectedId && !scopedTasks.some((task) => task.id === selectedId)) {
      selectedId = null;
      expandedId = null;
    }
    if (expandedId && expandedId !== selectedId) {
      expandedId = null;
    }

    if (session.mode === 'blockers') {
      mountBlockerGraph(
        stage,
        scopedTasks,
        projects,
        confirmHost,
        selectedId,
        expandedId,
        (taskId) => {
          selectedId = taskId;
          expandedId = null;
          paint();
        },
        (taskId, open) => {
          expandedId = open ? taskId : null;
          paint();
        },
        paint
      );
      return;
    }

    mountWorkstreamGraph(
      stage,
      scopedTasks,
      filteredProjects.length ? filteredProjects : projects,
      confirmHost,
      selectedId,
      expandedId,
      (taskId) => {
        selectedId = taskId;
        expandedId = null;
        paint();
      },
      (taskId, open) => {
        expandedId = open ? taskId : null;
        paint();
      },
      paint
    );
  };

  session.setMode = (next) => {
    if (session.mode === next) return;
    session.mode = next;
    paintChrome();
    paint();
  };

  search.input.addEventListener('input', () => paint());
  paint();
}

/** Test hook — drop the live graph session between specs. */
export function resetGraphSession(): void {
  liveGraph = null;
}
