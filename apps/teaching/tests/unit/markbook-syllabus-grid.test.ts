import { describe, expect, it, vi } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import type { InsightContext } from '@/evidence/context';
import { lessonPointMap, outcomePointMap, withPointTags } from '@/evidence/syllabus';
import { classRung, rungOf, sortPoints, syllabusGrid } from '@/evidence/syllabus-grid';
import { moveKind, nextMoves } from '@/evidence/next-moves';
import type { Evidence } from '@/evidence/types';
import type { SkillsContinuum } from '@/skills/schema';
import type { MarkbookView, QuizColumn, RosterStudent } from '@/markbook/types';
import { newSyllabusGridState, renderSyllabusGrid } from '@/markbook/syllabus-grid';
import { newNextState, renderNextSteps } from '@/markbook/next-view';

const alignment = {
  outcomes: [{ n: 3, code: 'EN12-3', text: 'x' }, { n: 5, code: 'EN12-5', text: 'x' }],
  concepts: [{ key: 'CX', name: 'Context', head: 'h', bullets: [{ n: 1, text: 'Texts reflect their time', adv: false }] }],
  focus_areas: [
    {
      id: 'texts',
      name: 'Texts',
      points: [
        { id: 'U1', kind: 'U', short: 'Language shapes meaning', text: 'a', outcomes: [{ n: 3, link: 'shared' }], concepts: [{ ref: 'CX1', link: 'shared' }], processes: [] },
        { id: 'R2', kind: 'R', short: 'Compose a response', text: 'b', outcomes: [{ n: 5, link: 'shared' }], concepts: [], processes: [] }
      ]
    }
  ]
} as unknown as Alignment;

const labels = [
  { id: 'o3', code: 'EN12-3', title: 'Language forms', group: '' },
  { id: 'o5', code: 'EN12-5', title: 'Analysis', group: '' }
];

const skills = {
  strands: [{ strand: 'reading', name: 'Reading', sub_strands: [{ id: 'infer', name: 'Inferring', points: [{ area: 'texts', point: 'U1', link: 'shared' }] }] }]
} as unknown as SkillsContinuum;

const ctx: InsightContext = { table: null, skills, codes: [], outcomes: labels, alignment };

const students: RosterStudent[] = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: ['Ann Ash', 'Bea Bell', 'Cal Cole', 'Dee Dow'][i]!, initials: id.toUpperCase() }));

const ev = (student: string, tags: string[], share: number, item = 'q1', source = 'quiz:l1'): Evidence => ({ item, tags, share, why: [], student, source, date: '2026-10-01', confidence: null });
const two = (student: string, tags: string[], share: number): Evidence[] => [ev(student, tags, share, 'q1'), ev(student, tags, share, 'q2')];
const U1 = 'dp:texts:U1';
const tagged = (student: string, share: number): Evidence[] => two(student, [U1, 'out:o3', 'skill:reading.infer', 'tech:x'], share);

describe('dot point tags', () => {
  it('gives quiz items their lesson’s points, and assessment criteria the points their outcomes reach', () => {
    expect([...lessonPointMap([{ id: 'l1', dot_points: ['texts:U1', 'texts:U9', 'gone:U1'] }, { id: 'l2' }], alignment)]).toEqual([['l1', [U1]]]);
    expect(lessonPointMap([{ id: 'l1', dot_points: ['texts:U1'] }], null).size).toBe(0);
    const byOutcome = outcomePointMap(alignment, labels);
    expect(byOutcome.get('out:o3')).toEqual([U1]);
    const out = withPointTags(
      [ev('a', ['tech:x'], 1), ev('a', ['out:o5'], 1, 'c1', 'assess:t1'), ev('a', ['tech:x'], 1, 'q1', 'quiz:l2')],
      lessonPointMap([{ id: 'l1', dot_points: ['texts:U1'] }], alignment),
      byOutcome
    );
    expect(out.map((e) => e.tags)).toEqual([['tech:x', U1], ['out:o5', 'dp:texts:R2'], ['tech:x']]);
  });
});

describe('skill rungs', () => {
  it('places a share on the ladder with the starting cut-offs', () => {
    expect([0.1, 0.39, 0.4, 0.6, 0.8, 0.9, 1].map(rungOf)).toEqual(['below', 'below', 'capable', 'skilled', 'accomplished', 'excellent', 'excellent']);
  });

  it('names the highest rung that half the rated students have reached', () => {
    expect(classRung([null, null])).toBeNull();
    expect(classRung(['skilled', 'skilled', 'capable', 'below'])).toBe('skilled');
    expect(classRung(['excellent', 'capable', 'capable', 'capable'])).toBe('capable');
    expect(classRung(['below', 'below', 'capable'])).toBe('below');
  });
});

