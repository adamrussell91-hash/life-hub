import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { layoutProjectBranch, type BranchNode } from '@/domain/branch';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubFilter, createHubToolbar } from '@/views/hub-kit';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderGraphFamilyPills } from '@/views/stretch-pills';
import { renderTaskEditor } from '@/views/task-editor';
import { createVizNodeList } from '@/views/viz-node-list';

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

function showPreview(preview: HTMLElement, node: BranchNode, task?: Task): void {
  preview.hidden = false;
  const meta =
    node.kind === 'project'
      ? node.id
      : [task?.status, task?.priority, task?.due_date ? formatDisplayDate(task.due_date) : null].filter(Boolean).join(' · ');
  preview.replaceChildren(
    el('p', 'graph-preview__eyebrow', node.kind),
    el('h3', 'graph-preview__title', node.label),
    el('p', 'graph-preview__meta', meta || node.id)
  );
}

function mountBranch(
  host: HTMLElement,
  project: Project,
  tasks: Task[],
  projects: Project[]
): void {
  host.replaceChildren();
  const layout = layoutProjectBranch(project, tasks, { colWidth: 260 });
  if (layout.nodes.length <= 1) {
    host.append(
      el(
        'p',
        'empty-state',
        'This project has no tasks yet. Assign tasks with parent or depends_on links.'
      )
    );
    return;
  }

  const pad = 24;
  const width = Math.max(layout.width + pad, host.clientWidth || 720);
  const height = Math.max(layout.height + pad, 420);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'branch-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Branch view for ${project.title}`);
  svg.style.width = '100%';
  svg.style.height = `${Math.min(height, Math.max(480, window.innerHeight * 0.58))}px`;

  const tip = el('div', 'graph-tip');
  tip.hidden = true;
  const preview = el('aside', 'graph-preview');
  preview.hidden = true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  const edges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edges.setAttribute('class', 'branch-edges');
  for (const edge of layout.edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (from.x + to.x) / 2;
    path.setAttribute(
      'd',
      `M ${from.x + 56} ${from.y + 18} C ${midX} ${from.y + 18}, ${midX} ${to.y + 18}, ${to.x} ${to.y + 18}`
    );
    path.setAttribute(
      'class',
      edge.kind === 'depends_on' ? 'branch-edge branch-edge--depends' : 'branch-edge'
    );
    edges.append(path);
  }
  svg.append(edges);

  const nodes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodes.setAttribute('class', 'branch-nodes');
  for (const node of layout.nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `branch-node branch-node--${node.kind}`);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${node.kind}: ${node.label}`);
    g.style.setProperty('--branch-delay', `${node.depth * 80}ms`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');
    rect.setAttribute('width', '220');
    rect.setAttribute('height', '36');
    rect.setAttribute('class', 'branch-node__shape');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(node.x + 12));
    text.setAttribute('y', String(node.y + 23));
    text.setAttribute('class', 'branch-node__label');
    text.setAttribute('title', node.label);
    text.textContent = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;

    const select = () => {
      showPreview(preview, node, byId.get(node.id));
      const task = byId.get(node.id);
      if (task) {
        const edit = el('button', 'btn btn--ghost', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', () => {
          renderTaskEditor(preview, task, projects, () =>
            mountBranch(host, project, tasks, projects)
          );
        });
        preview.append(edit);
      }
    };
    g.addEventListener('click', select);
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
    g.addEventListener('mouseenter', (event) => {
      const rectHost = host.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = node.label;
      tip.style.left = `${event.clientX - rectHost.left + 12}px`;
      tip.style.top = `${event.clientY - rectHost.top + 12}px`;
    });
    g.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });

    g.append(rect, text);
    nodes.append(g);
  }
  svg.append(nodes);

  host.append(
    svg,
    tip,
    preview,
    createVizNodeList(
      `Branch nodes for ${project.title}`,
      layout.nodes.map((node) => ({ id: node.id, kind: node.kind, label: node.label })),
      (entry) => {
        const node = nodeMap.get(entry.id);
        if (node) {
          showPreview(preview, node, byId.get(node.id));
          const task = byId.get(node.id);
          if (task) {
            const edit = el('button', 'btn btn--ghost', 'Edit');
            edit.type = 'button';
            edit.addEventListener('click', () => {
              renderTaskEditor(preview, task, projects, () =>
                mountBranch(host, project, tasks, projects)
              );
            });
            preview.append(edit);
          }
        }
      },
      { collapsed: layout.nodes.length > 10 }
    )
  );
}

/** Spec §6.5 — hierarchical / depends_on tree for one project. */
export async function renderBranchView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading branch…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const active = projects.filter((p) => p.status !== 'archived_dead');

  canvas.replaceChildren();
  const toolbar = createHubToolbar('graph-toolbar');
  toolbar.append(renderGraphFamilyPills('branch'));
  canvas.append(toolbar);

  if (!active.length) {
    canvas.append(el('p', 'empty-state', 'No active projects to branch.'));
    return;
  }
  const preferred = active.find((p) => p.id === 'proj_mindworks') ?? active[0];
  const queryProject = hashQuery().get('project');
  let projectId =
    queryProject && active.some((project) => project.id === queryProject)
      ? queryProject
      : preferred.id;
  const projectFilter = createHubFilter({
    key: 'Project',
    label: 'Project',
    defaultValue: preferred.id,
    options: active.map((project) => ({ value: project.id, label: project.title })),
    value: projectId,
    onChange: (value) => {
      projectId = value;
      paint();
    }
  });
  const filters = createCollapsibleFilters({
    id: 'branch',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline',
    active: projectId !== preferred.id
  });
  filters.panel.append(projectFilter.el);
  toolbar.append(filters.root);

  const host = el('div', 'branch-host graph-host');
  canvas.append(host);

  const paint = () => {
    const project = active.find((p) => p.id === projectId) ?? preferred;
    mountBranch(host, project, tasks, active);
  };
  paint();
}
