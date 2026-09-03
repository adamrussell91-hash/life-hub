import type { Area } from '@/schemas/area';
import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { deleteProjectNow } from '@/views/card-actions';
import { renderCardMenu } from '@/views/card-menu';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { renderTaskEditor } from '@/views/task-editor';
import { projectPageHash } from '@/domain/cards';
import { formatTagsInput, parseTagsInput } from '@/domain/hierarchy';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubFilter, createHubSearch, createHubToolbar, el } from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';

let goalArea = 'all';
let goalQuery = '';

function tagRow(tags: string[]): HTMLElement {
  const row = el('div', 'hierarchy-tags');
  for (const tag of tags) row.append(el('span', 'chip', tag));
  return row;
}

function renderMilestones(project: Project): HTMLElement {
  const wrap = el('div', 'hierarchy-milestones');
  if (project.milestones.length === 0) {
    wrap.append(el('p', 'hierarchy-meta', 'No milestones yet.'));
    return wrap;
  }
  const list = el('ul', 'hierarchy-milestone-list');
  for (const milestone of project.milestones) {
    const item = el('li', 'hierarchy-milestone');
    item.append(
      el('span', 'hierarchy-milestone__title', milestone.title),
      el('span', 'chip chip--muted', milestone.status)
    );
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderProjectCard(
  project: Project,
  tasks: Task[],
  editorHost: HTMLElement,
  onReload: () => void
): HTMLElement {
  const card = el('article', 'glass-tile hierarchy-card hierarchy-card--project');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const projectTasks = tasks.filter((t) => t.parent_project_id === project.id && t.kind !== 'step');
  const openCount = projectTasks.filter((t) => t.status !== 'done' && t.status !== 'dead').length;

  const title = el('h3', 'hierarchy-card__title', project.title);
  const head = el('div', 'hierarchy-card__head');
  head.append(title);
  head.append(
    renderCardMenu(`${project.title} card menu`, [
      {
        id: 'page',
        label: 'Full page',
        onSelect: () => {
          location.hash = projectPageHash(project.id);
        }
      },
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => deleteProjectNow(project, onReload, editorHost)
      }
    ])
  );
  const meta = el(
    'p',
    'hierarchy-meta',
    `${openCount} open task${openCount === 1 ? '' : 's'} · ${project.milestones.length} milestone${
      project.milestones.length === 1 ? '' : 's'
    }`
  );
  card.append(head, meta);
  if (project.tags.length) card.append(tagRow(project.tags));

  const detail = el('div', 'hierarchy-card__detail');
  detail.hidden = true;
  detail.append(renderMilestones(project));

  const taskList = el('ul', 'hierarchy-task-list');
  for (const task of projectTasks.slice(0, 6)) {
    const row = el('li', 'hierarchy-task-row');
    const btn = el('button', 'btn btn--ghost hierarchy-task-row__open', task.title);
    btn.type = 'button';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      renderTaskEditor(editorHost, task, [project], onReload);
    });
    row.append(btn, el('span', 'chip chip--muted', task.status));
    taskList.append(row);
  }
  if (projectTasks.length > 6) {
    taskList.append(el('li', 'hierarchy-meta', `+${projectTasks.length - 6} more`));
  }
  detail.append(taskList);
  card.append(detail);

  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    detail.hidden = !detail.hidden;
    card.classList.toggle('hierarchy-card--open', !detail.hidden);
  });

  return card;
}

function renderGoalSection(
  goal: Goal,
  areaTitle: string | undefined,
  projects: Project[],
  tasks: Task[],
  editorHost: HTMLElement,
  onReload: () => void
): HTMLElement {
  const section = el('section', 'hierarchy-goal');
  const head = el('div', 'hierarchy-goal__head');
  head.append(
    el('p', 'page-header__eyebrow', areaTitle ?? 'Goal'),
    el('h2', 'hierarchy-goal__title', goal.title)
  );
  if (goal.description) head.append(el('p', 'hierarchy-meta', goal.description));
  if (goal.tags.length) head.append(tagRow(goal.tags));
  section.append(head);

  const grid = el('div', 'hierarchy-grid');
  const goalProjects = projects.filter((p) => p.parent_goal_id === goal.id && p.status !== 'archived_dead');
  if (goalProjects.length === 0) {
    grid.append(el('p', 'empty-state', 'No projects under this goal yet.'));
  } else {
    for (const project of goalProjects) {
      grid.append(renderProjectCard(project, tasks, editorHost, onReload));
    }
  }
  section.append(grid);
  return section;
}

