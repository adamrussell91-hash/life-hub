import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { RecurrenceFrequency } from '@/schemas/recurrence';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { formatTagsInput, parseTagsInput, stepsForTask } from '@/domain/hierarchy';
import {
  defaultRecurrenceRule,
  formatRecurrenceLabel,
  parseRecurrenceRule,
  serializeRecurrenceRule
} from '@/domain/recurrence';
import {
  inferRemindPreset,
  remindAtFromPreset,
  type RemindPreset
} from '@/domain/reminders';
import {
  taskDomains,
  createHubField,
  createHubFilter,
  createHubSearch,
  createHubTextarea,
  domainFilterOptions,
  el,
  labeledField,
  optionList,
  priorityFilterOptions
} from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';

const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];
const REMIND_PRESETS: Array<{ value: RemindPreset; label: string }> = [
  { value: 'none', label: 'No reminder' },
  { value: 'morning_of', label: 'Morning of due date (9am)' },
  { value: '1_day_before', label: '1 day before (9am)' },
  { value: '1_hour_before', label: '1 hour before due time' },
  { value: 'custom', label: 'Custom date & time' }
];

function renderRecurrenceSection(task: Task): {
  section: HTMLElement;
  read: () => string | null;
} {
  const section = el('section', 'task-editor__repeat');
  section.append(el('h3', 'task-editor__repeat-title', 'Repeat'));

  const existing = parseRecurrenceRule(task.recurrence_rule);
  const enabled = el('input') as HTMLInputElement;
  enabled.type = 'checkbox';
  enabled.checked = Boolean(existing);
  enabled.id = 'task-repeat-enabled';
  const enabledLabel = el('label', 'task-editor__check-label', 'Repeating task');
  enabledLabel.htmlFor = enabled.id;
  section.append(enabledLabel, enabled);

  const panel = el('div', 'task-editor__repeat-panel');
  panel.hidden = !enabled.checked;

  const freq = createHubFilter({
    key: 'Frequency',
    label: 'Repeat frequency',
    defaultValue: existing?.frequency ?? 'weekly',
    options: optionList(FREQUENCIES),
    value: existing?.frequency ?? 'weekly',
    onChange: () => paintSummary()
  });

  const interval = createHubField({
    type: 'number',
    ariaLabel: 'Repeat every',
    min: '1',
    step: '1',
    value: String(existing?.interval ?? 1),
    onInput: () => paintSummary()
  });

  const count = createHubField({
    type: 'number',
    ariaLabel: 'Repeat count',
    min: '1',
    step: '1',
    placeholder: 'Forever',
    value: existing?.count != null ? String(existing.count) : '',
    onInput: () => paintSummary()
  });

  const weekday = createHubFilter({
    key: 'On',
    label: 'Repeat on weekday',
    defaultValue: String(existing?.weekday ?? 1),
    options: WEEKDAYS.map((day) => ({ value: String(day.value), label: day.label })),
    value: String(existing?.weekday ?? 1),
    onChange: () => paintSummary()
  });

  const summary = el('p', 'hierarchy-meta');

  const readRule = () => {
    if (!enabled.checked) return null;
    return defaultRecurrenceRule({
      frequency: freq.getValue() as RecurrenceFrequency,
      interval: Math.max(1, Number(interval.input.value) || 1),
      count: count.input.value.trim() ? Math.max(1, Number(count.input.value) || 1) : null,
      completed_count: existing?.completed_count ?? 0,
      weekday: freq.getValue() === 'weekly' ? Number(weekday.getValue()) : undefined,
      series_id: existing?.series_id
    });
  };

  const paintSummary = () => {
    const rule = readRule();
    summary.textContent = rule ? formatRecurrenceLabel(rule) : 'Not repeating';
    weekday.el.hidden = freq.getValue() !== 'weekly';
  };

  enabled.addEventListener('change', () => {
    panel.hidden = !enabled.checked;
    paintSummary();
  });

  panel.append(
    el('label', 'task-editor__field-label', 'Frequency'),
    freq.el,
    el('label', 'task-editor__field-label', 'Every'),
    interval.el,
    el('label', 'task-editor__field-label', 'On'),
    weekday.el,
    el('label', 'task-editor__field-label', 'Times (blank = forever)'),
    count.el,
    summary
  );
  section.append(panel);
  paintSummary();

  return {
    section,
    read: () => serializeRecurrenceRule(readRule())
  };
}

