import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import type { CaseBoard, CaseBoardStudent, CaseTeacherApi } from './api';
import { CASE_STATIONS, CASE_STATION_LABELS } from './schema';
import './editor.css';

export type CaseBoardHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };

const POLL_MS = 15000;
/** Station index of the Decide and Outcome stations in CASE_STATIONS. */
const DECIDE = 2;
const OUTCOME = 3;
const FREE_TEXT = '__text';

/**
 * The teacher's board for a published case. Names show here only: the class
 * spread a student sees has none. Teacher pace gets the release controls;
 * own pace gets a progress view.
 */
export function mountCaseBoard(o: { api: CaseTeacherApi; getLesson?: () => Lesson; now?: () => number }): CaseBoardHandle {
  const root = el('section', 'cbd');
  const error = el('p', 'cbd__err');
  error.setAttribute('role', 'alert');
  let board: CaseBoard | null = null;
  let busy = false;

  const run = async (p: Promise<CaseBoard>): Promise<void> => {
    busy = true;
    try { board = await p; error.textContent = ''; } catch (e) { error.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
    busy = false;
    paint();
  };

  const optionLabels = (b: CaseBoard): Array<[string, string]> => {
    const opts = o.getLesson?.().case?.decision?.options ?? [];
    const known = opts.map((x): [string, string] => [x.id, x.label]);
    const extra = Object.keys(b.spread).filter((k) => !opts.some((x) => x.id === k)).map((k): [string, string] => [k, k]);
    return [...known, ...extra];
  };

  function controls(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card cbd-controls');
    const row = el('div', 'cbd-stations');
    CASE_STATIONS.forEach((key, i) => {
      const state = i <= b.open_to ? (i === b.open_to ? 'now' : 'done') : 'next';
      const chip = el('span', `cbd-station cbd-station--${state}`, CASE_STATION_LABELS[key]);
      if (key === 'outcome' && b.outcome_revealed) chip.classList.add('cbd-station--revealed');
      row.append(chip);
    });
    box.append(row);
    const actions = el('div', 'cbd-actions');
    const next = b.open_to + 1;
    const nextKey = CASE_STATIONS[next];
    if (nextKey && next !== OUTCOME) {
      actions.append(button(`Open ${CASE_STATION_LABELS[nextKey]}`, 'primary', () => void run(o.api.open(next))));
    }
    if (b.parts_total > 1) {
      const more = b.parts_open < b.parts_total;
      const label = more ? `Release next part (${b.parts_open} of ${b.parts_total} open)` : `All ${b.parts_total} parts open`;
      const rel = button(label, 'secondary', () => void run(o.api.releasePart()));
      rel.disabled = !more || b.open_to < 1;
      actions.append(rel);
    }
    const reveal = button(b.outcome_revealed ? 'Outcome revealed' : 'Reveal the outcome', 'secondary', () => void run(o.api.reveal()));
    reveal.disabled = b.outcome_revealed || b.open_to < DECIDE;
    if (!b.outcome_revealed && b.open_to < DECIDE) reveal.title = 'Open Decide first.';
    actions.append(reveal);
    box.append(actions);
    return box;
  }

  function dot(s: CaseBoardStudent): HTMLElement {
    const d = el('span', `cbd-dot${s.locked?.changed ? ' cbd-dot--changed' : ''}`);
    d.title = `${s.name}: ${s.locked ? `sure ${s.locked.confidence}${s.locked.changed ? ', changed their mind' : ''}` : ''}`;
    d.append(el('b', '', s.initials), el('small', '', s.locked ? String(s.locked.confidence) : ''));
    return d;
  }

  function spread(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card');
    const locked = b.students.filter((s) => s.locked);
    box.append(el('h3', '', 'Class spread'), el('p', 'cbd-lead', `${locked.length} of ${b.students.length} locked. Dots with a ring changed their mind. Names are for you only.`));
    const cols = optionLabels(b);
    if (locked.some((s) => s.locked?.text && !s.locked.option_id)) cols.push([FREE_TEXT, 'In their own words']);
    const grid = el('div', 'cbd-spread');
    for (const [id, label] of cols) {
      const col = el('div', 'cbd-col');
      const mine = locked.filter((s) => (id === FREE_TEXT ? !s.locked!.option_id : s.locked!.option_id === id));
      col.append(el('b', '', label), el('span', 'cbd-count', String(mine.length)));
      const dots = el('div', 'cbd-dots');
      dots.append(...mine.map(dot));
      col.append(dots);
      grid.append(col);
    }
    box.append(grid);
    return box;
  }

  function heat(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card');
    box.append(el('h3', '', 'Evidence heat'), el('p', 'cbd-lead', 'How many students cited each document. A zero is a document nobody used.'));
    const max = Math.max(1, ...b.heat.map((h) => h.cited));
    for (const h of b.heat) {
      const row = el('div', `cbd-heat${h.cited === 0 ? ' cbd-heat--zero' : ''}`);
      const bar = el('span', 'cbd-heat__bar');
      bar.style.setProperty('--w', `${Math.round((h.cited / max) * 100)}%`);
      row.append(el('span', 'cbd-heat__t', h.title), bar, el('b', '', String(h.cited)));
      box.append(row);
    }
    return box;
  }

  function progress(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card');
    box.append(el('h3', '', 'Progress'), el('p', 'cbd-lead', 'Where each student is, at their own pace.'));
    const table = el('div', 'cbd-progress');
    for (const s of b.students) {
      const row = el('div', 'cbd-prow');
      const at = CASE_STATIONS[Math.min(s.at, CASE_STATIONS.length - 1)]!;
      row.append(
        el('b', '', `${s.initials} · ${s.name}`),
        el('span', 'cbd-pill', CASE_STATION_LABELS[at]),
        el('span', '', s.locked ? `Locked, sure ${s.locked.confidence}` : 'Not locked'),
        el('span', '', `${s.cited} cited`),
        el('span', '', s.rule ? 'Rule written' : ''),
        el('span', `cbd-pill${s.transfer === 'in' ? ' cbd-pill--in' : ''}`, s.transfer === 'in' ? 'Unseen case sent' : '')
      );
      table.append(row);
    }
    if (!b.students.length) table.append(el('p', 'cbd-lead', 'No students have opened this case yet.'));
    box.append(table);
    return box;
  }

  function rules(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card');
    box.append(el('h3', '', `Rule proposals${b.rules.length ? ` (${b.rules.length})` : ''}`));
    if (!b.rules.length) box.append(el('p', 'cbd-lead', 'None written yet.'));
    for (const r of b.rules) {
      const li = el('p', 'cbd-rule');
      li.append(el('b', '', `${r.initials}: `), document.createTextNode(`When ${r.when}, then ${r.then}, unless ${r.unless}.`));
      box.append(li);
    }
    return box;
  }

  function clearing(b: CaseBoard): HTMLElement {
    const box = el('div', 'cbd-card');
    const started = b.students.filter((s) => s.started);
    box.append(el('h3', '', 'Clear a student’s work'), el('p', 'cbd-lead', 'Deletes everything they saved here, so they start again from the Brief.'));
    if (!started.length) box.append(el('p', 'cbd-lead', 'Nobody has started yet.'));
    for (const s of started) {
      const row = el('div', 'cbd-clear');
      row.append(el('b', '', `${s.initials} · ${s.name}`), button('Clear work', 'ghost', () => {
        if (!window.confirm(`Clear all of ${s.name}’s work in this case? Their first take, answers, evidence, decision and rule are deleted. This can’t be undone.`)) return;
        void run(o.api.clearStudent(s.id));
      }));
      box.append(row);
    }
    return box;
  }

  function paint(): void {
    if (!board) return;
    const b = board;
    root.replaceChildren(
      el('h2', 'cbd__title', b.pace === 'own' ? 'Case progress' : 'Case board'),
      ...(b.pace === 'teacher' ? [controls(b)] : [progress(b)]),
      spread(b),
      heat(b),
      rules(b),
      clearing(b),
      error
    );
    root.querySelectorAll('button').forEach((x) => { if (busy) (x as HTMLButtonElement).disabled = true; });
  }

  async function refresh(): Promise<void> {
    if (busy) return;
    try { board = await o.api.board(); error.textContent = ''; paint(); } catch (e) { error.textContent = e instanceof Error ? e.message : 'The board didn’t load.'; if (!board) root.replaceChildren(error); }
  }

  root.append(error);
  const poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  return { root, refresh, dispose() { window.clearInterval(poll); root.remove(); } };
}
