import { STAGES, normalizeWalkthru, evidenceGain, openCycle } from '../../../../packages/walkthrus/goal.mjs';
import { seriesByKey, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import type { WalkthruGoal, WalkthruRep, WalkthruText, WalkthruTechniqueText } from '@/api/walkthrus';
import { summarise } from '../../../../packages/walkthrus/reps.mjs';
import { isFusionId } from '../../../../packages/walkthrus/tiles.mjs';
import { fusedTileSvg, type Fusion } from '../../../../packages/walkthrus/board/fused';
import { parentCodes } from '../../../../packages/walkthrus/fusions.mjs';
import type { Proof } from '@/api/walkthrus-proof';
import { renderProofStrip } from '@/views/walkthrus-proof';

/** Everything the side panel shows for one opened technique. */
export interface PanelModel {
  id: string;
  goal: WalkthruGoal | null;
  /** Another technique already has the one active goal, so this one can't start. */
  blockedBy: string | null;
  reps: WalkthruRep[];
  /**
   * Whether it sits on Adam's own board, why it can't come off if it can't, and the name of the
   * cluster it was opened from on My board (null in the whole book). Take off removes it from that
   * cluster only; with no cluster the panel offers Add to my board.
   */
  board: { on: boolean; locked: string | null; cluster: string | null };
  text: { state: 'loading' } | { state: 'ready'; value: WalkthruText } | { state: 'missing'; message: string };
  /** The fusion itself when the open tile is one (its steps live in the board document, not the book's text). */
  fusion?: Fusion | null;
  /** Proof for every tile; null while it loads or when it failed (the strip then shows nothing yet). */
  proof?: Proof | null;
  /** Whether "Fuse with…" makes sense: a book technique on My board with another technique beside it. */
  canFuse?: boolean;
}

export interface PanelActions {
  onClose: () => void;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onBoardToggle: (id: string) => void;
  onTextRetry: () => void;
  /** "Fuse with…": pick one or two other techniques on My board, then open the bench. */
  onFuseWith?: (id: string) => void;
  /** Reopens the bench on a fusion. */
  onEditFusion?: (id: string) => void;
  /** Draws (or redraws, with a note) a fusion's figure. Resolves once the board has the result. */
  onDraw?: (id: string, note?: string) => Promise<void>;
  /** What a drawing costs, shown before Adam says yes. */
  drawCost?: string;
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

const NS = 'http://www.w3.org/2000/svg';
const HEX_POINTS = '10,1.5 30,1.5 39,17.5 30,33.5 10,33.5 1,17.5';

/**
 * The A·D·A·P·T chain on one line: five small outlined hexagons, done ones yellow, the current one
 * black, then the stage's name and the loop from Test back to Practise.
 */
function adaptChain(stage: string | null): HTMLElement {
  const wrap = el('div', 'wt-adapt');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', stage ? `Stage: ${STAGE_LABEL[stage]}. Test loops back to Practise.` : 'Attempt, Develop, Adapt, Practise, Test. Test loops back to Practise.');
  const row = el('ol', 'wt-adapt__row');
  STAGES.forEach((s: string, i: number) => {
    const item = el('li', 'wt-adapt__step');
    if (stage === s) item.classList.add('is-current');
    else if (stage && STAGES.indexOf(stage) > i) item.classList.add('is-done');
    item.title = STAGE_LABEL[s]!;
    const pic = document.createElementNS(NS, 'svg');
    pic.setAttribute('viewBox', '0 0 40 35');
    pic.setAttribute('class', 'wt-adapt__hex');
    pic.setAttribute('aria-hidden', 'true');
    const hex = document.createElementNS(NS, 'polygon');
    hex.setAttribute('points', HEX_POINTS);
    const letter = document.createElementNS(NS, 'text');
    letter.setAttribute('x', '20');
    letter.setAttribute('y', '23.5');
    letter.setAttribute('text-anchor', 'middle');
    letter.textContent = s[0]!.toUpperCase();
    pic.append(hex, letter);
    item.append(pic);
    row.append(item);
  });
  wrap.append(row, el('span', 'wt-adapt__note', stage ? `${STAGE_LABEL[stage]} · ↺ Test to Practise` : '↺ Test to Practise'));
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

function proofSection(model: PanelModel): HTMLElement {
  const section = el('div', 'wt-panel__proof');
  renderProofStrip(section, model.id, model.proof ?? null);
  return section;
}

/** Start a goal, open the goal, take off or add: the same for a technique and a fusion. */
function goalActions(model: PanelModel, actions: PanelActions, name: string): HTMLElement {
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
    const takeOff = Boolean(model.board.cluster && model.board.on);
    const toggle = el('button', 'btn btn--secondary', takeOff ? 'Take off' : 'Add to my board');
    if (takeOff) toggle.setAttribute('aria-label', `Take ${name} off ${model.board.cluster}`);
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      // Adding asks which cluster first, so only a take-off locks the button.
      if (takeOff) toggle.disabled = true;
      actions.onBoardToggle(model.id);
    });
    actionsRow.append(toggle);
  }
  return actionsRow;
}

