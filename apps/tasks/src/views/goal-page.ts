import { normalizeGoal, type Goal, type GoalCurrentSource, type GoalLifeArea, type GoalSphere, type GoalTerm } from '@/schemas/goal';
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
import { buildGoalChain } from '@/domain/goal-chain';
import { takeGoalMorph } from '@/domain/goal-morph';
import { LIFE_AREAS } from '@/domain/someday';
import { DEFAULT_PLANNING_DIRECTION } from '@/schemas/planning-direction';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createTagList } from '../../design-kit/js/hub-inline-edit.js';
import {
  createMorphingClosedFieldPopover,
  createMorphingNotePopover,
  createMorphingValuesPopover
} from '../../design-kit/js/morphing-popover.js';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import { createDisclosureCard } from '../../design-kit/js/hub-surfaces.js';
import { morphFromRect, runMorphTransform } from '../../design-kit/js/morphing-dialog.js';
import { renderCardMenu } from '@/views/card-menu';
import { mountLifeWallEditor } from '@/views/life-wall-editor';
import { mountHammondPanel } from '@/views/hammond-goal';
import { bindEditablePageTitle } from '@/shell/shell';

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
const SPHERE_OPTIONS = (Object.keys(SPHERE_LABEL) as GoalSphere[]).map((id) => ({
  value: id,
  label: SPHERE_LABEL[id]
}));

export type GoalPageState = {
  goal: Goal;
  projects: Project[];
  tasks: Task[];
  terms: SchoolTerm[];
  today: string;
  direction: import('@/schemas/planning-direction').PlanningDirection;
};
/** Hook for Hammond's column. Defaults to the live panel. */
export type HammondMount = (host: HTMLElement, state: GoalPageState, reload: () => void) => void;
export type GoalPageOptions = { header?: HTMLElement };

export async function renderGoalPage(
  canvas: HTMLElement,
  goalId: string,
  today = sydneyToday(),
  mountHammond: HammondMount = (host, state, reload) => mountHammondPanel(host, state.goal, reload),
  options: GoalPageOptions = {}
): Promise<void> {
  showViewLoading(canvas, 'Loading goal…', '.goal-page');
  try {
    const [goal, projects, tasks, prefs, direction] = await Promise.all([
      tasksApi.getGoal(goalId),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs(),
      tasksApi.getPlanningDirection().catch(() => DEFAULT_PLANNING_DIRECTION)
    ]);
    paint(
      canvas,
      { goal, projects, tasks, terms: flattenTerms(prefs), today, direction },
      mountHammond,
      options
    );
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

function closedChip(spec: {
  title: string;
  value: string;
  label: string;
  choices: Array<{ value: string; label: string }>;
  onSave: (value: string) => void;
}): HTMLElement {
  const trigger = el('button', 'hub-chip morphing-popover__trigger', spec.label) as HTMLButtonElement;
  trigger.type = 'button';
  trigger.dataset.chip = spec.title.toLowerCase().replace(/\s+/g, '-');
  const popover = createMorphingClosedFieldPopover({
    root: document,
    trigger,
    title: spec.title,
    supporting: 'Closed list. Save writes it.',
    options: spec.choices,
    value: spec.value,
    onSave(value) {
      trigger.textContent = spec.choices.find((c) => c.value === value)?.label ?? value;
      spec.onSave(value);
    }
  });
  return popover.el;
}

function termValue(goal: Goal): string {
  return goal.term ? `${goal.term.year}-${goal.term.term}` : 'ongoing';
}

function termChoices(today: string, terms: SchoolTerm[]): Array<{ value: string; label: string }> {
  const year = Number(today.slice(0, 4));
  const years = new Set<number>([year]);
  for (const t of terms) years.add(Number(t.starts_on.slice(0, 4)));
  const choices: Array<{ value: string; label: string }> = [{ value: 'ongoing', label: 'Ongoing' }];
  for (const y of [...years].sort()) {
    for (const n of [1, 2, 3, 4] as const) {
      choices.push({ value: `${y}-${n}`, label: `${y} · Term ${n}` });
    }
  }
  return choices;
}

function parseTermValue(value: string): GoalTerm | null {
  if (value === 'ongoing') return null;
  const match = /^(\d{4})-([1-4])$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), term: Number(match[2]) as 1 | 2 | 3 | 4 };
}

function descriptionPreview(text: string): string {
  const lines = text.trim().split(/\n+/).filter(Boolean);
  if (!lines.length) return 'Add a description';
  return lines.slice(0, 2).join(' · ');
}

