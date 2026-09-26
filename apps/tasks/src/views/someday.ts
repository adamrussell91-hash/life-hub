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
  matchesSomedayKind,
  showsOriginDate,
  SOMEDAY_KINDS,
  somedayKindLabel,
  somedayLinkedGoalIds,
  somedayLinkedProjectIds,
  stalledLinkedProjects,
  suggestFirstMilestone,
  suggestIfThen,
  type SomedayKindFilter
} from '@/domain/someday';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { mountLifeWallEditor } from '@/views/life-wall-editor';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubField,
  createHubFilter,
  createHubSearch,
  createHubToolbar,
  domainFilterOptions,
  el,
  labeledField
} from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';
import { renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import type { TaskDomain } from '@/schemas/task';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { openPromoteToGoalPopover } from '@/views/promote-to-goal';

let somedayDomain: TaskDomain | 'all' = 'all';
let somedayKind: SomedayKindFilter = 'all';
let somedayQuery = '';
let openSomedayId: string | null = null;
let editingSomedayId: string | null = null;

/** Tests share this module. Clear filters so one case cannot hide another. */
export function resetSomedayViewFilters(): void {
  somedayDomain = 'all';
  somedayKind = 'all';
  somedayQuery = '';
  openSomedayId = null;
  editingSomedayId = null;
}

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

function persistSomeday(task: Task, patch: Partial<Task>, onChange: (next: Task | null) => void): void {
  void tasksApi
    .updateTask(task.id, patch)
    .then((next) => onChange(next))
    .catch((err) => window.alert(errorMessage(err)));
}

function isSomedayControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, label, .card-menu, .hub-menu, .someday-card__fields, .someday-card__stalled'
      )
    )
  );
}

type SomedayCardHandlers = {
  open: boolean;
  editing: boolean;
  onChange: (next: Task | null) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDone: () => void;
};

