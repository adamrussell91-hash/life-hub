import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { dueText } from './player';
import { PHASE_LABELS, SPRINT_PHASES, type SprintPhaseKey } from './schema';
import { mountGroupBoard } from './group-board';
import { earlyNotes, phaseSpans, renderPhaseGantt } from './phase-timeline';
import { openPitchView } from './pitch-view';
import type { MapGroup, SprintSummary, SprintTeacherApi } from './api';
import './sprint.css';

export type SprintMapHandle = { root: HTMLElement; refresh(): Promise<void>; openBoard(groupId: string): void; dispose(): void };
const POLL_MS = 15000;
const STATE_TEXT = { none: 'not in', draft: 'started', in: 'in', late: 'in late' } as const;
const DOT = { none: 'dot--none', draft: 'dot--started', in: 'dot--in', late: 'dot--late' } as const;

function badge(g: MapGroup, key: SprintPhaseKey): string {
  const a = g.awaiting;
  if (key === 'understand' && g.asked) return `${g.asked} ${g.asked === 1 ? 'question' : 'questions'} to answer`;
  if (!a) return '';
  if (a.kind === 'question' && key === 'understand') return a.empty ? 'No problems in' : a.tie ? 'Tie: choose problem' : 'Choose problem';
  if (a.kind === 'idea' && key === 'decide') return a.empty ? 'No ideas in' : a.tie ? 'Tie: choose idea' : 'Choose idea';
  return '';
}

/**
 * The teacher's progress map: phases across, groups down, a dot per student.
 * Names show here only. Clicking a row opens that group's board below.
 */
