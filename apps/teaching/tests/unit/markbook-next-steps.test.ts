import { describe, expect, it, vi } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import { dotPointOutcomes, lessonOutcomeMap, withLessonOutcomes } from '@/evidence/syllabus';
import { moveKind, nextMoves, sortStudents, studentRows, syllabusRows } from '@/evidence/next-moves';
import type { Evidence } from '@/evidence/types';
import type { InsightContext } from '@/evidence/context';
import type { MarkbookView, QuizColumn, RosterStudent } from '@/markbook/types';
import { newNextState, renderNextSteps } from '@/markbook/next-view';
import { newDetailState, renderPatterns } from '@/markbook/patterns-view';

const ev = (student: string, tags: string[], share: number, item = 'q1', source = 'quiz:l1', date = '2026-10-01'): Evidence => ({
  item,
  tags,
  share,
  why: [],
  student,
  source,
  date,
  confidence: null
});

/** Two questions per student on `tag`, at `share`. */
const two = (student: string, tags: string[], share: number, source = 'quiz:l1', date = '2026-10-01'): Evidence[] => [
  ev(student, tags, share, 'q1', source, date),
  ev(student, tags, share, 'q2', source, date)
];

const alignment = {
  outcomes: [
    { n: 3, code: 'EN12-3', text: 'x' },
    { n: 5, code: 'EN12-5', text: 'x' }
  ],
  focus_areas: [
    {
      id: 'texts',
      name: 'Texts',
      points: [
        { id: 'U1', kind: 'U', short: 'a', text: 'a', outcomes: [{ n: 3, link: 'shared' }, { n: 5, link: 'related' }], concepts: [], processes: [] },
        { id: 'R2', kind: 'R', short: 'b', text: 'b', outcomes: [{ n: 5, link: 'related' }], concepts: [], processes: [] }
      ]
    }
  ]
} as unknown as Alignment;

const labels = [
  { id: 'o3', code: 'EN12-3', title: 'Language forms', group: '' },
  { id: 'o5', code: 'EN12-5', title: 'Analysis', group: '' }
];

describe('syllabus links', () => {
  it('takes shared links, or every link when a point has no shared one', () => {
    expect(dotPointOutcomes(['texts:U1'], alignment, labels)).toEqual(['out:o3']);
    expect(dotPointOutcomes(['texts:R2'], alignment, labels)).toEqual(['out:o5']);
    expect(dotPointOutcomes(['texts:U9', 'gone:U1'], alignment, labels)).toEqual([]);
    expect(dotPointOutcomes(['texts:U1'], null, labels)).toEqual([]);
  });

  it('matches an alignment code to the catalogue outcome with the same numbers', () => {
    const differently = { ...alignment, outcomes: [{ n: 3, code: 'EAV-12-03', text: 'x' }] } as Alignment;
    const catalogue = [{ id: 'o3', code: 'EA12-3', title: 'Language forms', group: '' }, { id: 'o13', code: 'EA12-13', title: 'Other', group: '' }];
    expect(dotPointOutcomes(['texts:U1'], differently, catalogue)).toEqual(['out:o3']);
  });

  it('gives quiz items with no outcome their lesson’s outcomes, and leaves tagged ones alone', () => {
    const map = lessonOutcomeMap([{ id: 'l1', dot_points: ['texts:U1'] }, { id: 'l2' }], alignment, labels);
    expect([...map.keys()]).toEqual(['l1']);
    const out = withLessonOutcomes(
      [ev('a', ['tech:x'], 1), ev('a', ['out:o5'], 1), ev('a', ['tech:x'], 1, 'q1', 'quiz:l2'), ev('a', ['skill:y'], 1, 'c1', 'assess:t1')],
      map
    );
    expect(out.map((e) => e.tags)).toEqual([['tech:x', 'out:o3'], ['out:o5'], ['tech:x'], ['skill:y']]);
  });
});

