import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { mountSprintPlayer } from './player';
import { mountSprintMap, type SprintMapHandle } from './map';
import { phaseSpans, renderPhaseGantt, whenText } from './phase-timeline';
import { sprintPracticeApi, type PracticeApi, type PracticeState, type SprintClient, type SprintSummary } from './api';
import { PHASE_LABELS, type SprintPhaseKey } from './schema';
import './forms';
import './sprint.css';

export type YourMove = { text: string; when: string; action?: { label: string; kind: 'end_class'; phase: SprintPhaseKey } | { label: string; kind: 'board'; group: string } | { label: string; kind: 'pitch' } };

/**
 * What the practice run is waiting on the teacher for, if anything. Pure.
 * One move at a time, in the order a real lesson meets them.
 */
export function yourMove(summary: SprintSummary, phases: ReadonlyArray<{ key: SprintPhaseKey; where: 'class' | 'home' }>, lockHours: number, now: number): YourMove {
  const g = summary.groups[0];
  if (!g) return { text: 'There’s no practice group.', when: '' };
  if (summary.lock && Date.parse(summary.lock.until) > now) {
    return { text: `Class work is locked until ${whenText(Date.parse(summary.lock.until))}. Students see a countdown.`, when: 'Skip ahead to lift the lock.' };
  }
  if (g.awaiting) {
    const what = g.awaiting.kind === 'question' ? 'question' : 'idea';
    return {
      text: g.awaiting.tie ? `The vote tied. Choose the group’s ${what}.` : `The group is waiting for you to confirm its ${what}.`,
      when: 'In a real lesson you do this from the group’s board, as soon as the badge shows on the map.',
      action: { label: `Choose the ${what}`, kind: 'board', group: g.id }
    };
  }
  const key = g.open.at(-1);
  const p = phases.find((x) => x.key === key);
  if (key && p?.where === 'class' && summary.class_parts[key] === 'open') {
    return {
      text: `${PHASE_LABELS[key]} is a class phase. When the lesson ends, press End class part: work is saved and handed in, then locks for ${lockHours} h.`,
      when: 'In a real lesson you press it when the bell goes, or set a lesson end time in the Kit.',
      action: { label: 'End class part', kind: 'end_class', phase: key }
    };
  }
  if (key === 'test') {
    return {
      text: 'Pitch day. Run the pitch, then open, close and release the feedback round.',
      when: 'In a real lesson you run each group’s pitch on the projector.',
      action: { label: 'Run pitches', kind: 'pitch' }
    };
  }
  return { text: 'Nothing waits on you. Work as each student, then skip ahead.', when: '' };
}

