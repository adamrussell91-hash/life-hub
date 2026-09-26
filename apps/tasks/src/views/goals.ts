import type { Goal, GoalLifeArea, GoalSphere, GoalTerm } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createHubPills, el } from '@/views/hub-kit';
import { goalPageHash } from '@/domain/cards';
import { LANE_CAP, SPHERES, SPHERE_LABEL } from '@/domain/goal-hosting';
import {
  buildRunway, currentTerm, flattenTerms, goalBelongsToTerm, sydneyToday, termYear,
  type Runway, type RunwayLane, type RunwayRow
} from '@/domain/goal-runway';
import { overlayFromReads, type GoalReadEnvelope } from '@/domain/goal-reads';
import { activeProjectMeter } from '@/domain/hammond-portfolio';
import { LIFE_AREAS } from '@/domain/someday';
import { renderHammondStrip } from '@/views/hammond-goal';
import { openPlanNextTerm } from '@/views/goals-plan-next';
import { mountDirectionStrip } from '@/views/goals-direction';
import { mountYearZoom, type YearZoomHandle } from '@/views/goals-year-zoom';
import { rememberGoalMorph } from '@/domain/goal-morph';
import { createMorphingClosedFieldPopover } from '../../design-kit/js/morphing-popover.js';
import { createActiveProjectsMeter } from '../../design-kit/js/agent-productivity-cards.js';
import { DEFAULT_PLANNING_DIRECTION } from '@/schemas/planning-direction';

export const STRUCTURE_CHIP: Record<Goal['structure'], string> = {
  woop: 'WOOP',
  smarter: 'SMARTER',
  okr: 'OKR',
  lead_lag: 'LEAD/LAG',
  floor_target_stretch: 'FLOOR·TARGET'
};

export type GoalsData = { goals: Goal[]; projects: Project[]; tasks: Task[]; terms: SchoolTerm[]; today: string };
export type RunwayOverlay = { crunchWeeks: string[]; proposedRest: Record<string, string[]>; proposalGoalIds: Set<string> };

let selectedTermStart: string | null = null;
let runwayMode: 'term' | 'year' = 'term';
let zoomHandle: YearZoomHandle | null = null;

/** Term Runway (spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md). */
export async function renderGoalsView(canvas: HTMLElement, today = sydneyToday()): Promise<void> {
  showViewLoading(canvas, 'Loading goals…', '.runway');
  try {
    const [goals, projects, tasks, prefs, readsResult, direction, profile] = await Promise.all([
      tasksApi.listGoals(),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs(),
      tasksApi.getGoalReads().catch(() => ({ reads: [] as GoalReadEnvelope[] })),
      tasksApi.getPlanningDirection().catch(() => DEFAULT_PLANNING_DIRECTION),
      tasksApi.getPlanningProfile().catch(() => null)
    ]);
    const envelopes = readsResult.reads;
    const overlay = overlayFromReads(envelopes.flatMap((e) => (e.read ? [e.read] : [])));
    paintGoals(
      canvas,
      { goals, projects, tasks, terms: flattenTerms(prefs), today },
      overlay,
      envelopes,
      { direction, profile }
    );
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load goals.')));
  }
}

type Extra = {
  direction: import('@/schemas/planning-direction').PlanningDirection;
  profile: import('@/schemas/planning-profile').PlanningProfile | null;
};

