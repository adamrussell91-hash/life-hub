import { STAGES, normalizeWalkthru, evidenceGain, openCycle } from '../../../../packages/walkthrus/goal.mjs';
import { seriesByKey, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import type { WalkthruGoal, WalkthruRep, WalkthruText, WalkthruTechniqueText } from '@/api/walkthrus';
import { summarise } from '../../../../packages/walkthrus/reps.mjs';

/** Everything the side panel shows for one opened technique. */
export interface PanelModel {
  id: string;
  goal: WalkthruGoal | null;
  /** Another technique already has the one active goal, so this one can't start. */
  blockedBy: string | null;
  reps: WalkthruRep[];
  /** Whether it sits on Adam's own board, and why it can't come off if it can't. */
  board: { on: boolean; locked: string | null };
  text: { state: 'loading' } | { state: 'ready'; value: WalkthruText } | { state: 'missing'; message: string };
}

export interface PanelActions {
  onClose: () => void;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onBoardToggle: (id: string) => void;
  onTextRetry: () => void;
}

const STAGE_LABEL: Record<string, string> = { attempt: 'Attempt', develop: 'Develop', adapt: 'Adapt', practise: 'Practise', test: 'Test' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function techniqueText(text: WalkthruText, id: string): WalkthruTechniqueText | null {
  for (const set of text.sets) {
    const found = set.techniques.find((t) => t.id === id);
    if (found) return found;
  }
  return null;
}

/** The ADAPT chain as five hexagons with a loop from Test back to Practise. */
function adaptChain(stage: string | null): HTMLElement {
  const wrap = el('div', 'wt-chain');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', stage ? `Stage: ${STAGE_LABEL[stage]}. Test loops back to Practise.` : 'Attempt, Develop, Adapt, Practise, Test. Test loops back to Practise.');
  const row = el('ol', 'wt-chain__row');
  STAGES.forEach((s: string, i: number) => {
    const item = el('li', 'wt-chain__hex');
    if (stage === s) item.classList.add('is-current');
    if (stage && STAGES.indexOf(stage) > i) item.classList.add('is-done');
    item.append(el('span', 'wt-chain__letter', s[0]!.toUpperCase()), el('span', 'wt-chain__name', STAGE_LABEL[s]));
    row.append(item);
  });
  wrap.append(row, el('span', 'wt-chain__loop', '↺ repeat'));
  return wrap;
}

function stepsSection(model: PanelModel, actions: PanelActions): HTMLElement {
  const section = el('section', 'wt-panel__steps');
  section.append(el('h3', 'wt-panel__h', 'The five steps'));
  if (model.text.state === 'loading') {
    section.append(el('p', 'canvas-status', 'Loading the steps…'));
    return section;
  }
  if (model.text.state === 'missing') {
    section.append(el('p', 'empty-state', model.text.message));
    const retry = el('button', 'btn btn--secondary', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', actions.onTextRetry);
    section.append(retry);
    return section;
  }
  const master = techniqueText(model.text.value, model.id);
  if (!master) {
    section.append(el('p', 'empty-state', 'The private file has no steps for this technique yet.'));
    return section;
  }
  const adapted = normalizeWalkthru(model.goal?.walkthru)?.adapted ?? {};
  const list = el('ol', 'wt-steps');
  for (const step of master.steps) {
    const item = el('li', 'wt-steps__item');
    item.append(el('p', 'wt-steps__label', `${step.n}. ${step.label}`), el('p', 'wt-steps__text', step.text));
    const mine = adapted[String(step.n)];
    if (mine) item.append(el('p', 'wt-steps__mine', mine));
    list.append(item);
  }
  section.append(list);
  if (master.footer) section.append(el('p', 'wt-steps__footer', master.footer));
  return section;
}

function repsLine(reps: WalkthruRep[], techniqueId: string): HTMLElement {
  const mine = reps.filter((r) => r.technique_id === techniqueId);
  const total = summarise(mine);
  const p = el('p', 'wt-panel__reps');
  if (!mine.length) {
    p.textContent = 'Not used in a lesson yet. Add it to a lesson as a WalkThru note.';
    return p;
  }
  const parts = [`${total.reps} ${total.reps === 1 ? 'rep' : 'reps'}`];
  if (total.partly) parts.push(`${total.partly} partly`);
  if (total.to_log) parts.push(`${total.to_log} ${total.to_log === 1 ? 'lesson' : 'lessons'} to log`);
  p.textContent = parts.join(' · ');
  return p;
}

function evidenceLine(goal: WalkthruGoal | null): HTMLElement | null {
  const wt = normalizeWalkthru(goal?.walkthru);
  const cycle = wt ? openCycle(wt) ?? wt.cycles[wt.cycles.length - 1] : null;
  if (!cycle?.evidence_before) return null;
  const pc = (n: number) => `${Math.round(n * 100)}%`;
  const p = el('p', 'wt-panel__evidence');
  const before = cycle.evidence_before;
  if (!cycle.evidence_after) {
    p.textContent = `Before: ${pc(before.mean)} on ${before.n} students. Record the class again at Test.`;
    return p;
  }
  const { gain, change } = evidenceGain(before, cycle.evidence_after);
  p.textContent = `${pc(before.mean)} → ${pc(cycle.evidence_after.mean)}${change === null ? '' : gain ? ' · a gain' : ' · no clear gain yet'}`;
  return p;
}

export function renderPanel(host: HTMLElement, model: PanelModel, actions: PanelActions): void {
  const entry = techniqueById(model.id);
  host.replaceChildren();
  if (!entry) return;
  const series = seriesByKey(entry.series);
  const head = el('header', 'wt-panel__head');
  const titles = el('div');
  titles.append(el('p', 'wt-panel__code', `${entry.code} | ${entry.page}${series ? ` · ${series.name}` : ''}`), el('h2', 'wt-panel__title', entry.name));
  const close = el('button', 'wt-panel__close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', `Close ${entry.name}`);
  close.addEventListener('click', actions.onClose);
  head.append(titles, close);

  const wt = normalizeWalkthru(model.goal?.walkthru);
  const body = el('div', 'wt-panel__body');
  body.append(adaptChain(wt?.stage ?? null), stepsSection(model, actions), repsLine(model.reps, model.id));
  const evidence = evidenceLine(model.goal);
  if (evidence) body.append(evidence);

  const actionsRow = el('div', 'wt-panel__actions');
  if (model.goal) {
    const link = el('a', 'btn btn--primary', 'Open the goal');
    link.href = '#/learning/goal';
    actionsRow.append(link);
  } else if (model.blockedBy) {
    actionsRow.append(el('p', 'wt-panel__note', `You’re working on ${model.blockedBy}. Finish, park or drop it to start this one.`));
    const link = el('a', 'btn btn--secondary', 'Open that goal');
    link.href = '#/learning/goal';
    actionsRow.append(link);
  } else {
    const start = el('button', 'btn btn--primary', 'Work on this technique');
    start.type = 'button';
    start.addEventListener('click', () => {
      start.disabled = true;
      actions.onStart(model.id);
    });
    actionsRow.append(start);
  }
  if (!model.board.locked) {
    const toggle = el('button', 'btn btn--secondary', model.board.on ? 'Take off my board' : 'Add to my board');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      toggle.disabled = true;
      actions.onBoardToggle(model.id);
    });
    actionsRow.append(toggle);
  }
  body.append(actionsRow);

  if (entry.see_also.length) {
    const also = el('div', 'wt-panel__also');
    also.append(el('h3', 'wt-panel__h', 'The book also points to'));
    for (const id of entry.see_also as string[]) {
      const other = techniqueById(id);
      if (!other) continue;
      const chip = el('button', 'wt-chip', other.name);
      chip.type = 'button';
      chip.addEventListener('click', () => actions.onSelect(id));
      also.append(chip);
    }
    body.append(also);
  }
  host.append(head, body);
}