/** Closed summary. Open the card, then choose Edit — same shape as the other hub cards. */
function renderSomedayCard(
  task: Task,
  flagged: boolean,
  projects: Project[],
  allTasks: Task[],
  handlers: SomedayCardHandlers
): HTMLElement {
  const card = el(
    'article',
    `glass-tile someday-card${flagged ? ' someday-card--flagged' : ''}${handlers.open ? ' someday-card--open' : ''}`
  );
  card.tabIndex = 0;
  card.setAttribute('aria-expanded', handlers.open ? 'true' : 'false');
  card.setAttribute('aria-label', `${task.title} someday card`);

  const titleRow = el('div', 'someday-card__title-row');
  if (flagged) {
    const ring = document.createElement('span');
    ring.className = 'someday-open-loop';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="var(--line)" stroke-width="2.5"/><circle cx="9" cy="9" r="7" fill="none" stroke="var(--warning)" stroke-width="2.5" stroke-dasharray="26 44" stroke-linecap="round" transform="rotate(-90 9 9)"/></svg>';
    titleRow.append(ring);
  }
  titleRow.append(el('h3', 'someday-card__title', task.title));
  const menu: CardMenuItem[] = [
    handlers.editing
      ? { id: 'done', label: 'Done', onSelect: handlers.onDone }
      : { id: 'edit', label: 'Edit', onSelect: handlers.onEdit },
    {
      id: 'branch',
      label: 'Branch it',
      onSelect: () => {
        location.hash = `#/someday/odyssey/${encodeURIComponent(task.id)}`;
      }
    },
    {
      id: 'project',
      label: 'Promote to project',
      onSelect: () => {
        void spawnProjectFromSomeday(task)
          .then((project) =>
            tasksApi.updateTask(task.id, {
              linked_project_ids: [...somedayLinkedProjectIds(task), project.id]
            })
          )
          .then((next) => handlers.onChange(next))
          .catch((err) => window.alert(errorMessage(err)));
      }
    },
    {
      id: 'goal',
      label: 'Promote to goal',
      onSelect: () => {
        const menuBtn = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : document.body;
        void openPromoteToGoalPopover(menuBtn, task, (next) => handlers.onChange(next));
      }
    },
    {
      id: 'remove',
      label: 'Remove',
      danger: true,
      onSelect: () => {
        if (!window.confirm(`Remove “${task.title}”?`)) return;
        void tasksApi
          .deleteTask(task.id)
          .then(() => handlers.onChange(null))
          .catch((err) => window.alert(errorMessage(err)));
      }
    }
  ];
  titleRow.append(renderCardMenu(`${task.title} card menu`, menu, { heading: 'Someday' }));
  card.append(titleRow);

  const metaParts: string[] = [];
  if (showsOriginDate(task.someday_kind) && task.origin_date) {
    metaParts.push(`Origin ${formatDisplayDate(task.origin_date)}`);
  }
  if (task.review_at) metaParts.push(`Review ${formatDisplayDate(task.review_at)}`);
  const linkedProjects = somedayLinkedProjectIds(task).length;
  const linkedGoals = somedayLinkedGoalIds(task).length;
  if (linkedProjects) metaParts.push(`${linkedProjects} linked project${linkedProjects === 1 ? '' : 's'}`);
  if (metaParts.length) card.append(el('p', 'hierarchy-meta', metaParts.join(' · ')));
  if (linkedGoals) {
    const grownRow = el('p', 'someday-card__grown-row');
    const grown = el('a', 'someday-card__grown', `${linkedGoals} goal${linkedGoals === 1 ? '' : 's'} grown`) as HTMLAnchorElement;
    grown.href = linkedGoals === 1 ? `#/goal/${somedayLinkedGoalIds(task)[0]}` : '#/goals';
    grownRow.append(grown);
    card.append(grownRow);
  }

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
  if (task.someday_kind) {
    chipsRow.append(el('span', 'someday-chip someday-chip--kind', somedayKindLabel(task.someday_kind)));
  }
  card.append(chipsRow);

  if (handlers.open) {
    if (task.description) card.append(el('p', 'someday-card__copy', task.description));
    if (flagged) card.append(el('p', 'someday-card__if-then', suggestIfThen(task)));
    const linked = projects.filter((p) => somedayLinkedProjectIds(task).includes(p.id));
    const stalledPaths = renderStalledPaths(task, stalledLinkedProjects(task, linked, allTasks), (next) =>
      handlers.onChange(next)
    );
    if (stalledPaths) card.append(stalledPaths);
  }

  if (handlers.editing) {
    const fieldsRow = el('div', 'someday-card__fields');
    const maturitySelect = selectField({
      ariaLabel: `How developed “${task.title}” is`,
      value: task.maturity ?? '',
      placeholder: 'Maturity…',
      choices: MATURITY_LEVELS.map((m) => ({ id: m.id, label: m.label })),
      onChange: (value) => persistSomeday(task, { maturity: value || null }, handlers.onChange)
    });
    fieldsRow.append(labeledField('Maturity', maturitySelect, 'hub-field hub-field--compact'));
    const areaSelect = selectField({
      ariaLabel: `Life area for “${task.title}”`,
      value: task.life_area ?? '',
      placeholder: 'Life area…',
      choices: LIFE_AREAS,
      onChange: (value) => persistSomeday(task, { life_area: value || null }, handlers.onChange)
    });
    fieldsRow.append(labeledField('Life area', areaSelect, 'hub-field hub-field--compact'));
    const horizonSelect = selectField({
      ariaLabel: `What altitude “${task.title}” would land at`,
      value: task.horizon_target ?? '',
      placeholder: 'If promoted…',
      choices: HORIZON_TARGETS,
      onChange: (value) => persistSomeday(task, { horizon_target: value || null }, handlers.onChange)
    });
    fieldsRow.append(labeledField('Horizon', horizonSelect, 'hub-field hub-field--compact'));
    const kindSelect = selectField({
      ariaLabel: `Category for “${task.title}”`,
      value: task.someday_kind ?? '',
      placeholder: 'Category…',
      choices: SOMEDAY_KINDS.map((kind) => ({ id: kind.id, label: kind.label })),
      onChange: (value) => persistSomeday(task, { someday_kind: value || null }, handlers.onChange)
    });
    fieldsRow.append(labeledField('Category', kindSelect, 'hub-field hub-field--compact'));
    if (showsOriginDate(task.someday_kind)) {
      const origin = createHubField({
        type: 'date',
        ariaLabel: `Origin date for ${task.title}`,
        value: task.origin_date ?? ''
      });
      origin.input.addEventListener('change', () => {
        persistSomeday(task, { origin_date: origin.input.value || null }, handlers.onChange);
      });
      fieldsRow.append(labeledField('Origin', origin.el, 'hub-field hub-field--compact'));
    }
    const review = createHubField({
      type: 'date',
      ariaLabel: `Review date for ${task.title}`,
      value: task.review_at ?? ''
    });
    review.input.addEventListener('change', () => {
      persistSomeday(task, { review_at: review.input.value || null }, handlers.onChange);
    });
    fieldsRow.append(labeledField('Review', review.el, 'hub-field hub-field--compact'));
    card.append(fieldsRow);
    card.append(
      mountLifeWallEditor({
        title: task.title,
        wall: task.life_wall,
        suggest: () => {
          const date = task.target_date || task.review_at || task.origin_date;
          return date ? { starts_on: date, ends_on: date } : null;
        },
        onCommit: (wall) => persistSomeday(task, { life_wall: wall }, handlers.onChange)
      }).el
    );
  }

  const toggle = () => handlers.onToggle();
  card.addEventListener('click', (event) => {
    if (isSomedayControl(event.target)) return;
    toggle();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== card) return;
    event.preventDefault();
    toggle();
  });
  return card;
}

