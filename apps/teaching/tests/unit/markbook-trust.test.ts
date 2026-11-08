import { describe, expect, it } from 'vitest';
import { agreement, closeCalls, gainText, groupGain, quizVsWork, ranks, spearman, trustLines } from '@/evidence/trust';
import type { Evidence } from '@/evidence/types';
import type { InsightContext } from '@/evidence/context';
import type { SavedGroup } from '@/markbook/schema';
import type { MarkbookView, QuizColumn, RosterStudent } from '@/markbook/types';
import { newNextState, renderNextSteps } from '@/markbook/next-view';

const ev = (student: string, share: number, opts: { tag?: string; item?: string; source?: string; date?: string } = {}): Evidence => ({
  item: opts.item ?? 'q1',
  tags: [opts.tag ?? 'fam:x'],
  share,
  why: [],
  student,
  source: opts.source ?? 'quiz:l1',
  date: opts.date ?? '2026-10-01',
  confidence: null
});

/** One item per share, on one source. */
const answers = (student: string, shares: number[], source = 'quiz:l1', date = '2026-10-01', tag = 'fam:x'): Evidence[] =>
  shares.map((share, i) => ev(student, share, { item: `q${i + 1}`, source, date, tag }));

const STUDENTS = ['s1', 's2', 's3', 's4', 's5', 's6'];