function paint(
  canvas: HTMLElement,
  state: GoalPageState,
  mountHammond: HammondMount,
  options: GoalPageOptions = {}
): void {
  const { goal, projects, tasks, terms, today, direction } = state;
  const reload = () => void renderGoalPage(canvas, goal.id, today, mountHammond, options);
  const save = (patch: GoalPatch | Partial<Goal>) =>
    tasksApi
      .updateGoal(goal.id, patch)
      .then((next) => paint(canvas, { ...state, goal: normalizeGoal(next) }, mountHammond, options))
      .catch((err) => window.alert(errorMessage(err)));

  // G-06: editable title via a separate input seeded from goal.title — never kinetic + textContent.
  let headerTitle: HTMLElement | null = null;
  if (options.header) {
    headerTitle =
      options.header.querySelector<HTMLElement>('.page-header__title') ??
      options.header.querySelector<HTMLElement>('h1');
    headerTitle?.classList.remove('hub-kinetic');
    bindEditablePageTitle(options.header, goal.title, {
      onChange: (value) => {
        const next = value.trim();
        if (!next || next === goal.title) return;
        void save({ title: next });
      },
      current: () => goal.title
    });
    // Remorph target after bindEditablePageTitle replaces h1 with textarea.
    headerTitle =
      options.header.querySelector<HTMLElement>('.page-header__title') ??
      options.header.querySelector<HTMLElement>('h1');
    headerTitle?.setAttribute('data-hub-morph', 'title');
  }

  canvas.replaceChildren();
  const hosted = hostedTasks(goal, tasks, projects);
  const dream = goal.parent_someday_id ? tasks.find((t) => t.id === goal.parent_someday_id) : undefined;

  // G-21 chain breadcrumb
  const chain = el('nav', 'goal-page__chain');
  chain.setAttribute('aria-label', 'Goal chain');
  const segments = buildGoalChain({ goal, projects, tasks, direction: direction ?? DEFAULT_PLANNING_DIRECTION });
  segments.forEach((seg, i) => {
    if (i > 0) chain.append(el('span', 'goal-page__chain-sep', '→'));
    if (seg.href && !seg.muted) {
      const link = el('a', 'goal-page__chain-link', seg.label) as HTMLAnchorElement;
      link.href = seg.href;
      chain.append(link);
    } else {
      chain.append(el('span', `goal-page__chain-link${seg.muted ? ' is-muted' : ''}`, seg.label));
    }
  });

  const meta = el('div', 'goal-page__meta');
  const chips = el('div', 'goal-page__chips row');
  chips.append(
    closedChip({
      title: 'Sphere',
      value: goal.sphere,
      label: SPHERE_LABEL[goal.sphere],
      choices: SPHERE_OPTIONS,
      onSave: (value) => void save({ sphere: value as GoalSphere, ...(value !== 'life' ? { life_area: null } : {}) })
    }),
    closedChip({
      title: 'Status',
      value: goal.status,
      label: STATUSES.find((s) => s.id === goal.status)?.label ?? goal.status,
      choices: STATUSES.map((s) => ({ value: s.id, label: s.label })),
      onSave: (value) => void save({ status: value as Goal['status'] })
    }),
    closedChip({
      title: 'Term',
      value: termValue(goal),
      label: goal.term ? `${goal.term.year} · Term ${goal.term.term}` : 'Ongoing',
      choices: termChoices(today, terms),
      onSave: (value) => void save({ term: parseTermValue(value) })
    })
  );
  if (goal.sphere === 'life') {
    chips.append(
      closedChip({
        title: 'Life area',
        value: goal.life_area ?? '',
        label: LIFE_AREAS.find((a) => a.id === goal.life_area)?.label ?? 'Life area',
        choices: [{ value: '', label: 'None' }, ...LIFE_AREAS.map((a) => ({ value: a.id, label: a.label }))],
        onSave: (value) => void save({ life_area: (value || null) as GoalLifeArea | null })
      }),
      closedChip({
        title: 'Signal',
        value: goal.signal?.row ?? '',
        label: goal.signal ? `Signal · ${goal.signal.row}` : 'Life Hub signal',
        choices: [
          { value: '', label: 'None' },
          { value: 'weight', label: 'Weight' },
          { value: 'fat', label: 'Body fat' },
          { value: 'ratio', label: 'Shoulder:waist' },
          { value: 'lift', label: 'Lift' }
        ],
        onSave: (value) =>
          void save({
            signal: value
              ? { source: 'binding_goal', row: value as 'weight' | 'fat' | 'ratio' | 'lift' }
              : null
          })
      })
    );
  }

  const duePopover = createMorphingValuesPopover({
    root: document,
    label: goal.due_date ? formatDisplayDate(goal.due_date) : 'Due date',
    title: 'Due date',
    supporting: 'dd/mm/yy. Clear the field to remove it.',
    fields: [{ name: 'due', type: 'date', label: 'Due', value: goal.due_date ?? '' }],
    submitLabel: 'Save',
    triggerClass: 'hub-chip morphing-popover__trigger',
    onSubmit(values) {
      const next = typeof values.due === 'string' && values.due ? values.due : null;
      duePopover.setTriggerLabel(next ? formatDisplayDate(next) : 'Due date');
      void save({ due_date: next });
    }
  });
  duePopover.trigger.dataset.chip = 'due-date';
  chips.append(duePopover.el);

  const descPreview = el('p', 'goal-page__description', descriptionPreview(goal.description ?? ''));
  descPreview.dataset.slot = 'description-preview';
  const descEmpty = !(goal.description ?? '').trim();
  const descApi = createMorphingNotePopover({
    root: document,
    label: descEmpty ? 'Add description' : 'Edit description',
    title: 'Description',
    value: goal.description ?? '',
    rows: 4,
    triggerClass: 'btn btn--ghost',
    onDone(value) {
      descPreview.textContent = descriptionPreview(value);
      void save({ description: value });
    }
  });
  const descHost = el('div', 'goal-page__desc');
  descHost.dataset.slot = 'description';
  // One control: hide the preview line when empty so only Add description shows.
  if (!descEmpty) descHost.append(descPreview);
  descHost.append(descApi.el);

  const tags = createTagList({
    tags: goal.tags ?? [],
    addLabel: 'Add tag',
    onChange: (next) => void save({ tags: next })
  });
  tags.el.dataset.slot = 'tags';

  const lifeWall = mountLifeWallEditor({
    title: goal.title,
    wall: goal.life_wall,
    suggest: () => {
      const end = goal.due_date;
      const start = goal.created_at.slice(0, 10);
      return end ? { starts_on: start, ends_on: end } : null;
    },
    onCommit: (wall) => void save({ life_wall: wall })
  });
  lifeWall.el.dataset.slot = 'life-wall';

  const metaActions = el('div', 'row goal-page__actions');
  const back = el('a', 'btn btn--secondary', '← Runway');
  back.href = '#/goals';
  const focus = el('button', 'btn btn--primary', 'Give it 25 min now');
  focus.type = 'button';
  focus.addEventListener('click', () => startFocusStrip(canvas, { minutes: 25, label: `Focus: ${goal.title}` }));
  const menu = renderCardMenu(`${goal.title} card menu`, [
    {
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => {
        const message = `Delete ‘${goal.title}’? Its projects and tasks stay and are unlinked.`;
        if (!window.confirm(message)) return;
        offerTimedUndo({
          message: `Deleting ‘${goal.title}’…`,
          durationMs: 5000,
          onUndo: () => undefined,
          onCommit: () => {
            void tasksApi.deleteGoal(goal.id).then(() => {
              location.hash = '#/goals';
            });
          }
        });
      }
    }
  ]);
  metaActions.append(back, focus, menu);

  const metaLeft = el('div', 'goal-page__meta-left');
  metaLeft.append(chain);
  if (dream) {
    const chip = el('a', 'goal-page__dream-chip', `✦ ${dream.title}`) as HTMLAnchorElement;
    chip.href = `#/someday`;
    chip.title = 'Source dream on Someday';
    metaLeft.append(chip);
  }
  metaLeft.append(chips);
  const metaCard = el('div', 'goal-page__meta-card glass-tile');
  metaCard.append(descHost, tags.el, lifeWall.el);
  metaLeft.append(metaCard);
  meta.append(metaLeft, metaActions);

  const page = el('div', 'goal-page');
  const main = el('div', 'goal-page__main');
  const aside = el('aside', 'goal-page__hammond');
  page.append(main, aside);
  canvas.append(meta, page);

  // G-23 Structure card with morph + Details disclosure for other structures
  const structure = card('Structure');
  const frameHost = el('div', 'goal-frame-host');
  frameHost.append(renderGoalFrame(goal, (patch) => void save(patch)));
  if (goal.structure === 'okr' || goal.structure === 'floor_target_stretch') {
    frameHost.append(currentSourcePicker(goal, hosted, save));
  }
  const details = otherStructureDetails(goal, save);
  structure.root.append(
    createHubPills({
      label: 'Structure',
      items: STRUCTURES,
      value: goal.structure,
      onSelect: (id) => {
        runMorphTransform({
          from: structure.root,
          update: () => undefined,
          to: () => structure.root
        });
        void save({ structure: id as Goal['structure'] });
      }
    }),
    frameHost,
    details,
    leadMeasure(goal, hosted, terms, today, save)
  );
  main.append(structure.root);

  // 2. If-then + 3. next start
  const pair = el('div', 'goal-page__pair');
  pair.append(ifThen(goal, save), nextStart(goal, canvas, save, reload));
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

  // G-22 Row → page morph
  const origin = takeGoalMorph();
  if (origin && headerTitle) {
    requestAnimationFrame(() => morphFromRect(origin, headerTitle));
  }
}

