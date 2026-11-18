import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLessonFooter, type FooterCalls } from '@/student/lesson-footer';
import type { LessonQuizHandle } from '@/quiz/student-quiz';
import type { WorkSyncHandle } from '@/student/work-sync';

const QUESTIONS = [
  { id: 'clear_task', prompt: 'Did you know what you were meant to be doing?', options: ['All the way through', 'Mostly', 'Some of the time', 'Hardly at all'] },
  { id: 'checked', prompt: 'Did the lesson check whether you’d got it before moving on?', options: ['Yes, more than once', 'Once', 'Not that I noticed'] }
];

function fakeCalls(opts: { need?: 'initials' | null; ticked?: boolean; ask?: unknown } = {}) {
  const log: Array<[string, string, Record<string, unknown>]> = [];
  const calls: FooterCalls = {
    profile: vi.fn(async (action, extra = {}) => {
      log.push(['profile', action, extra]);
      if (action === 'status') return { need: opts.need ?? null, ticked: opts.ticked ?? false };
      return { need: null, initials: 'BB' };
    }),
    questions: vi.fn(async (action, extra = {}) => {
      log.push(['questions', action, extra]);
      if (action === 'ask') return (opts.ask ?? { questions: QUESTIONS, unclear: 'Anything from this lesson still unclear?' }) as never;
      return { given: true };
    })
  };
  return { calls, log };
}

function fakeQuiz(handIn = true): LessonQuizHandle & { handIn: ReturnType<typeof vi.fn> } {
  return {
    progress: () => ({ open: true, answered: 6, total: 7, blank: [{ prompt: 'Explain the council’s decision', marks: 3 }] }),
    handIn: vi.fn(async () => handIn)
  };
}
const fakeWork = (): WorkSyncHandle => ({ dispose() {}, flush: async () => {}, progress: () => ({ written: 6, toHandIn: 1 }), handInAll: vi.fn(async () => true) });

const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };
function mountHandle(calls: FooterCalls, quiz: LessonQuizHandle | null = fakeQuiz(), work: WorkSyncHandle | null = fakeWork()) {
  const footer = mountLessonFooter({ lessonId: 'lesson1', classId: 'class1', prev: { href: '/s/classes/class1/lessons/l0', title: 'Reading the sources' }, next: null, calls, quiz: () => quiz, work: () => work });
  document.body.append(footer.element);
  return footer;
}
const mount = (calls: FooterCalls, quiz?: LessonQuizHandle | null, work?: WorkSyncHandle | null) => mountHandle(calls, quiz, work).element;
const finish = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.lf__finish')!;
const card = (root: HTMLElement) => root.querySelector<HTMLElement>('.lf__card')!;
const isDone = (root: HTMLElement) => card(root).classList.contains('is-done');
const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;
const buttonNamed = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

afterEach(() => document.body.replaceChildren());