describe('rank correlation', () => {
  it('shares ranks across ties', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it('is 1 for the same order, -1 for the reverse, and null with no spread', () => {
    expect(spearman([1, 2, 3, 4], [10, 40, 90, 160])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe('close calls', () => {
  it('flags a student near a cut, not one clearly inside a band', () => {
    // Half right on two questions sits on the Not yet cut; all wrong on four is clear of it.
    const evidence = [...answers('near', [1, 0]), ...answers('clear', [0, 0, 0, 0]), ...answers('mid', [1, 0, 1, 0.5])];
    const close = closeCalls(evidence, 'fam:x');
    expect(close.has('near')).toBe(true);
    expect(close.get('near')!.band).toBe('developing');
    expect(close.get('near')!.could).toBe('weak');
    expect(close.has('clear')).toBe(false);
  });

  it('flags nobody when every student answers the same way each time', () => {
    const evidence = [...answers('a', [0.5, 0.5]), ...answers('b', [0.8, 0.8])];
    expect(closeCalls(evidence, 'fam:x').size).toBe(0);
  });

  it('skips a student with one item, the same rule the groups use', () => {
    const evidence = [...answers('one', [0.5]), ...answers('two', [1, 0])];
    const close = closeCalls(evidence, 'fam:x');
    expect(close.has('one')).toBe(false);
    expect(close.has('two')).toBe(true);
  });
});

describe('agreement between pieces', () => {
  const level = [0.1, 0.3, 0.45, 0.6, 0.75, 0.9];
  it('is high when students rank the same on every piece', () => {
    const evidence = STUDENTS.flatMap((s, i) => [ev(s, level[i]!, { source: 'quiz:l1' }), ev(s, level[i]! * 0.9, { source: 'quiz:l2' }), ev(s, level[i]! + 0.05, { source: 'assess:c1' })]);
    const a = agreement(evidence);
    expect(a.r).toBeCloseTo(1);
    expect(a.odd).toEqual([]);
  });

  it('names a piece that ranks students the other way', () => {
    const evidence = STUDENTS.flatMap((s, i) => [ev(s, level[i]!, { source: 'quiz:l1' }), ev(s, level[i]!, { source: 'quiz:l2' }), ev(s, level[i]!, { source: 'quiz:l4' }), ev(s, level[5 - i]!, { source: 'quiz:l3' })]);
    const a = agreement(evidence);
    expect(a.odd.map((s) => s.source)).toEqual(['quiz:l3']);
  });

  it('says nothing with fewer than five students or one piece', () => {
    expect(agreement(STUDENTS.slice(0, 4).flatMap((s, i) => [ev(s, i / 4, { source: 'quiz:l1' }), ev(s, i / 4, { source: 'quiz:l2' })])).r).toBeNull();
    expect(agreement(STUDENTS.map((s, i) => ev(s, i / 6))).r).toBeNull();
  });
});

describe('quizzes against marked work', () => {
  it('ranks quiz averages against criteria and rubric marks', () => {
    const evidence = STUDENTS.flatMap((s, i) => [ev(s, i / 6, { source: 'quiz:l1' }), ev(s, 1 - i / 6, { source: i % 2 ? 'assess:c1' : 'work:l2' })]);
    const out = quizVsWork(evidence);
    expect(out.n).toBe(6);
    expect(out.r).toBeCloseTo(-1);
  });

  it('needs five students with both', () => {
    expect(quizVsWork(STUDENTS.map((s, i) => ev(s, i / 6))).r).toBeNull();
  });
});

describe('a saved group against the usual bounce', () => {
  const group: SavedGroup = {
    id: 'g1',
    name: 'Structure',
    tags: ['fam:x'],
    started: '2026-10-05',
    retired: null,
    members: [
      { student: 'a', joined: '2026-10-05', left: null, why_joined: '', why_left: null },
      { student: 'b', joined: '2026-10-05', left: '2026-10-20', why_joined: '', why_left: 'Secure' }
    ]
  };
  // Members on 20% before (the marks the group came from, dated the day it was saved); class on 60%.
  const before = [...answers('a', [0.2], 'quiz:l1', '2026-10-05'), ...answers('b', [0.2], 'quiz:l1', '2026-10-05'), ...answers('c', [1], 'quiz:l1', '2026-10-05'), ...answers('d', [1], 'quiz:l1', '2026-10-05')];
  const after = (share: number) => [...answers('a', [share], 'quiz:l2', '2026-10-12'), ...answers('b', [share], 'quiz:l2', '2026-10-12')];

  it('splits the rise into the expected bounce and the rest', () => {
    const g = groupGain(group, [...before, ...after(0.6)], 0.6)!;
    expect(g.members).toBe(2);
    expect(g.change).toBeCloseTo(0.4);
    expect(g.classBefore).toBeCloseTo(0.6);
    // (1 − 0.6) × (0.6 − 0.2) = 0.16 expected anyway.
    expect(g.expected).toBeCloseTo(0.16);
    expect(g.beyond).toBeCloseTo(0.24);
    expect(gainText(g)).toBe('Since joining: 20% → 60% (+40, 2 students). About +16 is the usual bounce for students picked on low marks, so about +24 looks like real gain.');
  });

  it('says no clear gain when the rise is about the bounce', () => {
    const g = groupGain(group, [...before, ...after(0.35)], 0.6)!;
    expect(gainText(g)).toContain('no clear gain past it yet');
  });

  it('uses a middling guess without an agreement figure, and needs two members with marks both sides', () => {
    expect(groupGain(group, [...before, ...after(0.6)], null)!.reliability).toBe(0.5);
    expect(groupGain(group, [...before, ...answers('a', [0.6], 'quiz:l2', '2026-10-12')], 0.6)).toBeNull();
  });
});

describe('trust lines', () => {
  it('asks for more marks when there are too few, and counts close calls', () => {
    const lines = trustLines(answers('a', [1, 0]), () => 'Quiz', { count: 3, placed: 4 });
    expect(lines.map((l) => [l.key, l.tone])).toEqual([['agree', 'none'], ['work', 'none'], ['close', 'low']]);
    expect(lines[2]!.text).toContain('3 of 4 placements are close calls');
  });

  it('leaves out the close-call line with nobody placed', () => {
    expect(trustLines([], () => '', { count: 0, placed: 0 }).map((l) => l.key)).toEqual(['agree', 'work']);
  });
});

describe('Next steps view', () => {
  const students: RosterStudent[] = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: ['Ann Ash', 'Bea Bell', 'Cal Cole', 'Dee Dow'][i]!, initials: id.toUpperCase() }));
  const quiz = (shares: Record<string, [number, number]>): QuizColumn => {
    const scores: QuizColumn['scores'] = {};
    for (const [student, pair] of Object.entries(shares)) {
      scores[student] = {
        attempt_id: `${student}~0`,
        submitted_at: '',
        score: pair[0] + pair[1],
        max: 2,
        pending: 0,
        rows: pair.map((share, i) => ({ id: `q${i}`, awarded: share, max: 1, confidence: null, outcomes: [], items: [{ item: `q${i}`, tags: ['fam:structural'], share, why: [] }] }))
      };
    }
    return { kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', date: '2026-10-01', hidden: false, confidence: false, questions: [], scores };
  };
  const view: MarkbookView = {
    markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' },
    students,
    quizzes: [quiz({ a: [0, 0], b: [1, 0], c: [1, 1], d: [1, 1] })]
  };
  const ctx: InsightContext = { table: null, skills: null, codes: [], outcomes: [], lessonOutcomes: new Map() };

  it('dashes close calls, says what they could be, and shows the trust panel', () => {
    const state = newNextState();
    const node = renderNextSteps(view, students, ctx, state, { openStudent: () => {}, pins: () => ({ pinned: [], dismissed: [] }), repaint: () => {} });
    const panel = node.querySelector<HTMLElement>('.mb-trust')!;
    expect(panel).not.toBeNull();
    expect([...panel.querySelectorAll<HTMLElement>('[data-trust]')].map((r) => r.dataset.trust)).toEqual(['agree', 'work', 'close']);
    const b = node.querySelector<HTMLElement>('.mb-set [data-token="b"]')!;
    expect(b.classList.contains('is-close')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Bea Bell, close call, could be Not yet');
    expect(node.querySelector<HTMLElement>('.mb-set [data-token="a"]')!.classList.contains('is-close')).toBe(false);
    const closeCount = node.querySelectorAll('.mb-set .mb-tok.is-close').length;
    expect(panel.querySelector('[data-trust="close"]')!.textContent).toContain(`${closeCount} of 4 placements`);
    b.click();
    expect(node.querySelector('.mb-sets__student')!.textContent).toContain('Developing (close call, could be Not yet)');
  });
});
