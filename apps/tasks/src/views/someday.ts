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
  type SomedayKind,
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

function isSomedayReviewNow(
  item: Task,
  todayKey = new Date().toISOString().slice(0, 10)
): boolean {
  return isReviewDue(item, todayKey) || !item.review_at;
}

export function groupSomedayForReview(
  items: Task[],
  todayKey = new Date().toISOString().slice(0, 10)
): { reviewNow: Task[]; parked: Task[] } {
  const reviewNow: Task[] = [];
  const parked: Task[] = [];
  for (const item of items) {
    if (isSomedayReviewNow(item, todayKey)) reviewNow.push(item);
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

/** Kind-first capture — Bucket list journal / Dreams jar / Career, not a generic category dropdown. */
const SOMEDAY_CAPTURE_CHOICES: Array<{ id: SomedayKind; label: string; placeholder: string }> = [
  {
    id: 'bucket_list',
    label: 'Add from bucket list journal',
    placeholder: 'Something for the bucket list…'
  },
  {
    id: 'dreams_jar',
    label: 'Dreams jar',
    placeholder: 'Drop a dream in the jar…'
  },
  {
    id: 'career',
    label: 'Career',
    placeholder: 'A career someday idea…'
  }
];

function buildSomedayCapture(options: {
  onCreated: (task: Task) => void;
  onError: (message: string) => void;
}): { panel: HTMLElement; reset: () => void } {
  const panel = el('div', 'someday-capture');
  const choices = el('div', 'plus-add__choices someday-capture__choices');
  const form = el('form', 'someday-add hub-toolbar');
  form.hidden = true;

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
  const kindLabel = el('p', 'someday-capture__kind', '');
  const back = el('button', 'btn btn--ghost btn--sm', 'Back');
  back.type = 'button';
  const submit = el('button', 'btn btn--decisive', 'Park it');
  submit.type = 'submit';
  form.append(kindLabel, title.el, originWrap, back, submit);

  let activeKind: SomedayKind | null = null;

  const showChoices = () => {
    activeKind = null;
    form.hidden = true;
    choices.hidden = false;
    title.input.value = '';
    origin.input.value = '';
    originWrap.hidden = true;
  };

  const showForm = (kind: SomedayKind, label: string, placeholder: string) => {
    activeKind = kind;
    choices.hidden = true;
    form.hidden = false;
    kindLabel.textContent = label;
    title.input.placeholder = placeholder;
    title.input.setAttribute('aria-label', label);
    originWrap.hidden = !showsOriginDate(kind);
    title.input.focus();
  };

  for (const choice of SOMEDAY_CAPTURE_CHOICES) {
    const btn = el('button', 'btn btn--secondary hub-create__item', choice.label);
    btn.type = 'button';
    btn.dataset.somedayKind = choice.id;
    btn.addEventListener('click', () => showForm(choice.id, choice.label, choice.placeholder));
    choices.append(btn);
  }

  back.addEventListener('click', showChoices);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeKind) return;
    const nextTitle = title.input.value.trim();
    if (!nextTitle) return;
    submit.disabled = true;
    try {
      const created = await tasksApi.createTask({
        title: nextTitle,
        domain: 'other',
        bucket: 'someday',
        status: 'deferred',
        someday_kind: activeKind,
        origin_date: showsOriginDate(activeKind) ? origin.input.value || null : null
      });
      showChoices();
      options.onCreated(created);
    } catch (err) {
      options.onError(errorMessage(err));
    } finally {
      submit.disabled = false;
    }
  });

  panel.append(choices, form);
  showChoices();
  return { panel, reset: showChoices };
}

type SomedaySession = {
  canvas: HTMLElement;
  root: HTMLElement;
  listHost: HTMLElement;
  items: Task[];
  allTasks: Task[];
  projects: Project[];
  coverageSubtitle: HTMLElement;
  filtersToggle: HTMLElement;
  wheelCard: HTMLElement;
};

function somedayFiltersActive(): boolean {
  return somedayDomain !== 'all' || somedayKind !== 'all' || Boolean(somedayQuery.trim());
}

