import { STAGES, applyCycleDecision, evidenceGain, isLiveWalkthruGoal, normalizeWalkthru, openCycle, pieceFor, withOpenCycle, withSnapshot } from '../../../../packages/walkthrus/goal.mjs';
import { PROBLEM_TYPES, PROBLEM_TYPE_IDS } from '../../../../packages/walkthrus/problem-types.mjs';
import { seriesByKey, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import { summarise, hasLapsed } from '../../../../packages/walkthrus/reps.mjs';
import {
  loadWalkthruGoals, loadWalkthruReps, loadWalkthruText, patchWalkthruGoal,
  type WalkthruGoal, type WalkthruRep, type WalkthruSection, type WalkthruText
} from '@/api/walkthrus';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';

const STAGE_LABEL: Record<string, string> = { attempt: 'Attempt', develop: 'Develop', adapt: 'Adapt', practise: 'Practise', test: 'Test' };
const STAGE_HINT: Record<string, string> = {
  attempt: 'Try the technique as the book sets it out, before changing anything.',
  develop: 'Get the five steps secure. Rehearse them and run them in a lesson.',
  adapt: 'Make it yours. Write your version of each step below.',
  practise: 'Use it in lessons until it’s routine. Each lesson is a rep.',
  test: 'Check whether it worked on the problem it was for, then keep going or move on.'
};

function option(label: string, value: string, selected = false): HTMLOptionElement {
  const node = document.createElement('option');
  node.textContent = label;
  node.value = value;
  node.selected = selected;
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const pc = (n: number): string => `${Math.round(n * 100)}%`;

export interface LearningGoalOptions { isCurrent?: () => boolean }

export async function renderLearningGoal(root: HTMLElement, options: LearningGoalOptions = {}): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  showViewLoading(root, 'Loading the goal…');
  try {
    const [goals, reps] = await Promise.all([loadWalkthruGoals(), loadWalkthruReps().catch(() => [] as WalkthruRep[])]);
    if (!isCurrent()) return;
    mount(root, goals, reps);
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(root, err, () => void renderLearningGoal(root, options));
  }
}

function mount(root: HTMLElement, goals: WalkthruGoal[], reps: WalkthruRep[]): void {
  const page = el('div', 'wt-goal');
  const status = el('p', 'wt-goal__status');
  status.setAttribute('role', 'status');
  let text: WalkthruText | null = null;
  let textError: string | null = null;

  const live = (): WalkthruGoal | undefined => goals.find((g) => isLiveWalkthruGoal(g));

  async function save(goal: WalkthruGoal, patch: Record<string, unknown>, done: string): Promise<void> {
    try {
      const next = await patchWalkthruGoal(goal.id, patch);
      const i = goals.findIndex((g) => g.id === goal.id);
      if (i >= 0) goals[i] = next;
      status.textContent = done;
    } catch (err) {
      status.textContent = `That didn’t save. ${errorMessage(err)}`;
    }
    paint();
  }

  function stageStepper(goal: WalkthruGoal, wt: WalkthruSection): HTMLElement {
    const wrap = el('section', 'wt-goal__stage');
    wrap.append(el('h2', 'wt-goal__h', 'Where you are'));
    const row = el('ol', 'wt-chain__row');
    STAGES.forEach((s: string) => {
      const item = el('li', 'wt-chain__hex');
      if (wt.stage === s) item.classList.add('is-current');
      if (STAGES.indexOf(wt.stage) > STAGES.indexOf(s)) item.classList.add('is-done');
      const b = el('button', 'wt-chain__btn');
      b.type = 'button';
      b.append(el('span', 'wt-chain__letter', s[0]!.toUpperCase()), el('span', 'wt-chain__name', STAGE_LABEL[s]));
      b.setAttribute('aria-current', String(wt.stage === s));
      b.addEventListener('click', () => {
        if (wt.stage === s) return;
        void save(goal, { walkthru: withOpenCycle({ ...wt, stage: s }, today()) }, `Moved to ${STAGE_LABEL[s]}.`);
      });
      item.append(b);
      row.append(item);
    });
    wrap.append(row, el('p', 'wt-goal__hint', STAGE_HINT[wt.stage]));
    return wrap;
  }

  function problemField(goal: WalkthruGoal, wt: WalkthruSection): HTMLElement {
    const label = el('label', 'wt-goal__field');
    label.append(el('span', undefined, 'The problem this is for'));
    const select = el('select');
    select.append(option('Not set', ''));
    for (const id of PROBLEM_TYPE_IDS as string[]) select.append(option(PROBLEM_TYPES[id as keyof typeof PROBLEM_TYPES].label, id, wt.problem_type === id));
    select.addEventListener('change', () => void save(goal, { walkthru: { ...wt, problem_type: select.value || null } }, 'Saved.'));
    label.append(select);
    return label;
  }

  function snapshotForm(goal: WalkthruGoal, wt: WalkthruSection, which: 'before' | 'after'): HTMLElement {
    const cycle = openCycle(wt) ?? wt.cycles[wt.cycles.length - 1];
    const have = which === 'before' ? cycle?.evidence_before : cycle?.evidence_after;
    const box = el('div', 'wt-goal__snap');
    box.append(el('h3', 'wt-goal__h3', which === 'before' ? 'Where the class is now' : 'Where the class is after'));
    if (have) {
      box.append(el('p', undefined, `${have.label || 'Class'}: ${pc(have.mean)} on ${have.n} students, ${have.at.slice(0, 10)}.`));
    }
    const form = el('form', 'wt-goal__snapform');
    const lab = el('input'); lab.placeholder = 'Class and task, e.g. 9B quiz'; lab.value = have?.label ?? ''; lab.setAttribute('aria-label', 'Class and task');
    const mean = el('input'); mean.type = 'number'; mean.min = '0'; mean.max = '100'; mean.step = '1'; mean.placeholder = "Mean %"; mean.setAttribute('aria-label', 'Class mean percent'); if (have) mean.value = String(Math.round(have.mean * 100));
    const n = el('input'); n.type = 'number'; n.min = '0'; n.step = '1'; n.placeholder = 'Students'; n.setAttribute('aria-label', 'Number of students'); if (have) n.value = String(have.n);
    const submit = el('button', 'btn btn--secondary btn--small', have ? 'Update' : 'Record');
    submit.type = 'submit';
    form.append(lab, mean, n, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const m = Number(mean.value);
      const count = Number(n.value);
      if (!mean.value || !Number.isFinite(m) || m < 0 || m > 100 || !n.value || !Number.isInteger(count) || count < 0) {
        status.textContent = 'Enter the class mean as a percent and the number of students.';
        return;
      }
      const snapshot = { at: new Date().toISOString(), class_id: null, label: lab.value.trim(), mean: m / 100, n: count };
      void save(goal, { walkthru: withSnapshot(wt, which, snapshot, today()) }, 'Recorded.');
    });
    box.append(form);
    return box;
  }

  function stepsSection(goal: WalkthruGoal, wt: WalkthruSection): HTMLElement {
    const section = el('section', 'wt-goal__steps');
    section.append(el('h2', 'wt-goal__h', 'The five steps, in your words'));
    const master = text?.sets.flatMap((s) => s.techniques).find((t) => t.id === wt.technique_id);
    if (!master) {
      section.append(el('p', 'empty-state', textError ?? 'Loading the steps…'));
      return section;
    }
    for (const step of master.steps) {
      const row = el('div', 'wt-goal__step');
      row.append(el('p', 'wt-steps__label', `${step.n}. ${step.label}`), el('p', 'wt-steps__text', step.text));
      const area = el('textarea', 'wt-goal__adapt');
      area.rows = 2;
      area.maxLength = 600;
      area.placeholder = 'Your version of this step';
      area.value = wt.adapted[String(step.n)] ?? '';
      area.setAttribute('aria-label', `Your version of step ${step.n}`);
      area.addEventListener('change', () => void save(goal, { walkthru: { ...wt, adapted: { ...wt.adapted, [String(step.n)]: area.value.trim() } } }, 'Saved.'));
      row.append(area);
      section.append(row);
    }
    return section;
  }

  function repsSection(wt: WalkthruSection): HTMLElement {
    const mine = reps.filter((r) => r.technique_id === wt.technique_id);
    const cycle = openCycle(wt);
    const total = summarise(mine, { since: cycle?.started ?? null });
    const section = el('section', 'wt-goal__reps');
    section.append(el('h2', 'wt-goal__h', 'Lessons'));
    section.append(el('p', undefined, `${total.reps} ${total.reps === 1 ? 'rep' : 'reps'} this cycle${total.partly ? ` (${total.partly} partly)` : ''}${total.to_log ? ` · ${total.to_log} ${total.to_log === 1 ? 'lesson' : 'lessons'} to log` : ''}.`));
    if (total.to_log) section.append(el('p', 'wt-goal__hint', 'Log them from the WalkThru note in the lesson. After 7 days an unlogged lesson lapses and counts as nothing.'));
    const recent = mine.filter((r) => r.state !== 'planned' && !hasLapsed(r)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    if (recent.length) {
      const list = el('ul', 'wt-goal__replist');
      for (const r of recent) list.append(el('li', undefined, `${r.at.slice(0, 10)} · ${r.state === 'ran' ? 'Ran it' : r.state === 'partly' ? 'Partly' : 'Didn’t get to it'}${r.note ? ` — ${r.note}` : ''}`));
      section.append(list);
    }
    return section;
  }

  function decisionSection(goal: WalkthruGoal, wt: WalkthruSection): HTMLElement {
    const section = el('section', 'wt-goal__decide');
    section.append(el('h2', 'wt-goal__h', 'Keep going or move on'));
    const cycle = openCycle(wt);
    const verdict = cycle ? evidenceGain(cycle.evidence_before, cycle.evidence_after) : { gain: false, change: null as number | null };
    section.append(el('p', 'wt-goal__hint', verdict.change === null
      ? 'Record the class before and after to see whether it worked. Without both, moving on counts as dropped.'
      : verdict.gain ? `The class gained ${Math.round((verdict.change ?? 0) * 100)} points. Moving on counts as achieved.` : 'No clear gain yet. Keep going, or move on and drop it.'));
    const repsNow = summarise(reps.filter((r) => r.technique_id === wt.technique_id), { since: cycle?.started ?? null }).reps;
    const row = el('div', 'wt-goal__row');
    for (const [decision, label, cls] of [['keep', 'Keep going', 'btn btn--primary'], ['move_on', 'Move on', 'btn btn--secondary']] as const) {
      const b = el('button', cls, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        const patch = applyCycleDecision(goal, decision, { at: new Date().toISOString(), reps: repsNow });
        if (patch.error) { status.textContent = patch.error.message; return; }
        void save(goal, patch, decision === 'keep' ? 'Another cycle started.' : verdict.gain ? 'Achieved. Nicely done.' : 'Moved on.');
      });
      row.append(b);
    }
    section.append(row);
    return section;
  }

  function paint(): void {
    const goal = live();
    const children: HTMLElement[] = [];
    if (!goal) {
      const empty = el('section', 'wt-goal__empty');
      empty.append(el('h2', 'wt-goal__h', 'No technique in hand'));
      empty.append(el('p', undefined, 'Pick one hexagon on the board and choose “Work on this technique”. You work on one at a time.'));
      const link = el('a', 'btn btn--primary', 'Open the board');
      link.href = '#/learning';
      empty.append(link);
      children.push(empty);
    } else {
      const wt = normalizeWalkthru(goal.walkthru) as WalkthruSection;
      const entry = techniqueById(wt.technique_id);
      const series = entry ? seriesByKey(entry.series) : null;
      const head = el('header', 'wt-goal__head');
      head.append(el('p', 'wt-panel__code', `${entry?.code ?? ''} | ${entry?.page ?? ''}${series ? ` · ${series.name}` : ''}`), el('h2', 'wt-goal__title', entry?.name ?? goal.title));
      const piece = pieceFor(goal);
      if (piece) head.append(el('p', 'wt-goal__piece', piece === 'city' ? 'It worked: a city on the board.' : piece === 'house' ? 'A house on the board.' : 'A dashed house on the board.'));
      const board = el('a', 'btn btn--secondary btn--small', 'See it on the board');
      board.href = `#/learning/${encodeURIComponent(wt.technique_id)}`;
      head.append(board);
      children.push(head, stageStepper(goal, wt), problemField(goal, wt));
      const snaps = el('div', 'wt-goal__snaps');
      snaps.append(snapshotForm(goal, wt, 'before'));
      if (wt.stage === 'test' || openCycle(wt)?.evidence_after) snaps.append(snapshotForm(goal, wt, 'after'));
      children.push(snaps, stepsSection(goal, wt), repsSection(wt));
      if (wt.stage === 'test') children.push(decisionSection(goal, wt));
    }
    const past = goals.filter((g) => !isLiveWalkthruGoal(g));
    if (past.length) {
      const history = el('section', 'wt-goal__history');
      history.append(el('h2', 'wt-goal__h', 'Before'));
      const list = el('ul');
      for (const g of past) {
        const wt = normalizeWalkthru(g.walkthru);
        const name = techniqueById(wt?.technique_id ?? '')?.name ?? g.title;
        list.append(el('li', undefined, `${name} · ${g.status}${wt && pieceFor(g) === 'city' ? ' · it worked' : ''}`));
      }
      history.append(list);
      children.push(history);
    }
    page.replaceChildren(...children, status);
  }

  root.replaceChildren(page);
  paint();
  loadWalkthruText().then((t) => { text = t; paint(); }).catch((err) => { textError = `The steps couldn’t be loaded. ${errorMessage(err)}`; paint(); });
}
