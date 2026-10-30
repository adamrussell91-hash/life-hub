import { describe, expect, it } from 'vitest';
import { renderProfile } from '@/student/profile-view';
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
      { id: 'l1', title: 'Ghost poem', role: 'core', kind: 'lesson', done: true, assigned: true },
      { id: 'l2', title: 'Tutorial', role: 'support', kind: 'lesson', done: false, assigned: true },
      { id: 'l3', title: 'Stretch', role: 'extension', kind: 'lesson', done: false, assigned: false },
      { id: 'l4', title: 'Quiz 1', role: 'core', kind: 'quiz', done: false, assigned: true },
      { id: 'l5', title: 'Essay', role: 'core', kind: 'assessment', done: false, assigned: true }
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
  it('fades an unassigned lesson but keeps it pressable', () => {
    expect(row('l3').classList.contains('cm-faded')).toBe(true);
    expect(row('l3').getAttribute('role')).toBe('button');
    expect(row('l2').classList.contains('cm-faded')).toBe(false);
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
  codes: [{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [1, 1], hit: 2, of: 2, total: 2, dropped: false }]
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
    expect(host.querySelector('.pg-skills .pg-path')).toBeTruthy();
    expect(host.querySelector('.pg-codes .pg-codes__n')!.textContent).toBe('1');
  });
  it('badges Returned work with the unseen count', () => {
    expect(host.querySelector('[data-tab="returned"] .pg-tab__badge')!.textContent).toBe('2');
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