function visibleSomedayItems(items: Task[]): Task[] {
  const query = somedayQuery.trim().toLowerCase();
  return items.filter((item) => {
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
}

function buildOdysseyCta(task: Task): HTMLAnchorElement {
  const odysseyCta = el('a', 'someday-cta') as HTMLAnchorElement;
  odysseyCta.href = `#/someday/odyssey/${encodeURIComponent(task.id)}`;
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
  return odysseyCta;
}

function syncSomedayChrome(session: SomedaySession): void {
  session.coverageSubtitle.textContent = lifeCoverageHeadline(computeLifeCoverage(session.items));
  const existing = session.root.querySelector<HTMLAnchorElement>(':scope > .someday-cta');
  const target = session.items[0];
  if (!target) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.href = `#/someday/odyssey/${encodeURIComponent(target.id)}`;
    return;
  }
  session.root.insertBefore(buildOdysseyCta(target), session.wheelCard);
}

function scrollHostFor(canvas: HTMLElement): HTMLElement {
  const wrap = canvas.closest('.hub-canvas');
  return wrap instanceof HTMLElement ? wrap : canvas;
}

/** Someday / Maybe holding pen — off the active board until promoted. Dreams stay even once promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading someday ideas…', '.someday-view');
  try {
    const [allTasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
    mountSomedaySession(canvas, somedayTasks(allTasks), allTasks, projects);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load someday items.')));
  }
}

/** Mount shell once; list/card updates stay in place so field edits and clicks do not flash-remount. */
function mountSomedaySession(
  canvas: HTMLElement,
  items: Task[],
  allTasks: Task[],
  projects: Project[]
): void {
  const root = el('div', 'someday-view');
  const wash = el('div', 'someday-wash');
  wash.setAttribute('aria-hidden', 'true');
  root.append(wash);

  const wheelCard = el('a', 'someday-preview-card') as HTMLAnchorElement;
  wheelCard.href = '#/someday/wheel';
  const wheelIcon = el('div', 'someday-preview-card__icon');
  wheelIcon.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 110 110"><polygon points="55,15 82,25 96,50 82,90 55,100 25,85 12,50 32,30" fill="var(--pastel-blue)" stroke="var(--wave)" stroke-width="2"/><polygon points="55,20 66,52 50,52 71,68 62,46 45,46" fill="var(--wave)" opacity="0.55"/></svg>';
  const wheelBody = el('div', 'someday-preview-card__body');
  const coverageSubtitle = el('div', 'someday-preview-card__subtitle', '');
  wheelBody.append(el('div', 'someday-preview-card__title', 'Life coverage'), coverageSubtitle);
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
    active: somedayFiltersActive()
  });

  const session: SomedaySession = {
    canvas,
    root,
    listHost: el('div', 'someday-list'),
    items,
    allTasks,
    projects,
    coverageSubtitle,
    filtersToggle: filters.toggle,
    wheelCard
  };

  const refreshFilters = () => {
    session.filtersToggle.classList.toggle('is-set', somedayFiltersActive());
    paintSomedayList(session);
  };

  const search = createHubSearch({
    placeholder: 'Filter someday ideas…',
    ariaLabel: 'Filter someday ideas',
    value: somedayQuery,
    onInput: (value) => {
      somedayQuery = value;
      refreshFilters();
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
        refreshFilters();
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
        refreshFilters();
      }
    }).el
  );

  let closeCapture = () => {};
  const capture = buildSomedayCapture({
    onCreated: (created) => {
      closeCapture();
      session.items = [created, ...session.items];
      syncSomedayChrome(session);
      paintSomedayList(session);
    },
    onError: (message) => {
      root.append(el('p', 'empty-state', message));
    }
  });
  const plus = createPlusAdd({
    ariaLabel: 'Add a someday idea',
    panel: capture.panel,
    className: 'plus-add--inline'
  });
  closeCapture = () => plus.close();
  plus.root.querySelector('.plus-add__btn')?.addEventListener('click', () => capture.reset());
  toolbar.append(filters.root, plus.root);
  root.append(toolbar, session.listHost);

  canvas.replaceChildren(root);
  syncSomedayChrome(session);
  paintSomedayList(session);
}