/** Area → Goal → Project hierarchy with expandable project cards. */
export async function renderGoalsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading hierarchy…', '.hierarchy-toolbar');
  try {
    const [areas, goals, projects, tasks] = await Promise.all([
      tasksApi.listAreas(),
      tasksApi.listGoals(),
      tasksApi.listProjects(),
      tasksApi.listTasks()
    ]);
    paintGoals(canvas, areas, goals, projects, tasks);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load hierarchy.')));
  }
}

function paintGoals(
  canvas: HTMLElement,
  areas: Area[],
  goals: Goal[],
  projects: Project[],
  tasks: Task[]
): void {
  const restoreSearch =
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.getAttribute('aria-label') === 'Filter goals';
  const searchPos = restoreSearch
    ? (document.activeElement as HTMLInputElement).selectionStart
    : null;

  canvas.replaceChildren();
  const editorHost = el('div', 'hierarchy-editor-host');
  const reload = () => {
    void renderGoalsView(canvas);
  };

  const toolbar = createHubToolbar('hierarchy-toolbar');
  const search = createHubSearch({
    placeholder: 'Filter goals…',
    ariaLabel: 'Filter goals',
    value: goalQuery,
    onInput: (value) => {
      goalQuery = value;
      paintGoals(canvas, areas, goals, projects, tasks);
    }
  });
  const areaFilter = createHubFilter({
    key: 'Area',
    label: 'Area',
    defaultValue: 'all',
    options: [
      { value: 'all', label: 'All areas' },
      ...areas.map((area) => ({ value: area.id, label: area.title }))
    ],
    value: goalArea,
    onChange: (value) => {
      goalArea = value;
      paintGoals(canvas, areas, goals, projects, tasks);
    }
  });
  const addGoal = el('button', 'btn btn--secondary', 'New goal');
  addGoal.type = 'button';
  addGoal.addEventListener('click', () => {
    const title = window.prompt('Goal title');
    if (!title?.trim()) return;
    const areaId = areas[0]?.id ?? null;
    void tasksApi
      .createGoal({ title: title.trim(), parent_area_id: areaId })
      .then(reload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const addProject = el('button', 'btn btn--secondary', 'New project');
  addProject.type = 'button';
  addProject.addEventListener('click', () => {
    const title = window.prompt('Project title');
    if (!title?.trim()) return;
    const goalId = goals.find((g) => g.status === 'active')?.id ?? null;
    void tasksApi
      .createProject({ title: title.trim(), parent_goal_id: goalId })
      .then(reload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const addPanel = el('div', 'plus-add__choices');
  addPanel.append(addGoal, addProject);
  const filters = createCollapsibleFilters({
    id: 'goals',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline',
    active: goalArea !== 'all' || Boolean(goalQuery.trim())
  });
  filters.panel.append(search.el, areaFilter.el);
  toolbar.append(
    filters.root,
    createPlusAdd({
      ariaLabel: 'Add a goal or project',
      panel: addPanel,
      className: 'plus-add--inline'
    }).root
  );
  canvas.append(toolbar, editorHost);

  const areasById = new Map(areas.map((area) => [area.id, area]));
  const query = goalQuery.trim().toLowerCase();
  const activeGoals = goals.filter((g) => {
    if (g.status !== 'active') return false;
    if (goalArea !== 'all' && g.parent_area_id !== goalArea) return false;
    if (
      query &&
      !g.title.toLowerCase().includes(query) &&
      !g.description.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
  const grouped = new Map<string, Goal[]>();
  for (const goal of activeGoals) {
    const key = goal.parent_area_id ?? 'ungrouped';
    const list = grouped.get(key) ?? [];
    list.push(goal);
    grouped.set(key, list);
  }

  for (const area of areas) {
    const areaGoals = grouped.get(area.id) ?? [];
    if (areaGoals.length === 0) continue;
    const block = el('section', 'hierarchy-area');
    block.append(el('h2', 'hierarchy-area__title', area.title));
    for (const goal of areaGoals) {
      block.append(renderGoalSection(goal, area.title, projects, tasks, editorHost, reload));
    }
    canvas.append(block);
  }

  const ungrouped = grouped.get('ungrouped') ?? [];
  if (ungrouped.length > 0) {
    const block = el('section', 'hierarchy-area');
    block.append(el('h2', 'hierarchy-area__title', 'Other goals'));
    for (const goal of ungrouped) {
      block.append(renderGoalSection(goal, undefined, projects, tasks, editorHost, reload));
    }
    canvas.append(block);
  }

  if (areas.length === 0 && activeGoals.length === 0) {
    canvas.append(el('p', 'empty-state', 'Create your first goal to start building the hierarchy.'));
  }

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter goals"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}