function closeButton(name: string, actions: PanelActions): HTMLButtonElement {
  const close = el('button', 'wt-panel__close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', `Close ${name}`);
  close.addEventListener('click', actions.onClose);
  return close;
}

/** A fusion's own steps, with its loops and Adam's adapted notes from the goal. */
function fusionSteps(model: PanelModel, fusion: Fusion): HTMLElement {
  const section = el('section', 'wt-panel__steps');
  const steps = Array.isArray(fusion.steps) ? fusion.steps : [];
  section.append(el('h3', 'wt-panel__h', steps.length === 5 ? 'The five steps' : `The ${steps.length === 1 ? 'step' : `${steps.length} steps`}`));
  const adapted = normalizeWalkthru(model.goal?.walkthru)?.adapted ?? {};
  const list = el('ol', 'wt-steps');
  steps.forEach((step, i) => {
    const item = el('li', 'wt-steps__item');
    item.append(el('p', 'wt-steps__label', `${i + 1}. ${step.label || 'Untitled step'}`));
    if (step.text) item.append(el('p', 'wt-steps__text', step.text));
    if (step.loop_to) item.append(el('p', 'wt-steps__loop', `↻ back to step ${step.loop_to}`));
    const mine = adapted[String(i + 1)];
    if (mine) item.append(el('p', 'wt-steps__mine', mine));
    list.append(item);
  });
  section.append(list);
  return section;
}

/**
 * Draw or Redraw: the cost shows first, then Adam says yes. Redraw takes a note for Claude.
 */
function drawSection(fusion: Fusion, actions: PanelActions): HTMLElement | null {
  if (!actions.onDraw) return null;
  const drawn = fusion.drawing?.status === 'drawn';
  const section = el('section', 'wt-panel__draw');
  section.append(el('h3', 'wt-panel__h', drawn ? 'Redraw the picture' : 'Its picture'));
  const status = el('p', 'wt-panel__note');
  status.setAttribute('role', 'status');
  if (!drawn) status.textContent = fusion.drawing?.status === 'failed' ? 'The last drawing did not pass its checks.' : 'It shows a dashed figure until drawn.';
  let note: HTMLInputElement | null = null;
  if (drawn) {
    note = el('input', 'wt-pop__input');
    note.type = 'text';
    note.maxLength = 200;
    note.placeholder = 'What should change? (optional)';
    note.setAttribute('aria-label', 'Note for the redraw');
    section.append(note);
  }
  const row = el('div', 'wt-panel__actions');
  const ask = el('button', 'btn btn--secondary', drawn ? 'Redraw…' : 'Draw…');
  ask.type = 'button';
  ask.addEventListener('click', () => {
    const cost = el('p', 'wt-panel__note', `${actions.drawCost ?? 'About A$0.10–0.25'}. Draw it now?`);
    const yes = el('button', 'btn btn--primary', drawn ? 'Redraw' : 'Draw');
    yes.type = 'button';
    const no = el('button', 'btn btn--secondary', 'Not now');
    no.type = 'button';
    no.addEventListener('click', () => { row.replaceChildren(ask); });
    yes.addEventListener('click', () => {
      yes.disabled = true;
      no.disabled = true;
      if (note) note.disabled = true;
      status.textContent = 'Drawing… this takes up to half a minute.';
      void actions.onDraw!(fusion.id, note?.value.trim() || undefined).catch((err: unknown) => {
        status.textContent = `Could not draw it: ${err instanceof Error ? err.message : 'try again'}`;
        row.replaceChildren(ask);
        if (note) note.disabled = false;
      });
    });
    row.replaceChildren(cost, yes, no);
    yes.focus();
  });
  row.append(ask);
  section.append(row, status);
  return section;
}