function buildSomedayCard(session: SomedaySession, item: Task, flagged: boolean): HTMLElement {
  const card = renderSomedayCard(
    item,
    flagged,
    session.projects,
    session.allTasks,
    somedayCardHandlers(session, item)
  );
  card.dataset.somedayId = item.id;
  return card;
}

function somedayCardHandlers(session: SomedaySession, item: Task): SomedayCardHandlers {
  const refreshCard = () => replaceSomedayCard(session, item.id);
  return {
    open: openSomedayId === item.id,
    editing: editingSomedayId === item.id,
    onChange: (next) => applySomedayCardChange(session, item, next),
    onToggle: () => {
      if (openSomedayId === item.id) {
        openSomedayId = null;
        editingSomedayId = null;
      } else {
        openSomedayId = item.id;
        editingSomedayId = null;
      }
      refreshCard();
    },
    onEdit: () => {
      openSomedayId = item.id;
      editingSomedayId = item.id;
      refreshCard();
    },
    onDone: () => {
      editingSomedayId = null;
      refreshCard();
    }
  };
}

function applySomedayCardChange(session: SomedaySession, item: Task, next: Task | null): void {
  if (!next) {
    if (openSomedayId === item.id) openSomedayId = null;
    if (editingSomedayId === item.id) editingSomedayId = null;
    session.items = session.items.filter((entry) => entry.id !== item.id);
    syncSomedayChrome(session);
    paintSomedayList(session);
    return;
  }

  const movedBucket = isSomedayReviewNow(item) !== isSomedayReviewNow(next);
  session.items = session.items.map((entry) => (entry.id === next.id ? next : entry));
  session.allTasks = session.allTasks.map((entry) => (entry.id === next.id ? next : entry));
  syncSomedayChrome(session);
  if (movedBucket) paintSomedayList(session);
  else replaceSomedayCard(session, next.id);
}

function replaceSomedayCard(session: SomedaySession, itemId: string): void {
  const item = session.items.find((entry) => entry.id === itemId);
  const existing = session.listHost.querySelector<HTMLElement>(
    `.someday-card[data-someday-id="${CSS.escape(itemId)}"]`
  );
  if (!item || !existing) {
    paintSomedayList(session);
    return;
  }
  existing.replaceWith(buildSomedayCard(session, item, isSomedayReviewNow(item)));
}

function appendSomedayCards(
  host: HTMLElement,
  title: string,
  items: Task[],
  flagged: boolean,
  session: SomedaySession,
  sweepNote?: string
): void {
  if (!items.length) return;
  const group = el('section', 'someday-group');
  const heading = el('h2', 'someday-group__title', title);
  if (sweepNote) heading.append(el('span', 'someday-group__sweep', sweepNote));
  group.append(heading);
  const grid = el('div', 'someday-grid');
  for (const item of items) grid.append(buildSomedayCard(session, item, flagged));
  group.append(grid);
  host.append(group);
}

function paintSomedayList(session: SomedaySession): void {
  const host = scrollHostFor(session.canvas);
  const scrollTop = host.scrollTop;
  const visible = visibleSomedayItems(session.items);
  session.listHost.replaceChildren();

  if (visible.length === 0) {
    session.listHost.append(
      el(
        'p',
        'empty-state',
        session.items.length === 0
          ? 'Nothing in Someday / Maybe yet.'
          : 'No someday ideas match those filters.'
      )
    );
  } else {
    const { reviewNow, parked } = groupSomedayForReview(visible);
    let sweepNote: string | undefined;
    if (reviewNow.length === 1) sweepNote = 'The Sweep found 1 dream ready for another look.';
    else if (reviewNow.length > 1) {
      sweepNote = `The Sweep found ${reviewNow.length} dreams ready for another look.`;
    }
    appendSomedayCards(session.listHost, 'Review now', reviewNow, true, session, sweepNote);
    appendSomedayCards(session.listHost, 'Parked', parked, false, session);
  }

  host.scrollTop = scrollTop;
}