export function paintGoals(
  canvas: HTMLElement,
  data: GoalsData,
  overlay: RunwayOverlay = { crunchWeeks: [], proposedRest: {}, proposalGoalIds: new Set() },
  envelopes: GoalReadEnvelope[] = [],
  extra: Extra = { direction: DEFAULT_PLANNING_DIRECTION, profile: null }
): Runway | null {
  const term = data.terms.find((t) => t.starts_on === selectedTermStart) ?? currentTerm(data.terms, data.today);
  canvas.replaceChildren();
  const reload = () => void renderGoalsView(canvas, data.today);

  window.addEventListener(
    'goals:select-term',
    ((event: CustomEvent<{ year: number; term: number }>) => {
      const match = data.terms.find(
        (t) => t.term === event.detail.term && termYear(t) === event.detail.year
      );
      if (match) {
        selectedTermStart = match.starts_on;
        runwayMode = 'term';
        reload();
      }
    }) as EventListener,
    { once: true }
  );

  const directionHost = el('div', 'goals-direction-host');
  mountDirectionStrip(directionHost, extra.direction);

  const top = el('div', 'goals-top');
  const summaryRow = el('div', 'goals-summary-row');
  const summary = el('p', 'goals-summary');
  const meterHost = el('div', 'goals-meter');
  meterHost.append(
    createActiveProjectsMeter(document, {
      meter: activeProjectMeter(data.projects, extra.profile),
      eyebrow: 'Portfolio',
      title: 'Active projects'
    })
  );
  meterHost.classList.add('goals-meter--compact');
  summaryRow.append(summary, meterHost);
  const actions = el('div', 'goals-top__actions');
  if (term) {
    const year = term.starts_on.slice(0, 4);
    actions.append(
      createHubPills({
        label: 'Term',
        items: [
          ...data.terms.filter((t) => t.starts_on.startsWith(year)).map((t) => ({ id: t.starts_on, label: `Term ${t.term}` })),
          { id: 'year', label: 'Year' }
        ],
        value: runwayMode === 'year' ? 'year' : term.starts_on,
        onSelect: (id) => {
          if (id === 'year') {
            if (runwayMode === 'year') return;
            runwayMode = 'year';
            if (zoomHandle) {
              zoomHandle.setMode('year');
              summary.textContent = `${term.starts_on.slice(0, 4)} · year view`;
              return;
            }
            paintGoals(canvas, data, overlay, envelopes, extra);
            return;
          }
          const termChanged = selectedTermStart !== id;
          selectedTermStart = id;
          if (!termChanged && runwayMode === 'year' && zoomHandle) {
            runwayMode = 'term';
            zoomHandle.setMode('term');
            const r = buildRunway({
              goals: data.goals,
              projects: data.projects,
              tasks: data.tasks,
              term,
              today: data.today,
              crunchWeeks: overlay.crunchWeeks,
              proposedRest: overlay.proposedRest
            });
            const when = r.nowWeek !== null
              ? `week ${r.nowWeek} of ${r.weeks.length}`
              : data.today < term.starts_on ? 'starts soon' : 'finished';
            summary.textContent = `Term ${term.term} · ${when} · this week ${r.weekSummary.done} of ${r.weekSummary.total} moves done`;
            return;
          }
          runwayMode = 'term';
          paintGoals(canvas, data, overlay, envelopes, extra);
        }
      })
    );
  }
  const plan = el('button', 'btn btn--secondary', 'Plan next term');
  plan.type = 'button';
  plan.dataset.action = 'plan-next-term';
  const add = el('button', 'btn btn--primary', 'New goal');
  add.type = 'button';
  add.dataset.action = 'new-goal';
  actions.append(plan, add);
  top.append(summaryRow, actions);

  const hammondHost = el('div', 'goals-hammond-host');
  canvas.append(directionHost, top, hammondHost);
  renderHammondStrip(hammondHost, envelopes, data.goals, reload);

  plan.addEventListener('click', () => {
    if (!term) return;
    openPlanNextTerm(canvas, data.goals, term, reload);
  });
  add.addEventListener('click', () => {
    if (canvas.querySelector('.goals-new')) return;
    hammondHost.before(newGoalForm(data, term, reload));
  });

  if (!term) {
    canvas.append(el('p', 'empty-state', 'Add your school terms in Tools → Term dates to see the runway.'));
    return null;
  }

  if (!data.goals.some((g) => g.status === 'active' || g.status === 'parked')) {
    const empty = el('div', 'goals-empty glass-tile');
    empty.append(
      el('p', 'empty-state', 'No goals yet.'),
      (() => {
        const btn = el('button', 'btn btn--primary', 'New goal') as HTMLButtonElement;
        btn.type = 'button';
        btn.addEventListener('click', () => add.click());
        return btn;
      })()
    );
    canvas.append(empty);
  }

  zoomHandle?.dispose();
  zoomHandle = null;
  const zoomHost = el('div', 'goals-zoom-host');
  canvas.append(zoomHost);

  const zoom = mountYearZoom(zoomHost, data, overlay, term, runwayMode);
  if (zoom) {
    zoomHandle = zoom;
    if (runwayMode === 'year') {
      summary.textContent = `${term.starts_on.slice(0, 4)} · year view`;
      return null;
    }
    const runway = buildRunway({
      goals: data.goals,
      projects: data.projects,
      tasks: data.tasks,
      term,
      today: data.today,
      crunchWeeks: overlay.crunchWeeks,
      proposedRest: overlay.proposedRest
    });
    const when = runway.nowWeek !== null
      ? `week ${runway.nowWeek} of ${runway.weeks.length}`
      : data.today < term.starts_on ? 'starts soon' : 'finished';
    summary.textContent = `Term ${term.term} · ${when} · this week ${runway.weekSummary.done} of ${runway.weekSummary.total} moves done`;
    return runway;
  }

  const runway = buildRunway({
    goals: data.goals,
    projects: data.projects,
    tasks: data.tasks,
    term,
    today: data.today,
    crunchWeeks: overlay.crunchWeeks,
    proposedRest: overlay.proposedRest
  });
  const when = runway.nowWeek !== null
    ? `week ${runway.nowWeek} of ${runway.weeks.length}`
    : data.today < term.starts_on ? 'starts soon' : 'finished';
  summary.textContent = `Term ${term.term} · ${when} · this week ${runway.weekSummary.done} of ${runway.weekSummary.total} moves done`;
  zoomHost.append(renderRunway(runway, data, overlay));
  return runway;
}