describe('next moves', () => {
  const fam = (s: string, share: number) => two(s, ['fam:structural', 'out:o3'], share);

  it('reteaches when half the class is not there yet, groups a few, and moves on when most are secure', () => {
    const evidence = [
      ...['a', 'b', 'c', 'd'].flatMap((s, i) => fam(s, i < 2 ? 0.2 : 0.9)),
      ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap((s, i) => two(s, ['fam:comparative'], i < 2 ? 0.1 : 0.7)),
      ...['a', 'b', 'c'].flatMap((s) => two(s, ['fam:descriptive'], 0.95))
    ];
    expect(moveKind(evidence)).toBe('fam');
    const moves = nextMoves(evidence, 'fam');
    expect(moves.map((m) => [m.kind, m.tag])).toEqual([
      ['reteach', 'fam:structural'],
      ['group', 'fam:comparative'],
      ['move_on', 'fam:descriptive']
    ]);
    expect(moves[0]!.students).toEqual(['a', 'b']);
    expect(moves[2]!.secure).toEqual(['a', 'b', 'c']);
  });

  it('merges small groups of much the same students into one move, each tag keeping its own students', () => {
    const evidence = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap((s, i) => [
      ...two(s, ['fam:x'], i < 3 ? 0.1 : 0.7),
      ...two(s, ['fam:y'], i < 2 ? 0.2 : 0.75),
      ...two(s, ['fam:z'], i >= 6 ? 0.1 : 0.8)
    ]);
    const moves = nextMoves(evidence, 'fam');
    expect(moves.map((m) => m.parts.map((p) => p.tag))).toEqual([['fam:x', 'fam:y'], ['fam:z']]);
    expect(moves[0]!.students).toEqual(['a', 'b', 'c']);
    expect(moves[0]!.parts[1]!.students).toEqual(['a', 'b']);
  });

  it('makes no move on one question or two students', () => {
    const thin = ['a', 'b', 'c'].map((s) => ev(s, ['fam:x'], 0));
    const few = ['a', 'b'].flatMap((s) => two(s, ['fam:y'], 0));
    expect(nextMoves([...thin, ...few], 'fam')).toEqual([]);
  });

  it('spreads an outcome over the class, students with no marks included, with its families inside', () => {
    const evidence = [...fam('a', 0.2), ...fam('b', 0.9), ...two('c', ['fam:comparative', 'out:o3'], 0.6)];
    const [row] = syllabusRows(evidence, [{ source: 'quiz:l1', title: 'Quiz' }], ['a', 'b', 'c', 'd']);
    expect(row!.tag).toBe('out:o3');
    expect(row!.spread).toEqual({ weak: 1, developing: 1, secure: 1, none: 1 });
    expect(row!.parts.map((p) => p.tag).sort()).toEqual(['fam:comparative', 'fam:structural']);
  });

  it('ranks students by need, then by lowest average, with no marks last', () => {
    const sources = [{ source: 'quiz:l1', title: 'One' }, { source: 'quiz:l2', title: 'Two' }];
    const evidence = [
      ...two('a', ['fam:x'], 0.2), ...two('a', ['fam:y'], 0.3),
      ...two('b', ['fam:x'], 0.4, 'quiz:l1', '2026-10-01'), ...two('b', ['fam:y'], 0.9, 'quiz:l2', '2026-10-08'),
      ...two('c', ['fam:x'], 1), ...two('c', ['fam:y'], 1)
    ];
    const rows = studentRows(evidence, sources, ['a', 'b', 'c', 'd'], 'fam', () => ({ pinned: [], dismissed: [] }));
    const names: Record<string, string> = { a: 'Zed', b: 'Amy', c: 'Bo', d: 'Cy' };
    expect(sortStudents(rows, 'need', (id) => names[id]!).map((r) => r.student)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortStudents(rows, 'name', (id) => names[id]!).map((r) => r.student)).toEqual(['b', 'c', 'd', 'a']);
    const b = rows.find((r) => r.student === 'b')!;
    expect(b.change).toBeCloseTo(0.5);
    expect(rows.find((r) => r.student === 'c')!.secure).toBe(2);
  });
});