function renderRemindSection(task: Task): {
  section: HTMLElement;
  dueTimeInput: HTMLInputElement;
  read: (dueDate: string | null, dueTime: string | null) => {
    remind_at: string | null;
    remind_dismissed_at: string | null;
  };
} {
  const section = el('section', 'task-editor__remind');
  section.append(el('h3', 'task-editor__remind-title', 'Notify me'));

  const initialPreset = inferRemindPreset(task.remind_at, task.due_date, task.due_time);
  const dueTime = createHubField({
    type: 'time',
    ariaLabel: 'Due time',
    value: task.due_time ?? ''
  });

  const custom = createHubField({
    type: 'datetime-local',
    ariaLabel: 'Custom reminder time',
    value: ''
  });
  custom.el.hidden = initialPreset !== 'custom';
  if (task.remind_at && initialPreset === 'custom') {
    const d = new Date(task.remind_at);
    if (!Number.isNaN(d.getTime())) {
      custom.input.value = d.toISOString().slice(0, 16);
    }
  }

  const preset = createHubFilter({
    key: 'Notify',
    label: 'Reminder preset',
    defaultValue: 'none',
    options: REMIND_PRESETS,
    value: initialPreset,
    onChange: (value) => {
      custom.el.hidden = value !== 'custom';
    }
  });

  section.append(
    preset.el,
    el('label', 'task-editor__field-label', 'Due time (optional)'),
    dueTime.el,
    custom.el
  );

  return {
    section,
    dueTimeInput: dueTime.input,
    read: (dueDate, dueTimeValue) => {
      const selected = preset.getValue() as RemindPreset;
      const customIso =
        selected === 'custom' && custom.input.value
          ? new Date(custom.input.value).toISOString()
          : null;
      const remind_at = remindAtFromPreset(
        selected,
        dueDate,
        dueTimeValue,
        customIso
      );
      const remind_dismissed_at =
        remind_at && task.remind_at && remind_at !== task.remind_at ? null : task.remind_dismissed_at;
      return { remind_at, remind_dismissed_at };
    }
  };
}

function renderSteps(
  host: HTMLElement,
  task: Task,
  allTasks: Task[],
  onSaved: (task?: Task) => void | Promise<void>
): void {
  const section = el('section', 'task-editor__steps');
  section.append(el('h3', 'task-editor__steps-title', 'Steps'));

  const list = el('ul', 'task-editor__step-list');
  const steps = stepsForTask(allTasks, task.id);

  const paint = (): void => {
    list.replaceChildren();
    for (const step of stepsForTask(allTasks, task.id)) {
      const item = el('li', 'task-editor__step');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = step.status === 'done';
      check.setAttribute('aria-label', `Complete ${step.title}`);
      check.addEventListener('change', () => {
        void tasksApi
          .updateTask(step.id, { status: check.checked ? 'done' : 'open' })
          .then(async () => {
            const fresh = await tasksApi.listTasks();
            allTasks.length = 0;
            allTasks.push(...fresh);
            paint();
            await onSaved();
          })
          .catch((err) => window.alert(errorMessage(err)));
      });
      const label = el('span', 'task-editor__step-label', step.title);
      item.append(check, label);
      list.append(item);
    }
  };
  paint();
  section.append(list);

  const addRow = el('form', 'task-editor__step-add');
  const stepField = createHubSearch({
    type: 'text',
    placeholder: 'Add a step',
    ariaLabel: 'New step'
  });
  const addBtn = el('button', 'btn btn--secondary', 'Add step');
  addBtn.type = 'submit';
  addRow.append(stepField.el, addBtn);
  addRow.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = stepField.input.value.trim();
    if (!title) return;
    addBtn.disabled = true;
    try {
      const created = await tasksApi.createTask({
        title,
        domain: task.domain,
        parent_task_id: task.id,
        parent_project_id: task.parent_project_id,
        kind: 'step',
        step_order: steps.length,
        bucket: 'active',
        status: 'open'
      });
      allTasks.push(created);
      stepField.input.value = '';
      paint();
      await onSaved();
    } catch (err) {
      section.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      addBtn.disabled = false;
    }
  });
  section.append(addRow);
  host.append(section);
}