/** Someday / Maybe holding pen — off the active board until promoted. Dreams stay even once promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading someday ideas…', '.someday-view');
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

  const root = el('div', 'someday-view');
  const wash = el('div', 'someday-wash');
  wash.setAttribute('aria-hidden', 'true');
  root.append(wash);

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
    root.append(odysseyCta);
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
  root.append(wheelCard);

  const toolbar = createHubToolbar('someday-toolbar');
  const filters = createCollapsibleFilters({
    id: 'someday',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline',
    active: somedayDomain !== 'all' || somedayKind !== 'all' || Boolean(somedayQuery.trim())
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
    }).el,
    createHubFilter({
      key: 'Category',
      label: 'Category',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All' },
        ...SOMEDAY_KINDS.map((kind) => ({ value: kind.id, label: kind.label })),
        { value: 'uncategorised', label: 'Uncategorised' }
      ],
      value: somedayKind,
      onChange: (value) => {
        somedayKind = value as SomedayKindFilter;
        paintSomeday(canvas, items, allTasks, projects, setItems);
      }
    }).el
  );

  const addForm = el('form', 'someday-add hub-toolbar');
  const title = createHubSearch({
    type: 'text',
    placeholder: 'Capture a someday idea',
    ariaLabel: 'Someday idea',
    required: true
  });
  const origin = createHubField({
    type: 'date',
    ariaLabel: 'Origin date for the new someday idea'
  });
  const originWrap = labeledField('Origin', origin.el, 'hub-field hub-field--compact');
  originWrap.hidden = true;
  const kind = selectField({
    ariaLabel: 'Category for the new someday idea',
    value: '',
    placeholder: 'Category…',
    choices: SOMEDAY_KINDS.map((entry) => ({ id: entry.id, label: entry.label })),
    onChange: (value) => {
      originWrap.hidden = !showsOriginDate(value);
    }
  });
  const submit = el('button', 'btn btn--decisive', 'Park it');
  submit.type = 'submit';
  addForm.append(title.el, labeledField('Category', kind, 'hub-field hub-field--compact'), originWrap, submit);
  const plus = createPlusAdd({
    ariaLabel: 'Add a someday idea',
    panel: addForm,
    className: 'plus-add--inline'
  });
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const someday_kind = kind.value || null;
      const created = await tasksApi.createTask({
        title: title.input.value.trim(),
        domain: 'other',
        bucket: 'someday',
        status: 'deferred',
        someday_kind,
        origin_date: showsOriginDate(someday_kind) ? origin.input.value || null : null
      });
      title.input.value = '';
      kind.value = '';
      origin.input.value = '';
      originWrap.hidden = true;
      plus.close();
      setItems([created, ...items]);
    } catch (err) {
      root.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  toolbar.append(filters.root, plus.root);
  root.append(toolbar);

  const query = somedayQuery.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (somedayDomain !== 'all' && item.domain !== somedayDomain) return false;
    if (!matchesSomedayKind(item, somedayKind)) return false;
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
    root.append(
      el(
        'p',
        'empty-state',
        items.length === 0 ? 'Nothing in Someday / Maybe yet.' : 'No someday ideas match those filters.'
      )
    );
    canvas.replaceChildren(root);
    return;
  }

  const { reviewNow, parked } = groupSomedayForReview(visible);
  const onCardChange = (item: Task, next: Task | null) => {
    if (!next) {
      if (openSomedayId === item.id) openSomedayId = null;
      if (editingSomedayId === item.id) editingSomedayId = null;
    }
    setItems(
      next
        ? items.map((entry) => (entry.id === next.id ? next : entry))
        : items.filter((entry) => entry.id !== item.id)
    );
  };

  const repaint = () => paintSomeday(canvas, items, allTasks, projects, setItems);
  const somedayCardHandlers = (item: Task, onChange: (next: Task | null) => void): SomedayCardHandlers => ({
    open: openSomedayId === item.id,
    editing: editingSomedayId === item.id,
    onChange,
    onToggle: () => {
      if (openSomedayId === item.id) {
        openSomedayId = null;
        editingSomedayId = null;
      } else {
        openSomedayId = item.id;
        editingSomedayId = null;
      }
      repaint();
    },
    onEdit: () => {
      openSomedayId = item.id;
      editingSomedayId = item.id;
      repaint();
    },
    onDone: () => {
      editingSomedayId = null;
      repaint();
    }
  });

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
      grid.append(
        renderSomedayCard(item, true, projects, allTasks, somedayCardHandlers(item, (next) => onCardChange(item, next)))
      );
    }
    group.append(grid);
    root.append(group);
  }
  if (parked.length) {
    const group = el('section', 'someday-group');
    group.append(el('h2', 'someday-group__title', 'Parked'));
    const grid = el('div', 'someday-grid');
    for (const item of parked) {
      grid.append(
        renderSomedayCard(item, false, projects, allTasks, somedayCardHandlers(item, (next) => onCardChange(item, next)))
      );
    }
    group.append(grid);
    root.append(group);
  }

  canvas.replaceChildren(root);

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter someday ideas"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}
