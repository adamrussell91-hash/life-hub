import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { renderPublishedLessonHero } from '@/student/lesson-view';
import { mountCasePlayer } from './player';
import { casePracticeApi, type CasePracticeApi, type CasePracticeClass, type CasePracticeState, type CaseClient } from './api';
import { CASE_STATIONS, CASE_STATION_LABELS } from './schema';
import '@/sprint/sprint.css';

export type CaseMove = { label: string; action: 'open' | 'release_part' | 'reveal'; station?: number };

const stationLabel = (i: number) => CASE_STATION_LABELS[CASE_STATIONS[i]!];

/**
 * What the practice run waits on the teacher for, in the order a real lesson meets it. Pure.
 * Own pace: nothing; the student's own Next buttons move the case on.
 */
export function caseMoves(c: CasePracticeClass, layered: boolean): { text: string; moves: CaseMove[] } {
  if (c.pace === 'own') return { text: 'This case runs at the student’s own pace, so the student’s Next buttons move it on. Nothing waits on you.', moves: [] };
  const open = CASE_STATIONS.slice(0, c.open_to + 1).map((_, i) => stationLabel(i)).join(', ');
  const moves: CaseMove[] = [];
  if (layered && c.open_to >= 1 && c.parts_open < c.parts_total) moves.push({ label: `Release part ${c.parts_open + 1}`, action: 'release_part' });
  if (c.open_to >= 3 && !c.outcome_revealed) moves.push({ label: 'Reveal the Outcome', action: 'reveal' });
  else if (c.open_to < c.last) moves.push({ label: `Open ${stationLabel(c.open_to + 1)}`, action: 'open', station: c.open_to + 1 });
  const text = moves.length
    ? `Open now: ${open}. In class you press these on the case board when the room is ready.`
    : `Everything is open: ${open}. Finish the case as the student.`;
  return { text, moves };
}

/** The practice run, over the lesson page: the student's screen on a private copy of the case, and the class moves. */
export function openCasePractice(o: { getLesson: () => Lesson; api?: CasePracticeApi }): { close(): void } {
  const lesson = o.getLesson();
  const api = o.api ?? casePracticeApi(lesson.id);
  const root = el('div', 'spractice cpractice');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Try it as a student');
  const bar = el('header', 'spractice__bar');
  const moveHost = el('div', 'spractice__move');
  const playerHost = el('section', 'cpractice__student');
  const error = el('p', 'sprint-submit__err');
  error.setAttribute('role', 'alert');
  root.append(bar, error, moveHost, playerHost);
  document.body.append(root);
  document.body.classList.add('spractice-open');

  let state: CasePracticeState | null = null;
  let player: { dispose(): void; refresh(): Promise<void> } | null = null;

  const run = async (p: Promise<CasePracticeState>, remount = false) => {
    try {
      state = await p;
      error.textContent = '';
      if (remount || !player) mount();
      else void player.refresh();
      paint();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'That didn’t work.';
    }
  };

  /** Keeps the class card in step with what the student does (a lock, a finished part). */
  const watched = (client: CaseClient): CaseClient => {
    const after = <T>(p: Promise<T>) => p.finally(() => void api.state().then((s) => { state = s; paint(); }).catch(() => {}));
    return { ...client, save: (i) => after(client.save(i)), nextPart: () => after(client.nextPart()), advance: () => after(client.advance()), lock: (i) => after(client.lock(i)) };
  };

  function mount(): void {
    if (!state) return;
    player?.dispose();
    playerHost.replaceChildren();
    const shown = state.lesson;
    player = mountCasePlayer(playerHost, {
      lesson: shown,
      classId: 'practice',
      client: watched(api.client),
      // The banner keeps the real lesson's look; the page underneath runs on the practice copy.
      renderHero: (h) => { renderPublishedLessonHero(h, { ...shown, lesson_id: lesson.id }); }
    });
  }

  function paint(): void {
    if (!state) return;
    const s = state;
    bar.replaceChildren(
      el('strong', 'spractice__title', 'Try it as a student'),
      el('span', 'spractice__time', 'A private copy. Your class, the case board and the real case see nothing.'),
      button('Start over', 'secondary', () => void run(api.start(o.getLesson()), true)),
      button('Exit', 'ghost', close)
    );
    const { text, moves } = caseMoves(s.class, s.lesson.case?.release === 'layered');
    const card = el('div', 'spractice__card');
    card.append(el('b', '', 'Your move'), el('p', '', text));
    if (moves.length) {
      const row = el('div', 'cpractice__moves');
      moves.forEach((m, i) => row.append(button(m.label, i === 0 ? 'primary' : 'secondary', () => void run(api.move(m.action, m.station)))));
      card.append(row);
    }
    moveHost.replaceChildren(card);
  }

  function close(): void {
    player?.dispose();
    root.remove();
    document.body.classList.remove('spractice-open');
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) close(); };
  document.addEventListener('keydown', onKey);

  // Carry on the last run if the case hasn't changed; otherwise start one from the case as it is now.
  bar.append(el('strong', 'spractice__title', 'Try it as a student'), button('Exit', 'ghost', close));
  void run(api.open(lesson), true);
  return { close };
}
