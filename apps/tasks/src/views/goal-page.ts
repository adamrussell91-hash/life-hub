import { normalizeGoal, type Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { mondayOf } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createHubPills, el } from '@/views/hub-kit';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { renderGoalFrame, type GoalPatch } from '@/views/goal-frame';
import { startFocusStrip } from '@/views/focus-strip';
import { directTasks, hostedProjects, hostedTasks, isOpenTask, projectProgress, SPHERE_DOMAIN, SPHERE_LABEL } from '@/domain/goal-hosting';
import { cellState, currentTerm, flattenTerms, sydneyToday, termWeeks, weekCount } from '@/domain/goal-runway';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

const STRUCTURES: Array<{ id: Goal['structure']; label: string }> = [
  { id: 'woop', label: 'WOOP' },
  { id: 'smarter', label: 'SMARTER' },
  { id: 'okr', label: 'OKR' },
  { id: 'lead_lag', label: 'Lead / lag' },
  { id: 'floor_target_stretch', label: 'Floor · target · stretch' }
];
const STATUSES: Array<{ id: Goal['status']; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'parked', label: 'Parked' },
  { id: 'achieved', label: 'Achieved' },
  { id: 'dropped', label: 'Dropped' }
];

export type GoalPageState = { goal: Goal; projects: Project[]; tasks: Task[]; terms: SchoolTerm[]; today: string };
/** Hook for Task 17: fills the Hammond column. Defaults to nothing. */
export type HammondMount = (host: HTMLElement, state: GoalPageState, reload: () => void) => void;

export async function renderGoalPage(
  canvas: HTMLElement,
  goalId: string,
  today = sydneyToday(),
  mountHammond: HammondMount = () => {}
): Promise<void> {
  showViewLoading(canvas, 'Loading goal…', '.goal-page');
  try {
    const [goal, projects, tasks, prefs] = await Promise.all([
      tasksApi.getGoal(goalId),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs()
    ]);
    paint(canvas, { goal, projects, tasks, terms: flattenTerms(prefs), today }, mountHammond);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load this goal.')));
  }
}

function card(title: string, className = 'glass-tile goal-card'): { root: HTMLElement; head: HTMLElement } {
  const root = el('section', className);
  const head = el('p', 'goal-card__eyebrow');
  head.append(el('span', '', title));
  root.append(head);
  return { root, head };
}

function paint(canvas: HTMLElement, state: GoalPageState, mountHammond: HammondMount): void {
  const { goal, projects, tasks, terms, today } = state;
  const reload = () => void renderGoalPage(canvas, goal.id, today, mountHammond);
  const save = (patch: GoalPatch | Partial<Goal>) =>
    tasksApi
      .updateGoal(goal.id, patch)
      .then((next) => paint(canvas, { ...state, goal: normalizeGoal(next) }, mountHammond))
      .catch((err) => window.alert(errorMessage(err)));

  canvas.replaceChildren();
  const hosted = hostedTasks(goal, tasks, projects);
  const dream = goal.parent_someday_id ? tasks.find((t) => t.id === goal.parent_someday_id) : undefined;

  const meta = el('div', 'goal-page__meta');
  const line = [SPHERE_LABEL[goal.sphere], dream ? `From ✦ ${dream.title}` : null, goal.due_date ? `due ${formatDisplayDate(goal.due_date)}` : null]
    .filter(Boolean)
    .join(' · ');
  const metaActions = el('div', 'row');
  const back = el('a', 'btn btn--secondary', '← Runway');
  back.href = '#/goals';
  const focus = el('button', 'btn btn--primary', 'Give it 25 min now');
  focus.type = 'button';
  focus.addEventListener('click', () => startFocusStrip(canvas, { minutes: 25, label: `Focus: ${goal.title}` }));
  metaActions.append(
    createHubPills({ label: 'Status', items: STATUSES, value: goal.status, onSelect: (status) => void save({ status }) }),
    back,
    focus
  );
  meta.append(el('span', '', line), metaActions);

  const page = el('div', 'goal-page');
  const main = el('div', 'goal-page__main');
  const aside = el('aside', 'goal-page__hammond');
  page.append(main, aside);
  canvas.append(meta, page);

  // 1. Structure card + lead measure
  const structure = card('Structure');
  structure.root.append(
    createHubPills({ label: 'Structure', items: STRUCTURES, value: goal.structure, onSelect: (id) => void save({ structure: id }) }),
    renderGoalFrame(goal, (patch) => void save(patch)),
    leadMeasure(goal, hosted, terms, today, save)
  );
  main.append(structure.root);

  // 2. If-then + 3. next start
  const pair = el('div', 'goal-page__pair');
  pair.append(ifThen(goal, save), nextStart(goal, canvas, save));
  main.append(pair);

  // 4. Projects + milestones, 5. tasks
  const pair2 = el('div', 'goal-page__pair');
  pair2.append(projectsCard(goal, projects, tasks, reload), tasksCard(goal, tasks, reload));
  main.append(pair2, milestonesCard(goal, save));

  // 6. Tagged (@)
  const tagged = card('Tagged (@)');
  const tagHost = el('div');
  tagged.root.append(tagHost);
  main.append(tagged.root);
  mountTagAnythingSection(tagHost, `tasks:goal:${goal.id}`);

  mountHammond(aside, state, reload);
}

