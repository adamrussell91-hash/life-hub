import type { Lesson } from '@/schemas/lesson';
import { el } from '@/quiz/dom';
import { ROTATION_FALLBACK_LABELS, ROTATION_KINDS, ROTATION_KIND_INFO, ROTATION_LEVELS, ROTATION_LEVEL_LABELS, RotationSettingsSchema, WRITTEN_CHECK_LABELS } from './schema';
import { DEFAULT_LESSON_MINUTES, FINALE_MINUTES, MOVE_MINUTES, timeBudget } from './rules';
import type { RotationBoard, RotationTeacherApi } from './api';
import './rotation.css';

export type RotationLiveOptions = {
  api: RotationTeacherApi;
  getLesson: () => Lesson;
  classes?: Array<{ id: string; name: string; minutes?: number }>;
  pollMs?: number;
  now?: () => number;
};
export type RotationLiveHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };

const minsSince = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000));

/** The teacher's live view of a published rotation. Names come from the class list, never ids. */
export function mountRotationLive(o: RotationLiveOptions): RotationLiveHandle {
  const now = o.now ?? (() => Date.now());
  const root = el('section', 'rot rot-live');
  const head = el('div', 'rot-row rot-row--between');
  const title = el('h2', '', 'Live');
  const status = el('span', 'rot-status');
  status.setAttribute('role', 'status');
  head.append(title, status);
  const err = el('p', 'rot-err');
  err.setAttribute('role', 'alert');
  const body = el('div', 'rot-grid');
  root.append(head, err, body);
  let board: RotationBoard | null = null;
  let poll = 0;
  let disposed = false;
  let openPick = { student: '', station: '' };

  const btn = (label: string, onClick: () => void, cls = 'rot-btn rot-btn--small'): HTMLButtonElement => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const panel = (t: string, ...kids: HTMLElement[]) => { const p = el('section', 'rot-panel'); p.append(el('h3', '', t), ...kids); return p; };
  const stationTitle = (id: string | null) => board?.stations.find((s) => s.id === id)?.title ?? 'the map';

  async function run(go: () => Promise<RotationBoard>): Promise<void> {
    err.textContent = '';
    try {
      board = await go();
      paint();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t work. Try again.';
    }
  }

  function summary(b: RotationBoard): HTMLElement {
    const r = RotationSettingsSchema.parse(o.getLesson().rotation ?? {});
    const minutes = o.classes?.find((c) => c.id === r.class_id)?.minutes ?? r.minutes ?? DEFAULT_LESSON_MINUTES;
    const plan = timeBudget(r, minutes);
    const elapsed = b.started_at ? minsSince(b.started_at, now()) : 0;
    const left = Math.max(0, minutes - elapsed);
    const learning = b.stations.filter((s) => s.kind !== 'teacher');
    const avgStation = learning.length ? learning.reduce((n, s) => n + s.minutes, 0) / learning.length : 0;
    const started = b.students.filter((s) => s.started);
    const avgLeft = started.length ? started.reduce((n, s) => n + s.pieces_left, 0) / started.length : learning.length;
    const needs = Math.round(avgLeft * (avgStation + MOVE_MINUTES) + FINALE_MINUTES);
    const row = el('div', 'rot-stat-row');
    const stat = (big: string, small: HTMLElement | string) => { const s = el('div', 'rot-stat'); s.append(el('b', '', big)); const sp = el('span'); sp.append(small); s.append(sp); return s; };
    const timeNote = el('span');
    const home = !!r.finish_at_home;
    timeNote.append(document.createTextNode(b.started_at
      ? `left in class · about ${needs} min of work still to do${home && needs > left ? ', the rest at home' : ''}${!home && needs > left ? ' · ' : ''}`
      : `planned ${plan.total} min${home && plan.home ? `: ${minutes} in class, ${plan.home} at home` : ` of ${minutes} min`} · not started`));
    if (b.started_at && !home && needs > left && b.behind_fallback !== 'none' && !b.fallback_on) {
      const fb = el('button', 'rot-link', ROTATION_FALLBACK_LABELS[b.behind_fallback].split(':')[0]!.toLowerCase());
      fb.type = 'button';
      fb.addEventListener('click', () => void run(() => o.api.fallback(true)));
      timeNote.append(fb);
    }
    if (b.fallback_on) {
      timeNote.append(document.createTextNode(` · fallback on (${ROTATION_FALLBACK_LABELS[b.behind_fallback].toLowerCase()}) `));
      const off = el('button', 'rot-link', 'undo');
      off.type = 'button';
      off.addEventListener('click', () => void run(() => o.api.fallback(false)));
      timeNote.append(off);
    }
    row.append(
      stat(b.started_at ? `${left} min` : '—', timeNote),
      stat(`${b.done_share}%`, 'stations done across the class'),
      stat(String(b.queue.length), 'in the help queue'),
      stat(String(b.groups.filter((g) => !g.called_at).length), 'groups waiting for you')
    );
    return row;
  }

  /** The room as tidy cards: learning stations in order, then the teacher station, each with a seat meter and who is there. */
  function roomMap(b: RotationBoard): HTMLElement {
    const grid = el('div', 'rot-room');
    grid.setAttribute('aria-label', 'Room');
    const learningIds = b.stations.filter((s) => s.kind !== 'teacher').map((s) => s.id);
    const ordered = [...b.stations.filter((s) => s.kind !== 'teacher'), ...b.stations.filter((s) => s.kind === 'teacher')];
    for (const s of ordered) {
      const teacher = s.kind === 'teacher';
      const n = learningIds.indexOf(s.id);
      const card = el('div', `rot-room__card${teacher ? ' rot-room__card--teacher' : ''}`);
      if (!teacher) card.dataset.hue = String(n % 6);
      const here = b.students.filter((st) => st.at === s.id);
      card.dataset.full = String(here.length >= s.seats);
      const top = el('div', 'rot-room__top');
      top.append(el('span', 'rot-room__badge', teacher ? 'T' : String(n + 1)));
      const head = el('div', 'rot-room__head');
      head.append(el('span', 'rot-room__kind', teacher ? 'Teacher station · you' : (ROTATION_KIND_INFO[s.kind as keyof typeof ROTATION_KIND_INFO]?.label ?? '')), el('b', 'rot-room__title', s.title));
      top.append(head);
      const count = el('span', 'rot-room__count');
      count.append(el('b', '', String(here.length)), document.createTextNode(` / ${s.seats}`));
      top.append(count);
      const seats = el('div', 'rot-room__seats');
      seats.setAttribute('aria-label', `${here.length} of ${s.seats} seats taken`);
      for (let k = 0; k < s.seats; k++) seats.append(el('i', k < here.length ? 'on' : ''));
      card.append(top, seats);
      const misses = b.gate_misses[s.id];
      if (misses) card.append(el('span', 'rot-room__flag', `${misses} gate miss${misses === 1 ? '' : 'es'}`));
      const names = el('div', 'rot-room__names');
      if (!here.length) names.append(el('span', 'rot-room__empty', teacher ? 'Nobody called yet' : 'Empty'));
      for (const st of here) {
        const d = el('span', `rot-room__name${st.stuck ? ' rot-room__name--stuck' : ''}`, st.name);
        d.title = st.stuck ? `${st.name} is stuck` : st.name;
        names.append(d);
      }
      card.append(names);
      grid.append(card);
    }
    return grid;
  }

  function coveragePanel(b: RotationBoard): HTMLElement {
    const kinds = ROTATION_KINDS.filter((k) => k !== 'teacher' && b.stations.some((s) => s.kind === k));
    const strands = [...new Set(b.stations.map((s) => s.strand).filter((s): s is string => !!s))];
    const t = el('table', 'rot-cover');
    const groups = el('tr', 'rot-cover__groups');
    groups.append(el('th', '', ''));
    if (kinds.length) { const th = el('th', 'rot-cover__group', 'What the station teaches'); th.colSpan = kinds.length; groups.append(th); }
    if (strands.length) { const th = el('th', 'rot-cover__group', 'English skill'); th.colSpan = strands.length; groups.append(th); }
    const head = el('tr');
    const which = (k: string) => b.stations.filter((s) => s.kind === k || s.strand === k).map((s) => s.title).join(', ');
    const th = (label: string, k: string) => { const c = el('th'); c.append(el('span', '', label), el('small', 'rot-cover__which', which(k))); return c; };
    head.append(el('th', '', 'Student'), ...kinds.map((k) => th(ROTATION_KIND_INFO[k].label, k)), ...strands.map((s) => th(s.charAt(0).toUpperCase() + s.slice(1), s)));
    const cols = el('colgroup');
    cols.append(el('col', 'rot-cover__name'), ...[...kinds, ...strands].map(() => el('col')));
    t.append(cols, groups, head);
    for (const st of b.students) {
      const tr = el('tr');
      tr.append(el('td', '', st.name));
      const doneKinds = new Set(st.done.map((id) => b.stations.find((s) => s.id === id)?.kind));
      const doneStrands = new Set(st.done.map((id) => b.stations.find((s) => s.id === id)?.strand));
      for (const k of kinds) { const td = el('td'); const tick = el('span', `rot-tick${doneKinds.has(k) ? ' on' : ''}`); tick.setAttribute('aria-label', doneKinds.has(k) ? 'covered' : 'not yet'); td.append(tick); tr.append(td); }
      for (const s of strands) { const td = el('td'); const tick = el('span', `rot-tick${doneStrands.has(s) ? ' on' : ''}`); tick.setAttribute('aria-label', doneStrands.has(s) ? 'covered' : 'not yet'); td.append(tick); tr.append(td); }
      t.append(tr);
    }
    const key = el('p', 'rot-note', 'A green tick means the student has finished a station of that kind. The station names sit under each heading.');
    return panel('Coverage', key, t);
  }

  function groupsPanel(b: RotationBoard): HTMLElement {
    const box = el('div', 'rot-grid');
    box.style.gap = '8px';
    const teacher = b.stations.find((s) => s.kind === 'teacher');
    if (!b.groups.length) box.append(el('p', 'rot-note', 'No groups yet. They form from the pretest’s misconception questions and from students flagged at a gate.'));
    b.groups.forEach((g, i) => {
      const card = el('div', `rot-group${i === 0 ? '' : ' rot-group--next'}`);
      const top = el('div', 'rot-row');
      top.append(el('b', '', `Group ${String.fromCharCode(65 + i)} · ${g.title}`), el('span', `rot-chip ${g.called_at ? 'rot-chip--warn' : ''}`, g.called_at ? `called ${minsSince(g.called_at, now())} min ago` : i === 0 ? 'now' : 'next'));
      card.append(top);
      const ul = el('ul');
      for (const m of g.members) {
        const li = el('li');
        li.append(el('span', '', `${m.name}${m.missed.length ? `: missed pretest Q${m.missed.join(', Q')}` : ''}${m.flagged ? `${m.missed.length ? ' ·' : ':'} flagged at the gate` : ''} `));
        const tick = g.ticks[m.student_id];
        const got = btn(tick === 'got_it' ? '✓ Got it' : 'Got it', () => void run(() => o.api.tick(g.id, m.student_id, 'got_it')));
        got.setAttribute('aria-pressed', String(tick === 'got_it'));
        const more = btn(tick === 'needs_more' ? '✓ Needs more' : 'Needs more', () => void run(() => o.api.tick(g.id, m.student_id, 'needs_more')));
        more.setAttribute('aria-pressed', String(tick === 'needs_more'));
        li.append(got, document.createTextNode(' '), more);
        ul.append(li);
      }
      card.append(ul);
      for (const q of g.questions) card.append(el('p', 'rot-small', `Q${q.n}: ${q.prompt}`));
      if (teacher?.script) card.append(el('p', 'rot-small', `Script: ${teacher.script}`));
      const actions = el('div', 'rot-row');
      if (g.called_at) actions.append(btn('Done with this group', () => void run(() => o.api.groupDone(g.id))));
      else actions.append(btn(`Call group ${String.fromCharCode(65 + i)}`, () => void run(() => o.api.callGroup(g.id)), 'rot-btn rot-btn--small rot-btn--primary'));
      card.append(actions);
      box.append(card);
    });
    return panel(teacher?.title || 'Teacher station', box);
  }

  function queuePanel(b: RotationBoard): HTMLElement {
    const q = el('div', 'rot-queue');
    if (!b.queue.length) q.append(el('p', 'rot-note', 'No hands up.'));
    for (const h of b.queue) {
      const row = el('div', 'rot-q');
      row.append(el('span', '', `${h.name} · ${stationTitle(h.station)} · ${minsSince(h.at, now())} min`), btn('Going', () => void run(() => o.api.going(h.student_id))));
      q.append(row);
    }
    return panel('Help queue', q);
  }

  function heatPanel(b: RotationBoard): HTMLElement {
    const t = el('table', 'rot-heat');
    const head = el('tr');
    head.append(el('th', '', ''), ...ROTATION_LEVELS.map((l) => el('th', '', ROTATION_LEVEL_LABELS[l])));
    t.append(head);
    let hottest: { title: string; level: string; n: number } | null = null;
    for (const s of b.stations.filter((x) => x.kind !== 'teacher')) {
      const tr = el('tr');
      tr.append(el('th', '', s.title));
      for (const l of ROTATION_LEVELS) {
        const n = b.heat[s.id]?.[l] ?? 0;
        const td = el('td', '', String(n));
        td.style.background = n ? `rgba(246, 134, 32, ${Math.min(0.15 + n * 0.08, 0.75)})` : 'var(--paper)';
        tr.append(td);
        if (n > (hottest?.n ?? 2)) hottest = { title: s.title, level: ROTATION_LEVEL_LABELS[l], n };
      }
      t.append(tr);
    }
    const p = panel('Hints opened', t);
    if (hottest) p.append(el('p', 'rot-note', `${hottest.title} at ${hottest.level} is running hot. It may be pitched too high.`));
    const misses = Object.entries(b.gate_misses).filter(([, n]) => n > 0);
    if (misses.length) p.append(el('p', 'rot-note', `Gate misses: ${misses.map(([id, n]) => `${stationTitle(id)} ${n}`).join(' · ')}`));
    return p;
  }

  function writingPanel(b: RotationBoard): HTMLElement | null {
    if (!b.writing.length) return null;
    const box = el('div', 'rot-grid');
    box.style.gap = '8px';
    for (const w of b.writing) {
      const card = el('div', 'rot-wq');
      card.append(el('b', '', `${w.name} · ${stationTitle(w.station)}${w.appeal ? ' · appeal' : ''}`));
      w.attempts.forEach((a, i) => {
        card.append(el('p', 'rot-small rot-muted', `Check ${i + 1} · ${a.outcome === 'passed' ? 'passed' : a.outcome === 'teacher' ? 'sent to you' : 'not yet'}${a.flagged_text ? ' · the text talked to the checker, so it came straight to you' : ''}`));
        const pre = el('pre', '', a.text);
        card.append(pre);
        for (const [pi, p] of a.points.entries()) {
          card.append(el('p', 'rot-small', `Point ${pi + 1}: ${p.checks.map((c) => `${c.ok === true ? '✓' : c.ok === false ? '✗' : '?'} ${WRITTEN_CHECK_LABELS[c.check]}`).join(' · ')}`));
        }
        if (a.feedback.length) card.append(el('p', 'rot-small', `Told: ${a.feedback.join(' ')}`));
      });
      const row = el('div', 'rot-row');
      row.append(btn('Pass', () => void run(() => o.api.decide(w.student_id, w.station, 'pass')), 'rot-btn rot-btn--small rot-btn--primary'), btn('Keep closed', () => void run(() => o.api.decide(w.student_id, w.station, 'keep'))));
      card.append(row, el('p', 'rot-note', 'Your decision wins over the checker. Keep closed gives the student their checks back.'));
      box.append(card);
    }
    return panel('Written gates to look at', box);
  }

  function openGatePanel(b: RotationBoard): HTMLElement {
    const row = el('div', 'rot-grid');
    row.style.gap = '6px';
    const sel = (items: Array<[string, string]>, value: string, aria: string, onPick: (v: string) => void) => {
      const s = el('select', 'rot-input');
      s.setAttribute('aria-label', aria);
      for (const [v, t] of items) { const op = el('option', '', t); op.value = v; op.selected = v === value; s.append(op); }
      s.addEventListener('change', () => onPick(s.value));
      return s;
    };
    row.append(
      sel([['', 'Pick a student'], ...b.students.map((s): [string, string] => [s.id, s.name])], openPick.student, 'Student', (v) => { openPick.student = v; }),
      sel([['', 'Pick a station'], ...b.stations.filter((s) => s.kind !== 'teacher').map((s): [string, string] => [s.id, s.title])], openPick.station, 'Station', (v) => { openPick.station = v; }),
      btn('Open gate', () => {
        if (!openPick.student || !openPick.station) { err.textContent = 'Pick a student and a station.'; return; }
        const pick = { ...openPick };
        void run(() => o.api.openGate(pick.student, pick.station));
      })
    );
    return panel('Open a gate for one student', row, el('p', 'rot-note', 'Gates are practice only. Opening one writes nothing to the markbook.'));
  }

  function paint(): void {
    if (!board) return;
    const b = board;
    const scroll = window.scrollY;
    status.textContent = `Updated ${new Date(now()).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`;
    const main = el('div', 'rot-grid');
    const room = el('div', 'rot-grid');
    room.style.gap = '6px';
    room.append(el('h3', '', 'Room'), roomMap(b), el('p', 'rot-note', 'Red names are stuck: three hints and no exit check, a gate miss, or a hand up.'));
    main.append(room, heatPanel(b), coveragePanel(b));
    const writing = writingPanel(b);
    if (writing) main.append(writing);
    const side = el('aside', 'rot-grid');
    side.append(groupsPanel(b), queuePanel(b), openGatePanel(b));
    const grid = el('div', 'rot-grid rot-grid--side');
    grid.append(main, side);
    body.replaceChildren(summary(b), grid);
    // A live update never jumps the page.
    if (window.scrollY !== scroll) window.scrollTo?.({ top: scroll });
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    await run(() => o.api.board());
  }
  poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, o.pollMs ?? 10000);

  return { root, refresh, dispose() { disposed = true; window.clearInterval(poll); root.remove(); } };
}
