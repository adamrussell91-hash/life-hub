// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mountLessonStudents, type LessonStudentsApi } from '@/network/lesson-students';

const flush = () => new Promise((r) => setTimeout(r));
const api = (over: Partial<LessonStudentsApi> = {}): LessonStudentsApi => ({
  lessonStudents: vi.fn(async () => ({ students: [{ id: 's1', name: 'Ava Stone' }, { id: 's2', name: 'Ben Ash' }, { id: 's3', name: 'Cal Moss' }], ticked: ['s1'], started: ['s3'] })),
  setLessonStudents: vi.fn(async () => undefined),
  ...over
});
const pill = (row: HTMLElement, name: string) => [...row.querySelectorAll('button')].find((b) => b.textContent?.startsWith(name))!;

describe('side lesson tick list', () => {
  it('loads once, shows ticks and who keeps the lesson, and saves each change', async () => {
    const a = api();
    const m = mountLessonStudents('l1', [{ id: 'c1', name: '9 English' }], a);
    const row = m.open();
    m.open();
    await flush();
    expect(a.lessonStudents).toHaveBeenCalledTimes(1);
    expect(pill(row, 'Ava').getAttribute('aria-pressed')).toBe('true');
    expect(pill(row, 'Cal').textContent).toBe('Cal Moss · started');
    expect(row.textContent).toContain('2 of 3 see this on their map');
    pill(row, 'Ben').click();
    await flush();
    expect(a.setLessonStudents).toHaveBeenLastCalledWith('c1', 'l1', ['s1', 's2']);
    expect(row.textContent).toContain('3 of 3');
  });
  it('Everyone ticks the class, Clear empties it', async () => {
    const a = api();
    const row = mountLessonStudents('l1', [{ id: 'c1', name: '9 English' }], a).open();
    await flush();
    pill(row, 'Everyone').click();
    await flush();
    expect(a.setLessonStudents).toHaveBeenLastCalledWith('c1', 'l1', ['s2', 's3', 's1']);
    pill(row, 'Clear').click();
    await flush();
    expect(a.setLessonStudents).toHaveBeenLastCalledWith('c1', 'l1', []);
  });
  it('goes back and says so when a save fails', async () => {
    const a = api({ setLessonStudents: vi.fn(async () => { throw new Error('no'); }) });
    const row = mountLessonStudents('l1', [{ id: 'c1', name: '9 English' }], a).open();
    await flush();
    pill(row, 'Ben').click();
    await flush();
    expect(pill(row, 'Ben').getAttribute('aria-pressed')).toBe('false');
    expect(row.textContent).toContain('Couldn’t save that');
  });
});