function closedChip(spec: {
  title: string;
  value: string;
  label: string;
  choices: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): HTMLElement {
  const trigger = el('button', 'hub-chip morphing-popover__trigger', spec.label) as HTMLButtonElement;
  trigger.type = 'button';
  const popover = createMorphingClosedFieldPopover({
    root: document,
    trigger,
    title: spec.title,
    options: spec.choices,
    value: spec.value,
    onSave(value) {
      trigger.textContent = spec.choices.find((c) => c.value === value)?.label ?? value;
      spec.onChange(value);
    }
  });
  return popover.el;
}

function newGoalForm(data: GoalsData, term: SchoolTerm | null, reload: () => void): HTMLFormElement {
  const form = el('form', 'glass-tile goals-new');
  const tabs = el('div', 'goals-new__tabs');
  const blankTab = el('button', 'btn btn--ghost is-active', 'Blank');
  blankTab.type = 'button';
  const dreamTab = el('button', 'btn btn--ghost', 'From a dream');
  dreamTab.type = 'button';
  tabs.append(blankTab, dreamTab);

  const title = el('input', 'goal-field');
  title.name = 'title';
  title.placeholder = 'What do you want to be true by the end of term?';
  title.setAttribute('aria-label', 'Goal title');

  let parentSomedayId: string | null = null;
  let sphere: GoalSphere = 'life';
  let termValue: string = term ? `${termYear(term)}-${term.term}` : 'ongoing';
  let lifeArea: string = '';

  const dreamPick = el('div', 'goals-new__dreams');
  dreamPick.hidden = true;
  const candidates = data.tasks
    .filter(
      (t) =>
        t.someday_kind === 'bucket_list' ||
        t.someday_kind === 'dreams_jar' ||
        t.someday_kind === 'career' ||
        t.status === 'someday'
    )
    .filter((t) => !data.goals.some((g) => g.parent_someday_id === t.id));
  if (!candidates.length) {
    dreamPick.append(el('p', 'meta', 'No unlinked Someday ideas yet.'));
  } else {
    for (const dream of candidates.slice(0, 20)) {
      const btn = el('button', 'btn btn--ghost goals-new__dream', dream.title);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        parentSomedayId = dream.id;
        title.value = dream.title;
        if (dream.someday_kind === 'career') sphere = 'professional';
        if (typeof dream.life_area === 'string') lifeArea = dream.life_area;
        for (const b of dreamPick.querySelectorAll('button')) b.classList.remove('is-selected');
        btn.classList.add('is-selected');
      });
      dreamPick.append(btn);
    }
  }
  blankTab.addEventListener('click', () => {
    blankTab.classList.add('is-active');
    dreamTab.classList.remove('is-active');
    dreamPick.hidden = true;
    parentSomedayId = null;
  });
  dreamTab.addEventListener('click', () => {
    dreamTab.classList.add('is-active');
    blankTab.classList.remove('is-active');
    dreamPick.hidden = false;
  });

  const chips = el('div', 'goals-new__chips row');
  chips.append(
    closedChip({
      title: 'Sphere',
      value: sphere,
      label: SPHERE_LABEL[sphere],
      choices: SPHERES.map((id) => ({ value: id, label: SPHERE_LABEL[id] })),
      onChange: (value) => {
        sphere = value as GoalSphere;
        lifeAreaHost.hidden = sphere !== 'life';
      }
    })
  );
  const year = term ? termYear(term) : Number(data.today.slice(0, 4));
  const termChoices = [
    { value: 'ongoing', label: 'Ongoing' },
    ...([1, 2, 3, 4] as const).map((n) => ({ value: `${year}-${n}`, label: `Term ${n}` }))
  ];
  chips.append(
    closedChip({
      title: 'Term',
      value: termValue,
      label: term ? `Term ${term.term}` : 'Ongoing',
      choices: termChoices,
      onChange: (value) => {
        termValue = value;
      }
    })
  );
  const lifeAreaHost = el('span');
  lifeAreaHost.hidden = sphere !== 'life';
  lifeAreaHost.append(
    closedChip({
      title: 'Life area',
      value: '',
      label: 'Life area',
      choices: [{ value: '', label: 'None' }, ...LIFE_AREAS.map((a) => ({ value: a.id, label: a.label }))],
      onChange: (value) => {
        lifeArea = value;
      }
    })
  );
  chips.append(lifeAreaHost);

  const submit = el('button', 'btn btn--primary', 'Create');
  submit.type = 'submit';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => form.remove());
  form.append(tabs, dreamPick, title, chips, submit, cancel);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    const selectedTerm: GoalTerm | null =
      termValue === 'ongoing'
        ? null
        : (() => {
            const [y, t] = termValue.split('-').map(Number);
            return { year: y!, term: t as 1 | 2 | 3 | 4 };
          })();

    const termTiedActive = selectedTerm
      ? data.goals.filter(
          (g) =>
            g.sphere === sphere &&
            g.status === 'active' &&
            g.term?.year === selectedTerm.year &&
            g.term?.term === selectedTerm.term
        )
      : [];

    let status: Goal['status'] = 'active';
    const create = (): void => {
      void tasksApi
        .createGoal({
          title: text,
          sphere,
          term: selectedTerm,
          ...(status === 'parked' ? { status } : {}),
          ...(sphere === 'life' && lifeArea ? { life_area: lifeArea as GoalLifeArea } : {}),
          ...(parentSomedayId ? { parent_someday_id: parentSomedayId } : {})
        })
        .then(async (goal) => {
          if (parentSomedayId) {
            const dream = data.tasks.find((t) => t.id === parentSomedayId);
            if (dream) {
              const linked = Array.isArray(dream.linked_goal_ids) ? dream.linked_goal_ids : [];
              await tasksApi.updateTask(dream.id, { linked_goal_ids: [...linked, goal.id] }).catch(() => undefined);
            }
          }
          reload();
        })
        .catch((err) => window.alert(errorMessage(err)));
    };

    if (selectedTerm && termTiedActive.length >= LANE_CAP) {
      const pick = window.prompt(
        `${SPHERE_LABEL[sphere]} already has ${LANE_CAP} goals this term. Type a goal id to park, or leave blank to add as parked.\n\n${termTiedActive.map((g) => `${g.id}: ${g.title}`).join('\n')}`
      );
      if (pick === null) return;
      if (pick.trim()) {
        const target = termTiedActive.find((g) => g.id === pick.trim() || g.title === pick.trim());
        if (!target) {
          window.alert('No matching goal to park.');
          return;
        }
        void tasksApi.updateGoal(target.id, { status: 'parked' }).then(create);
        return;
      }
      status = 'parked';
    }
    create();
  });
  queueMicrotask(() => title.focus());
  return form;
}

