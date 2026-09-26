import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createHubPills, el } from '@/views/hub-kit';
import { goalPageHash } from '@/domain/cards';
import { LANE_CAP, SPHERES, SPHERE_LABEL } from '@/domain/goal-hosting';
import {
  buildRunway, currentTerm, flattenTerms, sydneyToday,
  type Runway, type RunwayLane, type RunwayRow
} from '@/domain/goal-runway';
import { overlayFromReads, type GoalReadEnvelope } from '@/domain/goal-reads';
import { renderHammondStrip } from '@/views/hammond-goal';

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

/** Term Runway (spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md). */
export async function renderGoalsView(canvas: HTMLElement, today = sydneyToday()): Promise<void> {
  showViewLoading(canvas, 'Loading goals…', '.runway');
  try {
    const [goals, projects, tasks, prefs, readsResult] = await Promise.all([
      tasksApi.listGoals(),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs(),
      tasksApi.getGoalReads().catch(() => ({ reads: [] as GoalReadEnvelope[] }))
    ]);
    const envelopes = readsResult.reads;
    const overlay = overlayFromReads(envelopes.flatMap((e) => (e.read ? [e.read] : [])));
    paintGoals(canvas, { goals, projects, tasks, terms: flattenTerms(prefs), today }, overlay, envelopes);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load goals.')));
  }
}

export function paintGoals(
  canvas: HTMLElement,
  data: GoalsData,
  overlay: RunwayOverlay = { crunchWeeks: [], proposedRest: {}, proposalGoalIds: new Set() },
  envelopes: GoalReadEnvelope[] = []
): Runway | null {
  const term = data.terms.find((t) => t.starts_on === selectedTermStart) ?? currentTerm(data.terms, data.today);
  canvas.replaceChildren();
  const reload = () => void renderGoalsView(canvas, data.today);

  const top = el('div', 'goals-top');
  const summary = el('p', 'goals-summary');
  const actions = el('div', 'goals-top__actions');
  if (term) {
    const year = term.starts_on.slice(0, 4);
    actions.append(
      createHubPills({
        label: 'Term',
        items: data.terms.filter((t) => t.starts_on.startsWith(year)).map((t) => ({ id: t.starts_on, label: `Term ${t.term}` })),
        value: term.starts_on,
        onSelect: (id) => {
          selectedTermStart = id;
          paintGoals(canvas, data, overlay, envelopes);
        }
      })
    );
  }
  const add = el('button', 'btn btn--primary', 'New goal');
  add.type = 'button';
  add.dataset.action = 'new-goal';
  actions.append(add);
  top.append(summary, actions);
  const hammondHost = el('div', 'goals-hammond-host');
  canvas.append(top, hammondHost);
  renderHammondStrip(hammondHost, envelopes, data.goals, reload);
  add.addEventListener('click', () => {
    if (canvas.querySelector('.goals-new')) return;
    hammondHost.before(newGoalForm(data.goals, reload));
  });

  if (!term) {
    canvas.append(el('p', 'empty-state', 'Add your school terms in Tools → Term dates to see the runway.'));
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
  canvas.append(renderRunway(runway, data, overlay));
  return runway;
}

function newGoalForm(goals: Goal[], reload: () => void): HTMLFormElement {
  const form = el('form', 'glass-tile goals-new');
  const title = el('input', 'goal-field');
  title.name = 'title';
  title.placeholder = 'What do you want to be true by the end of term?';
  title.setAttribute('aria-label', 'Goal title');
  const sphere = el('select', 'goal-field') as HTMLSelectElement;
  sphere.name = 'sphere';
  sphere.setAttribute('aria-label', 'Lane');
  for (const id of SPHERES) {
    const option = el('option', '', SPHERE_LABEL[id]) as HTMLOptionElement;
    option.value = id;
    sphere.append(option);
  }
  const submit = el('button', 'btn btn--primary', 'Create');
  submit.type = 'submit';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => form.remove());
  form.append(title, sphere, submit, cancel);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    const lane = sphere.value as GoalSphere;
    const activeInLane = goals.filter((g) => g.sphere === lane && g.status === 'active').length;
    let status: Goal['status'] = 'active';
    if (activeInLane >= LANE_CAP) {
      const park = window.confirm(`${SPHERE_LABEL[lane]} already has ${LANE_CAP} active goals. Park one first? OK adds this goal as parked.`);
      if (!park) return;
      status = 'parked';
    }
    void tasksApi
      .createGoal({ title: text, sphere: lane, ...(status === 'parked' ? { status } : {}) })
      .then(reload)
      .catch((err) => window.alert(errorMessage(err)));
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
  if (lane.rows.length === 0) nodes.push(el('p', 'runway__empty', 'No active goals in this lane.'));
  for (const row of lane.rows) nodes.push(renderRow(row, lane.sphere, data, overlay));
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
  const info = el('div', 'runway__goal');
  const title = el('p', 'runway__goal-title', row.goal.title);
  title.append(el('span', 'runway__chip', STRUCTURE_CHIP[row.goal.structure]));
  const dream = row.goal.parent_someday_id ? data.tasks.find((t) => t.id === row.goal.parent_someday_id) : undefined;
  const lead = row.goal.lead_measure
    ? `${row.goal.lead_measure.label} · ${row.thisWeek.count}/${row.goal.lead_measure.per_week} this week`
    : 'No lead measure yet';
  info.append(title, el('p', 'runway__goal-meta', dream ? `${lead} · ✦ ${dream.title}` : lead));
  link.append(info);
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