/** Inline edit panel — title, due, domain, project, tags, notes, steps. */
export async function renderTaskEditor(
  host: HTMLElement,
  task: Task,
  projects: Project[],
  onSaved: (task?: Task) => void | Promise<void>
): Promise<void> {
  host.replaceChildren();
  const allTasks = await tasksApi.listTasks();

  const card = el('section', 'confirm-card task-editor');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Edit task');
  card.append(el('p', 'page-header__eyebrow', task.kind === 'step' ? 'Edit step' : 'Edit task'));
  card.append(el('h2', 'page-header__title', task.title));

  const title = createHubField({
    ariaLabel: 'Title',
    value: task.title
  });

  const due = createHubField({
    type: 'date',
    ariaLabel: 'Due date',
    value: task.due_date ?? ''
  });

  const recurrence = renderRecurrenceSection(task);
  const remind = renderRemindSection(task);

  const domain = createHubFilter({
    key: 'Domain',
    label: 'Domain',
    defaultValue: task.domain,
    options: domainFilterOptions(false),
    value: task.domain
  });

  const priority = createHubFilter({
    key: 'Priority',
    label: 'Priority',
    defaultValue: task.priority,
    options: priorityFilterOptions(false),
    value: task.priority
  });

  const project = createHubFilter({
    key: 'Project',
    label: 'Project',
    defaultValue: '',
    options: [
      { value: '', label: 'No project' },
      ...projects
        .filter((p) => p.status !== 'archived_dead')
        .map((item) => ({ value: item.id, label: item.title }))
    ],
    value: task.parent_project_id ?? ''
  });

  const tags = createHubField({
    ariaLabel: 'Tags',
    placeholder: 'Tags — urgent, waiting, marking',
    value: formatTagsInput(task.tags)
  });

  const notes = createHubTextarea({
    ariaLabel: 'Notes',
    className: 'task-editor__notes',
    value: task.description
  });

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const save = el('button', 'btn btn--primary', 'Save');
  save.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  save.addEventListener('click', async () => {
    const nextTitle = title.input.value.trim();
    if (!nextTitle) {
      host.append(el('p', 'empty-state', 'Add a title.'));
      return;
    }
    save.disabled = true;
    discard.disabled = true;
    try {
      const dueValue = due.input.value || null;
      const dueTimeValue = remind.dueTimeInput.value || null;
      const reminder = remind.read(dueValue, dueTimeValue);
      const updated = await tasksApi.updateTask(task.id, {
        title: nextTitle,
        due_date: dueValue,
        due_time: dueTimeValue,
        domain: domain.getValue(),
        priority: priority.getValue(),
        parent_project_id: project.getValue() || null,
        description: notes.input.value.trim(),
        tags: parseTagsInput(tags.input.value),
        recurrence_rule: recurrence.read(),
        remind_at: reminder.remind_at,
        remind_dismissed_at: reminder.remind_dismissed_at
      });
      await onSaved(updated);
    } catch (err) {
      save.disabled = false;
      discard.disabled = false;
      host.append(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, save);
  card.append(title.el, due.el, domain.el, priority.el, project.el, tags.el, notes.el);
  if (task.kind !== 'step' && !task.parent_task_id) {
    card.append(recurrence.section, remind.section);
  }
  card.append(actions);
  host.append(card);

  if (task.kind !== 'step' && !task.parent_task_id) {
    renderSteps(host, task, allTasks, onSaved);
  }

  if (!host.closest('.hub-calendar__rail')) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function renderQuickAdd(
  onCreated: (task: Task) => void,
  projectId: string | null = null,
  options: {
    dueDate?: string | null;
    dueTime?: string | null;
    standing?: boolean;
    durationMinutes?: number | null;
  } = {}
): HTMLElement {
  const form = el('form', 'quick-add hub-toolbar');
  const title = createHubSearch({
    type: 'text',
    placeholder: options.standing ? 'Add to this day…' : 'New task title',
    ariaLabel: 'New task title',
    required: true
  });
  const due = createHubField({
    type: 'date',
    ariaLabel: 'Due date',
    value: options.dueDate ?? ''
  });
  if (options.dueDate) due.input.dataset.calendarDue = options.dueDate;
  const time = createHubField({
    type: 'time',
    ariaLabel: 'Start time',
    value: options.dueTime ?? ''
  });
  if (options.dueTime) time.input.dataset.calendarTime = options.dueTime;
  const domain = createHubFilter({
    key: 'Domain',
    label: 'Domain',
    defaultValue: taskDomains()[0] ?? 'teaching',
    options: domainFilterOptions(false),
    value: taskDomains()[0] ?? 'teaching'
  });
  const submit = el('button', 'btn btn--primary', 'Add');
  submit.type = 'submit';
  if (options.dueDate) {
    const when = el('div', 'quick-add__when');
    when.append(
      labeledField('Date', due.el, 'quick-add__when-field'),
      labeledField('Time', time.el, 'quick-add__when-field')
    );
    form.append(title.el, when, domain.el, submit);
  } else {
    form.append(title.el, domain.el, submit);
  }
  const plus = options.standing
    ? null
    : createPlusAdd({
        ariaLabel: options.dueDate ? 'Add a task for this day' : 'Add a task',
        panel: form
      });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const body: {
        title: string;
        domain: string;
        parent_project_id: string | null;
        due_date?: string;
        due_time?: string;
        estimated_duration?: number;
        kind: 'task';
        bucket: 'active';
      } = {
        title: title.input.value.trim(),
        domain: domain.getValue(),
        parent_project_id: projectId,
        kind: 'task',
        bucket: 'active'
      };
      if (options.dueDate) {
        // Never drop a dated compose to backlog because iOS "Reset" cleared the date.
        const nextDue = due.input.value.trim() || options.dueDate;
        due.input.value = nextDue;
        body.due_date = nextDue;
        const nextTime = time.input.value.trim();
        if (nextTime) {
          body.due_time = nextTime;
          body.estimated_duration = options.durationMinutes ?? 60;
        }
      }
      const created = await tasksApi.createTask(body);
      title.input.value = '';
      plus?.close();
      onCreated(created);
    } catch (err) {
      form.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  if (plus) return plus.root;
  const wrap = el('div', 'calendar-compose');
  wrap.append(form);
  return wrap;
}