function renderRunway(runway: Runway, data: GoalsData, overlay: RunwayOverlay): HTMLElement {
  const wrap = el('section', 'glass-tile runway');
  const grid = el('div', 'runway__grid');
  grid.style.setProperty('--weeks', String(runway.weeks.length));
  const head = el('div', 'runway__head');
  head.append(el('span', '', 'Goal · lead measure'));
  for (const week of runway.weeks) {
    head.append(el('span', `${week.isNow ? 'is-now' : ''}${week.isCrunch ? ' is-crunch' : ''}`.trim(), week.label));
  }
  head.append(el('span', '', "This week's one move"));
  grid.append(head);
  for (const lane of runway.lanes) grid.append(...renderLane(lane, data, overlay));
  wrap.append(grid, legend());
  return wrap;
}

function renderLane(lane: RunwayLane, data: GoalsData, overlay: RunwayOverlay): HTMLElement[] {
  const label = el('div', `runway__lane runway__lane--${lane.sphere}`);
  label.append(el('span', 'runway__dot'), el('span', '', lane.label), el('small', '', `${lane.slotsUsed} of ${LANE_CAP} slots`));
  const nodes: HTMLElement[] = [label];
  if (!lane.rows.length && !lane.ongoing.length) {
    const empty = el('div', 'runway__empty-lane');
    empty.append(
      el('p', 'runway__empty', 'No active goals in this lane.'),
      (() => {
        const btn = el('button', 'btn btn--ghost', `Add a ${lane.label} goal`) as HTMLButtonElement;
        btn.type = 'button';
        btn.addEventListener('click', () => {
          document.querySelector<HTMLButtonElement>('[data-action="new-goal"]')?.click();
        });
        return btn;
      })()
    );
    nodes.push(empty);
  }
  for (const row of lane.rows) nodes.push(renderRow(row, lane.sphere, data, overlay));
  if (lane.ongoing.length) {
    const group = el('div', 'runway__ongoing');
    group.append(el('p', 'runway__ongoing-label', 'Ongoing'));
    for (const row of lane.ongoing) {
      const rowEl = renderRow(row, lane.sphere, data, overlay);
      rowEl.classList.add('runway__row--ongoing');
      const chip = el('span', 'runway__chip runway__chip--ongoing', 'Ongoing');
      rowEl.querySelector('.runway__goal-title')?.append(chip);
      group.append(rowEl);
    }
    nodes.push(group);
  }
  if (lane.parked.length) {
    const parked = el('details', 'runway__parked');
    parked.append(el('summary', '', `Not this term (${lane.parked.length})`));
    for (const goal of lane.parked) {
      const link = el('a', '', `${goal.title} · ${goal.status}`);
      link.href = goalPageHash(goal.id);
      const item = el('div');
      item.append(link);
      parked.append(item);
    }
    nodes.push(parked);
  }
  return nodes;
}

