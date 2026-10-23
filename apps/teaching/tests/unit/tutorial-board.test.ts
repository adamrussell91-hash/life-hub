import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountTutorialBoard } from '@/tutorial/board';
import type { LiveBoard, TutorialSummary, TutorialTeacherApi } from '@/tutorial/api';
import { ApiClientError } from '@/api/client';
import type { Block } from '@/schemas/block';

const summary = (): TutorialSummary => ({
  seen: 1,
  total: 2,
  groups: [
    {
      id: 'ga', name: 'Re-tells the plot', why: 'x', gap_type: 'knowledge', sitting: false, seen_at: null, status: 'waiting', handups: 1, open: 1,
      students: [
        { id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', unlocked: false },
        { id: 'st_ed', initials: 'EF', name: 'Ed Fox', stage: 'before', unlocked: false }
      ]
    },
    {
      id: 'gb', name: 'Mix-up', why: 'y', gap_type: 'mix_up', sitting: false, seen_at: '2026-10-21T12:00:00.000Z', status: 'seen', handups: 0, open: 0,
      students: [
        { id: 'st_cy', initials: 'CD', name: 'Cy Dale', stage: 'after', unlocked: true },
        { id: 'st_gus', initials: 'GH', name: 'Gus Hale', stage: 'waiting', unlocked: false }
      ]
    }
  ]
});
const board = (): LiveBoard => ({
  group: { id: 'ga', name: 'Re-tells the plot', why: 'x' },
  sitting: true,
  shown: null,
  done_students: [],
  students: [
    { id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', answers: { f1: { parts: { 2: 'It repeats' }, rating: 'wrong', at: 'x' }, c1: { parts: { 1: 'In the chorus' }, rating: 'right', at: 'x' } } },
    { id: 'st_ed', initials: 'EF', name: 'Ed Fox', stage: 'before', answers: {} }
  ],
  handups: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa~abc123', label: 'Step 2', text: 'What is an effect?', status: 'open', reply: '', at: '2026-10-23T01:00:00.000Z', student_id: 'st_ann' }]
});
const step = (id: string, blanks: number[]): Block =>
  ({ id, type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher', content: { prompt: '', extract: 'e', parts: [{ label: 'Technique', answer: 'a' }, { label: 'Where', answer: 'b' }, { label: 'Effect', answer: 'c' }], blanks } }) as Block;
const lesson = () => ({
  blocks: [
    step('c1', [1]),
    {
      id: 'tA', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher',
      content: {
        title: 'A', tutorial_group: 'ga',
        blocks: [
          step('full', []),
          step('f1', [2]),
          { id: 'w1', type: 'block', block_type: 'with_teacher', variant: 'medium', visibility: 'student_teacher', content: { talking_points: ['Ask what the reader feels'] } },
          step('late', [0])
        ]
      }
    }
  ] as Block[]
});
const api = (): TutorialTeacherApi => ({
  summary: vi.fn(async () => summary()), board: vi.fn(async () => board()), sit: vi.fn(async () => summary()), show: vi.fn(async () => summary()),
  hide: vi.fn(async () => summary()), done: vi.fn(async () => summary()), unlock: vi.fn(async () => summary()), move: vi.fn(async () => summary()),
  reply: vi.fn(async () => summary())
});
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};
async function openLive(a: TutorialTeacherApi, extra: Partial<Parameters<typeof mountTutorialBoard>[0]> = {}) {
  const handle = mountTutorialBoard({ getLesson: lesson, api: a, ...extra });
  await handle.refresh();
  (handle.root.querySelector('.tut-card__sit') as HTMLButtonElement).click();
  await flush();
  return handle;
}

afterEach(() => vi.useRealTimers());

describe('tutorial board', () => {
  it('draws a card per group and the seen count', async () => {
    const handle = mountTutorialBoard({ getLesson: lesson, api: api() });
    await handle.refresh();
    expect(handle.root.querySelector('.tut-board__count')?.textContent).toBe('1 of 2 groups seen');
    const cards = handle.root.querySelectorAll('.tut-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain('Waiting for you');
    expect(cards[0]!.textContent).toContain('✋ 1');
    expect(cards[1]!.querySelector('.tut-card__status')?.textContent).toBe('Seen Wed 21 Oct');
    handle.dispose();
  });

  it('Sit with group opens the live board with answers and talking points', async () => {
    const a = api();
    const handle = await openLive(a);
    expect(a.sit).toHaveBeenCalledWith('ga');
    const live = handle.root.querySelector('.tut-live')!;
    expect(live.textContent).toContain('It repeats');
    expect(live.textContent).toContain('Ask what the reader feels');
    const show = [...live.querySelectorAll<HTMLButtonElement>('.tut-live__show')];
    show[show.length - 1]!.click();
    expect(a.show).toHaveBeenCalledWith('ga', 'st_ann', 'f1', '2');
    handle.dispose();
  });

  it('columns are the faded steps with blanks from Common and the tab before With teacher', async () => {
    const handle = await openLive(api());
    const heads = [...handle.root.querySelectorAll('.tut-live__col')].map((h) => h.textContent);
    expect(heads).toEqual(['Where', 'Effect']);
    expect(handle.root.querySelector('.tut-live')!.textContent).toContain('In the chorus');
    handle.dispose();
  });

  it('Done unlocks the students who are here, with absent ones unticked', async () => {
    const a = api();
    const handle = await openLive(a);
    (handle.root.querySelector('.tut-live__done') as HTMLButtonElement).click();
    expect(a.done).toHaveBeenCalledWith('ga', ['st_ann']);
    handle.dispose();
  });

  it('a teacher’s untick survives the next repaint', async () => {
    const a = api();
    const handle = await openLive(a);
    const tick = handle.root.querySelector<HTMLInputElement>('.tut-live__row input[type="checkbox"]')!;
    tick.checked = false;
    tick.dispatchEvent(new Event('change'));
    handle.root.querySelector<HTMLButtonElement>('.tut-live__show')!.click();
    await flush();
    expect(a.board).toHaveBeenCalledTimes(2);
    expect(handle.root.querySelector<HTMLInputElement>('.tut-live__row input[type="checkbox"]')!.checked).toBe(false);
    (handle.root.querySelector('.tut-live__done') as HTMLButtonElement).click();
    expect(a.done).toHaveBeenCalledWith('ga', []);
    handle.dispose();
  });

  it('lists hand-ups with who sent them, and Answered sends the reply', async () => {
    const a = api();
    const handle = await openLive(a);
    const hand = handle.root.querySelector('.tut-live__hand')!;
    expect(hand.textContent).toContain('What is an effect?');
    expect(hand.textContent).toContain('Ann Bell');
    hand.querySelector<HTMLInputElement>('input')!.value = 'How it makes the reader feel';
    hand.querySelector<HTMLButtonElement>('.tut-live__answered')!.click();
    await flush();
    expect(a.reply).toHaveBeenCalledWith('aaaaaaaaaaaaaaaaaaaaaaaa~abc123', 'How it makes the reader feel');
    handle.dispose();
  });

  it('Move puts a student in another group and tells the editor', async () => {
    const a = api();
    const onMoved = vi.fn();
    const handle = await openLive(a, { onMoved });
    const row = handle.root.querySelector('.tut-live__row')!;
    expect(row.querySelector('select')).toBeNull();
    const pill = row.querySelector<HTMLButtonElement>('.tut-live__move .hub-pills__btn')!;
    expect(pill.textContent).toBe('Mix-up');
    pill.click();
    await flush();
    expect(a.move).toHaveBeenCalledWith('st_ann', 'gb');
    expect(onMoved).toHaveBeenCalledWith(expect.objectContaining({ total: 2 }));
    handle.dispose();
  });

  it('shows a move error in the error line', async () => {
    const a = api();
    a.move = vi.fn(async () => {
      throw new ApiClientError({ code: 'not_published', message: 'Publish the tutorial again so this group has a tab.' });
    });
    const onMoved = vi.fn();
    const handle = await openLive(a, { onMoved });
    handle.root.querySelector<HTMLButtonElement>('.tut-live__move .hub-pills__btn')!.click();
    await flush();
    expect(handle.root.querySelector('.tut-board__error')!.textContent).toBe('Publish the tutorial again so this group has a tab.');
    expect(onMoved).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('a seen group card offers Unlock for students who were away', async () => {
    const a = api();
    const handle = mountTutorialBoard({ getLesson: lesson, api: a });
    await handle.refresh();
    const cards = handle.root.querySelectorAll('.tut-card');
    expect(cards[0]!.querySelector('.tut-card__unlock')).toBeNull();
    const unlocks = cards[1]!.querySelectorAll<HTMLButtonElement>('.tut-card__unlock');
    expect(unlocks).toHaveLength(1);
    unlocks[0]!.click();
    await flush();
    expect(a.unlock).toHaveBeenCalledWith('gb', 'st_gus');
    handle.dispose();
  });

  it('polls the live board, and stops after dispose', async () => {
    vi.useFakeTimers();
    const a = api();
    const handle = mountTutorialBoard({ getLesson: lesson, api: a });
    await handle.refresh();
    (handle.root.querySelector('.tut-card__sit') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.board).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(a.board).toHaveBeenCalledTimes(2);
    handle.dispose();
    const before = handle.root.innerHTML;
    await vi.advanceTimersByTimeAsync(12000);
    expect(a.board).toHaveBeenCalledTimes(2);
    expect(handle.root.innerHTML).toBe(before);
  });
});
