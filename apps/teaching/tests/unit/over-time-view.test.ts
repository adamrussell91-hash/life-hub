import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/organiser/print', () => ({ printOrganiser: vi.fn() }));
import { renderProfile } from '@/student/profile-view';
import { mountOverTime, type OverTimeApi } from '@/teacher/over-time-view';

// Invented students and work only.
const unit = { content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Assessment task' } }, lines: [], lessons: [{ id: 'l1', title: 'Lesson one' }], schedule: [], pre: [] };
const payload = {
  need: null,
  initials: 'JP',
  pieces: [{ id: 'p1', label: 'Essay 1', date: '13 Oct', kind: 'written' }],
  codes: [],
  next: [],
  outcomes: [],
  concepts: [],
  skills: [],
  map: { next: null, unit, lessons: [{ id: 'l1', title: 'Lesson one', role: 'core', kind: 'lesson', done: true }] }
};

describe('Over time tab plumbing', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('is never built without a teacher, even when offered', () => {
    const build = vi.fn(() => document.createElement('div'));
    const host = renderProfile(payload as never, { classId: 'c1', overTime: build, loadReturned: async () => [] });
    expect(host.querySelector('[data-tab="over-time"]')).toBeNull();
    expect(host.textContent).not.toContain('Only you');
    expect(build).not.toHaveBeenCalled();
  });

  it('adds a fourth tab with an Only you badge, mounted the first time it opens', () => {
    const build = vi.fn(() => Object.assign(document.createElement('div'), { className: 'built' }));
    const host = renderProfile(payload as never, { classId: 'c1', teacher: { name: 'Jo Pell' }, overTime: build, loadReturned: async () => [] });
    const tab = host.querySelector<HTMLButtonElement>('[data-tab="over-time"]')!;
    expect(tab.textContent).toContain('Over time');
    expect(tab.querySelector('.pg-tab__lock')!.textContent).toBe('Only you');
    expect(host.querySelector('[data-tab="progress"]')!.getAttribute('aria-selected')).toBe('true');
    expect(build).not.toHaveBeenCalled();
    tab.click();
    tab.click();
    expect(build).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.built')).toBeTruthy();
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('over-time');
    host.querySelector<HTMLButtonElement>('[data-tab="progress"]')!.click();
    expect(new URL(window.location.href).searchParams.get('tab')).toBeNull();
  });

  it('opens straight on Over time with ?tab=over-time', () => {
    const build = vi.fn(() => document.createElement('div'));
    const host = renderProfile(payload as never, { classId: 'c1', teacher: { name: 'Jo Pell' }, overTime: build, tab: 'over-time', loadReturned: async () => [] });
    expect(host.querySelector('[data-tab="over-time"]')!.getAttribute('aria-selected')).toBe('true');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('still shows the tab to a teacher when nothing is returned yet', () => {
    const bare = { need: null, initials: 'JP', map: payload.map };
    const host = renderProfile(bare as never, { classId: 'c1', teacher: { name: 'Jo Pell' }, overTime: () => document.createElement('div') });
    expect(host.querySelector('[data-tab="over-time"]')).toBeTruthy();
  });
});

const quiz = (id: string, title: string, date: string, tag: string, s1: number, s2: number) => ({
  kind: 'quiz',
  id: `quiz:${id}`,
  lesson_id: id,
  title,
  date,
  hidden: false,
  confidence: false,
  questions: [{ id: 'q1', prompt: '', marks: 1, outcomes: [] }],
  scores: Object.fromEntries(
    ([['s1', s1], ['s2', s2]] as const).map(([student, share]) => [
      student,
      { attempt_id: `${id}-${student}`, submitted_at: `${date}T01:00:00Z`, score: share, max: 1, pending: 0, rows: [{ id: 'q1', awarded: share, max: 1, confidence: null, outcomes: [], items: [{ item: 'q1', tags: [tag], share, why: [] }] }] }
    ])
  )
});

function fakeApi(quizzes: unknown[], calls: Array<[string, unknown]> = []): Partial<OverTimeApi> {
  let notes: Array<{ id: string; at: string; text: string; tag?: string }> = [];
  return {
    markbook: async () => ({ markbook: { columns: [], marks: {}, groups: [] }, students: [{ id: 's1', name: 'Jo Pell', initials: 'JP' }, { id: 's2', name: 'Sam Lee', initials: 'SL' }], quizzes, rubrics: [] }) as never,
    context: async () => ({ table: null, outcomes: [], skills: null, codes: [] }),
    frame: async () => ({ terms: [{ number: 4, start: '2026-10-12', end: '2026-12-18' }], unit: null, unitStart: null, deep: [] }),
    profile: (async (action: string, extra: Record<string, unknown> = {}) => {
      calls.push([action, extra]);
      if (action === 'habits') return { organiser: null, redrafts: 1, steps: { set: 0, acted: null } };
      if (action === 'note_save') {
        const note = extra.note as { text: string; tag: string | null };
        notes = [{ id: 'n1', at: '2026-11-04T01:00:00Z', text: note.text, ...(note.tag ? { tag: note.tag } : {}) }, ...notes];
      }
      return { notes };
    }) as OverTimeApi['profile']
  };
}

describe('Over time view', () => {
  it('says so plainly when nothing is tagged', async () => {
    const host = mountOverTime({ classId: 'c1', studentId: 's1', name: 'Jo Pell', api: fakeApi([]), today: '2026-11-04' });
    await vi.waitFor(() => expect(host.querySelector('.ot-empty')).toBeTruthy());
    expect(host.querySelector('.ot-empty')!.textContent).toBe('Nothing tagged yet for Jo Pell. Tagged quiz questions, marked work and vivas will show here.');
    expect(host.querySelector('.ot-private')!.textContent).toBe('Only you see this tab. Jo sees the other tabs, never this one.');
  });

  it('draws a row per tag; a kind chip filters and a row opens its evidence', async () => {
    const quizzes = [quiz('l1', 'Week 1 quiz', '2026-10-13', 'tech:~simile', 0.5, 1), quiz('l2', 'Week 2 quiz', '2026-10-20', 'tech:~simile', 1, 1), quiz('l3', 'Week 3 quiz', '2026-10-27', 'skill:an.inf', 0, 1)];
    const host = mountOverTime({ classId: 'c1', studentId: 's1', name: 'Jo Pell', api: fakeApi(quizzes), today: '2026-11-04' });
    await vi.waitFor(() => expect(host.querySelectorAll('.ot-row[data-tag]').length).toBe(2));
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.ot-pills[aria-label="Kind of tag"] .ot-pill')].map((b) => b.textContent);
    expect(chips).toEqual(['Everything', 'Thinking skills', 'Techniques']);
    expect(host.querySelector('.ot-trend svg')).toBeTruthy();
    expect(host.querySelector('.ot-move--up')!.textContent).toContain('Simile, 50% → 100%');

    host.querySelector<HTMLButtonElement>('.ot-pills[aria-label="Kind of tag"] [data-value="skill"]')!.click();
    expect([...host.querySelectorAll<HTMLElement>('.ot-row[data-tag]')].map((r) => r.dataset.tag)).toEqual(['skill:an.inf']);

    host.querySelector<HTMLButtonElement>('.ot-pills[aria-label="Kind of tag"] [data-value="all"]')!.click();
    host.querySelector<HTMLElement>('.ot-row[data-tag="tech:~simile"]')!.click();
    const detail = host.querySelector('.ot-detail')!;
    expect([...detail.querySelectorAll('.ot-evlist li')].map((li) => li.textContent)).toEqual(['20 Oct' + 'Week 2 quiz · Q1' + '100%', '13 Oct' + 'Week 1 quiz · Q1' + '50%']);
    expect([...detail.querySelectorAll('.ot-act__btn')].map((b) => b.textContent)).toEqual(['Make it a next step', 'Add to a group', 'Open the tag']);
  });

  it('saves a tagged note and shows it in that tag’s row', async () => {
    const calls: Array<[string, unknown]> = [];
    const quizzes = [quiz('l1', 'Week 1 quiz', '2026-10-13', 'tech:~simile', 0.5, 1)];
    const host = mountOverTime({ classId: 'c1', studentId: 's1', name: 'Jo Pell', api: fakeApi(quizzes, calls), today: '2026-11-04' });
    document.body.append(host);
    await vi.waitFor(() => expect(host.querySelector('.ot-row[data-tag]')).toBeTruthy());
    host.querySelector<HTMLElement>('.ot-row[data-tag="tech:~simile"]')!.click();
    host.querySelector<HTMLButtonElement>('.ot-act__btn')!.click();
    const draft = host.querySelector<HTMLTextAreaElement>('.ot-notes__input')!;
    expect(draft.value).toBe('Next step: Simile. ');
    expect(host.querySelector<HTMLSelectElement>('.ot-notes__tag')!.value).toBe('tech:~simile');
    draft.value = 'Next step: Simile. Find two in the poem.';
    [...host.querySelectorAll<HTMLButtonElement>('.ot-notes button')].find((b) => b.textContent === 'Save note')!.click();
    await vi.waitFor(() => expect(host.querySelector('.ot-nlist')).toBeTruthy());
    expect(calls.find(([a]) => a === 'note_save')![1]).toEqual({ note: { text: 'Next step: Simile. Find two in the poem.', tag: 'tech:~simile' } });
    expect(host.querySelector('.ot-nlist .ot-tagged')!.textContent).toBe('Simile');
    expect(host.querySelector('.ot-evlist--notes')!.textContent).toContain('Find two in the poem.');
    expect(calls.some(([a]) => a === 'seen')).toBe(false);
    host.remove();
  });
});