function renderRow(row: RunwayRow, sphere: GoalSphere, data: GoalsData, overlay: RunwayOverlay): HTMLElement {
  const link = el('a', `runway__row runway__row--${sphere}`);
  link.href = goalPageHash(row.goal.id);
  link.setAttribute('tabindex', '0');
  link.setAttribute('aria-label', `${row.goal.title}. Open goal.`);
  const info = el('div', 'runway__goal');
  const title = el('p', 'runway__goal-title', row.goal.title);
  title.setAttribute('data-hub-morph', 'title');
  title.append(el('span', 'runway__chip', STRUCTURE_CHIP[row.goal.structure]));
  const dream = row.goal.parent_someday_id ? data.tasks.find((t) => t.id === row.goal.parent_someday_id) : undefined;
  const meta = el('p', 'runway__goal-meta');
  if (row.thisWeek.perWeek !== null) {
    const fig = el('span', 'runway__lead-count');
    fig.setAttribute('data-hub-count', '');
    fig.textContent = `${row.thisWeek.count}/${row.thisWeek.perWeek}`;
    meta.append(
      document.createTextNode(row.goal.lead_measure ? `${row.goal.lead_measure.label} · ` : ''),
      fig,
      document.createTextNode(' this week')
    );
  } else {
    meta.textContent = row.goal.lead_measure?.label ?? 'No lead measure yet';
  }
  if (dream) meta.append(document.createTextNode(` · ✦ ${dream.title}`));
  info.append(title, meta);
  link.append(info);
  link.addEventListener('click', () => rememberGoalMorph(title));
  link.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    rememberGoalMorph(title);
    window.location.hash = goalPageHash(row.goal.id);
  });
  for (const cell of row.cells) {
    const box = el('span', 'runway__cell');
    if (cell.isNow) box.classList.add('is-now');
    const mark = el('i', `cell cell--${cell.state}`);
    mark.classList.toggle('is-now', cell.isNow);
    mark.classList.toggle('is-proposed', cell.proposed);
    mark.classList.toggle('has-milestone', cell.milestone);
    mark.title = `${cell.monday}: ${cell.state}${cell.count ? ` (${cell.count})` : ''}`;
    box.append(mark);
    link.append(box);
  }
  const move = el('p', 'runway__move');
  move.append(el('b', '', 'Move'), document.createTextNode(row.move?.title ?? 'Add a next start'));
  if (overlay.proposalGoalIds.has(row.goal.id)) move.append(el('span', 'is-proposal', ' · Hammond has a proposal'));
  link.append(move);
  return link;
}

function legend(): HTMLElement {
  const wrap = el('div', 'runway__legend');
  const item = (cls: string, label: string) => {
    const span = el('span');
    span.append(el('i', `cell ${cls}`), document.createTextNode(label));
    return span;
  };
  wrap.append(
    item('cell--done', 'Lead measure hit'),
    item('cell--part', 'Partial'),
    item('cell--rest', 'Rest week (not a fail)'),
    item('is-proposed', 'Hammond proposal, waiting for you'),
    item('has-milestone', 'Milestone')
  );
  return wrap;
}