function renderFusionPanel(host: HTMLElement, model: PanelModel, actions: PanelActions, fusion: Fusion): void {
  const codes = (parentCodes(fusion) as string[]).join(' + ');
  const head = el('header', 'wt-panel__head');
  const titles = el('div');
  titles.append(el('p', 'wt-panel__code', `FUSED${codes ? ` | ${codes}` : ''}`), el('h2', 'wt-panel__title', fusion.name));
  head.append(titles, closeButton(fusion.name, actions));

  const body = el('div', 'wt-panel__body');
  const frame = el('div', 'wt-panel__fused');
  frame.innerHTML = fusedTileSvg(fusion, { size: 90 });
  body.append(frame);
  if (fusion.why) body.append(el('p', 'wt-panel__why', fusion.why));
  const parents = (fusion.parents ?? []).map((id) => techniqueById(id)?.name).filter(Boolean);
  if (parents.length) body.append(el('p', 'wt-panel__note', `Fused from ${parents.join(' + ')}.`));
  const wt = normalizeWalkthru(model.goal?.walkthru);
  body.append(adaptChain(wt?.stage ?? null), fusionSteps(model, fusion), repsLine(model.reps, model.id));
  const evidence = evidenceLine(model.goal);
  if (evidence) body.append(evidence);
  const row = goalActions(model, actions, fusion.name);
  if (actions.onEditFusion) {
    const edit = el('button', 'btn btn--secondary', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${fusion.name}`);
    edit.addEventListener('click', () => actions.onEditFusion!(fusion.id));
    row.append(edit);
  }
  body.append(row);
  const draw = drawSection(fusion, actions);
  if (draw) body.append(draw);
  body.append(proofSection(model));
  host.append(head, body);
}

export function renderPanel(host: HTMLElement, model: PanelModel, actions: PanelActions): void {
  host.replaceChildren();
  if (isFusionId(model.id)) {
    if (model.fusion) renderFusionPanel(host, model, actions, model.fusion);
    return;
  }
  const entry = techniqueById(model.id);
  if (!entry) return;
  const series = seriesByKey(entry.series);
  const head = el('header', 'wt-panel__head');
  const titles = el('div');
  titles.append(el('p', 'wt-panel__code', `${entry.code} | ${entry.page}${series ? ` · ${series.name}` : ''}`), el('h2', 'wt-panel__title', entry.name));
  head.append(titles, closeButton(entry.name, actions));

  const wt = normalizeWalkthru(model.goal?.walkthru);
  const body = el('div', 'wt-panel__body');
  body.append(adaptChain(wt?.stage ?? null), stepsSection(model, actions), repsLine(model.reps, model.id));
  const evidence = evidenceLine(model.goal);
  if (evidence) body.append(evidence);

  const actionsRow = goalActions(model, actions, entry.name);
  if (model.canFuse && actions.onFuseWith) {
    const fuse = el('button', 'btn btn--secondary', 'Fuse with…');
    fuse.type = 'button';
    fuse.addEventListener('click', () => actions.onFuseWith!(model.id));
    actionsRow.append(fuse);
  }
  body.append(actionsRow, proofSection(model));

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