describe('syllabus grid rows', () => {
  const evidence = [...tagged('a', 0.2), ...tagged('b', 0.7), ...tagged('c', 0.95)];
  const rows = syllabusGrid(evidence, alignment, labels, ctx, ['a', 'b', 'c', 'd']);

  it('has a row per dot point, with each student’s band and who is behind', () => {
    expect(rows.map((r) => r.label)).toEqual(['U1 Language shapes meaning', 'R2 Compose a response']);
    const u1 = rows[0]!;
    expect(['a', 'b', 'c', 'd'].map((s) => u1.line.cells[s]!.band)).toEqual(['weak', 'developing', 'secure', null]);
    expect(u1.weak).toEqual(['a']);
    expect(u1.line.spread).toEqual({ weak: 1, developing: 1, secure: 1, none: 1 });
    expect(rows[1]!.line.mean).toBeNull();
  });

  it('opens into outcomes, concept bullets, skills on the ladder, and techniques', () => {
    const u1 = rows[0]!;
    expect(u1.outcomes.map((l) => [l.label, l.sub])).toEqual([['EN12-3', 'Language forms']]);
    expect(u1.concepts).toEqual([{ ref: 'CX1', name: 'Context', text: 'Texts reflect their time', link: 'shared' }]);
    const skill = u1.skills[0]!;
    expect(skill.ladder).toBe(true);
    expect(['a', 'b', 'c'].map((s) => skill.cells[s]!.rung)).toEqual(['below', 'skilled', 'excellent']);
    expect(skill.cells.a!.band).toBeNull();
    expect(skill.classRung).toBe('skilled');
    expect(u1.techniques.map((l) => l.tag)).toEqual(['tech:x']);
  });

  it('sorts weakest first or in syllabus order, with dot points that have no marks last', () => {
    const two = syllabusGrid([...evidence, ...tagged('a', 0.1).map((e) => ({ ...e, tags: ['dp:texts:R2', 'out:o5'] }))], alignment, labels, ctx, ['a', 'b', 'c']);
    expect(sortPoints(two, 'weakest').map((r) => r.point.id)).toEqual(['R2', 'U1']);
    expect(sortPoints(two, 'syllabus').map((r) => r.point.id)).toEqual(['U1', 'R2']);
    expect(sortPoints(rows, 'weakest').map((r) => r.point.id)).toEqual(['U1', 'R2']);
  });

  it('gives no rows without an alignment', () => {
    expect(syllabusGrid(evidence, null, labels, ctx, ['a'])).toEqual([]);
  });
});

