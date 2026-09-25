import type { Goal } from '@/schemas/goal';
import { isProjectArchived, type Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectPageHash } from '@/domain/cards';
import { findStallCandidates, type StallCandidate } from '@/domain/stall';
import {
  FORECAST_HORIZON_DAYS,
  LIFECYCLE_LABEL,
  buildProjectForecast,
  buildProjectPulseCard,
  findPortfolioTension,
  findRetroCandidate,
  groupPulseCards,
  lastActivityLabel,
  matchesProjectQuery,
  projectLifecycleMix,
  projectRoadmap,
  runningProjectCount,
  type ForecastItem,
  type ProjectLifecycle,
  type ProjectPulseCard,
  type ProjectsGroupBy,
  type RoadmapZoom
} from '@/domain/projects-pulse';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { deleteProjectNow, showCompleteConfirm } from '@/views/card-actions';
import { renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { renderProjectPortfolioChart } from '@/views/project-portfolio-chart';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubSearch,
  createHubTextarea,
  createHubToolbar,
  el
} from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';
import { inspectProjectHealth } from '@/domain/project-health';
import { projectSpan } from '@/domain/chronology';
import { projectMilestones } from '@/domain/project-milestones';
import { mountLifeWallEditor } from '@/views/life-wall-editor';
import { DEFAULT_PLANNING_PROFILE } from '@/schemas/planning-profile';

/** Quiet when healthy; a real control when the project has no next action. */
export function projectNextActionHealth(
  project: Project,
  tasks: Task[],
  onAdd?: () => void
): HTMLElement | null {
  if (isProjectArchived(project.status) || project.status === 'paused') return null;
  if (inspectProjectHealth(project, tasks).health !== 'missing_next_action') return null;
  const hint = el('button', 'proj-health proj-health--warn', 'Add next action');
  hint.type = 'button';
  hint.addEventListener('click', (event) => {
    event.stopPropagation();
    if (onAdd) onAdd();
    else location.hash = projectPageHash(project.id);
  });
  return hint;
}

let projectQuery = '';
let groupBy: ProjectsGroupBy = 'status';
let roadmapZoom: RoadmapZoom = 'month';
let lifecycleFilter: ProjectLifecycle | 'all' = 'all';
let tensionDismissed = false;

const CLOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const DRIFT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h10"/><path d="m10 7 5 5-5 5"/><path d="M20 5v14"/></svg>';
const LINK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h9v9"/><path d="M18 4 9 13"/><path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/></svg>';
const ENERGY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>';

type PulseContext = {
  projects: Project[];
  tasks: Task[];
  goals: Goal[];
  cards: ProjectPulseCard[];
  stallIds: Set<string>;
  stallCandidates: StallCandidate[];
  now: Date;
};

function svgIcon(markup: string): HTMLElement {
  const wrap = el('span', 'pcard__icon');
  wrap.innerHTML = markup;
  return wrap;
}

function renderStatusChart(
  mix: ReturnType<typeof projectLifecycleMix>,
  running: number,
  onSelect: (id: ProjectLifecycle | 'all') => void
): HTMLElement {
  const tile = el('section', 'hub-card projects-chart');
  tile.setAttribute('aria-label', 'Project status mix');
  tile.append(el('p', 'hub-card__eyebrow', 'What’s the mix?'));
  tile.append(
    renderProjectPortfolioChart(mix, {
      running,
      onSelect,
      selected: lifecycleFilter
    })
  );
  return tile;
}

