import { describe, expect, it } from 'vitest';
import { unitScope } from '@/deep/scope';
import { lessonWeeks, placements, planGaps } from '@/deep/derive';
import type { Alignment } from '@/alignment/schema';

// Invented alignment, same shape as tests/unit/alignment.test.ts.
const alignment = {
  concepts: [
    { key: 'ARG', name: 'Argument', head: 'h', bullets: [{ n: 1, text: 'claims need reasons', adv: false }, { n: 2, text: 'counter claims help', adv: false }] },
    { key: 'STY', name: 'Style', head: 'h', bullets: [{ n: 1, text: 'style shapes meaning', adv: false }] }
  ],
  focus_areas: [{ id: 'area-one', name: 'A', points: [
    { id: 'U1', kind: 'U', short: 'Close reading', text: 't', outcomes: [], concepts: [{ ref: 'ARG1', link: 'shared' }, { ref: 'STY1', link: 'related' }], processes: [] },
    { id: 'R1', kind: 'R', short: 'New forms', text: 't', outcomes: [], concepts: [{ ref: 'ARG2', link: 'shared' }], processes: [] },
    { id: 'U2', kind: 'U', short: 'Not taught', text: 't', outcomes: [], concepts: [{ ref: 'STY1', link: 'shared' }], processes: [] }
  ] }]
} as unknown as Alignment;

const quiz = (id: string, pieces: string[]) => ({ id, block_type: 'quiz_question', visibility: 'all', content: { question: { id, kind: 'short_answer', prompt: 'p', marks: 1, accepted: ['a'], pieces } }, settings: {} });
const lessons = [
  { id: 'L1', title: 'One', dot_points: ['area-one:U1'], blocks: [{ id: 'b1', block_type: 'rich_text', visibility: 'all', content: {}, settings: { deep_taught: ['kp_aa11bb'] } }] },
  { id: 'L2', title: 'Two', dot_points: ['area-one:R1'], blocks: [quiz('q1', ['kp_aa11bb']), quiz('q2', ['kp_aa11bb']), { id: 'b2', block_type: 'question_set', visibility: 'all', content: { title: 'Paragraph' }, settings: { deep_step: { du: 'du_ab12cd', step: '2a' } } }] },
  { id: 'L3', title: 'Three', blocks: [{ id: 'sec', block_type: 'section', visibility: 'all', content: { blocks: [quiz('q3', ['kp_aa11bb'])] }, settings: {} }] }
] as never;

describe('unit scope', () => {
  it('lists only the unit’s dot points and the concept bullets linked to them', () => {
    const scope = unitScope(lessons, alignment);
    expect(scope.points.map((p) => p.ref)).toEqual(['area-one:U1', 'area-one:R1']);
    expect(scope.bullets.map((b) => [b.ref, b.via])).toEqual([['ARG1', ['U1']], ['STY1', ['U1']], ['ARG2', ['R1']]]);
  });
});

describe('placements', () => {
  it('finds taught and tested lessons, item counts and step tasks, inside sections too', () => {
    const p = placements(lessons, 'du_ab12cd');
    expect(p.taught.get('kp_aa11bb')).toEqual(['L1']);
    expect(p.tested.get('kp_aa11bb')).toEqual({ lessons: ['L2', 'L3'], items: 3 });
    expect(p.steps.get('2a')).toEqual({ lesson_id: 'L2', block_id: 'b2', title: 'Paragraph' });
  });
});

describe('lesson weeks', () => {
  it('weeks run from the earliest dated lesson; undated lessons are null', () => {
    const weeks = lessonWeeks(['L1', 'L2', 'L3'], [
      { lesson_id: 'L1', date: '2026-10-12' }, { lesson_id: 'L1', date: '2026-10-14' },
      { lesson_id: 'L2', date: '2026-10-20' }
    ]);
    expect(weeks.get('L1')).toBe(1);
    expect(weeks.get('L2')).toBe(2);
    expect(weeks.get('L3')).toBeNull();
  });
});

describe('plan gaps', () => {
  it('names what is missing', () => {
    const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: [], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 't', tier: 'essential' as const }, { id: 'kp_cc22dd', text: 'u', tier: 'strong' as const }], shared_piece_ids: [], steps: [] };
    expect(planGaps(du, [du], placements(lessons, 'du_ab12cd'))).toEqual([
      'Needs a dot point',
      'Only 2 knowledge pieces (aim for 8 to 12 Essential and Strong)',
      '1 piece not taught yet',
      '1 piece not tested yet',
      'No evidence task for Steps 2B, 3, 4'
    ]);
  });
});
