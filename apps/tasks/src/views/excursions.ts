import type { Project } from '@/schemas/project';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import { defaultExcursionEventDate, formatLeadTimes } from '@/domain/excursion';
import { DEFAULT_EXCURSION_TITLE } from '@/domain/excursion-catalog';
import { newExcursionHash, projectPageHash } from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { hashQuery } from '@/shell/shell';
import { plusIcon } from '@/shell/icons';
import { deleteProjectNow } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';
import { mountProjectCard } from '@/views/hub-cards';
import { el } from '@/views/hub-kit';

function showConfirm(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  card.append(el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`));
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

async function createFromTemplate(template: ExcursionTemplate): Promise<Project> {
  const result = await tasksApi.createExcursionFromTemplate({
    excursion_template_id: template.id,
    title: DEFAULT_EXCURSION_TITLE,
    event_date: defaultExcursionEventDate()
  });
  return result.project;
}

function confirmCreate(
  host: HTMLElement,
  template: ExcursionTemplate,
  onCreated: (project: Project) => void
): void {
  const eventDate = defaultExcursionEventDate();
  showConfirm(
    host,
    `Create “${DEFAULT_EXCURSION_TITLE}”`,
    `On ${formatDisplayDate(eventDate)}. This will add dated admin tasks (${formatLeadTimes(template)}) and draft the permission note + staff email.`,
    async () => {
      onCreated(await createFromTemplate(template));
    }
  );
}

function plusButton(label: string, href: string): HTMLButtonElement {
  const button = el('button', 'icon-plus-btn excursions-add') as HTMLButtonElement;
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(plusIcon());
  button.addEventListener('click', () => {
    location.hash = href;
  });
  return button;
}

function appendTemplateRows(
  host: HTMLElement,
  templates: ExcursionTemplate[],
  confirmHost: HTMLElement
): void {
  const stack = el('div', 'task-stack');
  for (const template of templates) {
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      confirmCreate(confirmHost, template, openProjectPage);
    });
    actions.append(use);
    row.append(el('h3', 'task-row__title', template.name), actions);
    stack.append(row);
  }
  host.append(stack);
}

/** Excursions list — use a template (confirm → page), no extra create form. */
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
  addRow.append(plusButton('New excursion', newExcursionHash()));
  canvas.append(addRow, confirmHost);

  if (templates.length) {
    canvas.append(el('h2', 'section-title', 'Templates'));
    appendTemplateRows(canvas, templates, confirmHost);
  }

  canvas.append(el('h2', 'section-title', 'Active'));
  if (!excursions.length) {
    listHost.append(el('p', 'empty-state', 'No excursions yet. Use a template above.'));
  } else {
    const reload = async () => {
      await renderExcursionsView(canvas);
    };
    for (const project of excursions) {
      mountProjectCard(listHost, project, tasks, {
        onToggleChild: (task) => requestToggleDone(confirmHost, task, reload),
        onAddTask: () => {
          confirmHost.replaceChildren(renderQuickAdd(() => void reload(), project.id));
        },
        onOpenPage: openProjectPage,
        onActivate: openProjectPage,
        onDelete: (current) => deleteProjectNow(current, reload, confirmHost)
      });
    }
  }
  canvas.append(listHost);
}

/** Confirm a template, then write — no Template / date / group form. */
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

  if (prefillId) {
    confirmCreate(confirmHost, prefillTpl, openProjectPage);
  } else {
    appendTemplateRows(page, templates, confirmHost);
  }

  canvas.replaceChildren(page);
}