export function mountSprintMap(o: { getLesson: () => Lesson; api: SprintTeacherApi; emitLesson: (next: Lesson) => void; now?: () => number; practice?: boolean }): SprintMapHandle {
  const now = o.now ?? (() => Date.now());
  const root = el('section', 'smap');
  const head = el('header', 'smap__head');
  const notice = el('div', 'smap__notice');
  const gantt = el('div', 'smap__gantt');
  const grid = el('div', 'smap__grid');
  const confirmHost = el('div');
  const boardHost = el('div');
  const error = el('p', 'sprint-submit__err');
  error.setAttribute('role', 'alert');
  root.append(head, notice, confirmHost, gantt, grid, boardHost, error);
  let summary: SprintSummary | null = null;
  let poll = 0;
  let board: { refresh(): Promise<void>; dispose(): void } | null = null;

  const run = async (p: Promise<SprintSummary>) => {
    try { summary = await p; paint(); } catch (e) { error.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
  };

  function confirmEnd(key: SprintPhaseKey): void {
    if (!summary) return;
    const students = summary.groups.flatMap((g) => g.students);
    const drafts = students.filter((s) => s.opened[key] && s.phases[key] === 'draft').length;
    const absent = students.filter((s) => !s.opened[key]);
    const hours = o.getLesson().sprint?.lock_hours ?? 2;
    const box = el('div', 'smap-confirm');
    const ul = el('ul');
    ul.append(
      el('li', '', `Freeze ${PHASE_LABELS[key]} class work${drafts ? ` (${drafts} ${drafts === 1 ? 'draft will be submitted as it is' : 'drafts will be submitted as they are'})` : ''}`),
      el('li', '', hours ? `Lock the sprint for ${hours} h` : 'No class lock is set'),
      el('li', '', `Open ${PHASE_LABELS[SPRINT_PHASES[SPRINT_PHASES.indexOf(key) + 1] ?? key]} when the lock lifts`)
    );
    if (absent.length) ul.append(el('li', '', `Mark ${absent.length} ${absent.length === 1 ? 'student' : 'students'} absent (${absent.map((s) => s.initials).join(', ')}): they can catch up from home after the lock`));
    box.append(el('strong', '', `End the ${PHASE_LABELS[key]} class part?`), ul, button('End and lock', 'primary', () => { confirmHost.replaceChildren(); void run(o.api.endClass(key)); }), button('Not yet', 'secondary', () => confirmHost.replaceChildren()));
    confirmHost.replaceChildren(box);
  }

  function extendForm(): void {
    if (!summary) return;
    const box = el('div', 'smap-confirm');
    const scope = el('select', 'qz-input');
    for (const [v, l] of [['class', 'Whole class'], ['group', 'One group'], ['student', 'One student']]) { const op = el('option', '', l); op.value = v; scope.append(op); }
    const who = el('select', 'qz-input');
    const fill = () => {
      who.replaceChildren();
      who.hidden = scope.value === 'class';
      const items = scope.value === 'group' ? summary!.groups.map((g) => [g.id, g.name]) : summary!.groups.flatMap((g) => g.students.map((s) => [s.id, `${s.initials} · ${s.name}`]));
      for (const [v, l] of items) { const op = el('option', '', l); op.value = v!; who.append(op); }
    };
    scope.addEventListener('change', fill);
    fill();
    const phase = el('select', 'qz-input');
    for (const k of SPRINT_PHASES) { const op = el('option', '', PHASE_LABELS[k]); op.value = k; phase.append(op); }
    const date = el('input', 'qz-input'); date.type = 'date';
    const time = el('input', 'qz-input'); time.type = 'time';
    const msg = el('p', 'sprint-submit__err');
    // Start from the phase's current deadline (after any class extension), so a nudge is one tap.
    const current = () => {
      const base = o.getLesson().sprint?.phases.find((x) => x.key === phase.value);
      const over = (summary!.extend as { class?: Record<string, { due_date: string; due_time: string }> }).class?.[phase.value];
      date.value = over?.due_date ?? base?.due_date ?? '';
      time.value = over?.due_time ?? (base?.due_time || '15:00');
    };
    const shift = (minutes: number) => {
      if (!date.value) current();
      const t = new Date(`${date.value}T${time.value || '15:00'}:00Z`);
      t.setUTCMinutes(t.getUTCMinutes() + minutes);
      date.value = t.toISOString().slice(0, 10);
      time.value = t.toISOString().slice(11, 16);
      msg.textContent = '';
    };
    phase.addEventListener('change', current);
    current();
    const quick = el('div', 'smap-quick');
    for (const [label, mins] of [['+30 min', 30], ['+1 h', 60], ['+1 day', 1440]] as const) quick.append(button(label, 'secondary', () => shift(mins)));
    for (const [c, l] of [[scope, 'Extend for'], [who, 'Who'], [phase, 'Phase'], [date, 'New due date'], [time, 'New due time']] as const) c.setAttribute('aria-label', l);
    box.append(el('strong', '', 'Extend a deadline'), scope, who, phase, date, time, quick, msg, button('Extend', 'primary', () => {
      if (!date.value) { msg.textContent = 'Pick a new due date first.'; return; }
      confirmHost.replaceChildren();
      void run(o.api.extend({ scope: scope.value as 'class' | 'group' | 'student', ...(scope.value === 'class' ? {} : { id: who.value }), phase: phase.value as SprintPhaseKey, due_date: date.value, due_time: time.value || '15:00' }));
    }), button('Cancel', 'secondary', () => confirmHost.replaceChildren()));
    confirmHost.replaceChildren(box);
  }

  function openBoard(groupId: string): void {
    board?.dispose();
    board = mountGroupBoard(boardHost, { api: o.api, groupId, getLesson: o.getLesson, emitLesson: o.emitLesson, onChanged: () => void refresh(), practice: o.practice });
  }

  function paint(): void {
    if (!summary) return;
    const s = summary;
    const sprint = o.getLesson().sprint;
    head.replaceChildren(
      el('h2', '', 'Progress map'),
      button('Extend a deadline', 'secondary', extendForm),
      ...(s.spotlight ? [button('Take down the spotlight', 'secondary', () => void run(o.api.clearSpotlight()))] : []),
      button('Run pitches', 'primary', () => openPitchView({ api: o.api, getLesson: o.getLesson, summary: s, onClose: () => void refresh() }))
    );
    notice.replaceChildren();
    // Groups that can't move on until the teacher chooses: easy to miss once the class has moved past Understand.
    const waits = s.groups.filter((g) => g.awaiting);
    if (waits.length) {
      const box = el('div', 'smap-waits');
      box.append(el('strong', '', 'Waiting on you'));
      for (const g of waits) {
        const what = g.awaiting!.kind === 'question'
          ? `choose the group’s problem. Decide can’t pick an idea until you do.`
          : 'choose the group’s idea, so they can plan the parts.';
        box.append(button(`${g.name}: ${what}`, 'secondary', () => openBoard(g.id)));
      }
      notice.append(box);
    }
    if (s.lock) {
      const until = new Date(s.lock.until).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      const who = el('select', 'qz-input');
      who.setAttribute('aria-label', 'Unlock one student');
      who.append(el('option', '', 'Unlock one student…'));
      for (const st of s.groups.flatMap((g) => g.students)) { const op = el('option', '', `${st.initials} · ${st.name}`); op.value = st.id; who.append(op); }
      who.addEventListener('change', () => { if (who.value) void run(o.api.unlock(who.value)); });
      notice.append(el('span', 'pill pill--wait', `Locked until ${until}`), who);
    }
    if (sprint) {
      // Class deadlines after any class-wide extension, as the students see them.
      const ext = (s.extend as { class?: Record<string, { due_date: string; due_time: string }> }).class ?? {};
      const spans = phaseSpans(sprint.phases.map((p) => ({ ...p, ...(ext[p.key] ?? {}) })), sprint.lock_hours, s.ended);
      gantt.replaceChildren(renderPhaseGantt(spans, { now: now(), note: earlyNotes(spans, s.groups.map((g) => g.open), now()) }));
    }
    const classExt = (s.extend as { class?: Record<string, { due_date: string; due_time: string }> }).class ?? {};
    grid.replaceChildren();
    const header = el('div', 'smap-row smap-row--head');
    header.append(el('div'));
    for (const key of SPRINT_PHASES) {
      const p = sprint?.phases.find((x) => x.key === key);
      const h = el('div', 'smap-ph');
      h.append(el('b', '', PHASE_LABELS[key]), el('span', `pill ${p?.where === 'class' ? 'pill--class' : 'pill--home'}`, p?.where === 'class' ? 'Class' : 'Home'), el('span', 'smap-due', p ? dueText(classExt[key]?.due_date ?? p.due_date, classExt[key]?.due_time ?? p.due_time, now()) : ''));
      if (p?.where === 'class' && s.class_parts[key] === 'open' && s.groups.some((g) => g.open.includes(key))) {
        const end = button('End class part', 'secondary', () => confirmEnd(key));
        // The lock length is dropped on a phone; the confirm still says it.
        end.append(el('span', 'smap-lock-note', ` · locks ${sprint?.lock_hours ?? 2} h`));
        end.dataset.end = key;
        h.append(end);
      }
      if (s.class_parts[key] === 'ended') h.append(el('span', 'smap-due', 'Class part ended'));
      header.append(h);
    }
    grid.append(header);
    for (const g of s.groups) {
      const row = el('div', 'smap-row');
      const name = el('div', 'smap-name');
      name.append(el('b', '', g.name), el('span', '', g.students.map((x) => x.initials).join(' · ')));
      row.append(name);
      for (const key of SPRINT_PHASES) {
        const cell = el('div', `smap-cell${g.open.at(-1) === key ? ' smap-cell--now' : ''}`);
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `${g.name}, ${PHASE_LABELS[key]}`);
        for (const st of g.students) {
          const d = el('i', `dot ${DOT[st.phases[key]]}`);
          d.title = `${st.name}: ${STATE_TEXT[st.phases[key]]}`;
          cell.append(d);
        }
        const b = badge(g, key);
        if (b) cell.append(el('span', 'pill pill--wait', b));
        if ((key === 'prototype' || key === 'test') && g.students.some((st) => st.phases[key] === 'in' || st.phases[key] === 'late')) cell.append(el('span', 'pill pill--mark', 'Mark'));
        const open = () => openBoard(g.id);
        cell.addEventListener('click', open);
        cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        row.append(cell);
      }
      grid.append(row);
    }
  }

  async function refresh(): Promise<void> {
    try {
      summary = await o.api.summary();
      error.textContent = '';
      paint();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'The map didn’t load.';
    }
  }

  poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  return { root, refresh, openBoard, dispose() { window.clearInterval(poll); board?.dispose(); } };
}