function renderRoadmap(ctx: PulseContext, onZoom: (zoom: RoadmapZoom) => void): HTMLElement {
  const model = projectRoadmap(ctx.projects, ctx.tasks, roadmapZoom, ctx.now);
  const tile = el('section', 'hub-card projects-roadmap');
  const head = el('div', 'roadmap-head');
  head.append(el('p', 'hub-card__eyebrow', 'Timeline'));
  head.append(
    createHubPills({
      label: 'Timeline range',
      items: [
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
        { id: 'term', label: 'Term' }
      ],
      value: roadmapZoom,
      onSelect: onZoom
    })
  );
  tile.append(head);
  tile.append(
    el(
      'p',
      'roadmap-lede',
      'Each bar is calendar time — when the project runs, from start to target. The dashed outline is the original plan. Not a task count.'
    )
  );
  const rows = el('div', 'roadmap-rows');
  for (const row of model.rows) {
    const line = el('div', 'roadmap-row roadmap-row--linked');
    line.setAttribute('role', 'button');
    line.tabIndex = 0;
    line.setAttribute('aria-label', `Open ${row.label}`);
    const goToProject = (): void => {
      location.hash = projectPageHash(row.projectId);
    };
    line.addEventListener('click', goToProject);
    line.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      goToProject();
    });
    line.append(el('span', 'roadmap-row__label', row.label));
    const track = el('div', 'roadmap-row__track');
    if (row.ghost) {
      const ghost = el('div', 'roadmap-row__ghost');
      ghost.style.left = `${row.ghost.left}%`;
      ghost.style.width = `${row.ghost.width}%`;
      track.append(ghost);
    }
    if (row.bar) {
      const bar = el('div', 'roadmap-row__bar');
      bar.style.left = `${row.bar.left}%`;
      bar.style.width = `${row.bar.width}%`;
      bar.style.background = row.bar.color;
      track.append(bar);
    }
    line.append(track);
    rows.append(line);
  }
  if (!model.rows.length) rows.append(el('p', 'empty-state empty-state--compact', 'No live projects on the horizon.'));
  const axis = el('div', 'roadmap-axis');
  axis.append(el('span', 'roadmap-axis__kind', 'Time'));
  const ticks = el('div', 'roadmap-axis__ticks');
  for (const tick of model.axis) ticks.append(el('span', undefined, tick));
  axis.append(ticks);
  tile.append(rows, axis);
  return tile;
}

