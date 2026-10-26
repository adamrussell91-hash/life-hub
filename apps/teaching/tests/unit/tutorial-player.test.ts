import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountTutorialPlayer } from '@/tutorial/player';
import type { TutorialClient, TutorialStatus } from '@/tutorial/api';
import type { Block } from '@/schemas/block';

vi.mock('@/quiz/student-quiz', () => ({ mountStudentQuiz: () => Object.assign(document.createElement('section'), { className: 'qz-quiz' }) }));

const b = (id: string, block_type: string, content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;
const lesson = { lesson_id: 'tut1', title: 'Structure', unit_id: 'u1', blocks: [b('c1', 'heading', { text: 'Common demo' })], published_at: '2026-10-23T00:00:00.000Z', schema_version: 1 as const, pedagogical_mode: 'tutorial' as const };
const withQuiz = { ...lesson, quiz: { version: 'v', question_count: 1, total_marks: 1 } as never };
const status = (over: Partial<TutorialStatus> = {}): TutorialStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'ga', goal: 'Today: the effect', blocks: [b('r1', 'heading', { text: 'Step' }), b('w1', 'with_teacher', { talking_points: [] }), b('r2', 'heading', { text: 'You do' })] },
  sitting: false, unlocked: false, shown: null, handups: [], ...over
});
const client = (s: TutorialStatus | (() => TutorialStatus)): TutorialClient => {
  const get = typeof s === 'function' ? s : () => s;
  return {
    status: vi.fn(async () => get()), claim: vi.fn(async () => get()), progress: vi.fn(async () => get()), answer: vi.fn(async () => get()),
    forPlayer: () => ({ status: async () => ({ identity: get().identity, handups: [] }), claim: async () => ({ identity: get().identity, handups: [] }), handup: async () => ({ identity: get().identity, handups: [] }), progress: () => {} })
  };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const setDone = (d: Record<string, boolean>) => localStorage.setItem('tutorial:tut1:done', JSON.stringify({ common: false, exit: false, ...d }));
const click = (host: HTMLElement, selector: string) => (host.querySelector(selector) as HTMLButtonElement).click();

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('tutorial player', () => {
  it('starts on the Common page, full width, with no group content or navigation pills', async () => {
    const host = document.createElement('div');
    const c = client(status());
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('Common demo');
    expect(host.textContent).not.toContain('Step');
    expect(host.textContent).not.toContain('Today: the effect');
    expect(host.querySelector('.lecture-stage, .lecture-strip, .tut-wait')).toBeNull();
    expect(c.progress).toHaveBeenLastCalledWith('common');
  });

  it('the next button moves to the group page: the whole tab, no With teacher marker, no hero', async () => {
    const host = document.createElement('div');
    const c = client(status());
    mountTutorialPlayer(host, { lesson, client: c, renderHero: (h) => h.append(document.createTextNode('Title')) });
    await flush();
    click(host, '.tut__next');
    expect(host.textContent).not.toContain('Common demo');
    expect(host.textContent).toContain('Step');
    expect(host.textContent).toContain('You do');
    expect(host.querySelector('.block-with-teacher')).toBeNull();
    expect((host.querySelector('.tut__hero') as HTMLElement).hidden).toBe(true);
    expect(c.progress).toHaveBeenLastCalledWith('waiting');
  });

  it('puts the exit check at the bottom of the group page, then finishes', async () => {
    setDone({ common: true });
    const host = document.createElement('div');
    const c = client(status());
    mountTutorialPlayer(host, { lesson: withQuiz, classId: 'class1', client: c, renderHero: () => {} });
    await flush();
    const page = host.querySelector('.tut__page')!;
    const quiz = host.querySelector('.qz-quiz')!;
    expect(page.compareDocumentPosition(quiz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    click(host, '.tut__next');
    expect(host.textContent).toContain('All done. Nice work.');
    expect(c.progress).toHaveBeenLastCalledWith('done');
  });

  it('with no common blocks or exit questions, goes straight to the group page and just ends', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson: { ...lesson, blocks: [] }, client: client(status()), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('Step');
    expect(host.querySelector('.qz-quiz')).toBeNull();
    expect(host.querySelector('.tut__next')?.textContent).toBe('I’m finished');
  });

  it('tells a student outside the groups, with nothing else', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ group: null, not_for_you: true })), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('This one isn’t for you today.');
    expect(host.querySelector('.tut__next')).toBeNull();
  });

  it('does not poll once the page is up', async () => {
    vi.useFakeTimers();
    const c = client(status());
    mountTutorialPlayer(document.createElement('div'), { lesson, client: c, renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30000);
    expect(c.status).toHaveBeenCalledTimes(1);
  });

  it('a check-in in flight at dispose does not repaint', async () => {
    let resolveLate: (v: TutorialStatus) => void = () => {};
    const c = client(status());
    (c.status as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<TutorialStatus>((r) => { resolveLate = r; }));
    const host = document.createElement('div');
    const handle = mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    handle.dispose();
    resolveLate(status());
    await flush();
    expect(host.textContent).not.toContain('Common demo');
  });

  it('sends faded answers to the server', async () => {
    const c = client(status());
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await flush();
    host.querySelector('.tut__page')!.dispatchEvent(new CustomEvent('tutorial:faded', { bubbles: true, detail: { blockId: 'f1', parts: { 0: 'x' }, rating: 'right' } }));
    expect(c.answer).toHaveBeenCalledWith('f1', { 0: 'x' }, 'right');
  });

  it('shows the hero once, above the Common page', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status()), renderHero: (h) => h.append(Object.assign(document.createElement('h1'), { textContent: 'Structure' })) });
    await flush();
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('.tut__hero')?.textContent).toBe('Structure');
  });

  it('a failed first check says so and keeps trying until it answers', async () => {
    vi.useFakeTimers();
    const c = client(status());
    const fail = c.status as ReturnType<typeof vi.fn>;
    fail.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    const host = document.createElement('div');
    const handle = mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.textContent).toContain('Couldn’t reach your teacher’s board. Trying again…');
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.textContent).toContain('Couldn’t reach your teacher’s board. Trying again…');
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.textContent).toContain('Common demo');
    expect(fail).toHaveBeenCalledTimes(3);
    handle.dispose();
  });

  it('a bad claim says so, then a good one moves on', async () => {
    let s = status({ identity: { need: 'initials', initials: null } });
    const c = client(() => s);
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await flush();
    const form = host.querySelector('.tut-claim') as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'ZZ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(host.querySelector('.tut-claim__err')?.textContent).toContain('Those initials aren’t on your class list.');
    s = status();
    input.value = 'AB';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(c.claim).toHaveBeenLastCalledWith('AB');
    expect(host.querySelector('.tut-claim')).toBeNull();
    expect(host.textContent).toContain('Common demo');
  });

  it('asks a student with no class link to open it from their class page', () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: null, renderHero: () => {} });
    expect(host.textContent).toContain('Open this tutorial from your class page.');
  });
});