describe('lesson footer', () => {
  it('is one card with a Finish lesson button that says what it does, and the lesson links under it', async () => {
    const { calls } = fakeCalls();
    const root = mount(calls);
    await flush();
    expect(q(root, 'a.lf__link--prev').textContent).toBe('← Previous lessonReading the sources');
    expect(root.querySelector('a.lf__link--next')).toBeNull();
    expect(finish(root).textContent).toBe('Finish lesson');
    expect(finish(root).closest('.lf__card')).toBe(card(root));
    expect(q(root, '.lf__row').closest('.lf__card')).toBeNull();
    expect(isDone(root)).toBe(false);
    // No list of parts on this lesson: a plain title, and nothing about parts.
    expect(q(root, '.lf__name').textContent).toBe('End of lesson');
    expect(q(root, '.lf__parts').hidden).toBe(true);
    expect(q(root, '.lf__kicker').hidden).toBe(true);
    expect(q(root, '.lf__count').hidden).toBe(true);
    expect(q(root, '.lf__left').textContent).toBe('');
    expect(q(root, '.lf__undo').hidden).toBe(true);
  });

  it('on a quiz has no Finish lesson button: handing the quiz in marks it done', async () => {
    const { calls, log } = fakeCalls();
    const footer = mountLessonFooter({ lessonId: 'lesson1', classId: 'class1', prev: { href: '/s/classes/class1/lessons/l0', title: 'Reading the sources' }, next: null, finish: false, calls });
    await flush();
    expect(footer.element.querySelector('.lf__finish')).toBeNull();
    expect(footer.element.querySelector('a.lf__link--prev')).not.toBeNull();
    // Nothing to put in a card: just the lesson links.
    expect(footer.element.querySelector('.lf__card')).toBeNull();
    expect(log).toEqual([]);
  });

  it('on a quiz the card holds only what it is handed', async () => {
    const { calls } = fakeCalls();
    const beside = document.createElement('section');
    beside.className = 'wn-card';
    const footer = mountLessonFooter({ lessonId: 'lesson1', classId: 'class1', next: { href: '/s/classes/class1/lessons/l2', title: 'The verdict' }, finish: false, calls, beside });
    await flush();
    const c = card(footer.element);
    expect(c.classList.contains('is-bare')).toBe(true);
    expect(c.contains(beside)).toBe(true);
    expect(q(footer.element, '.lf__head').hidden).toBe(true);
    expect(q(footer.element, '.lf__go').hidden).toBe(true);
    expect(q(footer.element, 'a.lf__link--next').textContent).toBe('Next lesson →The verdict');
  });

  it('shows the parts count, a bar and what is left once the list reports in', async () => {
    const { calls } = fakeCalls();
    const footer = mountHandle(calls);
    const root = footer.element;
    await flush();
    footer.setParts(2, 4);
    expect(q(root, '.lf__kicker').hidden).toBe(false);
    expect(q(root, '.lf__name').textContent).toBe('Before you finish');
    expect(q(root, '.lf__count').textContent).toBe('2 of 4 parts done');
    expect(q(root, '.lf__bar i').style.width).toBe('50%');
    expect(q(root, '.lf__parts').hidden).toBe(false);
    expect(footer.partsSlot).toBe(q(root, '.lf__parts'));
    expect(footer.card).toBe(card(root));
    expect(q(root, '.lf__left').textContent).toBe('2 parts aren’t ticked. You can still finish.');
    footer.setParts(3, 4);
    expect(q(root, '.lf__left').textContent).toBe('1 part isn’t ticked. You can still finish.');
    footer.setParts(4, 4);
    expect(q(root, '.lf__left').textContent).toBe('All parts ticked.');
    expect(q(root, '.lf__bar i').style.width).toBe('100%');
  });

  it('checks what’s left, hands everything in, asks two questions and the box, then says completed', async () => {
    const { calls, log } = fakeCalls();
    const quiz = fakeQuiz();
    const work = fakeWork();
    const root = mount(calls, quiz, work);
    await flush();
    finish(root).click();
    const panel = root.querySelector<HTMLElement>('.lf__panel')!;
    expect(panel.hidden).toBe(false);
    // The check takes the Finish lesson row's place, so there is one main button.
    expect(q(root, '.lf__go').hidden).toBe(true);
    expect(card(root).classList.contains('has-panel')).toBe(true);
    expect(panel.querySelector('.lf__heading')?.textContent).toBe('Hand in and finish?');
    expect(panel.textContent).toContain('Quiz: 6 of 7 answered');
    expect(panel.textContent).toContain('Left blank: “Explain the council’s decision” (3 marks)');
    expect(panel.textContent).toContain('Written work: 6 answers, 1 to hand in');

    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    expect(quiz.handIn).toHaveBeenCalledOnce();
    expect(work.handInAll).toHaveBeenCalledOnce();
    expect(log.find(([, a]) => a === 'done')?.[2]).toEqual({ lesson_id: 'lesson1', quick: true });

    expect(panel.querySelector('legend')?.textContent).toBe(QUESTIONS[0]!.prompt);
    // Not "completed" until the questions are out of the way.
    expect(isDone(root)).toBe(false);
    expect(q(root, '.lf__go').hidden).toBe(true);
    expect([...panel.querySelectorAll('.lf__chip')].map((c) => c.textContent)).toEqual(QUESTIONS[0]!.options);
    panel.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click();
    expect(panel.querySelector('legend')?.textContent).toBe(QUESTIONS[1]!.prompt);
    panel.querySelectorAll<HTMLInputElement>('input[type=radio]')[2]!.click();
    const box = panel.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(panel.textContent).toContain('Anything from this lesson still unclear? (optional)');
    box.value = ' what counts as corroboration ';
    buttonNamed(root, 'Done').click();
    await flush();
    expect(log.find(([w, a]) => w === 'questions' && a === 'send')?.[2]).toEqual({ answers: { clear_task: 1, checked: 2 }, unclear: 'what counts as corroboration' });
    expect(panel.hidden).toBe(true);
    expect(isDone(root)).toBe(true);
    expect(card(root).classList.contains('has-panel')).toBe(false);
    expect(q(root, '.lf__name').textContent).toBe('Lesson completed');
    expect(q(root, '.lf__status').textContent).toBe('Lesson completed');
    expect(q(root, '.lf__go').hidden).toBe(true);
    expect(q(root, '.lf__undo').hidden).toBe(false);
    expect(document.activeElement).toBe(q(root, '.lf__name'));
  });

  it('once finished, tucks the parts behind Show parts', async () => {
    const { calls } = fakeCalls({ ticked: true });
    const footer = mountHandle(calls);
    const root = footer.element;
    footer.setParts(2, 4);
    await flush();
    expect(isDone(root)).toBe(true);
    expect(q(root, '.lf__parts').hidden).toBe(true);
    expect(q(root, '.lf__sub').textContent).toBe('2 of 4 parts ticked · Show parts');
    const show = q<HTMLButtonElement>(root, '.lf__show');
    expect(show.getAttribute('aria-expanded')).toBe('false');
    show.click();
    expect(q(root, '.lf__parts').hidden).toBe(false);
    expect(show.textContent).toBe('Hide parts');
    expect(show.getAttribute('aria-expanded')).toBe('true');
    show.click();
    expect(q(root, '.lf__parts').hidden).toBe(true);
  });

  it('Keep working closes the check and brings the Finish lesson button back', async () => {
    const { calls, log } = fakeCalls();
    const root = mount(calls);
    await flush();
    finish(root).click();
    buttonNamed(root, 'Keep working').click();
    expect(q(root, '.lf__panel').hidden).toBe(true);
    expect(q(root, '.lf__go').hidden).toBe(false);
    expect(document.activeElement).toBe(finish(root));
    expect(log.some(([, a]) => a === 'done')).toBe(false);
  });

  it('skip sends what was answered so far and still finishes', async () => {
    const { calls, log } = fakeCalls();
    const root = mount(calls);
    await flush();
    finish(root).click();
    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    buttonNamed(root, 'Skip').click();
    await flush();
    expect(log.find(([w, a]) => w === 'questions' && a === 'send')?.[2]).toEqual({ answers: {} });
    expect(isDone(root)).toBe(true);
  });

  it('finishes straight away when the lesson asks no questions or this device already answered', async () => {
    for (const ask of [{ off: true }, { given: true }]) {
      const { calls, log } = fakeCalls({ ask });
      const root = mount(calls);
      await flush();
      finish(root).click();
      buttonNamed(root, 'Hand in and finish').click();
      await flush();
      expect(root.querySelector<HTMLElement>('.lf__panel')!.hidden).toBe(true);
      expect(isDone(root)).toBe(true);
      expect(log.some(([w, a]) => w === 'questions' && a === 'send')).toBe(false);
      document.body.replaceChildren();
    }
  });

  it('asks for initials on a new device and claims them first', async () => {
    const { calls, log } = fakeCalls({ need: 'initials' });
    const root = mount(calls, null, null);
    await flush();
    finish(root).click();
    const input = root.querySelector<HTMLInputElement>('.lf__initials')!;
    expect(root.querySelector('.lf__panel')!.textContent).toContain('Nothing left to hand in.');
    input.value = 'bb';
    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    const actions = log.filter(([w]) => w === 'profile').map(([, a]) => a);
    expect(actions.indexOf('claim')).toBeLessThan(actions.indexOf('done'));
  });

  it('keeps the lesson unfinished and says so when the quiz doesn’t hand in', async () => {
    const { calls, log } = fakeCalls();
    const root = mount(calls, fakeQuiz(false));
    await flush();
    finish(root).click();
    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    expect(root.querySelector('.lf__error')?.textContent).toContain('Your quiz didn’t hand in');
    expect(log.some(([, a]) => a === 'done')).toBe(false);
    expect(isDone(root)).toBe(false);
  });

  it('can be unticked; what was handed in stays', async () => {
    const { calls, log } = fakeCalls({ ticked: true });
    const root = mount(calls);
    await flush();
    expect(isDone(root)).toBe(true);
    expect(q(root, '.lf__undo').textContent).toBe('Finished by mistake? Untick this lesson');
    q<HTMLButtonElement>(root, '.lf__untick').click();
    expect(root.querySelector('.lf__panel')!.textContent).toContain('Your quiz and written work stay handed in.');
    // Asking doesn't undo anything: the card still says completed.
    expect(isDone(root)).toBe(true);
    expect(q(root, '.lf__undo').hidden).toBe(true);
    buttonNamed(root, 'Untick').click();
    await flush();
    expect(log.find(([, a]) => a === 'undone')?.[2]).toEqual({ lesson_id: 'lesson1', quick: true });
    expect(isDone(root)).toBe(false);
    expect(q(root, '.lf__go').hidden).toBe(false);
    expect(document.activeElement).toBe(finish(root));
  });
});
