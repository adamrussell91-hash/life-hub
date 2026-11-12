import { describe, expect, it, vi } from 'vitest';

vi.mock('@/organiser/print', () => ({ printOrganiser: vi.fn() }));
import { renderProfile } from '@/student/profile-view';
import { renderTodoPanel, type TodoPayload } from '@/student/todo-panel';
import { pieceView, returnedList } from '@/student/returned-view';

const unit = {
  content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Assessment task' } },
  lines: [{ id: 'ln1', mode: 'train', name: 'Argument', colour: 'wave' }],
  lessons: [
    { id: 'l1', title: 'Ghost poem', line_stops: [{ line_id: 'ln1', level: 'introduced' }] },
    { id: 'l2', title: 'Tutorial', role: 'support', line_stops: [{ line_id: 'ln1' }] },
    { id: 'l3', title: 'Stretch', role: 'extension' },
    { id: 'l4', title: 'Quiz 1', quiz: true, line_stops: [{ line_id: 'ln1', level: 'reinforced' }] },
    { id: 'l5', title: 'Essay', assessment: true }
  ],
  schedule: [{ lesson_id: 'l1', date: '2026-10-05' }, { lesson_id: 'l4', date: '2026-10-12' }],
  pre: []
};
const payload = {
  need: null,
  initials: 'AR',
  map: {
    next: 'l4',
    unit,
    lessons: [
      { id: 'l1', title: 'Ghost poem', role: 'core', kind: 'lesson', done: true },
      { id: 'l2', title: 'Tutorial', role: 'support', kind: 'lesson', done: false },
      { id: 'l3', title: 'Stretch', role: 'extension', kind: 'lesson', done: false },
      { id: 'l4', title: 'Quiz 1', role: 'core', kind: 'quiz', done: false },
      { id: 'l5', title: 'Essay', role: 'core', kind: 'assessment', done: false }
    ]
  }
};

describe('profile map', () => {
  const host = renderProfile(payload as never, { classId: 'class1' });
  // A lesson's row (name and station); its dots on the item branches share the data-row but not the class.
  const row = (id: string) => host.querySelector(`.cm-row[data-row="${id}"]`)!;
  it('fills done lessons and leaves the rest grey', () => {
    expect(row('l1').querySelector('.cm-station')!.classList.contains('cm-p-done')).toBe(true);
    expect(row('l4').querySelector('.cm-station')!.classList.contains('cm-p-done')).toBe(false);
    expect(host.querySelectorAll('.cm-route.cm-p-lit').length).toBe(0);
    expect(host.querySelectorAll('.cm-route.cm-p-grey').length).toBeGreaterThan(0);
  });
  it('colours the route behind a done lesson and marks it done in words too', () => {
    const done = renderProfile({ ...payload, map: { ...payload.map, lessons: payload.map.lessons.map((l) => (l.id === 'l4' ? { ...l, done: true } : l)), next: 'l5' } } as never, { classId: 'class1' });
    expect(done.querySelectorAll('.cm-route.cm-p-lit').length).toBeGreaterThan(0);
    expect(done.querySelector('.cm-row[data-row="l4"]')!.getAttribute('aria-label')).toContain('done');
    expect(done.querySelector('.cm-row[data-row="l4"] .cm-done-mark')).toBeTruthy();
  });
  it('rings the next lesson in words too', () => {
    expect(row('l4').querySelector('.cm-station')!.classList.contains('cm-p-next')).toBe(true);
    expect(row('l4').textContent).toContain('Next up');
  });
  it('draws the quiz as a diamond and the assessment as a square', () => {
    expect(row('l4').querySelector('rect[transform^="rotate(45"]')).toBeTruthy();
    expect(row('l5').querySelector('rect[rx="2"]')).toBeTruthy();
  });
  it('has no placeholder assessment row when the assessment is a lesson', () => {
    expect(host.querySelector('[data-row="__terminus"]')).toBeNull();
  });
  it('shows the initials step when the device is unclaimed', () => {
    const calls: string[] = [];
    const unclaimed = renderProfile({ need: 'initials' } as never, { classId: 'class1', onClaim: (i) => calls.push(i) });
    (unclaimed.querySelector('input') as HTMLInputElement).value = 'ar';
    unclaimed.querySelector('button')!.click();
    expect(calls).toEqual(['ar']);
    expect(unclaimed.querySelector('.pm-map')).toBeNull();
  });
  it('heads the teacher’s view with just the student’s name, no explaining lines', () => {
    const seen = renderProfile(payload as never, { classId: 'class1', teacher: { name: 'Ava Nguyen' } });
    expect(seen.querySelector('.pm-title')?.textContent).toBe('Ava Nguyen');
    expect(seen.textContent).not.toContain('on this device');
    expect(seen.querySelector('.pm-who, .pm-empty')).toBeNull();
    expect(seen.querySelector('.pm-map')).toBeTruthy();
  });
  it('says so when the class has no unit yet', () => {
    const empty = renderProfile({ ...payload, map: { lessons: [], next: null, unit: null } } as never, { classId: 'class1' });
    expect(empty.textContent).toContain('will appear here once your teacher sets it up');
  });
});