const students: RosterStudent[] = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: ['Ann Ash', 'Bea Bell', 'Cal Cole', 'Dee Dow'][i]!, initials: id.toUpperCase() }));

function quiz(shares: Record<string, number>): QuizColumn {
  const scores: QuizColumn['scores'] = {};
  for (const [student, share] of Object.entries(shares)) {
    scores[student] = {
      attempt_id: `${student}~0`,
      submitted_at: '',
      score: share,
      max: 1,
      pending: 0,
      rows: ['q1', 'q2'].map((id) => ({ id, awarded: share, max: 1, confidence: null, outcomes: [], items: [{ item: id, tags: ['fam:structural'], share, why: [] }] }))
    };
  }
  return { kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', date: '2026-10-01', hidden: false, confidence: false, questions: [], scores };
}

const view = (shares: Record<string, number>): MarkbookView => ({
  markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' },
  students,
  quizzes: [quiz(shares)]
});

const ctx: InsightContext = { table: null, skills: null, codes: [], outcomes: labels, lessonOutcomes: new Map([['l1', ['out:o3']]]) };

describe('Next steps view', () => {
  it('draws a reteach card whose Ann button gets the students not there yet', () => {
    const followUp = vi.fn();
    const node = renderNextSteps(view({ a: 0, b: 0.2, c: 0.9, d: 1 }), students, ctx, newNextState(), {
      openStudent: () => {},
      followUp,
      pins: () => ({ pinned: [], dismissed: [] }),
      repaint: () => {}
    });
    const card = node.querySelector('.mb-move--reteach')!;
    expect(card.textContent).toContain('Reteach to the class');
    expect(card.textContent).toContain('2 of 4 not there yet');
    card.querySelector<HTMLButtonElement>('.mb-move__ann')!.click();
    expect(followUp).toHaveBeenCalledWith('fam:structural', ['a', 'b'], expect.any(Array));
    // The lesson's dot point puts the quiz under its outcome.
    expect(node.querySelector('.mb-syl')?.textContent).toContain('EN12-3');
    expect(node.querySelector('.mb-syl')?.textContent).toContain('Language forms');
  });

  it('lists students most need first and re-sorts by name', () => {
    const state = newNextState();
    let node = document.createElement('div');
    const draw = () => {
      node = renderNextSteps(view({ a: 0.9, b: 0.1, c: 0.5, d: 1 }), students, ctx, state, {
        openStudent: () => {},
        pins: () => ({ pinned: [], dismissed: [] }),
        repaint: draw
      });
    };
    draw();
    const order = () => [...node.querySelectorAll('.mb-who__name')].map((n) => n.textContent);
    expect(order()[0]).toBe('B · Bea Bell');
    node.querySelector<HTMLButtonElement>('[aria-label="Sort students"] [data-sort="name"]')!.click();
    expect(order()).toEqual(['A · Ann Ash', 'B · Bea Bell', 'C · Cal Cole', 'D · Dee Dow']);
  });
});

describe('Detail view', () => {
  it('sorts the heatmap by a tag column, then turns the order round', () => {
    const host = document.createElement('div');
    document.body.append(host);
    host.append(renderPatterns(view({ a: 0.5, b: 0.1, c: 0.9, d: 0.3 }), students, ctx, { openStudent: () => {} }, newDetailState()));
    const names = () => [...host.querySelectorAll('.mb-patterns__heatmap .mb-patterns__name')].map((n) => n.textContent);
    expect(names()[0]).toBe('A · Ann Ash');
    const heading = () => [...host.querySelectorAll<HTMLButtonElement>('.mb-patterns__heatmap .mb-sort')].find((b) => b.dataset.sortCol === 'structural')!;
    heading().click();
    expect(names()).toEqual(['B · Bea Bell', 'D · Dee Dow', 'A · Ann Ash', 'C · Cal Cole']);
    heading().click();
    expect(names()[0]).toBe('C · Cal Cole');
    host.remove();
  });
});
