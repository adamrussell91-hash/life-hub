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
function mount(calls: FooterCalls, quiz: LessonQuizHandle | null = fakeQuiz(), work: WorkSyncHandle | null = fakeWork()) {
  const footer = mountLessonFooter({ lessonId: 'lesson1', classId: 'class1', prev: { href: '/s/classes/class1/lessons/l0', title: 'Reading the sources' }, next: null, calls, quiz: () => quiz, work: () => work });
  document.body.append(footer.element);
  return footer.element;
}
const tick = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.lf__tick')!;
const buttonNamed = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

afterEach(() => document.body.replaceChildren());

describe('lesson footer', () => {
  it('shows previous and next with the old link classes, and the tick in between', async () => {
    const { calls } = fakeCalls();
    const root = mount(calls);
    await flush();
    expect(root.querySelector('a.lf__link--prev')?.textContent).toContain('Reading the sources');
    expect(root.querySelector('a.lf__link--next')).toBeNull();
    expect(tick(root).getAttribute('aria-pressed')).toBe('false');
  });

  it('on a quiz shows previous and next with no tick: handing the quiz in marks it done', async () => {
    const { calls, log } = fakeCalls();
    const footer = mountLessonFooter({ lessonId: 'lesson1', classId: 'class1', prev: { href: '/s/classes/class1/lessons/l0', title: 'Reading the sources' }, next: null, finish: false, calls });
    await flush();
    expect(footer.element.querySelector('.lf__tick')).toBeNull();
    expect(footer.element.querySelector('a.lf__link--prev')).not.toBeNull();
    expect(log).toEqual([]);
  });

  it('checks what’s left, hands everything in, asks two questions and the box, then says completed', async () => {
    const { calls, log } = fakeCalls();
    const quiz = fakeQuiz();
    const work = fakeWork();
    const root = mount(calls, quiz, work);
    await flush();
    tick(root).click();
    const panel = root.querySelector<HTMLElement>('.lf__panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Quiz: 6 of 7 answered');
    expect(panel.textContent).toContain('Left blank: “Explain the council’s decision” (3 marks)');
    expect(panel.textContent).toContain('Written work: 6 answers, 1 to hand in');

    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    expect(quiz.handIn).toHaveBeenCalledOnce();
    expect(work.handInAll).toHaveBeenCalledOnce();
    expect(log.find(([, a]) => a === 'done')?.[2]).toEqual({ lesson_id: 'lesson1', quick: true });

    expect(panel.querySelector('legend')?.textContent).toBe(QUESTIONS[0]!.prompt);
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
    expect(tick(root).getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.lf__status')?.textContent).toBe('Lesson completed ✓');
  });

  it('skip sends what was answered so far and still finishes', async () => {
    const { calls, log } = fakeCalls();
    const root = mount(calls);
    await flush();
    tick(root).click();
    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    buttonNamed(root, 'Skip').click();
    await flush();
    expect(log.find(([w, a]) => w === 'questions' && a === 'send')?.[2]).toEqual({ answers: {} });
    expect(tick(root).getAttribute('aria-pressed')).toBe('true');
  });

  it('finishes straight away when the lesson asks no questions or this device already answered', async () => {
    for (const ask of [{ off: true }, { given: true }]) {
      const { calls, log } = fakeCalls({ ask });
      const root = mount(calls);
      await flush();
      tick(root).click();
      buttonNamed(root, 'Hand in and finish').click();
      await flush();
      expect(root.querySelector<HTMLElement>('.lf__panel')!.hidden).toBe(true);
      expect(tick(root).getAttribute('aria-pressed')).toBe('true');
      expect(log.some(([w, a]) => w === 'questions' && a === 'send')).toBe(false);
      document.body.replaceChildren();
    }
  });

  it('asks for initials on a new device and claims them first', async () => {
    const { calls, log } = fakeCalls({ need: 'initials' });
    const root = mount(calls, null, null);
    await flush();
    tick(root).click();
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
    tick(root).click();
    buttonNamed(root, 'Hand in and finish').click();
    await flush();
    expect(root.querySelector('.lf__error')?.textContent).toContain('Your quiz didn’t hand in');
    expect(log.some(([, a]) => a === 'done')).toBe(false);
    expect(tick(root).getAttribute('aria-pressed')).toBe('false');
  });

  it('can be unticked; what was handed in stays', async () => {
    const { calls, log } = fakeCalls({ ticked: true });
    const root = mount(calls);
    await flush();
    expect(tick(root).getAttribute('aria-pressed')).toBe('true');
    tick(root).click();
    expect(root.querySelector('.lf__panel')!.textContent).toContain('Your quiz and written work stay handed in.');
    buttonNamed(root, 'Untick').click();
    await flush();
    expect(log.find(([, a]) => a === 'undone')?.[2]).toEqual({ lesson_id: 'lesson1', quick: true });
    expect(tick(root).getAttribute('aria-pressed')).toBe('false');
  });
});