function leadMeasure(goal: Goal, hosted: Task[], terms: SchoolTerm[], today: string, save: (p: GoalPatch) => void): HTMLElement {
  const wrap = el('div', 'goal-lead');
  const label = el('input', 'goal-field');
  label.value = goal.lead_measure?.label ?? '';
  label.placeholder = 'Weekly lead measure, e.g. 1 evidence write-up';
  label.setAttribute('aria-label', 'Lead measure');
  const per = el('input', 'goal-field');
  per.type = 'number';
  per.min = '1';
  per.value = String(goal.lead_measure?.per_week ?? 1);
  per.style.width = '4rem';
  per.setAttribute('aria-label', 'Times per week');
  const commit = () => {
    const text = label.value.trim();
    const n = Math.max(1, Math.round(Number(per.value) || 1));
    save({ lead_measure: text ? { label: text, per_week: n } : null });
  };
  label.addEventListener('change', commit);
  per.addEventListener('change', commit);
  wrap.append(el('span', 'goal-frame__label', 'Lead measure'), label, per, el('span', 'meta', '/ week'));

  const term = currentTerm(terms, today);
  if (term) {
    const cells = el('span', 'goal-lead__cells');
    const nowMonday = mondayOf(today);
    for (const week of termWeeks(term, today)) {
      const count = weekCount(goal, hosted, week.monday);
      const mark = el('i', `cell cell--${cellState(goal, count, week.monday, nowMonday)}`);
      mark.classList.toggle('is-now', week.isNow);
      mark.title = `${week.label}: ${count}`;
      cells.append(mark);
    }
    wrap.append(cells);
  }
  const plus = el('button', 'btn btn--secondary', '+1 this week');
  plus.type = 'button';
  plus.dataset.action = 'plus-one';
  plus.addEventListener('click', () => {
    const monday = mondayOf(today);
    const manual = (goal.week_log[monday]?.manual ?? 0) + 1;
    save({ week_log: { ...goal.week_log, [monday]: { manual } } });
  });
  wrap.append(plus);
  return wrap;
}

function ifThen(goal: Goal, save: (p: GoalPatch) => void): HTMLElement {
  const root = el('section', 'goal-ifthen');
  const head = el('p', 'goal-card__eyebrow', 'If–then trigger · shows where you act');
  const current = goal.if_then ?? { cue: '', action: '', obstacle: '' };
  const input = (key: 'cue' | 'action' | 'obstacle', label: string) => {
    const node = el('input', 'goal-field');
    node.value = current[key];
    node.placeholder = label;
    node.setAttribute('aria-label', label);
    node.addEventListener('change', () => {
      const next = { ...current, [key]: node.value.trim() };
      save({ if_then: next.cue && next.action ? next : null });
    });
    return node;
  };
  const row1 = el('p', 'row');
  row1.append(el('b', '', 'If'), input('cue', 'the cue, e.g. Tuesday P5 and not teaching'));
  const row2 = el('p', 'row');
  row2.append(el('b', '', 'then'), input('action', 'what you do'));
  const row3 = el('p', 'row');
  row3.append(el('span', 'meta', 'Answers the obstacle:'), input('obstacle', "e.g. it's boring admin, so email wins"));
  root.append(head, row1, row2, row3);
  return root;
}

function nextStart(goal: Goal, canvas: HTMLElement, save: (p: GoalPatch) => void): HTMLElement {
  const root = el('section', 'goal-start');
  const input = el('input', 'goal-field');
  input.value = goal.next_start ?? '';
  input.placeholder = 'The 2-minute start';
  input.setAttribute('aria-label', 'Smallest next start');
  input.addEventListener('change', () => save({ next_start: input.value.trim() || null }));
  const row = el('div', 'row');
  row.style.marginTop = 'var(--space-3)';
  const start = el('button', 'btn btn--primary', 'Start now');
  start.type = 'button';
  start.addEventListener('click', () => startFocusStrip(canvas, { minutes: 25, label: input.value || goal.title }));
  const body = el('button', 'btn btn--secondary', 'Body-double');
  body.type = 'button';
  body.addEventListener('click', () => startFocusStrip(canvas, { minutes: 15, label: "Hammond's with you" }));
  row.append(start, body);
  row.dataset.slot = 'start-actions';
  root.append(el('p', 'goal-card__eyebrow', 'Smallest next start · 2 min'), input, row);
  return root;
}