const pieces = [
  { id: 'p1', label: 'Road imagery', date: '6 Oct', kind: 'written' },
  { id: 'p2', label: 'Tension', date: '13 Oct', kind: 'written' }
];
const rich = {
  ...payload,
  pieces,
  unseen: 2,
  next: [{ code_id: 'ts', code: 'TS', colour: 'peach', positive: false, hit: 2, of: 2, action: 'Open each paragraph with your argument.', resource: { kind: 'link', url: 'https://example.com/ts' } }],
  outcomes: [{ key: 'out:a', name: 'Analysis', sub: 'EN12-1', cells: ['starting', 'building'], now: 'building', story: { kind: 'moved_up', from: 'starting', to: 'building', piece_id: 'p2' }, looks: null }],
  concepts: [],
  skills: [{ strand: 'Composing', rows: [{ key: 'skill:x', name: 'Paragraph control', counts: { below: 0, capable: 1, skilled: 1, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'now', step: 'skilled' }, i_can: 'I can build a paragraph.', next_move: 'Link back at the end.', next_rung: 'accomplished' }] }],
  codes: [{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [1, 1], hit: 2, of: 2, total: 2, dropped: false }],
  feedback: { pieces: [{ id: 'w:l1:b', label: 'Road imagery', date: '6 Oct', kind: 'written' }, { id: 'w:l4:b', label: 'Tension', date: '13 Oct', kind: 'written' }], rows: [{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [1, 1], hit: 2, of: 2, total: 2, trend: 'steady', hits: [{ piece_id: 'w:l4:b', title: 'Tension', date: '13 Oct', words: 'The road waits.', note: null }], do: 'Open each paragraph with your argument.' }] }
};