function renderTensionBanner(message: string, onDismiss: () => void): HTMLElement {
  const banner = el('div', 'pulse-banner');
  banner.setAttribute('role', 'status');
  const icon = el('span', 'pulse-banner__icon');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>';
  banner.append(icon, el('span', 'pulse-banner__text', message));
  const dismiss = el('button', 'pulse-banner__dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  dismiss.addEventListener('click', onDismiss);
  banner.append(dismiss);
  return banner;
}

type ProjectBoardActions = {
  onReload: () => void;
  onDeleted: (projectId: string) => void;
};

function projectBoardMenuItems(
  card: ProjectPulseCard,
  confirmHost: HTMLElement,
  actions: ProjectBoardActions
): CardMenuItem[] {
  const items: CardMenuItem[] = [
    {
      id: 'page',
      label: 'Full page',
      onSelect: () => {
        location.hash = projectPageHash(card.project.id);
      }
    }
  ];
  if (card.readyToClose) {
    items.push({
      id: 'complete',
      label: 'Mark complete',
      onSelect: () => showCompleteConfirm(confirmHost, card.project, card.slipDays, actions.onReload)
    });
  }
  items.push({
    id: 'delete',
    label: 'Delete',
    danger: true,
    onSelect: () =>
      deleteProjectNow(card.project, () => actions.onDeleted(card.project.id), confirmHost)
  });
  return items;
}

function attachProjectBoardMenu(
  host: HTMLElement,
  card: ProjectPulseCard,
  confirmHost: HTMLElement,
  actions: ProjectBoardActions
): void {
  host.append(renderCardMenu(`${card.project.title} card menu`, projectBoardMenuItems(card, confirmHost, actions)));
}

function renderProjectBoardCard(
  card: ProjectPulseCard,
  tasks: Task[],
  confirmHost: HTMLElement,
  boardActions: ProjectBoardActions
): HTMLElement {
  const article = el('article', card.lifecycle === 'stalled' ? 'hub-card pcard pcard--compact' : 'hub-card pcard');
  article.dataset.projectId = card.project.id;
  article.dataset.lifecycle = card.lifecycle;

  const top = el('div', 'pcard__top');
  const title = el('span', 'pcard__title', card.project.title);
  top.append(title);
  const healthHint = projectNextActionHealth(card.project, tasks);
  if (healthHint) top.append(healthHint);
  top.append(el('span', `status-badge status-badge--${card.lifecycle}`, LIFECYCLE_LABEL[card.lifecycle]));
  article.append(top);

  const desc = card.project.arc_summary || card.project.description;
  if (desc) article.append(el('p', 'pcard__desc', desc));

  if (card.lifecycle === 'stalled') {
    article.append(el('p', 'pcard__desc', lastActivityLabel(card.project, tasks)));
    const jump = el('a', 'pcard__jump', 'Review below ↓');
    jump.href = '#stalled-queue';
    article.append(jump);
    attachProjectBoardMenu(top, card, confirmHost, boardActions);
    return article;
  }

  const aging = el('div', 'pcard__row');
  const dots = el('div', 'aging-row');
  dots.setAttribute('aria-label', 'Task activity last five weeks');
  for (const fresh of card.aging) {
    const dot = el('span', 'aging-dot');
    dot.dataset.fresh = fresh ? 'true' : 'false';
    dots.append(dot);
  }
  aging.append(dots, el('span', 'aging-label', 'task activity'));
  article.append(aging);

  const impact = el('div', 'impact-row');
  const quad = el('span', 'quad');
  for (const key of ['tl', 'tr', 'bl', 'br'] as const) {
    const cell = el('span');
    if (card.impactQuad[key]) cell.dataset.on = 'true';
    quad.append(cell);
  }
  impact.append(quad, el('span', 'impact-label', card.impactLabel));
  article.append(impact);

  const drift = el('div', 'meta-line');
  drift.append(svgIcon(DRIFT_ICON), el('span', `drift--${card.driftKind}`, card.driftLabel));
  article.append(drift);

  const linked = el('div', 'meta-line');
  linked.append(svgIcon(LINK_ICON), el('span', undefined, card.linkedLabel));
  article.append(linked);

  const energy = el('div', 'meta-line');
  energy.append(svgIcon(ENERGY_ICON), el('span', undefined, card.energyLabel));
  article.append(energy);

  if (card.project.current_end_date || card.project.baseline_end_date) {
    const due = el('div', 'meta-line');
    due.append(
      svgIcon(CLOCK_ICON),
      el(
        'span',
        undefined,
        `Target ${formatDisplayDate(card.project.current_end_date ?? card.project.baseline_end_date)}`
      )
    );
    article.append(due);
  }

  article.append(
    mountLifeWallEditor({
      title: card.project.title,
      wall: card.project.life_wall,
      suggest: () => {
        const span = projectSpan(card.project, tasks);
        if (span) return { starts_on: span.startKey, ends_on: span.endKey };
        const end = card.project.current_end_date || card.project.baseline_end_date;
        return end ? { starts_on: card.project.created_at.slice(0, 10), ends_on: end } : null;
      },
      onCommit: (wall) => {
        void tasksApi
          .updateProject(card.project.id, { life_wall: wall })
          .then(() => boardActions.onReload())
          .catch((err) => article.append(el('p', 'empty-state', errorMessage(err))));
      }
    }).el
  );

  const milestones = projectMilestones(card.project).slice(0, 3);
  if (milestones.length) {
    const chips = el('div', 'pcard__row pcard__milestones');
    milestones.forEach((milestone) => {
      chips.append(el('span', 'pcard__milestone', milestone.title));
    });
    article.append(chips);
  }

  const actions = el('div', 'pcard__row pcard__actions');
  const open = el('button', 'btn btn--ghost', 'Open page');
  open.type = 'button';
  open.addEventListener('click', () => {
    location.hash = projectPageHash(card.project.id);
  });
  actions.append(open);
  if (card.readyToClose) {
    const complete = el('button', 'btn btn--primary', 'Complete');
    complete.type = 'button';
    complete.addEventListener('click', () => {
      showCompleteConfirm(confirmHost, card.project, card.slipDays, boardActions.onReload);
    });
    actions.append(complete);
  }
  article.append(actions);
  attachProjectBoardMenu(top, card, confirmHost, boardActions);
  return article;
}

function renderQuickAddProject(goals: Goal[], onCreated: (project: Project) => void): HTMLElement {
  const form = el('form', 'quick-add hub-toolbar');
  const title = createHubSearch({
    type: 'text',
    placeholder: 'New project title',
    ariaLabel: 'New project title',
    required: true
  });
  const type = createHubFilter({
    key: 'Type',
    label: 'Type',
    defaultValue: 'standard',
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'academic_program', label: 'Academic program' },
      { value: 'excursion', label: 'Excursion' }
    ],
    value: 'standard'
  });
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const goal = createHubFilter({
    key: 'Goal',
    label: 'Goal',
    defaultValue: '',
    options: [
      { value: '', label: 'No goal' },
      ...activeGoals.map((item) => ({ value: item.id, label: item.title }))
    ],
    value: ''
  });
  const submit = el('button', 'btn btn--primary', 'Add');
  submit.type = 'submit';
  form.append(title.el, type.el);
  if (activeGoals.length) form.append(goal.el);
  form.append(submit);
  const plus = createPlusAdd({
    ariaLabel: 'Add a project',
    panel: form,
    className: 'plus-add--inline'
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nextTitle = title.input.value.trim();
    if (!nextTitle) {
      form.append(el('p', 'empty-state', 'Add a title.'));
      return;
    }
    submit.disabled = true;
    try {
      const created = await tasksApi.createProject({
        title: nextTitle,
        type: type.getValue() || 'standard',
        parent_goal_id: activeGoals.length ? goal.getValue() || null : null
      });
      title.input.value = '';
      plus.close();
      onCreated(created);
    } catch (err) {
      form.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  return plus.root;
}

function renderBoard(
  ctx: PulseContext,
  confirmHost: HTMLElement,
  actions: ProjectBoardActions
): HTMLElement {
  const visible = ctx.cards.filter((card) => {
    if (!matchesProjectQuery(card.project, projectQuery)) return false;
    if (lifecycleFilter !== 'all' && card.lifecycle !== lifecycleFilter) return false;
    return true;
  });
  const groups = groupPulseCards(visible, groupBy, ctx.goals, ctx.now);
  const grid = el('div', 'projects-board');
  grid.style.gridTemplateColumns = groups.length
    ? `repeat(${groups.length}, minmax(0, 1fr))`
    : 'minmax(0, 1fr)';
  if (!groups.length) {
    grid.append(el('p', 'empty-state', 'No projects match.'));
    return grid;
  }
  for (const group of groups) {
    const lane = el('div', 'lane');
    const head = el('div', 'lane__head');
    head.append(el('span', 'lane__title', group.title), el('span', 'lane__count', String(group.cards.length)));
    lane.append(head);
    for (const card of group.cards) {
      lane.append(renderProjectBoardCard(card, ctx.tasks, confirmHost, actions));
    }
    grid.append(lane);
  }
  return grid;
}

function removeProjectNodes(canvas: HTMLElement, projectId: string): void {
  const nodes = [...canvas.querySelectorAll<HTMLElement>(`[data-project-id="${CSS.escape(projectId)}"]`)];
  for (const node of nodes) {
    const lane = node.closest('.lane');
    const forecast = node.closest('#project-forecast');
    node.remove();
    if (lane instanceof HTMLElement) {
      const remaining = lane.querySelectorAll('[data-project-id]').length;
      const count = lane.querySelector('.lane__count');
      if (count) count.textContent = String(remaining);
      if (!remaining) lane.remove();
    }
    if (forecast instanceof HTMLElement) {
      const rows = forecast.querySelector('.forecast-rows');
      if (rows && !rows.querySelector('[data-project-id]')) {
        rows.replaceWith(el('p', 'empty-state empty-state--compact', `Nothing due in the next ${FORECAST_HORIZON_DAYS} days.`));
      }
    }
  }
  const board = canvas.querySelector<HTMLElement>('.projects-board');
  if (!board) return;
  const lanes = [...board.querySelectorAll('.lane')];
  if (!lanes.length) {
    board.replaceChildren(el('p', 'empty-state', 'No projects match.'));
    board.style.gridTemplateColumns = 'minmax(0, 1fr)';
    return;
  }
  board.style.gridTemplateColumns = `repeat(${lanes.length}, minmax(0, 1fr))`;
}

function renderRetro(
  candidate: ReturnType<typeof findRetroCandidate>,
  onLogged: () => void
): HTMLElement | null {
  if (!candidate) return null;
  const card = el('section', 'hub-card projects-retro');
  card.dataset.projectId = candidate.project.id;
  card.append(el('p', 'hub-card__eyebrow', candidate.eyebrow));
  card.append(el('h2', 'section-title section-title--tight', candidate.title));
  const grid = el('div', 'retro-grid');
  const moved = createHubTextarea({
    ariaLabel: 'What moved',
    placeholder: 'Permission forms sent, transport quoted…'
  });
  const stalled = createHubTextarea({
    ariaLabel: 'What stalled',
    placeholder: 'Still waiting on venue confirmation…'
  });
  const why = createHubTextarea({
    ariaLabel: 'Why',
    placeholder: 'Venue is slow to reply — chase Monday…'
  });
  for (const [label, field] of [
    ['What moved', moved],
    ['What stalled', stalled],
    ['Why', why]
  ] as const) {
    const col = el('div');
    col.append(el('label', 'retro-grid__label', label), field.el);
    grid.append(col);
  }
  const actions = el('div', 'stall-card__actions');
  const log = el('button', 'btn btn--primary', 'Log retro');
  log.type = 'button';
  log.addEventListener('click', async () => {
    const reason = [
      moved.input.value.trim() && `Moved: ${moved.input.value.trim()}`,
      stalled.input.value.trim() && `Stalled: ${stalled.input.value.trim()}`,
      why.input.value.trim() && `Why: ${why.input.value.trim()}`
    ]
      .filter(Boolean)
      .join(' · ');
    if (!reason) {
      card.append(el('p', 'empty-state', 'Add a note in at least one field.'));
      return;
    }
    log.disabled = true;
    try {
      const previous = candidate.project.review_summary?.trim();
      await tasksApi.updateProject(candidate.project.id, {
        review_summary: previous ? `${previous}\n${reason}` : reason
      });
      onLogged();
    } catch (err) {
      log.disabled = false;
      card.append(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(log);
  card.append(grid, actions);
  return card;
}

function forecastWhenLabel(item: ForecastItem): string {
  if (item.kind === 'stalled') return item.label;
  if (item.daysOut < 0) return `${-item.daysOut} day${item.daysOut === -1 ? '' : 's'} overdue`;
  if (item.daysOut === 0) return 'Due today';
  return `Due in ${item.daysOut} day${item.daysOut === 1 ? '' : 's'}`;
}

/**
 * "Is anything about to slip" — one chronological list replacing what used
 * to be three disconnected pieces (a dismissible tension banner, a single
 * nearest-milestone retro prompt, and a stalled-projects queue that didn't
 * show the one number that actually matters for a revive/bury call: how
 * long it's been idle). Milestone rows link straight to the project;
 * stalled rows keep the same revive/frankenstein/bury actions, now with
 * idle days shown instead of a vague "flagged" chip.
 */
function renderForecast(
  items: ForecastItem[],
  mergeTargets: Project[],
  confirmHost: HTMLElement,
  onReload: () => void
): HTMLElement {
  const section = el('section', 'hub-card projects-forecast');
  section.id = 'project-forecast';
  section.append(el('p', 'hub-card__eyebrow', 'Forecast — what needs your eyes'));
  if (!items.length) {
    section.append(el('p', 'empty-state empty-state--compact', `Nothing due in the next ${FORECAST_HORIZON_DAYS} days.`));
    return section;
  }
  const list = el('div', 'forecast-rows');
  for (const item of items) {
    if (item.kind === 'stalled' && item.stall) {
      list.append(renderStalledCard(item.stall, mergeTargets, confirmHost, onReload));
      continue;
    }
    const row = el('a', `forecast-row forecast-row--${item.kind}`);
    row.href = projectPageHash(item.project.id);
    row.dataset.projectId = item.project.id;
    const main = el('span', 'forecast-row__main');
    main.append(
      el('span', 'forecast-row__project', item.project.title),
      el('span', 'forecast-row__label', item.label)
    );
    row.append(main, el('span', `forecast-row__when forecast-row__when--${item.kind}`, forecastWhenLabel(item)));
    list.append(row);
  }
  section.append(list);
  return section;
}

export async function renderProjectsView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…', '.projects-pulse');
  let flagWarning = '';
  try {
    await tasksApi.flagStalledProjects();
  } catch (err) {
    flagWarning = `Could not persist stall flags (${errorMessage(err)}). Showing quiet projects from local detection.`;
  }

  let projects: Project[];
  let tasks: Task[];
  let goals: Goal[] = [];
  let reviews: Awaited<ReturnType<typeof tasksApi.listReviewLogs>> = [];
  let planningProfile = DEFAULT_PLANNING_PROFILE;
  try {
    [projects, tasks, goals, reviews, planningProfile] = await Promise.all([
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.listGoals().catch(() => [] as Goal[]),
      tasksApi.listReviewLogs().catch(() => []),
      tasksApi.getPlanningProfile().catch(() => DEFAULT_PLANNING_PROFILE)
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderProjectsView(canvas), 'Could not load projects');
    return;
  }

  projects = projects.filter((project) => !isProjectArchived(project.status));

  const now = new Date();
  const stallCandidates = findStallCandidates(projects, tasks, now);
  const stallIds = new Set(stallCandidates.map((item) => item.project.id));
  const cards = projects.map((project) => buildProjectPulseCard(project, tasks, stallIds, now));
  const ctx: PulseContext = { projects, tasks, goals, cards, stallIds, stallCandidates, now };
  const retro = findRetroCandidate(cards, now);
  const mergeTargets = projects.filter((project) => !isProjectArchived(project.status) && project.status !== 'stalled');

  const reload = () => void renderProjectsView(canvas);

  function mountRoadmap(): HTMLElement {
    return renderRoadmap(ctx, (zoom) => {
      roadmapZoom = zoom;
      canvas.querySelector('.projects-roadmap')?.replaceWith(mountRoadmap());
    });
  }

  function refreshPulse(): void {
    const host = canvas.querySelector('.projects-pulse');
    if (!host) return;
    const nextMix = projectLifecycleMix(ctx.projects, ctx.tasks, ctx.stallIds, ctx.now);
    const nextRunning = runningProjectCount(nextMix);
    host.replaceChildren(
      renderStatusChart(nextMix, nextRunning, (id) => {
        lifecycleFilter = id;
        paint();
      }),
      mountRoadmap()
    );
  }

  function dropProject(projectId: string): void {
    ctx.projects = ctx.projects.filter((project) => project.id !== projectId);
    ctx.tasks = ctx.tasks.filter((task) => task.parent_project_id !== projectId);
    ctx.cards = ctx.cards.filter((card) => card.project.id !== projectId);
    ctx.stallIds.delete(projectId);
    ctx.stallCandidates = ctx.stallCandidates.filter((item) => item.project.id !== projectId);
    removeProjectNodes(canvas, projectId);
    refreshPulse();
  }

  function acceptProject(created: Project): void {
    ctx.projects = [created, ...ctx.projects];
    const card = buildProjectPulseCard(created, ctx.tasks, ctx.stallIds, ctx.now);
    ctx.cards = [card, ...ctx.cards];
    if (lifecycleFilter !== 'all' && card.lifecycle !== lifecycleFilter) {
      lifecycleFilter = 'all';
    }
    if (projectQuery.trim() && !matchesProjectQuery(created, projectQuery)) {
      projectQuery = '';
    }
    paint();
  }

  const boardActions: ProjectBoardActions = { onReload: reload, onDeleted: dropProject };

  function paint(): void {
    const restoreSearch =
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.getAttribute('aria-label') === 'Filter projects';
    const searchPos = restoreSearch
      ? (document.activeElement as HTMLInputElement).selectionStart
      : null;
    const scrollTop = canvas.scrollTop;
    const tension = tensionDismissed ? null : findPortfolioTension(ctx.cards, ctx.tasks, ctx.now);
    const nextMix = projectLifecycleMix(ctx.projects, ctx.tasks, ctx.stallIds, ctx.now);
    const nextRunning = runningProjectCount(nextMix);
    const forecastItems = buildProjectForecast(ctx.cards, ctx.stallCandidates, ctx.now);

    canvas.replaceChildren();
    if (flagWarning) canvas.append(el('p', 'empty-state', flagWarning));

    const stallConfirmHost = el('div', 'stall-confirm');
    const closureConfirmHost = el('div', 'closure-confirm');
    canvas.append(closureConfirmHost, stallConfirmHost);

    if (tension) {
      canvas.append(
        renderTensionBanner(tension.message, () => {
          tensionDismissed = true;
          paint();
        })
      );
    }

    const toolbar = createHubToolbar('projects-toolbar');
    const search = createHubSearch({
      placeholder: 'Filter projects…',
      ariaLabel: 'Filter projects',
      value: projectQuery,
      onInput: (value) => {
        projectQuery = value;
        paint();
      }
    });
    const filters = createCollapsibleFilters({
      id: 'projects',
      ariaLabel: 'Filters',
      className: 'hub-filters--inline',
      active: Boolean(projectQuery.trim())
    });
    filters.panel.append(search.el);
    const groupByRow = el('div', 'projects-groupby');
    const statusToggle = el('button', `btn ${groupBy === 'status' ? 'btn--primary' : 'btn--ghost'}`, 'Status');
    statusToggle.type = 'button';
    statusToggle.setAttribute('aria-pressed', groupBy === 'status' ? 'true' : 'false');
    statusToggle.addEventListener('click', () => {
      groupBy = 'status';
      paint();
    });
    groupByRow.append(
      statusToggle,
      createHubPills<ProjectsGroupBy>({
        label: 'Group by (more)',
        role: 'tablist',
        items: [
          { id: 'energy', label: 'Energy' },
          { id: 'goal', label: 'Goal area' },
          { id: 'deadline', label: 'Deadline' }
        ],
        value: groupBy,
        onSelect: (id) => {
          groupBy = id;
          paint();
        }
      })
    );
    toolbar.append(filters.root, groupByRow, renderQuickAddProject(ctx.goals, acceptProject));
    canvas.append(toolbar);
    // Forecast goes first: "is anything about to slip" is the thing to
    // check before browsing the board itself.
    canvas.append(renderForecast(forecastItems, mergeTargets, stallConfirmHost, reload));
    // No separate "active projects, limit not set" meter here — the mix
    // chart below already covers "how many running, is that sustainable"
    // with an actual per-status breakdown, which made this card pure
    // duplicate chrome on this page specifically (still used as-is on
    // Goals, which has no equivalent chart).
    canvas.append(renderBoard(ctx, closureConfirmHost, boardActions));

    const pulse = el('div', 'projects-pulse');
    pulse.append(
      renderStatusChart(nextMix, nextRunning, (id) => {
        lifecycleFilter = id;
        paint();
      }),
      mountRoadmap()
    );
    canvas.append(pulse);

    const retroCard = renderRetro(retro, reload);
    if (retroCard) canvas.append(retroCard);

    if (reviews.length) {
      canvas.append(el('h2', 'section-title', 'Review log'));
      const logStack = el('div', 'task-stack');
      for (const review of [...reviews].reverse().slice(0, 8)) {
        const proj = projects.find((project) => project.id === review.project_id);
        const slip =
          review.slip_days === null || review.slip_days === undefined
            ? ''
            : review.slip_days === 0
              ? ' · on baseline'
              : review.slip_days > 0
                ? ` · +${review.slip_days}d vs baseline`
                : ` · ${review.slip_days}d vs baseline`;
        const row = el('article', 'task-row');
        row.append(
          el('h3', 'task-row__title', `${review.outcome} · ${proj?.title ?? review.project_id}`),
          el('p', 'task-row__desc', `${review.reason}${slip}`)
        );
        logStack.append(row);
      }
      canvas.append(logStack);
    }

    canvas.scrollTop = scrollTop;
    if (restoreSearch) {
      const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter projects"]');
      if (field) {
        field.focus();
        if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
      }
    }
  }

  paint();
}

function renderStalledCard(
  candidate: StallCandidate,
  mergeTargets: Project[],
  confirmHost: HTMLElement,
  onDone: () => void
): HTMLElement {
  const { project, idle_days, open_task_count } = candidate;
  const card = el('article', 'stall-card');
  card.dataset.projectId = project.id;
  card.append(
    el('p', 'page-header__eyebrow', 'Stalled'),
    el('h3', 'pcard__title', project.title),
    el('p', 'pcard__desc', project.arc_summary || project.description)
  );
  const meta = el('div', 'pcard__row');
  meta.append(
    el('span', 'hub-chip', project.type),
    el('span', 'hub-chip tint-lilac', `${open_task_count} open task${open_task_count === 1 ? '' : 's'}`),
    el('span', 'hub-chip tint-peach', `no activity in ${idle_days}d`)
  );
  card.append(meta);

  const reason = createHubField({
    ariaLabel: `Reason for ${project.title}`,
    placeholder: 'Short reason (required)'
  });
  const merge = createHubFilter({
    key: 'Merge into',
    label: 'Frankenstein into',
    defaultValue: '',
    options: [
      { value: '', label: 'Merge into… (for Frankenstein)' },
      ...mergeTargets
        .filter((item) => item.id !== project.id)
        .map((target) => ({ value: target.id, label: target.title }))
    ],
    value: ''
  });

  const actions = el('div', 'stall-card__actions');
  const outcomes: Array<{ id: 'revived' | 'frankensteined' | 'buried'; label: string }> = [
    { id: 'revived', label: 'Revive' },
    { id: 'frankensteined', label: 'Frankenstein' },
    { id: 'buried', label: 'Bury' }
  ];
  for (const outcome of outcomes) {
    const btn = el(
      'button',
      outcome.id === 'buried' ? 'btn btn--decisive' : 'btn btn--secondary',
      outcome.label
    );
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const text = reason.input.value.trim();
      if (!text) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Add a short reason first.'));
        return;
      }
      if (outcome.id === 'frankensteined' && !merge.getValue()) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Pick a merge target for Frankenstein.'));
        return;
      }
      showStallConfirm(confirmHost, project, outcome.id, text, merge.getValue() || null, onDone);
    });
    actions.append(btn);
  }
  card.append(reason.el, merge.el, actions);
  return card;
}

function showStallConfirm(
  host: HTMLElement,
  project: Project,
  outcome: 'revived' | 'frankensteined' | 'buried',
  reason: string,
  mergeInto: string | null,
  onDone: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm stall outcome');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'stall-confirm__title', `${outcome} · ${project.title}`));
  card.append(
    el(
      'p',
      'page-header__supporting',
      `${reason}${mergeInto ? ` · merge → ${mergeInto}` : ''}. Do not apply until Confirm.`
    )
  );
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await tasksApi.resolveStalledProject({
        project_id: project.id,
        outcome,
        reason,
        merge_into_project_id: mergeInto
      });
      host.replaceChildren(el('p', 'canvas-status', 'Outcome recorded.'));
      onDone();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', err instanceof Error ? err.message : 'Resolve failed'));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
}

export function resetProjectsViewStateForTests(): void {
  projectQuery = '';
  groupBy = 'status';
  roadmapZoom = 'month';
  lifecycleFilter = 'all';
  tensionDismissed = false;
}
