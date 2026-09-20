import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import { isReviewDue } from '@/domain/date-truth';
import {
  computeLifeCoverage,
  HORIZON_TARGETS,
  LIFE_AREAS,
  lifeCoverageHeadline,
  MATURITY_LEVELS,
  somedayLinkedGoalIds,
  somedayLinkedProjectIds,
  stalledLinkedProjects,
  suggestFirstMilestone,
  suggestIfThen
} from '@/domain/someday';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubField,
  createHubFilter,
  createHubSearch,
  domainFilterOptions,
  el,
  labeledField
} from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';
import type { TaskDomain } from '@/schemas/task';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

let somedayDomain: TaskDomain | 'all' = 'all';
let somedayQuery = '';

export function groupSomedayForReview(
  items: Task[],
  todayKey = new Date().toISOString().slice(0, 10)
): { reviewNow: Task[]; parked: Task[] } {
  const reviewNow: Task[] = [];
  const parked: Task[] = [];
  for (const item of items) {
    if (isReviewDue(item, todayKey) || !item.review_at) reviewNow.push(item);
    else parked.push(item);
  }
  return { reviewNow, parked };
}

function selectField(options: {
  ariaLabel: string;
  value: string;
  choices: Array<{ id: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'hub-search__input someday-select';
  select.setAttribute('aria-label', options.ariaLabel);
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = options.placeholder;
  select.append(blank);
  for (const choice of options.choices) {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = choice.label;
    if (choice.id === options.value) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => options.onChange(select.value));
  return select;
}

/** Create the next project attempt for a Someday idea — a fresh project, same anchor, milestone seeded. */
async function spawnProjectFromSomeday(task: Task): Promise<Project> {
  const project = await tasksApi.createProject({
    title: task.title,
    description: task.description,
    parent_someday_id: task.id
  });
  const milestoneTitle = suggestFirstMilestone(task);
  await tasksApi.updateProject(project.id, {
    milestones: [
      { id: `${project.id}_m1`, project_id: project.id, title: milestoneTitle, due_date: null, status: 'open' }
    ]
  });
  return project;
}

function renderStalledPaths(
  task: Task,
  stalled: Project[],
  onChange: (next: Task) => void
): HTMLElement | null {
  if (stalled.length === 0) return null;
  const wrap = el('div', 'someday-card__stalled');
  for (const project of stalled) {
    const row = el('div', 'someday-card__stalled-row');
    row.append(
      el('p', 'someday-card__stalled-copy', `“${project.title}” has stalled. The dream isn't dead — the approach might be.`)
    );
    const actions = el('div', 'someday-card__stalled-actions');
    const reroute = el('button', 'btn btn--secondary btn--sm', 'Reroute');
    reroute.type = 'button';
    reroute.addEventListener('click', async () => {
      reroute.disabled = true;
      try {
        const next = await spawnProjectFromSomeday(task);
        await tasksApi.updateProject(project.id, { status: 'archived_dead' });
        const updated = await tasksApi.updateTask(task.id, {
          linked_project_ids: [...somedayLinkedProjectIds(task), next.id]
        });
        onChange(updated);
      } catch (err) {
        window.alert(errorMessage(err));
      } finally {
        reroute.disabled = false;
      }
    });
    const archive = el('button', 'btn btn--ghost btn--sm', 'Archive this path');
    archive.type = 'button';
    archive.addEventListener('click', async () => {
      archive.disabled = true;
      try {
        await tasksApi.updateProject(project.id, { status: 'archived_dead' });
        onChange(task);
      } catch (err) {
        window.alert(errorMessage(err));
      } finally {
        archive.disabled = false;
      }
    });
    actions.append(reroute, archive);
    row.append(actions);
    wrap.append(row);
  }
  return wrap;
}

function renderSomedayCard(
  task: Task,
  flagged: boolean,
  projects: Project[],
  allTasks: Task[],
  onChange: (next: Task | null) => void
): HTMLElement {
  const card = el('article', `glass-tile someday-card${flagged ? ' someday-card--flagged' : ''}`);
  const titleRow = el('div', 'someday-card__title-row');
  if (flagged) {
    const ring = document.createElement('span');
    ring.className = 'someday-open-loop';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="var(--line)" stroke-width="2.5"/><circle cx="9" cy="9" r="7" fill="none" stroke="var(--warning)" stroke-width="2.5" stroke-dasharray="26 44" stroke-linecap="round" transform="rotate(-90 9 9)"/></svg>';
    titleRow.append(ring);
  }
  const title = el('h3', 'someday-card__title', task.title);
  titleRow.append(title);
  const branch = el('a', 'btn btn--ghost btn--sm someday-card__branch', 'Branch it →');
  branch.href = `#/someday/odyssey/${encodeURIComponent(task.id)}`;
  titleRow.append(branch);
  card.append(titleRow);

  if (task.description) card.append(el('p', 'someday-card__copy', task.description));
  if (flagged) {
    card.append(el('p', 'someday-card__if-then', suggestIfThen(task)));
  }

  const linkedProjects = somedayLinkedProjectIds(task).length;
  const linkedGoals = somedayLinkedGoalIds(task).length;
  const metaParts = [
    task.domain,
    task.priority,
    task.review_at ? `Review ${formatDisplayDate(task.review_at)}` : 'No review date'
  ];
  if (linkedProjects) metaParts.push(`${linkedProjects} linked project${linkedProjects === 1 ? '' : 's'}`);
  if (linkedGoals) metaParts.push(`${linkedGoals} linked goal${linkedGoals === 1 ? '' : 's'}`);
  card.append(el('p', 'hierarchy-meta', metaParts.join(' · ')));

  const chipsRow = el('div', 'someday-card__chips');
  const maturity = task.maturity ?? null;
  const maturityDot = el('span', `someday-maturity someday-maturity--${maturity ?? 'new'}`);
  maturityDot.setAttribute('aria-hidden', 'true');
  const maturityLabel = MATURITY_LEVELS.find((m) => m.id === maturity)?.label ?? 'New';
  const maturityChip = el('span', 'someday-chip');
  maturityChip.append(maturityDot, document.createTextNode(maturityLabel));
  chipsRow.append(maturityChip);
  if (task.horizon_target) {
    const label = HORIZON_TARGETS.find((h) => h.id === task.horizon_target)?.label ?? task.horizon_target;
    chipsRow.append(el('span', 'someday-chip someday-chip--horizon', label));
  }
  if (task.life_area) {
    const label = LIFE_AREAS.find((a) => a.id === task.life_area)?.label ?? task.life_area;
    chipsRow.append(el('span', 'someday-chip someday-chip--area', label));
  }
  card.append(chipsRow);

  const fieldsRow = el('div', 'someday-card__fields');

  const maturitySelect = selectField({
    ariaLabel: `How developed “${task.title}” is`,
    value: task.maturity ?? '',
    placeholder: 'Maturity…',
    choices: MATURITY_LEVELS.map((m) => ({ id: m.id, label: m.label })),
    onChange: (value) => {
      void tasksApi
        .updateTask(task.id, { maturity: value || null })
        .then((next) => onChange(next))
        .catch((err) => window.alert(errorMessage(err)));
    }
  });
  fieldsRow.append(labeledField('Maturity', maturitySelect, 'hub-field hub-field--compact'));

  const areaSelect = selectField({
    ariaLabel: `Life area for “${task.title}”`,
    value: task.life_area ?? '',
    placeholder: 'Life area…',
    choices: LIFE_AREAS,
    onChange: (value) => {
      void tasksApi
        .updateTask(task.id, { life_area: value || null })
        .then((next) => onChange(next))
        .catch((err) => window.alert(errorMessage(err)));
    }
  });
  fieldsRow.append(labeledField('Life area', areaSelect, 'hub-field hub-field--compact'));

  const horizonSelect = selectField({
    ariaLabel: `What altitude “${task.title}” would land at`,
    value: task.horizon_target ?? '',
    placeholder: 'If promoted…',
    choices: HORIZON_TARGETS,
    onChange: (value) => {
      void tasksApi
        .updateTask(task.id, { horizon_target: value || null })
        .then((next) => onChange(next))
        .catch((err) => window.alert(errorMessage(err)));
    }
  });
  fieldsRow.append(labeledField('Horizon', horizonSelect, 'hub-field hub-field--compact'));
  card.append(fieldsRow);

  const review = createHubField({
    type: 'date',
    ariaLabel: `Review date for ${task.title}`,
    value: task.review_at ?? ''
  });
  review.input.addEventListener('change', () => {
    const review_at = review.input.value || null;
    void tasksApi
      .updateTask(task.id, { review_at })
      .then((next) => onChange(next))
      .catch((err) => window.alert(errorMessage(err)));
  });
  card.append(labeledField('Review at', review.el));

  const linked = projects.filter((p) => somedayLinkedProjectIds(task).includes(p.id));
  const stalledPaths = renderStalledPaths(task, stalledLinkedProjects(task, linked, allTasks), (next) =>
    onChange(next)
  );
  if (stalledPaths) card.append(stalledPaths);

  const parkUntil = el('button', 'btn btn--ghost', 'Park until…');
  parkUntil.type = 'button';
  parkUntil.addEventListener('click', () => {
    const raw = window.prompt('Park until (YYYY-MM-DD)', task.review_at ?? '');
    if (raw == null) return;
    const review_at = raw.trim() || null;
    void tasksApi
      .updateTask(task.id, { review_at })
      .then((next) => onChange(next))
      .catch((err) => window.alert(errorMessage(err)));
  });

  const actions = el('div', 'someday-card__actions');
  const promoteTask = el('button', 'btn btn--primary', 'Promote to task');
  promoteTask.type = 'button';
  promoteTask.addEventListener('click', () => {
    void tasksApi
      .updateTask(task.id, { bucket: 'active', status: 'open' })
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteProject = el('button', 'btn btn--secondary', 'Promote to project');
  promoteProject.type = 'button';
  promoteProject.addEventListener('click', () => {
    void spawnProjectFromSomeday(task)
      .then((project) =>
        tasksApi.updateTask(task.id, {
          linked_project_ids: [...somedayLinkedProjectIds(task), project.id]
        })
      )
      .then((next) => onChange(next))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteGoal = el('button', 'btn btn--ghost', 'Promote to goal');
  promoteGoal.type = 'button';
  promoteGoal.addEventListener('click', () => {
    void tasksApi
      .createGoal({ title: task.title, description: task.description, parent_someday_id: task.id })
      .then((goal) =>
        tasksApi.updateTask(task.id, {
          linked_goal_ids: [...somedayLinkedGoalIds(task), goal.id]
        })
      )
      .then((next) => onChange(next))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const trash = el('button', 'btn btn--ghost', 'Remove');
  trash.type = 'button';
  trash.addEventListener('click', () => {
    if (!window.confirm(`Remove “${task.title}”?`)) return;
    void tasksApi
      .deleteTask(task.id)
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  actions.append(parkUntil, promoteTask, promoteProject, promoteGoal, trash);
  card.append(actions);
  return card;
}

/** Someday / Maybe holding pen — off the active board until promoted. Dreams stay even once promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading someday ideas…', '.someday-hero');
  try {
    const [allTasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
    let items = somedayTasks(allTasks);
    const paint = () => {
      paintSomeday(canvas, items, allTasks, projects, (next) => {
        items = next;
        paint();
      });
    };
    paint();
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load someday items.')));
  }
}

function paintSomeday(
  canvas: HTMLElement,
  items: Task[],
  allTasks: Task[],
  projects: Project[],
  setItems: (next: Task[]) => void
): void {
  const restoreSearch =
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.getAttribute('aria-label') === 'Filter someday ideas';
  const searchPos = restoreSearch
    ? (document.activeElement as HTMLInputElement).selectionStart
    : null;
  canvas.replaceChildren();

  const hero = el('div', 'someday-hero');
  hero.append(el('span', 'someday-hero__icon', '🌈'));
  canvas.append(hero);

  if (items.length > 0) {
    const odysseyTarget = items[0];
    const odysseyCta = el('a', 'someday-cta');
    odysseyCta.href = `#/someday/odyssey/${encodeURIComponent(odysseyTarget.id)}`;
    const ctaIcon = el('div', 'someday-cta__icon');
    ctaIcon.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>';
    const ctaBody = el('div', 'someday-cta__body');
    ctaBody.append(
      el('div', 'someday-cta__title', 'Start an Odyssey'),
      el('div', 'someday-cta__subtitle', 'Sketch three futures before you pick one')
    );
    const ctaChevron = el('div', 'someday-cta__chevron');
    ctaChevron.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    odysseyCta.append(ctaIcon, ctaBody, ctaChevron);
    canvas.append(odysseyCta);
  }

  const coverage = computeLifeCoverage(items);
  const wheelCard = el('a', 'someday-preview-card');
  wheelCard.href = '#/someday/wheel';
  const wheelIcon = el('div', 'someday-preview-card__icon');
  wheelIcon.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 110 110"><polygon points="55,15 82,25 96,50 82,90 55,100 25,85 12,50 32,30" fill="var(--pastel-blue)" stroke="var(--wave)" stroke-width="2"/><polygon points="55,20 66,52 50,52 71,68 62,46 45,46" fill="var(--wave)" opacity="0.55"/></svg>';
  const wheelBody = el('div', 'someday-preview-card__body');
  wheelBody.append(
    el('div', 'someday-preview-card__title', 'Life coverage'),
    el('div', 'someday-preview-card__subtitle', lifeCoverageHeadline(coverage))
  );
  const wheelChevron = el('div', 'someday-preview-card__chevron');
  wheelChevron.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  wheelCard.append(wheelIcon, wheelBody, wheelChevron);
  canvas.append(wheelCard);

  const filters = createCollapsibleFilters({
    id: 'someday',
    ariaLabel: 'Filters',
    active: somedayDomain !== 'all' || Boolean(somedayQuery.trim())
  });
  const search = createHubSearch({
    placeholder: 'Filter someday ideas…',
    ariaLabel: 'Filter someday ideas',
    value: somedayQuery,
    onInput: (value) => {
      somedayQuery = value;
      paintSomeday(canvas, items, allTasks, projects, setItems);
    }
  });
  filters.panel.append(
    search.el,
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: somedayDomain,
      onChange: (value) => {
        somedayDomain = value as TaskDomain | 'all';
        paintSomeday(canvas, items, allTasks, projects, setItems);
      }
    }).el
  );
  canvas.append(filters.root);

  const addForm = el('form', 'someday-add hub-toolbar');
  const title = createHubSearch({
    type: 'text',
    placeholder: 'Capture a someday idea',
    ariaLabel: 'Someday idea',
    required: true
  });
  const submit = el('button', 'btn btn--decisive', 'Park it');
  submit.type = 'submit';
  addForm.append(title.el, submit);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const created = await tasksApi.createTask({
        title: title.input.value.trim(),
        domain: 'other',
        bucket: 'someday',
        status: 'deferred'
      });
      title.input.value = '';
      setItems([created, ...items]);
    } catch (err) {
      canvas.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  canvas.append(
    createPlusAdd({
      ariaLabel: 'Add a someday idea',
      panel: addForm
    }).root
  );

  const query = somedayQuery.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (somedayDomain !== 'all' && item.domain !== somedayDomain) return false;
    if (
      query &&
      !item.title.toLowerCase().includes(query) &&
      !item.description.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  if (visible.length === 0) {
    canvas.append(
      el(
        'p',
        'empty-state',
        items.length === 0 ? 'Nothing in Someday / Maybe yet.' : 'No someday ideas match those filters.'
      )
    );
    return;
  }

  const { reviewNow, parked } = groupSomedayForReview(visible);
  const onCardChange = (item: Task, next: Task | null) => {
    setItems(
      next
        ? items.map((entry) => (entry.id === next.id ? next : entry))
        : items.filter((entry) => entry.id !== item.id)
    );
  };

  if (reviewNow.length) {
    const group = el('section', 'someday-group');
    const heading = el('h2', 'someday-group__title', 'Review now');
    const sweepNote = el(
      'span',
      'someday-group__sweep',
      reviewNow.length === 1
        ? 'The Sweep found 1 dream ready for another look.'
        : `The Sweep found ${reviewNow.length} dreams ready for another look.`
    );
    heading.append(sweepNote);
    group.append(heading);
    const grid = el('div', 'someday-grid');
    for (const item of reviewNow) {
      grid.append(renderSomedayCard(item, true, projects, allTasks, (next) => onCardChange(item, next)));
    }
    group.append(grid);
    canvas.append(group);
  }
  if (parked.length) {
    const group = el('section', 'someday-group');
    group.append(el('h2', 'someday-group__title', 'Parked'));
    const grid = el('div', 'someday-grid');
    for (const item of parked) {
      grid.append(renderSomedayCard(item, false, projects, allTasks, (next) => onCardChange(item, next)));
    }
    group.append(grid);
    canvas.append(group);
  }

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter someday ideas"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}