function projectsCard(goal: Goal, projects: Project[], tasks: Task[], reload: () => void): HTMLElement {
  const { root } = card('Projects under this goal');
  for (const project of hostedProjects(goal, projects)) {
    const progress = projectProgress(project, tasks);
    const item = el('div', 'goal-list__item');
    const link = el('a', '', project.title);
    link.href = `#/project/${encodeURIComponent(project.id)}`;
    const bar = el('span', 'goal-progress');
    const fill = el('i');
    fill.style.width = `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`;
    bar.append(fill);
    const unlink = el('button', 'btn btn--ghost', '×');
    unlink.type = 'button';
    unlink.setAttribute('aria-label', `Unlink ${project.title}`);
    unlink.addEventListener('click', () => void tasksApi.updateProject(project.id, { parent_goal_id: null }).then(reload));
    const right = el('span', 'r');
    right.append(bar, el('span', 'meta', `${progress.done}/${progress.total}`), unlink);
    item.append(link, right);
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const select = el('select', 'goal-field') as HTMLSelectElement;
  select.name = 'link-project';
  select.setAttribute('aria-label', 'Project to link');
  const none = el('option', '', 'Link a project…') as HTMLOptionElement;
  none.value = '';
  select.append(none);
  for (const project of projects.filter((p) => p.status === 'active' && !p.parent_goal_id)) {
    const option = el('option', '', project.title) as HTMLOptionElement;
    option.value = project.id;
    select.append(option);
  }
  const link = el('button', 'btn btn--secondary', 'Link');
  link.type = 'button';
  link.dataset.action = 'link-project';
  link.addEventListener('click', () => {
    if (!select.value) return;
    void tasksApi.updateProject(select.value, { parent_goal_id: goal.id }).then(reload);
  });
  add.append(select, link);
  root.append(add);
  return root;
}

function tasksCard(goal: Goal, tasks: Task[], reload: () => void): HTMLElement {
  const { root } = card('Tasks on this goal');
  const list = directTasks(goal, tasks).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  for (const task of list) {
    const item = el('label', 'goal-list__item');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !isOpenTask(task);
    box.addEventListener('change', () =>
      void tasksApi
        .updateTask(task.id, box.checked ? { status: 'done', completed_at: new Date().toISOString() } : { status: 'open', completed_at: null })
        .then(reload)
    );
    item.append(box, el('span', '', task.title));
    if (task.due_date) item.append(el('span', 'r meta', formatDisplayDate(task.due_date)));
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const input = el('input', 'goal-field');
  input.name = 'new-task';
  input.placeholder = 'Add a task to this goal';
  input.setAttribute('aria-label', 'New task');
  const button = el('button', 'btn btn--secondary', 'Add');
  button.type = 'button';
  button.dataset.action = 'add-task';
  button.addEventListener('click', () => {
    const title = input.value.trim();
    if (!title) return;
    void tasksApi.createTask({ title, domain: SPHERE_DOMAIN[goal.sphere], parent_goal_id: goal.id }).then(reload);
  });
  add.append(input, button);
  root.append(add);
  return root;
}

function milestonesCard(goal: Goal, save: (p: GoalPatch) => void): HTMLElement {
  const { root } = card('Milestones');
  for (const milestone of goal.milestones) {
    const item = el('label', 'goal-list__item');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = milestone.status === 'done';
    box.addEventListener('change', () =>
      save({ milestones: goal.milestones.map((m) => (m.id === milestone.id ? { ...m, status: box.checked ? 'done' : 'open' } : m)) })
    );
    item.append(box, el('span', '', milestone.title));
    if (milestone.due_date) item.append(el('span', 'r meta', formatDisplayDate(milestone.due_date)));
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const title = el('input', 'goal-field');
  title.placeholder = 'Milestone';
  title.setAttribute('aria-label', 'Milestone title');
  const date = el('input', 'goal-field');
  date.type = 'date';
  date.setAttribute('aria-label', 'Milestone date');
  const button = el('button', 'btn btn--secondary', 'Add');
  button.type = 'button';
  button.addEventListener('click', () => {
    if (!title.value.trim()) return;
    save({
      milestones: [
        ...goal.milestones,
        { id: `ms${Date.now().toString(36)}`, title: title.value.trim(), due_date: date.value || null, status: 'open' }
      ]
    });
  });
  add.append(title, date, button);
  root.append(add);
  return root;
}
