import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubFilter,
  createHubSearch,
  domainFilterOptions,
  el
} from '@/views/hub-kit';
import { createPlusAdd } from '@/views/plus-add';
import type { TaskDomain } from '@/schemas/task';

let somedayDomain: TaskDomain | 'all' = 'all';
let somedayQuery = '';

function renderSomedayCard(task: Task, onChange: (next: Task | null) => void): HTMLElement {
  const card = el('article', 'glass-tile someday-card');
  card.append(el('h3', 'someday-card__title', task.title));
  if (task.description) card.append(el('p', 'someday-card__copy', task.description));
  const meta = el('p', 'hierarchy-meta', `${task.domain} · ${task.priority}`);
  card.append(meta);

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
    void tasksApi
      .createProject({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteGoal = el('button', 'btn btn--ghost', 'Promote to goal');
  promoteGoal.type = 'button';
  promoteGoal.addEventListener('click', () => {
    void tasksApi
      .createGoal({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(() => onChange(null))
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
  actions.append(promoteTask, promoteProject, promoteGoal, trash);
  card.append(actions);
  return card;
}

/** Someday / Maybe holding pen — off the active board until promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading someday ideas…', '.someday-hero');
  try {
    let items = somedayTasks(await tasksApi.listTasks());
    const paint = () => {
      paintSomeday(canvas, items, (next) => {
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
      paintSomeday(canvas, items, setItems);
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
        paintSomeday(canvas, items, setItems);
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

  const grid = el('div', 'someday-grid');
  for (const item of visible) {
    grid.append(
      renderSomedayCard(item, (next) => {
        setItems(next ? items.map((entry) => (entry.id === next.id ? next : entry)) : items.filter((entry) => entry.id !== item.id));
      })
    );
  }
  canvas.append(grid);

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter someday ideas"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}
