import { el } from '@/quiz/dom';
import type { PhaseRow } from './api';
import { PHASE_LABELS, type SprintPhaseKey } from './schema';

/**
 * The phase rail: one flat mark per phase on a dotted line, the way Problem
 * Solver and Decision Maker show their steps. The marks use the Problem Solver
 * palette (blue, red, yellow, ink on paper) so the sprint reads as part of the set.
 */
const MARKS: Record<SprintPhaseKey, string> = {
  understand: '<circle cx="50" cy="50" r="46" fill="#2c55a4"/><circle cx="50" cy="50" r="24" fill="var(--paper, #faf8ef)"/><circle cx="50" cy="50" r="11" fill="#d7262e"/>',
  sketch: '<circle cx="50" cy="50" r="46" fill="#f6be2c"/><path d="M22 66C34 40 44 70 56 44S72 38 80 30" fill="none" stroke="#171813" stroke-width="7" stroke-linecap="round"/>',
  decide: '<circle cx="50" cy="50" r="46" fill="var(--paper, #faf8ef)"/><circle cx="34" cy="50" r="28" fill="#d7262e"/><circle cx="66" cy="50" r="28" fill="#2c55a4" style="mix-blend-mode:multiply"/>',
  prototype: '<circle cx="50" cy="50" r="46" fill="#f6be2c"/><rect x="24" y="52" width="24" height="24" fill="#2c55a4"/><rect x="52" y="52" width="24" height="24" fill="#d7262e"/><rect x="38" y="26" width="24" height="24" fill="#171813"/>',
  test: '<circle cx="50" cy="50" r="46" fill="#d7262e"/><circle cx="50" cy="50" r="31" fill="var(--paper, #faf8ef)"/><circle cx="50" cy="50" r="18" fill="#2c55a4"/><circle cx="50" cy="50" r="6" fill="#f6be2c"/>'
};

export type RailState = 'now' | 'in' | 'late' | 'open' | 'later';

/** A phase's place on the rail. Pure. A closed phase with nothing handed in is "late" but stays openable. */
export function railState(p: Pick<PhaseRow, 'key' | 'open' | 'state' | 'closed'>, current: SprintPhaseKey): RailState {
  if (p.key === current) return 'now';
  if (!p.open) return 'later';
  if (p.state === 'in') return 'in';
  return p.closed ? 'late' : 'open';
}

const NOTE: Record<RailState, string> = { now: '', in: 'Handed in', late: 'Closed', open: 'Open', later: '' };

export function buildRail(phases: PhaseRow[], current: SprintPhaseKey, where: (k: SprintPhaseKey) => 'class' | 'home' | undefined, onPick: (k: SprintPhaseKey) => void, dueNote: (p: PhaseRow) => string): HTMLElement {
  const nav = el('nav', 'srail');
  nav.setAttribute('aria-label', 'Sprint phases');
  const ol = el('ol', '');
  const at = Math.max(0, phases.findIndex((p) => p.key === current));
  ol.style.setProperty('--p', String(phases.length > 1 ? at / (phases.length - 1) : 0));
  for (const p of phases) {
    const state = railState(p, current);
    const li = el('li', '');
    const b = el('button', 'srail__stn');
    b.type = 'button';
    b.dataset.state = state;
    b.dataset.where = where(p.key) ?? '';
    b.disabled = state === 'later';
    if (state === 'now') b.setAttribute('aria-current', 'step');
    const mark = el('span', 'srail__mark');
    mark.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${MARKS[p.key]}</svg>`;
    const name = el('b', '', PHASE_LABELS[p.key]);
    const tag = el('span', 'srail__where', where(p.key) === 'class' ? 'Class' : 'Home');
    const note = el('small', '', state === 'now' ? dueNote(p) : NOTE[state]);
    const status = { now: 'current', in: 'handed in', late: 'closed without a hand-in', open: 'open', later: 'not open yet' }[state];
    b.setAttribute('aria-label', `${PHASE_LABELS[p.key]}, ${where(p.key) === 'class' ? 'in class' : 'at home'}, ${status}`);
    b.append(mark, name, tag, note);
    b.addEventListener('click', () => onPick(p.key));
    li.append(b);
    ol.append(li);
  }
  nav.append(ol);
  return nav;
}