/** The practice run, over the lesson page: controls, Gantt, your move, two students, your map. */
export function openPracticeRun(o: { getLesson: () => Lesson; api?: PracticeApi }): { close(): void } {
  const lesson = o.getLesson();
  const api = o.api ?? sprintPracticeApi(lesson.id);
  const root = el('div', 'spractice');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Practice run');
  const bar = el('header', 'spractice__bar');
  const ganttHost = el('div', 'spractice__gantt');
  const moveHost = el('div', 'spractice__move');
  const tabs = el('div', 'hub-pills spractice__tabs');
  const pair = el('div', 'spractice__pair');
  const mapHost = el('div', 'spractice__map');
  const error = el('p', 'sprint-submit__err');
  error.setAttribute('role', 'alert');
  root.append(bar, error, ganttHost, moveHost, tabs, pair, mapHost);
  document.body.append(root);
  document.body.classList.add('spractice-open');

  let state: PracticeState | null = null;
  let players: Array<{ dispose(): void }> = [];
  let map: SprintMapHandle | null = null;
  let shown: 's1' | 's2' = 's1';
  const now = () => state?.now ?? Date.now();

  const run = async (p: Promise<PracticeState>, remount = false) => {
    try {
      state = await p;
      error.textContent = '';
      if (remount) mount();
      paint();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'That didn’t work.';
    }
  };

  /** A student's client that refreshes the Gantt, your move and the map after anything they send. */
  function watched(client: SprintClient): SprintClient {
    const after = <T>(p: Promise<T>) => p.finally(() => { void run(api.state()); void map?.refresh(); });
    return {
      ...client,
      save: (phase, payload) => after(client.save(phase, payload)),
      submit: (phase, payload) => after(client.submit(phase, payload)),
      parts: (parts) => after(client.parts(parts)),
      claimPart: (id) => after(client.claimPart(id)),
      assign: (id, keys) => after(client.assign(id, keys)),
      setAssembler: (key) => after(client.setAssembler(key)),
      pitch: (source) => after(client.pitch(source)),
      feedback: (g, e) => after(client.feedback(g, e))
    };
  }

  function mount(): void {
    if (!state) return;
    for (const p of players) p.dispose();
    map?.dispose();
    pair.replaceChildren();
    players = (['s1', 's2'] as const).map((as, i) => {
      const host = el('section', 'spractice__student');
      host.dataset.as = as;
      pair.append(host);
      return mountSprintPlayer(host, {
        lesson: state!.lesson,
        classId: 'practice',
        client: watched(api.client(as)),
        now,
        practice: { name: `Student ${i + 1}` },
        renderHero: (h) => h.replaceChildren(el('h2', 'spractice__who', `Student ${i + 1}`))
      });
    });
    map = mountSprintMap({ getLesson: o.getLesson, api: api.teacher(() => void run(api.state())), emitLesson: () => {}, now, practice: true });
    mapHost.replaceChildren(el('h2', '', 'Your progress map'), map.root);
    void map.refresh();
  }

  function paint(): void {
    if (!state) return;
    const s = state;
    bar.replaceChildren(
      el('strong', 'spractice__title', 'Practice run'),
      el('span', 'spractice__time', `Practice time: ${whenText(s.now)}`),
      s.next ? button(`Skip to: ${s.next.label}`, 'primary', () => void run(api.skip(), true)) : el('span', 'spractice__done', 'Nothing else changes on its own. The run is finished.'),
      button('Start over', 'secondary', () => void run(api.start(o.getLesson()), true)),
      button('Exit', 'ghost', close)
    );
    const sprint = s.lesson.sprint!;
    ganttHost.replaceChildren(renderPhaseGantt(phaseSpans(sprint.phases, sprint.lock_hours, s.summary.ended), { now: s.now }));
    const move = yourMove(s.summary, sprint.phases, sprint.lock_hours, s.now);
    const card = el('div', 'spractice__card');
    card.append(el('b', '', 'Your move'), el('p', '', move.text));
    if (move.when) card.append(el('p', 'kit-why', move.when));
    const a = move.action;
    if (a) {
      card.append(button(a.label, 'primary', () => {
        if (a.kind === 'end_class') void run(api.teacher(() => {}).endClass(a.phase).then(() => api.state()), true);
        else if (a.kind === 'board') { map?.openBoard(a.group); mapHost.scrollIntoView({ behavior: 'smooth' }); }
        else [...mapHost.querySelectorAll<HTMLButtonElement>('.smap__head button')].find((b) => b.textContent === 'Run pitches')?.click();
      }));
    }
    moveHost.replaceChildren(card);
    tabs.replaceChildren(...(['s1', 's2'] as const).map((as, i) => {
      const t = el('button', `hub-pills__btn${shown === as ? ' is-active' : ''}`, `Student ${i + 1}`);
      t.type = 'button';
      t.setAttribute('aria-pressed', String(shown === as));
      t.addEventListener('click', () => { shown = as; paint(); });
      return t;
    }));
    pair.dataset.shown = shown;
  }

  function close(): void {
    for (const p of players) p.dispose();
    map?.dispose();
    root.remove();
    document.body.classList.remove('spractice-open');
  }

  // Carry on a run already going; otherwise start one from the Kit as it is now.
  void (async () => {
    try {
      state = await api.state();
    } catch {
      try { state = await api.start(lesson); } catch (e) { error.textContent = e instanceof Error ? e.message : 'The practice run didn’t start.'; return; }
    }
    mount();
    paint();
  })();
  return { close };
}
