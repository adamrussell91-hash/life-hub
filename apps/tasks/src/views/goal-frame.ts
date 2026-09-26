// apps/tasks/src/views/goal-frame.ts
import type { Goal, GoalFrame } from '@/schemas/goal';
import { el } from '@/views/hub-kit';

export type GoalPatch = Partial<Pick<Goal,
  'frame' | 'structure' | 'lead_measure' | 'week_log' | 'if_then' | 'next_start' | 'milestones' | 'status' | 'sphere'>>;

const EMPTY_WOOP = { wish: '', outcome: '', obstacle: '', plan: '' };
const EMPTY_SMARTER = { specific: '', measurable: '', achievable: '', relevant: '', time_bound: '', evaluate: '', readjust: '' };
const EMPTY_FTS = { unit: '', floor: null, target: null, stretch: null, current: null };

function field(kind: 'input' | 'textarea', path: string, value: string, label: string, onCommit: (v: string) => void) {
  const node = el(kind, 'goal-field') as HTMLInputElement | HTMLTextAreaElement;
  node.value = value;
  node.dataset.field = path;
  node.setAttribute('aria-label', label);
  node.addEventListener('change', () => onCommit(node.value.trim()));
  return node;
}

function numberField(path: string, value: number | null, label: string, onCommit: (v: number | null) => void) {
  const node = el('input', 'goal-field');
  node.type = 'number';
  node.value = value === null ? '' : String(value);
  node.dataset.field = path;
  node.setAttribute('aria-label', label);
  node.addEventListener('change', () => onCommit(node.value === '' ? null : Number(node.value)));
  return node;
}

function withFrame(goal: Goal, part: Partial<GoalFrame>): GoalPatch {
  return { frame: { ...goal.frame, ...part } };
}

function woop(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_WOOP, ...goal.frame.woop };
  const grid = el('div', 'goal-frame__grid');
  const parts: Array<[keyof typeof EMPTY_WOOP, string, string, string]> = [
    ['wish', 'W', 'Wish', 'tone-gold'],
    ['outcome', 'O', 'Outcome', 'tone-sage'],
    ['obstacle', 'O', 'Obstacle', 'tone-peach'],
    ['plan', 'P', 'Plan', 'tone-blue']
  ];
  for (const [key, letter, label, tone] of parts) {
    const tile = el('div', `goal-frame__tile ${tone}`);
    const head = el('div', 'row');
    head.append(el('span', 'goal-frame__letter', letter), el('span', 'goal-frame__label', label));
    tile.append(head, field('textarea', `woop.${key}`, current[key], label, (v) => onPatch(withFrame(goal, { woop: { ...current, [key]: v } }))));
    grid.append(tile);
  }
  return grid;
}

function smarter(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_SMARTER, ...goal.frame.smarter };
  const rows = el('div', 'goal-rows');
  const labels: Array<[keyof typeof EMPTY_SMARTER, string]> = [
    ['specific', 'Specific'], ['measurable', 'Measurable'], ['achievable', 'Achievable'], ['relevant', 'Relevant'],
    ['time_bound', 'Time-bound'], ['evaluate', 'Evaluate'], ['readjust', 'Readjust']
  ];
  for (const [key, label] of labels) {
    rows.append(el('span', 'goal-frame__label', label), field('input', `smarter.${key}`, current[key], label, (v) => onPatch(withFrame(goal, { smarter: { ...current, [key]: v } }))));
  }
  return rows;
}

function okr(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { objective: '', key_results: [], ...goal.frame.okr };
  const wrap = el('div', 'goal-rows');
  wrap.append(el('span', 'goal-frame__label', 'Objective'), field('input', 'okr.objective', current.objective, 'Objective', (v) => onPatch(withFrame(goal, { okr: { ...current, objective: v } }))));
  current.key_results.forEach((kr, index) => {
    const row = el('div', 'row');
    const save = (next: typeof kr) => onPatch(withFrame(goal, { okr: { ...current, key_results: current.key_results.map((k, i) => (i === index ? next : k)) } }));
    row.append(
      field('input', `okr.kr.${index}.label`, kr.label, 'Key result', (v) => save({ ...kr, label: v || kr.label })),
      numberField(`okr.kr.${index}.current`, kr.current, 'Current', (v) => save({ ...kr, current: v })),
      numberField(`okr.kr.${index}.target`, kr.target, 'Target', (v) => save({ ...kr, target: v }))
    );
    wrap.append(el('span', 'goal-frame__label', `KR ${index + 1}`), row);
  });
  const add = el('button', 'btn btn--ghost', '+ Key result');
  add.type = 'button';
  add.dataset.action = 'add-kr';
  add.addEventListener('click', () =>
    onPatch(withFrame(goal, {
      okr: { ...current, key_results: [...current.key_results, { id: `kr${current.key_results.length + 1}`, label: 'New key result', target: null, current: null }] }
    }))
  );
  wrap.append(el('span', ''), add);
  return wrap;
}

function leadLag(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { lag: '', ...goal.frame.lead_lag };
  const rows = el('div', 'goal-rows');
  rows.append(el('span', 'goal-frame__label', 'Lag (the outcome)'), field('textarea', 'lead_lag.lag', current.lag, 'Lag measure', (v) => onPatch(withFrame(goal, { lead_lag: { lag: v } }))));
  rows.append(el('span', 'goal-frame__label', 'Lead'), el('span', 'meta', 'The weekly lead measure below drives the runway.'));
  return rows;
}

function floorTargetStretch(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_FTS, ...goal.frame.floor_target_stretch };
  const save = (next: Partial<typeof current>) => onPatch(withFrame(goal, { floor_target_stretch: { ...current, ...next } }));
  const wrap = el('div');
  const levels: Array<['floor' | 'target' | 'stretch', string, string]> = [
    ['floor', 'Floor · still a win', 'tone-sage'],
    ['target', 'Target', 'tone-lilac'],
    ['stretch', 'Stretch', 'tone-gold']
  ];
  const reached = levels.filter(([key]) => current[key] !== null && current.current !== null && current.current >= (current[key] as number)).at(-1)?.[0];
  const grid = el('div', 'goal-frame__grid goal-frame__grid--3');
  for (const [key, label, tone] of levels) {
    const tile = el('div', `goal-frame__tile ${tone}`);
    tile.append(el('span', 'goal-frame__label', label), numberField(`fts.${key}`, current[key], label, (v) => save({ [key]: v })));
    if (reached === key) tile.append(el('span', 'goal-frame__here', "you're here"));
    grid.append(tile);
  }
  const rows = el('div', 'goal-rows');
  rows.append(
    el('span', 'goal-frame__label', 'Unit'), field('input', 'fts.unit', current.unit, 'Unit', (v) => save({ unit: v })),
    el('span', 'goal-frame__label', 'Where you are'), numberField('fts.current', current.current, 'Current', (v) => save({ current: v }))
  );
  wrap.append(grid, rows);
  return wrap;
}

/** The main card body for the goal's chosen structure. */
export function renderGoalFrame(goal: Goal, onPatch: (patch: GoalPatch) => void): HTMLElement {
  switch (goal.structure) {
    case 'woop': return woop(goal, onPatch);
    case 'smarter': return smarter(goal, onPatch);
    case 'okr': return okr(goal, onPatch);
    case 'lead_lag': return leadLag(goal, onPatch);
    case 'floor_target_stretch': return floorTargetStretch(goal, onPatch);
  }
}
