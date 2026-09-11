import type { ComplianceModule, Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate, LeadTimeOverrides } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import {
  defaultExcursionEventDate,
  excursionClearance,
  excursionCountdownLabel,
  formatLeadTimes,
  leadTimeSlack,
  nextExcursionAction
} from '@/domain/excursion';
import { cloneDefaultComplianceModules } from '@/domain/excursion-modules';
import { DEFAULT_EXCURSION_TITLE } from '@/domain/excursion-catalog';
import { newExcursionHash, projectPageHash, projectProgress } from '@/domain/cards';
import { matchesProjectQuery } from '@/domain/projects-pulse';
import { parseDue, startOfDay } from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { hashQuery } from '@/shell/shell';
import { deleteProjectNow } from '@/views/card-actions';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { renderComplianceBundle } from '@/views/excursion-compliance';
import { renderCardMenu } from '@/views/card-menu';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import {
  createHubField,
  createHubPills,
  createHubSearch,
  createHubToolbar,
  el
} from '@/views/hub-kit';
import { createPlusButton } from '@/views/plus-add';

function showConfirm(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>,
  extra?: HTMLElement[]
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  const summaryEl = el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`);
  card.append(summaryEl);
  if (extra?.length) card.append(...extra);
  const actions = el('div', 'confirm-card__actions');
  const cancel = el('button', 'btn btn--ghost', 'Discard');
  cancel.type = 'button';
  const ok = el('button', 'btn btn--primary', 'Confirm');
  ok.type = 'button';
  cancel.addEventListener('click', () => host.replaceChildren());
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    cancel.disabled = true;
    try {
      await onConfirm();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Create failed')
      );
    } finally {
      ok.disabled = false;
      cancel.disabled = false;
    }
  });
  actions.append(cancel, ok);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openProjectPage(project: Project): void {
  location.hash = projectPageHash(project.id);
}

async function createFromTemplate(
  template: ExcursionTemplate,
  title: string,
  eventDate: string,
  complianceModules: ComplianceModule[],
  leadTimeOverrides: LeadTimeOverrides
): Promise<Project> {
  const result = await tasksApi.createExcursionFromTemplate({
    excursion_template_id: template.id,
    title,
    event_date: eventDate,
    compliance_modules: complianceModules,
    lead_time_overrides: Object.keys(leadTimeOverrides).length ? leadTimeOverrides : undefined
  });
  return result.project;
}

function confirmSummary(template: ExcursionTemplate, eventDate: string): string {
  return `On ${formatDisplayDate(eventDate)}. This will add dated admin tasks (${formatLeadTimes(template)}) and draft the permission note + staff email.`;
}

type EditableLeadKind = 'risk_assessment' | 'permission_note' | 'staff_email' | 'payment';

const LEAD_FIELD_BY_KIND: Record<EditableLeadKind, keyof ExcursionTemplate['default_lead_times']> = {
  risk_assessment: 'risk_assessment_days',
  permission_note: 'permission_note_days',
  staff_email: 'staff_email_days',
  payment: 'payment_days'
};

/** Apply per-item day-count overrides on top of a template's defaults, for preview + create. */
function withLeadOverrides(template: ExcursionTemplate, overrides: LeadTimeOverrides): ExcursionTemplate {
  return { ...template, default_lead_times: { ...template.default_lead_times, ...overrides } };
}

/**
 * Live lead-time slack under the date field — editable, since how many days'
 * notice a permission note or risk assessment needs can change trip to trip.
 */
function renderSlackList(
  host: HTMLElement,
  template: ExcursionTemplate,
  eventDate: string,
  onLeadDaysChange: (kind: EditableLeadKind, days: number) => void
): void {
  host.replaceChildren();
  const slack = leadTimeSlack(template, eventDate);
  for (const row of slack) {
    const li = el('li', `excursion-confirm__slack-row${row.tight ? ' is-tight' : ''}`);
    li.append(el('span', 'excursion-confirm__slack-label', row.label));
    const days = document.createElement('input');
    days.type = 'number';
    days.min = '0';
    days.className = 'excursion-confirm__slack-days';
    days.value = String(row.leadDays);
    days.setAttribute('aria-label', `${row.label} — days of notice needed`);
    days.addEventListener('change', () => {
      const value = Math.round(Number(days.value));
      if (!Number.isFinite(value) || value < 0) {
        days.value = String(row.leadDays);
        return;
      }
      onLeadDaysChange(row.kind as EditableLeadKind, value);
    });
    li.append(
      days,
      el(
        'span',
        'excursion-confirm__slack-note',
        row.tight
          ? `needs ${Math.abs(row.slackDays)} more days than this date gives`
          : `${row.slackDays}d to spare`
      )
    );
    host.append(li);
  }
}

function confirmCreate(
  host: HTMLElement,
  template: ExcursionTemplate,
  onCreated: (project: Project) => void
): void {
  let title = DEFAULT_EXCURSION_TITLE;
  let eventDate = defaultExcursionEventDate();
  let leadOverrides: LeadTimeOverrides = {};
  let complianceModules = cloneDefaultComplianceModules();

  const refreshHeading = () => {
    const heading = host.querySelector('.page-header__title');
    if (heading) heading.textContent = `Create “${title}”`;
  };
  const refreshSummary = () => {
    const summaryEl = host.querySelector('.page-header__supporting');
    if (summaryEl) {
      summaryEl.textContent = `${confirmSummary(withLeadOverrides(template, leadOverrides), eventDate)} Do not apply until Confirm.`;
    }
  };

  const slackList = el('ul', 'excursion-confirm__slack');
  const refreshSlack = () =>
    renderSlackList(slackList, withLeadOverrides(template, leadOverrides), eventDate, (kind, value) => {
      leadOverrides = { ...leadOverrides, [LEAD_FIELD_BY_KIND[kind]]: value };
      refreshSlack();
      refreshSummary();
    });
  refreshSlack();

  const titleField = createHubField({
    ariaLabel: 'Excursion title',
    value: title,
    placeholder: DEFAULT_EXCURSION_TITLE,
    inputClass: 'hub-search__input excursion-confirm__title',
    onChange: (value) => {
      title = value.trim() || DEFAULT_EXCURSION_TITLE;
      refreshHeading();
    }
  });

  const dateField = createHubField({
    ariaLabel: 'Event date',
    type: 'date',
    value: eventDate,
    className: 'excursion-confirm__date',
    onChange: (value) => {
      if (!value) return;
      eventDate = value;
      refreshSlack();
      refreshSummary();
    }
  });
  const fieldWrap = el('div', 'excursion-confirm__field');
  fieldWrap.append(titleField.el, dateField.el, slackList);

  const complianceHeading = el(
    'p',
    'excursion-confirm__field-label',
    'Compliance bundle — on by default, untoggle what this trip doesn’t need'
  );
  const complianceWrap = renderComplianceBundle(complianceModules, (id) => {
    const module = complianceModules.find((m) => m.id === id);
    if (!module) return;
    module.on = !module.on;
  });

  showConfirm(
    host,
    `Create “${title}”`,
    confirmSummary(template, eventDate),
    async () => {
      onCreated(await createFromTemplate(template, title, eventDate, complianceModules, leadOverrides));
    },
    [fieldWrap, complianceHeading, complianceWrap]
  );
}

type ExcursionsGroupBy = 'clearance' | 'when';

type ExcursionLane = { id: string; title: string };

const CLEARANCE_LANES: ExcursionLane[] = [
  { id: 'not_cleared', title: 'Not cleared' },
  { id: 'cleared', title: 'Cleared' },
  { id: 'past', title: 'Past' }
];

const WHEN_LANES: ExcursionLane[] = [
  { id: 'soon', title: 'This week' },
  { id: 'upcoming', title: 'Upcoming' },
  { id: 'unscheduled', title: 'Unscheduled' },
  { id: 'past', title: 'Past' }
];

let excursionQuery = '';
let excursionGroupBy: ExcursionsGroupBy = 'clearance';

function eventDayDelta(project: Project, now: Date): number | null {
  const event = parseDue(project.current_end_date);
  if (!event) return null;
  return Math.round((startOfDay(event).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function whenLaneId(project: Project, now: Date): string {
  const days = eventDayDelta(project, now);
  if (days === null) return 'unscheduled';
  if (days < 0) return 'past';
  if (days <= 7) return 'soon';
  return 'upcoming';
}

function clearanceLaneId(project: Project, tasks: Task[], now: Date): string {
  if (whenLaneId(project, now) === 'past') return 'past';
  return excursionClearance(project, tasks).cleared ? 'cleared' : 'not_cleared';
}

function complianceSummary(project: Project): { on: number; total: number } | null {
  const modules = project.compliance_modules;
  if (!modules?.length) return null;
  return { on: modules.filter((m) => m.on).length, total: modules.length };
}

/**
 * Same hub-card / pcard chrome as Projects, with the excursion facts
 * (clearance, countdown, compliance, next dated action) in place of
 * energy / drift / impact.
 */
function renderExcursionCard(
  project: Project,
  tasks: Task[],
  actions: { onOpen: (project: Project) => void; onDelete: (project: Project) => void }
): HTMLElement {
  const clearance = excursionClearance(project, tasks);
  const progress = projectProgress(project, tasks);
  const compliance = complianceSummary(project);
  const next = nextExcursionAction(project, tasks);

  const card = el('article', 'hub-card pcard excursion-card');
  card.dataset.projectId = project.id;

  const top = el('div', 'pcard__top');
  top.append(el('span', 'pcard__title excursion-card__title', project.title));
  top.append(
    el(
      'span',
      `status-badge excursion-card__pill ${clearance.cleared ? 'status-badge--on_the_go is-go' : 'tint-peach is-warn'}`,
      clearance.cleared ? 'Cleared' : 'Not cleared'
    )
  );
  top.append(
    renderCardMenu(`${project.title} card menu`, [
      { id: 'page', label: 'Full page', onSelect: () => actions.onOpen(project) },
      { id: 'delete', label: 'Delete', danger: true, onSelect: () => actions.onDelete(project) }
    ])
  );
  card.append(top);

  const desc = project.arc_summary || project.description;
  if (desc) card.append(el('p', 'pcard__desc', desc));
  card.append(
    el('p', 'pcard__desc excursion-card__countdown', excursionCountdownLabel(project.current_end_date))
  );

  if (compliance) {
    const row = el('div', 'pcard__row excursion-card__row');
    row.append(
      el('span', 'excursion-card__row-label', 'Compliance'),
      el('span', 'excursion-card__row-value', `${compliance.on}/${compliance.total}`)
    );
    const track = el('div', 'hub-track hub-track--sm');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(compliance.total));
    track.setAttribute('aria-valuenow', String(compliance.on));
    track.setAttribute('aria-label', 'Compliance items included');
    const fill = el('div', 'hub-track__fill');
    fill.style.width = `${compliance.total ? Math.round((compliance.on / compliance.total) * 100) : 0}%`;
    track.append(fill);
    card.append(row, track);
  }

  const taskRow = el('div', 'pcard__row excursion-card__row');
  taskRow.append(
    el('span', 'excursion-card__row-label', 'Tasks'),
    el('span', 'excursion-card__row-value', `${progress.done}/${progress.total} done`)
  );
  card.append(taskRow);

  card.append(
    next
      ? el(
          'p',
          `meta-line excursion-card__next${next.overdue ? ' is-overdue' : ''}`,
          `${next.overdue ? 'Overdue' : 'Next'}: ${next.label} — ${formatDisplayDate(next.dueDate)}`
        )
      : el('p', 'meta-line excursion-card__next', 'Nothing dated outstanding.')
  );

  if (project.current_end_date) {
    card.append(
      el('p', 'meta-line', `Target ${formatDisplayDate(project.current_end_date)}`)
    );
  }

  const actionsRow = el('div', 'pcard__row pcard__actions');
  const open = el('button', 'btn btn--ghost', 'Open page');
  open.type = 'button';
  open.addEventListener('click', () => actions.onOpen(project));
  actionsRow.append(open);
  card.append(actionsRow);

  return card;
}

function renderExcursionBoard(
  excursions: Project[],
  tasks: Task[],
  now: Date,
  actions: { onOpen: (project: Project) => void; onDelete: (project: Project) => void }
): HTMLElement {
  const visible = excursions.filter((project) => matchesProjectQuery(project, excursionQuery));
  const lanes = excursionGroupBy === 'when' ? WHEN_LANES : CLEARANCE_LANES;
  const grouped = lanes
    .map((lane) => ({
      ...lane,
      cards: visible.filter((project) =>
        excursionGroupBy === 'when'
          ? whenLaneId(project, now) === lane.id
          : clearanceLaneId(project, tasks, now) === lane.id
      )
    }))
    .filter((lane) => lane.cards.length);

  const grid = el('div', 'projects-board excursions-board');
  grid.style.gridTemplateColumns = grouped.length
    ? `repeat(${grouped.length}, minmax(0, 1fr))`
    : 'minmax(0, 1fr)';
  if (!grouped.length) {
    grid.append(
      el(
        'p',
        'empty-state',
        excursions.length ? 'No excursions match.' : 'No excursions yet. Create one above.'
      )
    );
    return grid;
  }
  for (const group of grouped) {
    const lane = el('div', 'lane');
    const head = el('div', 'lane__head');
    head.append(el('span', 'lane__title', group.title), el('span', 'lane__count', String(group.cards.length)));
    lane.append(head);
    for (const project of group.cards) {
      lane.append(renderExcursionCard(project, tasks, actions));
    }
    grid.append(lane);
  }
  return grid;
}

/** Excursions dashboard — Projects chrome, excursion facts on each card. */
export async function renderExcursionsView(canvas: HTMLElement): Promise<void> {
  const prefillId = hashQuery().get('template');
  if (prefillId) {
    location.hash = newExcursionHash(prefillId);
    return;
  }

  showViewLoading(canvas, 'Loading…', '.excursions-board');

  let excursions: Project[];
  let tasks: Task[];
  let templates: ExcursionTemplate[] = [];
  try {
    const [projects, allTasks, templatesPayload] = await Promise.all([
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.listTemplates().catch(() => ({ excursion_templates: [] as ExcursionTemplate[] }))
    ]);
    excursions = projects.filter((project) => project.type === 'excursion');
    tasks = allTasks;
    templates = templatesPayload.excursion_templates as ExcursionTemplate[];
  } catch (err) {
    renderLoadError(canvas, err, () => void renderExcursionsView(canvas), 'Could not load excursions');
    return;
  }

  const now = new Date();

  function dropProject(projectId: string): void {
    excursions = excursions.filter((project) => project.id !== projectId);
    tasks = tasks.filter((task) => task.parent_project_id !== projectId);
    paint();
  }

  function paint(): void {
    const restoreSearch =
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.getAttribute('aria-label') === 'Filter excursions';
    const searchPos = restoreSearch
      ? (document.activeElement as HTMLInputElement).selectionStart
      : null;
    const scrollTop = canvas.scrollTop;

    canvas.replaceChildren();
    const confirmHost = el('div', 'excursion-confirm');

    const toolbar = createHubToolbar('projects-toolbar', 'excursions-toolbar');
    const search = createHubSearch({
      placeholder: 'Filter excursions…',
      ariaLabel: 'Filter excursions',
      value: excursionQuery,
      onInput: (value) => {
        excursionQuery = value;
        paint();
      }
    });
    const filters = createCollapsibleFilters({
      id: 'excursions',
      ariaLabel: 'Filters',
      className: 'hub-filters--inline',
      active: Boolean(excursionQuery.trim())
    });
    filters.panel.append(search.el);
    toolbar.append(
      filters.root,
      createHubPills({
        label: 'Group by',
        role: 'tablist',
        items: [
          { id: 'clearance', label: 'Clearance' },
          { id: 'when', label: 'When' }
        ],
        value: excursionGroupBy,
        onSelect: (id) => {
          excursionGroupBy = id;
          paint();
        }
      }),
      createPlusButton('Add an excursion', () => {
        location.hash = newExcursionHash(templates[0]?.id);
      })
    );
    canvas.append(toolbar, confirmHost);
    canvas.append(
      renderExcursionBoard(excursions, tasks, now, {
        onOpen: openProjectPage,
        onDelete: (current) => deleteProjectNow(current, () => dropProject(current.id), confirmHost)
      })
    );

    canvas.scrollTop = scrollTop;
    if (restoreSearch) {
      const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter excursions"]');
      if (field) {
        field.focus();
        if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
      }
    }
  }

  paint();
}

export function resetExcursionsViewStateForTests(): void {
  excursionQuery = '';
  excursionGroupBy = 'clearance';
}

/** Confirm the (single) template, then write — event date is editable inline, no template picker. */
export async function renderNewExcursionPage(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursion…'));
  const templatesPayload = await tasksApi.listTemplates();
  const templates = templatesPayload.excursion_templates as ExcursionTemplate[];
  const prefillId = hashQuery().get('template');
  const prefillTpl = templates.find((t) => t.id === prefillId) ?? templates[0];

  const page = el('div', 'excursion-page');
  const nav = el('div', 'page-editor__nav');
  const back = el('button', 'btn btn--ghost', 'Back to Excursions');
  back.type = 'button';
  back.addEventListener('click', () => {
    location.hash = '#/excursions';
  });
  nav.append(back);

  const confirmHost = el('div', 'excursion-confirm');
  page.append(nav, confirmHost);

  if (!prefillTpl) {
    page.append(el('p', 'empty-state', 'No excursion templates yet.'));
    canvas.replaceChildren(page);
    return;
  }

  confirmCreate(confirmHost, prefillTpl, openProjectPage);

  canvas.replaceChildren(page);
}