describe('progress page', () => {
  const host = renderProfile(rich as never, { classId: 'class1' });
  it('lists next steps with See how', () => {
    expect(host.querySelector('.pg-next__do')!.textContent).toContain('Open each paragraph with your argument.');
    expect(host.querySelector('.pg-next .pg-seehow')!.textContent).toBe('See how →');
  });
  it('shows learning rows, a skills path and the code grid with counts', () => {
    expect(host.textContent).toContain('Where your learning is');
    expect(host.querySelectorAll('.pg-learning .pg-chart').length).toBe(1);
    expect(host.querySelectorAll('.pg-skills .pg-sk__dot').length).toBe(4);
    expect(host.querySelector('.pg-fb .pg-fb__count')!.textContent).toBe('2 of last 2 · steady');
  });
  it('badges Returned work with the unseen count', () => {
    expect(host.querySelector('[data-tab="returned"] .pg-tab__badge')!.textContent).toBe('2');
  });
  it('opens on Returned work when something is new, for the student only', async () => {
    const student = renderProfile(rich as never, { classId: 'class1', loadReturned: async () => [] });
    expect(student.querySelector('[data-tab="returned"]')!.getAttribute('aria-selected')).toBe('true');
    const teacher = renderProfile(rich as never, { classId: 'class1', teacher: { name: 'Ava' }, loadReturned: async () => [] });
    expect(teacher.querySelector('[data-tab="progress"]')!.getAttribute('aria-selected')).toBe('true');
    const seen = renderProfile({ ...rich, unseen: 0 } as never, { classId: 'class1' });
    expect(seen.querySelector('[data-tab="progress"]')!.getAttribute('aria-selected')).toBe('true');
  });
  it('gives a student with only a note the Returned work tab, without the code grid', () => {
    const h = renderProfile({ ...payload, pieces: [], has_returned: true, unseen: 1 } as never, { classId: 'class1', loadReturned: async () => [] });
    expect(h.querySelector('[data-tab="returned"] .pg-tab__badge')!.textContent).toBe('1');
    expect(h.querySelector('.pg-codes-sec')).toBeNull();
  });
  it('opens a returned note: its own text, cleaned, with no tags or criteria', () => {
    const view = pieceView({ id: 'n:d1', kind: 'note', title: 'Before your final draft', date: '25 Oct', body_html: '<p>Keep the road image.</p><script>bad()</script>', audio_url: null }, () => {});
    expect(view.querySelector('.student-feedback__body')!.innerHTML).toBe('<p>Keep the road image.</p>');
    expect(view.querySelector('audio')).toBeNull();
  });
  it('plays a note\'s recording, and says when its 28 days are up', () => {
    const note = { id: 'n:d1', kind: 'note' as const, title: 'Draft', date: '25 Oct', body_html: '<p>Hi</p>' };
    const playing = pieceView({ ...note, audio_url: '/api/published/voice-audio/abc' }, () => {});
    expect(playing.querySelector('audio')!.getAttribute('src')).toContain('/api/published/voice-audio/abc');
    const gone = pieceView({ ...note, audio_url: null, audio_deleted: true }, () => {});
    expect(gone.querySelector('audio')).toBeNull();
    expect(gone.textContent).toContain('kept for 28 days');
  });
  it('opens a piece from a feedback row on the Returned work tab, for the teacher too', async () => {
    for (const teacher of [undefined, { name: 'Sam Teacher' }]) {
      const asked: string[] = [];
      const lists: number[] = [];
      const h = renderProfile({ ...rich, unseen: 0 } as never, { classId: 'class1', teacher, loadReturned: async () => (lists.push(1), []), loadPiece: async (id) => (asked.push(id), { id, kind: 'written', title: 'Tension', date: '13 Oct', comment: '', text: null, tags: [], codes: [], criteria: [] } as never) });
      (h.querySelector('.pg-fb__head') as HTMLElement).click();
      (h.querySelector('.pg-fb__open') as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(h.querySelector('[data-tab="returned"]')!.getAttribute('aria-selected')).toBe('true');
      expect(asked).toEqual(['w:l4:b']);
      expect(lists).toEqual([], 'the list does not load over the piece');
    }
  });
  it('puts the soonest assessment countdown at the top, and says when its page is still closed', () => {
    const todo = { countdowns: [{ title: 'Sprint step', lesson_id: 'l2', assessment: false, due_date: '2099-01-01', due_time: '', set_date: '', published: true }, { title: 'Viva task', lesson_id: 'l5', assessment: true, due_date: '2099-02-01', due_time: '13:24', set_date: '', published: false }], announcements: [], practice: null, waiting: [], boxes: [], more: 0 };
    const h = renderProfile({ ...rich, unseen: 0, todo } as never, { classId: 'class1' });
    const panel = h.querySelector('.pg-panel')!;
    const top = panel.firstElementChild as HTMLElement;
    expect(top.classList.contains('td-count--big')).toBe(true);
    expect(top.tagName).toBe('DIV');
    expect(top.querySelector('.td-count__name')!.textContent).toBe('Viva task');
    expect(top.textContent).toContain('Your teacher opens the task page closer to the day.');
    expect(top.querySelector('.td-count__due')!.textContent).toBe('Due Sun 1 Feb, 1:24 pm');
    const open = renderProfile({ ...payload, todo: { ...todo, countdowns: [{ ...todo.countdowns[1]!, published: true }] } } as never, { classId: 'class1' });
    const link = open.querySelector('.td-count--big')!;
    expect(link.tagName).toBe('A');
    expect(link.textContent).not.toContain('closer to the day');
    expect(link.parentElement).toBe(open);
    expect(link.nextElementSibling!.classList.contains('pm-empty')).toBe(true);
    const none = renderProfile({ ...rich, todo: { ...todo, countdowns: [todo.countdowns[0]!] } } as never, { classId: 'class1' });
    expect(none.querySelector('.td-count--big')).toBeNull();
  });
  it('loads the returned list when the tab is opened', async () => {
    const opened: string[] = [];
    const h = renderProfile(rich as never, { classId: 'class1', loadReturned: async () => [{ id: 'w:l1:b', kind: 'written', title: 'Paragraph 1', date: '6 Oct', new: true, codes: ['ts'] }], loadPiece: async () => { throw new Error('x'); }, markSeen: (id) => opened.push(id) });
    (h.querySelector('[data-tab="returned"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.querySelector('.pg-returned__card')!.textContent).toContain('Paragraph 1');
  });
});

describe('returned work', () => {
  const asked = { id: 'w:l1:b', kind: 'written', title: 'Paragraph 1', date: '6 Oct', comment: '', text: { answers: { q1: 'Words.' } }, tags: [], criteria: [], redraft: { scope: 'whole' as const } };
  const openFirst = async (options: Partial<Parameters<typeof renderProfile>[1]>): Promise<HTMLElement> => {
    const h = renderProfile(rich as never, { classId: 'class1', loadReturned: async () => [{ id: 'w:l1:b', kind: 'written', title: 'Paragraph 1', date: '6 Oct', new: false, codes: [], redraft: 'asked' }], loadPiece: async () => asked, ...options });
    (h.querySelector('[data-tab="returned"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    (h.querySelector('.pg-returned__card') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    return h;
  };
  it('a student can rewrite an asked piece, and it reopens once sent', async () => {
    const send = vi.fn().mockResolvedValue({});
    const redraft = vi.fn(() => ({ load: async () => ({ scope: 'whole' as const, text: asked.text, prompts: {}, working: {} }), save: async () => ({}), send }));
    const loadPiece = vi.fn().mockResolvedValueOnce(asked).mockResolvedValue({ ...asked, redraft: undefined, sent: true });
    const h = await openFirst({ redraft, loadPiece });
    expect(redraft).toHaveBeenCalledWith('w:l1:b');
    (h.querySelector('.pg-redraft [data-action="send"]') as HTMLElement).click();
    await vi.waitFor(() => expect(h.querySelector('.pg-ask')!.textContent).toBe('Sent. Your teacher has it.'));
    expect(send).toHaveBeenCalled();
    expect(h.querySelector('.pg-redraft')).toBeNull();
  });
  it('a teacher looking in sees the ask with no box to write in', async () => {
    const h = await openFirst({ teacher: { name: 'Ava' } });
    expect(h.querySelector('.pg-ask')!.textContent).toBe('Your teacher asked for a redraft of this piece.');
    expect(h.querySelector('.pg-redraft')).toBeNull();
  });
  it('opens an item on click', () => {
    const opened: string[] = [];
    const list = returnedList([{ id: 'w:l1:b', kind: 'written', title: 'Paragraph 1', date: '6 Oct', new: true, codes: [] }], (id) => opened.push(id));
    (list.querySelector('button') as HTMLButtonElement).click();
    expect(opened).toEqual(['w:l1:b']);
  });
  it('shows a tagged piece, the explanation on tap, and a rise on the ladder', () => {
    const view = pieceView(
      {
        id: 'w:l1:b', kind: 'written', title: 'Paragraph 1', date: '6 Oct', comment: 'Sharp evidence.',
        text: { answers: { q1: 'In the poem the poet uses imagery. The road is a grey ribbon.' } },
        tags: [{ part: 'answers', field: 'q1', start: 0, end: 18, positive: false, code: 'TS', label: 'Topic sentence', colour: 'peach', action: 'Open with your argument.' }],
        criteria: [{ label: 'Analysis', step: 'building', was: 'starting' }]
      },
      () => undefined
    );
    document.body.append(view);
    const run = view.querySelector('.pa-run--mark') as HTMLElement;
    expect(run.textContent).toBe('In the poem the po');
    run.click();
    expect(view.querySelector('.pg-pop')!.textContent).toContain('Topic sentence');
    expect(view.querySelector('.pg-pop')!.textContent).toContain('Open with your argument.');
    expect(view.querySelector('.pg-box__delta')!.textContent).toBe('up from Starting');
    expect(view.querySelector('.pg-ladder__step.is-on')!.textContent).toBe('Building');
  });
});

describe('organiser tab', () => {
  const organiser = {
    need: null,
    practice: null,
    sheets: [{ unit_id: 'u1', title: 'Sample unit organiser', current: true, sections: [{ id: 's1', name: 'Key ideas', kind: 'list', lines: [{ id: 'a', cells: ['One idea'], fresh: false }] }] }]
  };
  const tabNames = (h: HTMLElement): string[] => [...h.querySelectorAll('.pg-tab')].map((t) => (t.textContent ?? '').replace(/\d+$/, ''));

  it('keeps today’s page with no organiser', () => {
    const h = renderProfile(payload as never, { classId: 'class1', organiser: null });
    expect(h.querySelector('.pg-tabs')).toBeNull();
    expect(h.querySelector('.pm-empty')!.textContent).toContain('first piece of work');
    expect(h.querySelector('.pm-map')).toBeTruthy();
  });
  it('shows My progress and Organiser when nothing is returned, with the map and empty message in My progress', () => {
    const h = renderProfile(payload as never, { classId: 'class1', organiser: organiser as never });
    expect(tabNames(h)).toEqual(['My progress', 'Organiser']);
    const progress = h.querySelectorAll('.pg-panel')[0]!;
    expect(progress.querySelector('.pm-map')).toBeTruthy();
    expect(progress.textContent).toContain('first piece of work');
    expect(h.querySelector('.kos-root')).toBeTruthy();
    expect((h.querySelector('.kos-root') as HTMLElement).hidden).toBe(true);
  });
  it('lands on the Organiser tab for ?tab=organiser', () => {
    const h = renderProfile(payload as never, { classId: 'class1', organiser: organiser as never, tab: 'organiser' });
    expect((h.querySelector('.kos-root') as HTMLElement).hidden).toBe(false);
    expect(h.querySelector('.pg-tab.is-on')!.textContent).toBe('Organiser');
  });
  it('adds the tab beside Returned work when work is returned', () => {
    const h = renderProfile({ ...payload, pieces: [], has_returned: true } as never, { classId: 'class1', organiser: organiser as never });
    expect(tabNames(h)).toEqual(['My progress', 'Returned work', 'Organiser']);
  });
  it('gives the teacher’s view no Organiser tab', () => {
    const h = renderProfile(payload as never, { classId: 'class1', organiser: organiser as never, teacher: { name: 'Ava Nguyen' } });
    expect(h.querySelector('.pg-tabs')).toBeNull();
    expect(h.querySelector('.kos-root')).toBeNull();
  });
  it('shows the sheet without an initials box when the class has no list', () => {
    const h = renderProfile({ need: 'initials' } as never, { classId: 'class1', organiser: { ...organiser, need: 'no_list' } as never });
    expect(h.querySelector('.pm-claim')).toBeNull();
    expect(h.querySelector('.kos-title')!.textContent).toBe('Sample unit organiser');
    expect(h.querySelector('.kos-prac')).toBeNull();
  });
});

describe('To do panel boxes', () => {
  const lesson = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Lesson ${id}`, kind: 'lesson' as const, role: 'core' as const, done: false, reason: 'Next in the unit', ...extra });
  const base: TodoPayload = { countdowns: [], announcements: [], practice: null, waiting: [], boxes: [], more: 0 };

  it('draws the boxes in order with dot headings, hints and reasons; empty boxes are left out', () => {
    const panel = renderTodoPanel({ ...base, boxes: [
      { key: 'now', items: [
        lesson('s', { reason: 'Pick up where you left off', started: { activities: [{ id: 'a', title: 'Warm-up', done: true }, { id: 'b', title: 'Questions', done: false }] } }),
        { id: 'w:1', title: 'Hinge', kind: 'feedback', done: false, reason: 'Your teacher asked for another go', feedback: { state: 'redraft', kind: 'answer', date: '5 Nov' } },
        { id: 'w:2', title: 'Essay', kind: 'feedback', done: false, reason: 'Feedback is back. Have a read', feedback: { state: 'new', kind: 'written', date: '5 Nov' } }
      ] },
      { key: 'next', items: [] },
      { key: 'challenge', items: [lesson('x', { role: 'extension', reason: 'Challenge lesson', kind: 'quiz' })] }
    ] }, { classId: 'class1' });
    const boxes = [...panel.querySelectorAll('.td-box')];
    expect(boxes.map((b) => b.querySelector('.td-group__title')!.textContent)).toEqual(['Do now', 'Challenge']);
    expect(boxes[0]!.querySelector('.td-box__hint')!.textContent).toBe('For your next test, or something to fix');
    expect([...boxes[0]!.querySelectorAll('.td-item__why')].map((w) => w.textContent)).toEqual(['Pick up where you left off', 'Your teacher asked for another go', 'Feedback is back. Have a read']);
    expect(boxes[0]!.querySelector('.td-acts')!.textContent).toContain('Warm-up');
    expect(boxes[0]!.querySelector('.td-meter')).not.toBeNull();
    expect([...boxes[0]!.querySelectorAll('.td-go')].map((g) => g.textContent)).toEqual(['Carry on →', 'Answer again →', 'Open →']);
    expect(boxes[1]!.querySelector('.td-item__note')!.textContent).toBe('Quiz');
    expect(panel.textContent).not.toContain('Keep going');
    expect(panel.textContent).not.toContain('Still to do');
  });

  it('Back to you holds only work with the teacher', () => {
    const panel = renderTodoPanel({ ...base, waiting: [{ title: 'Draft', lesson_id: 'l1', at: '2026-11-06T00:00:00Z' }] }, { classId: 'class1' });
    const group = [...panel.querySelectorAll('.td-group')].find((g) => g.querySelector('.td-group__title')!.textContent === 'Back to you')!;
    expect(group.textContent).toContain('With your teacher');
  });

  it('shows three rows not done; done-today rows stay ticked without a slot; Show more opens the rest', () => {
    const items = [lesson('d', { done: true }), ...['a', 'b', 'c', 'e', 'f'].map((id) => lesson(id))];
    const panel = renderTodoPanel({ ...base, boxes: [{ key: 'next', items }], more: 4 }, { classId: 'class1' });
    const box = panel.querySelector('.td-box')!;
    const visible = () => [...box.querySelectorAll('.td-item')].filter((r) => !r.closest('[hidden]')).map((r) => r.querySelector('.td-item__title')!.textContent);
    expect(visible()).toEqual(['Lesson d', 'Lesson a', 'Lesson b', 'Lesson c']);
    expect(box.querySelector('.td-mark--tick')).not.toBeNull();
    expect(box.querySelector('.td-item__title.is-done')!.nextElementSibling?.classList.contains('td-item__why')).toBe(false);
    const toggle = box.querySelector<HTMLButtonElement>('.td-morebtn')!;
    expect(toggle.textContent).toBe('Show 2 more');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(box.querySelector(`#${toggle.getAttribute('aria-controls')}`)).not.toBeNull();
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Show less');
    expect(visible()).toEqual(['Lesson d', 'Lesson a', 'Lesson b', 'Lesson c', 'Lesson e', 'Lesson f']);
    toggle.click();
    expect(visible()).toHaveLength(4);
    expect(panel.querySelector('.td-more')!.textContent).toBe('And 4 more on the map.');
  });
});