const CURRENT_SOURCE_LABEL: Record<GoalCurrentSource, string> = {
  typed: 'Typed',
  tasks: 'Tasks done',
  signal: 'Life Hub signal'
};

function completedHostedCount(hosted: Task[]): number {
  return hosted.filter((t) => t.status === 'done' || Boolean(t.completed_at)).length;
}

function currentSourcePicker(goal: Goal, hosted: Task[], save: (p: Partial<Goal>) => void): HTMLElement {
  const wrap = el('div', 'goal-current-source');
  wrap.append(el('span', 'goal-frame__label', "Where does ‘current’ come from?"));
  const source = goal.current_source ?? 'typed';
  wrap.append(
    closedChip({
      title: 'Current source',
      value: source,
      label: CURRENT_SOURCE_LABEL[source],
      choices: (Object.keys(CURRENT_SOURCE_LABEL) as GoalCurrentSource[]).map((id) => ({
        value: id,
        label: CURRENT_SOURCE_LABEL[id]
      })),
      onSave: (value) => {
        const next = value as GoalCurrentSource;
        const patch: Partial<Goal> = { current_source: next };
        if (next === 'tasks' && (goal.structure === 'floor_target_stretch' || goal.structure === 'okr')) {
          const n = completedHostedCount(hosted);
          if (goal.structure === 'floor_target_stretch') {
            patch.frame = {
              ...goal.frame,
              floor_target_stretch: {
                unit: goal.frame.floor_target_stretch?.unit ?? '',
                floor: goal.frame.floor_target_stretch?.floor ?? null,
                target: goal.frame.floor_target_stretch?.target ?? null,
                stretch: goal.frame.floor_target_stretch?.stretch ?? null,
                current: n
              }
            };
          }
        }
        void save(patch);
      }
    })
  );
  if (source === 'typed') {
    wrap.append(el('span', 'meta', 'Typed value stays editable in the fields above.'));
  } else if (source === 'tasks') {
    wrap.append(el('span', 'meta', `${completedHostedCount(hosted)} hosted tasks done`));
  } else {
    wrap.append(el('span', 'meta', goal.signal ? `Signal: ${goal.signal.row}` : 'Pick a Life Hub signal on this goal (Life only).'));
  }
  return wrap;
}

