import type { ComplianceModule, Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import {
  defaultExcursionEventDate,
  excursionClearance,
  excursionCountdownLabel,
  formatLeadTimes,
  leadTimeSlack
} from '@/domain/excursion';
import { cloneDefaultComplianceModules } from '@/domain/excursion-modules';
import { DEFAULT_EXCURSION_TITLE } from '@/domain/excursion-catalog';
import { newExcursionHash, projectPageHash } from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { hashQuery } from '@/shell/shell';
import { plusIcon } from '@/shell/icons';
import { deleteProjectNow } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';
import { mountProjectCard } from '@/views/hub-cards';
import { renderComplianceBundle } from '@/views/excursion-compliance';
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
  eventDate: string,
  complianceModules: ComplianceModule[]
): Promise<Project> {
  const result = await tasksApi.createExcursionFromTemplate({
    excursion_template_id: template.id,
    title: DEFAULT_EXCURSION_TITLE,
    event_date: eventDate,
    compliance_modules: complianceModules
  });
  return result.project;
}

function confirmSummary(template: ExcursionTemplate, eventDate: string): string {
  return `On ${formatDisplayDate(eventDate)}. This will add dated admin tasks (${formatLeadTimes(template)}) and draft the permission note + staff email.`;
}

/** Live lead-time slack under the date field — flags what can't get its normal runway. */
function renderSlackList(host: HTMLElement, template: ExcursionTemplate, eventDate: string): void {
  host.replaceChildren();
  const slack = leadTimeSlack(template, eventDate);
  if (!slack.length) return;
  for (const row of slack) {
    host.append(
      el(
        'li',
        `excursion-confirm__slack-row${row.tight ? ' is-tight' : ''}`,
        row.tight
          ? `${row.label} — needs ${Math.abs(row.slackDays)} more days than this date gives; expedite on create`
          : `${row.label} — ${row.slackDays}d to spare`
      )
    );
  }
}

function confirmCreate(
  host: HTMLElement,
  template: ExcursionTemplate,
  onCreated: (project: Project) => void
): void {
  let eventDate = defaultExcursionEventDate();
  let complianceModules = cloneDefaultComplianceModules();

  const slackList = el('ul', 'excursion-confirm__slack');
  renderSlackList(slackList, template, eventDate);

  const dateField = createHubField({
    ariaLabel: 'Event date',
    type: 'date',
    value: eventDate,
    className: 'excursion-confirm__date',
    onChange: (value) => {
      if (!value) return;
      eventDate = value;
      renderSlackList(slackList, template, eventDate);
      const summaryEl = host.querySelector('.page-header__supporting');
      if (summaryEl) summaryEl.textContent = `${confirmSummary(template, eventDate)} Do not apply until Confirm.`;
    }
  });
  const fieldWrap = el('div', 'excursion-confirm__field');
  fieldWrap.append(dateField.el, slackList);

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
    `Create “${DEFAULT_EXCURSION_TITLE}”`,
    confirmSummary(template, eventDate),
    async () => {
      onCreated(await createFromTemplate(template, eventDate, complianceModules));
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

/** Glanceable Clearance Gate + countdown above the existing project card — card itself untouched. */
function renderExcursionMeta(project: Project, tasks: Task[]): HTMLElement {
  const clearance = excursionClearance(project, tasks);
  const strip = el(
    'div',
    `excursion-list-meta ${clearance.cleared ? 'is-go' : 'is-warn'}`
  );
  strip.append(
    el('span', 'excursion-list-meta__dot'),
    el(
      'span',
      'excursion-list-meta__text',
      `${clearance.cleared ? 'Cleared to depart' : 'Not cleared'} · ${excursionCountdownLabel(project.current_end_date)}`
    )
  );
  return strip;
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
  const listHost = el('div', 'task-stack');
  const addRow = el('div', 'excursions-toolbar');
  addRow.append(newExcursionButton(newExcursionHash(templates[0]?.id)));
  canvas.append(addRow, confirmHost);

  canvas.append(el('h2', 'section-title', 'Active'));
  if (!excursions.length) {
    listHost.append(el('p', 'empty-state', 'No excursions yet. Create one above.'));
  } else {
    const reload = async () => {
      await renderExcursionsView(canvas);
    };
    for (const project of excursions) {
      const item = el('div', 'excursion-list-item');
      item.append(renderExcursionMeta(project, tasks));
      mountProjectCard(item, project, tasks, {
        onToggleChild: (task) => requestToggleDone(confirmHost, task, reload),
        onAddTask: () => {
          confirmHost.replaceChildren(renderQuickAdd(() => void reload(), project.id));
        },
        onOpenPage: openProjectPage,
        onActivate: openProjectPage,
        onDelete: (current) => deleteProjectNow(current, reload, confirmHost)
      });
      listHost.append(item);
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
