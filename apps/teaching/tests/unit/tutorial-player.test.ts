import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountTutorialPlayer } from '@/tutorial/player';
import type { TutorialClient, TutorialStatus } from '@/tutorial/api';
import type { Block } from '@/schemas/block';

vi.mock('@/quiz/student-quiz', () => ({ mountStudentQuiz: () => Object.assign(document.createElement('section'), { className: 'qz-quiz' }) }));

const b = (id: string, block_type: string, content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;
const lesson = { lesson_id: 'tut1', title: 'Structure', unit_id: 'u1', blocks: [], published_at: '2026-10-23T00:00:00.000Z', schema_version: 1 as const, pedagogical_mode: 'tutorial' as const };
const withQuiz = { ...lesson, quiz: { version: 'v', question_count: 1, total_marks: 1 } as never };
const status = (over: Partial<TutorialStatus> = {}): TutorialStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'ga', goal: 'Today: the effect', blocks: [b('r1', 'rich_text', { text: 'Step' }), b('w1', 'with_teacher', { talking_points: [] }), b('r2', 'rich_text', { text: 'You do' })] },
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
const setDone = (d: Record<string, boolean>) => localStorage.setItem('tutorial:tut1:done', JSON.stringify({ common: true, before: false, after: false, exit: false, ...d }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('tutorial player', () => {
  it('shows the goal and plays the tab up to With teacher, then waits', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status()), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('Today: the effect');
    expect(host.querySelector('.lecture-stage')).not.toBeNull();
    setDone({ before: true });
    const again = document.createElement('div');
    mountTutorialPlayer(again, { lesson, client: client(status()), renderHero: () => {} });
    await flush();
    expect(again.querySelector('.tut-wait')?.textContent).toContain('Your teacher will join you here');
  });

  it('shows what the teacher put up while sitting with the group', async () => {
    setDone({ before: true });
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ sitting: true, shown: { text: 'It goes back to the start', label: 'Effect' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.tut-wait')?.textContent).toContain('Your teacher is with your group.');
    expect(host.querySelector('.tut-shown')?.textContent).toContain('It goes back to the start');
  });

  it('after Done goes to You do, then the exit check', async () => {
    setDone({ before: true, after: true });
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson: withQuiz, classId: 'class1', client: client(status({ unlocked: true })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.qz-quiz')).not.toBeNull();
  });

  it('with no exit questions, the exit stage just says well done', async () => {
    setDone({ before: true, after: true });
    const host = document.createElement('div');
    const c = client(status({ unlocked: true }));
    mountTutorialPlayer(host, { lesson, classId: 'class1', client: c, renderHero: () => {} });
    await flush();
    expect(host.querySelector('.qz-quiz')).toBeNull();
    expect(host.textContent).toContain('All done. Nice work.');
    expect(c.progress).toHaveBeenCalledWith('done');
    expect(c.progress).not.toHaveBeenCalledWith('exit');
  });

  it('tells a student outside the groups, with no lecture or hand-up', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ group: null, not_for_you: true })), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('This one isn’t for you today.');
    expect(host.querySelector('.lecture-stage')).toBeNull();
    expect(host.querySelector('.lecture-strip__hand')).toBeNull();
  });

  it('sends progress only when the stage changes', async () => {
    vi.useFakeTimers();
    setDone({ before: true });
    const c = client(status());
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(c.status).toHaveBeenCalledTimes(3);
    expect(c.progress).toHaveBeenCalledTimes(1);
    expect(c.progress).toHaveBeenCalledWith('waiting');
  });

  it('polls only while waiting, moves on when unlocked and stops on dispose', async () => {
    vi.useFakeTimers();
    setDone({ before: true });
    let s = status();
    const c = client(() => s);
    const host = document.createElement('div');
    const handle = mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.tut-wait')).not.toBeNull();
    s = status({ unlocked: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.querySelector('.tut-wait')).toBeNull();
    expect(host.querySelector('.lecture-stage')).not.toBeNull();
    const calls = (c.status as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(20000);
    expect((c.status as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    handle.dispose();
  });

  it('a check-in in flight at dispose does not repaint', async () => {
    vi.useFakeTimers();
    setDone({ before: true });
    let resolveLate: (v: TutorialStatus) => void = () => {};
    const c = client(status());
    const host = document.createElement('div');
    const handle = mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    (c.status as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<TutorialStatus>((r) => { resolveLate = r; }));
    await vi.advanceTimersByTimeAsync(5000);
    handle.dispose();
    resolveLate(status({ sitting: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(host.textContent).not.toContain('Your teacher is with your group.');
  });

  it('stops repainting after dispose', async () => {
    setDone({ before: true });
    let resolveLate: (v: TutorialStatus) => void = () => {};
    const c = client(status());
    (c.status as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise<TutorialStatus>((r) => { resolveLate = r; }));
    const host = document.createElement('div');
    const handle = mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    handle.dispose();
    resolveLate(status());
    await flush();
    expect(host.querySelector('.tut-wait')).toBeNull();
  });

  it('sends faded answers to the server', async () => {
    const c = client(status());
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await flush();
    host.querySelector('.lecture-stage')!.dispatchEvent(new CustomEvent('tutorial:faded', { bubbles: true, detail: { blockId: 'f1', parts: { 0: 'x' }, rating: 'right' } }));
    expect(c.answer).toHaveBeenCalledWith('f1', { 0: 'x' }, 'right');
  });

  it('shows the hero once above the stages', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status()), renderHero: (h) => h.append(Object.assign(document.createElement('h1'), { textContent: 'Structure' })) });
    await flush();
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('.tut__hero')?.textContent).toBe('Structure');
  });

  it('a failed first check says so and keeps trying until it answers', async () => {
    vi.useFakeTimers();
    setDone({ before: true });
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
    expect(host.querySelector('.tut-wait')).not.toBeNull();
    expect(fail).toHaveBeenCalledTimes(3);
    handle.dispose();
  });

  it('an unchanged check-in leaves the waiting screen alone', async () => {
    vi.useFakeTimers();
    setDone({ before: true });
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ sitting: true, shown: { text: 'It goes back to the start', label: 'Effect' } })), renderHero: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    const box = host.querySelector('.tut-wait');
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.querySelector('.tut-wait')).toBe(box);
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
    expect(host.querySelector('.lecture-stage')).not.toBeNull();
  });

  it('Done on the first stretch leads to the wait, and checks in at once', async () => {
    let s = status();
    const c = client(() => s);
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: c, renderHero: () => {} });
    await flush();
    const main = host.querySelector('.lecture-bar__main') as HTMLButtonElement;
    for (let i = 0; i < 5 && !host.querySelector('.lecture-recap'); i += 1) main.click();
    const finish = host.querySelector('.lecture-recap__finish') as HTMLButtonElement;
    expect(finish.textContent).toBe('I’m ready for my teacher');
    s = status({ sitting: true });
    finish.click();
    expect(host.querySelector('.tut-wait')).not.toBeNull();
    expect(c.progress).toHaveBeenLastCalledWith('waiting');
    await flush();
    expect(host.querySelector('.tut-wait')?.textContent).toContain('Your teacher is with your group.');
  });

  it('asks a student with no class link to open it from their class page', () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: null, renderHero: () => {} });
    expect(host.textContent).toContain('Open this tutorial from your class page.');
  });
});
