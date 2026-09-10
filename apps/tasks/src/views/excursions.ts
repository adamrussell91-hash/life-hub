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
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { hashQuery } from '@/shell/shell';
import { plusIcon } from '@/shell/icons';
import { deleteProjectNow } from '@/views/card-actions';
import { renderComplianceBundle } from '@/views/excursion-compliance';
import { renderCardMenu } from '@/views/card-menu';
import { createHubField, el } from '@/views/hub-kit';

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
    onInput: (value) => {
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

function newExcursionButton(href: string): HTMLButtonElement {
  const button = el('button', 'btn btn--primary excursions-add') as HTMLButtonElement;
  button.type = 'button';
  button.append(plusIcon(), document.createTextNode('New excursion'));
  button.addEventListener('click', () => {
    location.hash = href;
  });
  return button;
}

function complianceSummary(project: Project): { on: number; total: number } | null {
  const modules = project.compliance_modules;
  if (!modules?.length) return null;
  return { on: modules.filter((m) => m.on).length, total: modules.length };
}

/**
 * Purpose-built dashboard card — Clearance Gate, countdown, compliance
 * completion, and the next outstanding dated action. Replaces the generic
 * project-board card here: excursions run 0-3 at a time, so this shows
 * everything that matters at a glance instead of a kanban-style summary.
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

  const card = el('article', 'excursion-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.setAttribute('aria-label', `Open ${project.title}`);

  const head = el('div', 'excursion-card__head');
  const titleCol = el('div', 'excursion-card__title-col');
  titleCol.append(
    el('p', 'excursion-card__title', project.title),
    el('p', 'excursion-card__countdown', excursionCountdownLabel(project.current_end_date))
  );
  head.append(
    titleCol,
    el(
      'span',
      `excursion-card__pill ${clearance.cleared ? 'is-go' : 'is-warn'}`,
      clearance.cleared ? 'Cleared' : 'Not cleared'
    ),
    renderCardMenu(
      `${project.title} options`,
      [{ id: 'delete', label: 'Delete', danger: true, onSelect: () => actions.onDelete(project) }],
      { heading: project.title, inline: true }
    )
  );
  card.append(head);

  const body = el('div', 'excursion-card__body');
  if (compliance) {
    const row = el('div', 'excursion-card__row');
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
    body.append(row, track);
  }

  const taskRow = el('div', 'excursion-card__row');
  taskRow.append(
    el('span', 'excursion-card__row-label', 'Tasks'),
    el('span', 'excursion-card__row-value', `${progress.done}/${progress.total} done`)
  );
  body.append(taskRow);

  body.append(
    next
      ? el(
          'p',
          `excursion-card__next${next.overdue ? ' is-overdue' : ''}`,
          `${next.overdue ? 'Overdue' : 'Next'}: ${next.label} — ${formatDisplayDate(next.dueDate)}`
        )
      : el('p', 'excursion-card__next', 'Nothing dated outstanding.')
  );
  card.append(body);

  const open = () => actions.onOpen(project);
  card.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.card-menu')) return;
    open();
  });
  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  return card;
}

/** Excursions dashboard — one template, so "New excursion" goes straight to the confirm flow. */
export async function renderExcursionsView(canvas: HTMLElement): Promise<void> {
  const prefillId = hashQuery().get('template');
  if (prefillId) {
    location.hash = newExcursionHash(prefillId);
    return;
  }

  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursions…'));
  const [projects, tasks, templatesPayload] = await Promise.all([
    tasksApi.listProjects(),
    tasksApi.listTasks(),
    tasksApi.listTemplates()
  ]);
  const templates = templatesPayload.excursion_templates as ExcursionTemplate[];
  const excursions = projects.filter((p) => p.type === 'excursion');

  canvas.replaceChildren();
  const confirmHost = el('div', 'excursion-confirm');
  const listHost = el('div', 'excursion-card-grid');
  const addRow = el('div', 'excursions-toolbar');
  addRow.append(newExcursionButton(newExcursionHash(templates[0]?.id)));
  canvas.append(addRow, confirmHost);

  const heading = el('h2', 'section-title', 'Active');
  heading.append(
    el('span', 'section-title__count', excursions.length === 1 ? '1 excursion' : `${excursions.length} excursions`)
  );
  canvas.append(heading);
  if (!excursions.length) {
    listHost.append(el('p', 'empty-state', 'No excursions yet. Create one above.'));
  } else {
    const reload = async () => {
      await renderExcursionsView(canvas);
    };
    for (const project of excursions) {
      listHost.append(
        renderExcursionCard(project, tasks, {
          onOpen: openProjectPage,
          onDelete: (current) => deleteProjectNow(current, reload, confirmHost)
        })
      );
    }
  }
  canvas.append(listHost);
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