function quiz(shares: Record<string, number>): QuizColumn {
  const scores: QuizColumn['scores'] = {};
  for (const [student, share] of Object.entries(shares)) {
    scores[student] = {
      attempt_id: `${student}~0`,
      submitted_at: '',
      score: share,
      max: 1,
      pending: 0,
      rows: ['q1', 'q2'].map((id) => ({ id, awarded: share, max: 1, confidence: null, outcomes: [], items: [{ item: id, tags: ['out:o3', 'skill:reading.infer', 'tech:x'], share, why: [] }] }))
    };
  }
  return { kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', date: '2026-10-01', hidden: false, confidence: false, questions: [], scores };
}
const view = (shares: Record<string, number>): MarkbookView => ({ markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' }, students, quizzes: [quiz(shares)] });
const viewCtx: InsightContext = { ...ctx, lessonPoints: new Map([['l1', [U1]]]) };

describe('Grid view', () => {
  function mount(narrow = false, extra: Partial<Parameters<typeof renderSyllabusGrid>[4]> = {}) {
    const state = newSyllabusGridState();
    const host = document.createElement('div');
    const draw = () => host.replaceChildren(renderSyllabusGrid(view({ a: 0.1, b: 0.2, c: 0.9, d: 1 }), students, viewCtx, state, { openStudent: () => {}, repaint: draw, ...extra }, narrow));
    draw();
    document.body.append(host);
    return { host, state };
  }

  it('draws dot points down and students across, closed at first', () => {
    const { host } = mount();
    expect([...host.querySelectorAll('.mbg__initials')].map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(host.querySelector('.mbg-row__label')?.textContent).toBe('U1 Language shapes meaning');
    expect(host.querySelectorAll('.mbg-row .mbg-cell')).toHaveLength(4);
    expect(host.querySelector('.mbg-line-row')).toBeNull();
    host.remove();
  });

  it('opens a dot point into its parts, and keeps techniques behind a toggle', () => {
    const { host, state } = mount();
    host.querySelector<HTMLButtonElement>('.mbg-row__toggle')!.click();
    expect(state.open.has(U1)).toBe(true);
    expect([...host.querySelectorAll('.mbg-group-row')].map((r) => r.textContent)).toEqual(['Outcomes', 'Skills, on their ladder']);
    expect(host.querySelector('.mbg-concepts')?.textContent).toContain('Context CX1');
    expect(host.querySelector('.mbg-concepts')?.textContent).toContain('no marks of their own');
    expect(host.querySelector('.mbg-line-row--skill .mbg-cell--r-skilled, .mbg-line-row--skill .mbg-cell--r-below')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.mbg__tech')!.click();
    expect(host.querySelector('.mbg-line-row--tech')).not.toBeNull();
    expect(host.querySelector('.mbg__tech')?.getAttribute('aria-pressed')).toBe('true');
    host.remove();
  });

  it('names who to pull aside and hands them to the follow-up and tutorial buttons', () => {
    const followUp = vi.fn();
    const planTutorial = vi.fn();
    const { host } = mount(false, { followUp, planTutorial });
    host.querySelector<HTMLButtonElement>('.mbg-row__toggle')!.click();
    expect(host.querySelector('.mbg-aside__text')?.textContent).toBe('Pull aside: Ann Ash, Bea Bell');
    host.querySelector<HTMLButtonElement>('.mbg-ann')!.click();
    host.querySelector<HTMLButtonElement>('.mbg-tutorial')!.click();
    expect(followUp).toHaveBeenCalledWith(U1, ['a', 'b'], expect.any(Array));
    expect(planTutorial).toHaveBeenCalledWith(U1, ['a', 'b'], expect.any(Array));
    host.remove();
  });

  it('opens a student from their initials', () => {
    const openStudent = vi.fn();
    const { host } = mount(false, { openStudent });
    host.querySelector<HTMLButtonElement>('.mbg__initials')!.click();
    expect(openStudent).toHaveBeenCalledWith('a');
    host.remove();
  });

  it('stacks dot points on a phone, each with a spread bar', () => {
    const { host } = mount(true);
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelectorAll('.mbg-card')).toHaveLength(1);
    expect(host.querySelector('.mbg-card .mb-next__bar')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.mbg-row__toggle')!.click();
    expect(host.querySelector('.mbg-card .mbg-group')?.textContent).toBe('Outcomes');
    expect(host.querySelector('.mbg-line__rung')?.textContent).toBeTruthy();
    host.remove();
  });

  it('says so when no syllabus is loaded', () => {
    const host = document.createElement('div');
    host.append(renderSyllabusGrid(view({ a: 1 }), students, { ...viewCtx, alignment: null }, newSyllabusGridState(), { openStudent: () => {}, repaint: () => {} }, false));
    expect(host.querySelector('.mb__empty')?.textContent).toContain('No syllabus is loaded');
  });
});

describe('Next steps from dot points', () => {
  const dpEvidence = [...tagged('a', 0), ...tagged('b', 0.1), ...tagged('c', 0.9), ...tagged('d', 1)];

  it('decides moves per dot point when evidence reaches one, else per family or outcome', () => {
    expect(moveKind(dpEvidence)).toBe('dp');
    expect(moveKind([ev('a', ['fam:x'], 1)])).toBe('fam');
    const moves = nextMoves(dpEvidence, 'dp');
    expect(moves.map((m) => [m.kind, m.tag])).toEqual([['reteach', U1]]);
  });

  it('shows the outcome and skill to work on inside the dot point', () => {
    const node = renderNextSteps(view({ a: 0, b: 0.1, c: 0.9, d: 1 }), students, viewCtx, newNextState(), {
      openStudent: () => {},
      pins: () => ({ pinned: [], dismissed: [] }),
      repaint: () => {}
    });
    const card = node.querySelector('.mb-move--reteach')!;
    expect(card.querySelector('.mb-move__tag')?.textContent).toBe('U1 Language shapes meaning');
    expect(card.querySelector('.mb-move__inside')?.textContent).toContain('Outcome to work on: EN12-3');
    expect(card.querySelector('.mb-move__inside')?.textContent).toContain('Skill to build: Inferring');
  });
});