function otherStructureDetails(goal: Goal, save: (p: GoalPatch) => void): HTMLElement {
  const others = STRUCTURES.filter((s) => s.id !== goal.structure);
  const filled = others.filter((s) => structureHasContent(goal, s.id));
  if (!filled.length) {
    const empty = el('div', 'goal-details-empty');
    empty.hidden = true;
    return empty;
  }
  const disc = createDisclosureCard({
    title: 'Details',
    meta: `${filled.length} other structure${filled.length === 1 ? '' : 's'} with content`,
    className: 'goal-details'
  });
  for (const s of filled) {
    const block = el('div', 'goal-details__block');
    block.append(el('p', 'goal-frame__label', s.label));
    const preview = el('div', 'goal-details__preview');
    preview.append(renderGoalFrame({ ...goal, structure: s.id }, save));
    block.append(preview);
    disc.body.append(block);
  }
  return disc.el;
}

function structureHasContent(goal: Goal, structure: Goal['structure']): boolean {
  const f = goal.frame;
  switch (structure) {
    case 'woop':
      return Boolean(f.woop && Object.values(f.woop).some((v) => String(v || '').trim()));
    case 'smarter':
      return Boolean(f.smarter && Object.values(f.smarter).some((v) => String(v || '').trim()));
    case 'okr':
      return Boolean(f.okr?.objective?.trim() || (f.okr?.key_results?.length ?? 0) > 0);
    case 'lead_lag':
      return Boolean(f.lead_lag?.lag?.trim());
    case 'floor_target_stretch': {
      const x = f.floor_target_stretch;
      return Boolean(x && (x.unit?.trim() || x.floor != null || x.target != null || x.stretch != null || x.current != null));
    }
  }
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

function nextStart(goal: Goal, canvas: HTMLElement, save: (p: GoalPatch) => void, reload: () => void): HTMLElement {
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
  const split = el('button', 'btn btn--secondary', 'Split it');
  split.type = 'button';
  split.addEventListener('click', () => void tasksApi.rescanGoalRead(goal.id).then(reload));
  row.append(start, body, split);
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
