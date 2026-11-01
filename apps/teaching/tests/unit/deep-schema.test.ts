import { describe, expect, it } from 'vitest';
import { DeepUnderstandingSchema, DEEP_LIMITS, newDuId, newPieceId, pieceTag, stepTag } from '@/deep/schema';
import { UnitSchema } from '@/schemas/unit';

const du = {
  id: 'du_ab12cd',
  claim: 'Composers turn a borrowed form back on the people who made it.',
  why: 'Carries to any unseen text this class meets.',
  dot_points: ['area-one:U1'],
  concept_bullets: ['ARG1'],
  pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' }],
  shared_piece_ids: [],
  steps: [{ step: '2a', fill: 'In the first text the road is the monster.' }]
};

describe('deep understanding schema', () => {
  it('accepts a full record', () => {
    expect(DeepUnderstandingSchema.parse(du).pieces[0]!.tier).toBe('essential');
  });
  it('needs a dot point and a concept bullet', () => {
    expect(DeepUnderstandingSchema.safeParse({ ...du, dot_points: [] }).success).toBe(false);
    expect(DeepUnderstandingSchema.safeParse({ ...du, concept_bullets: [] }).success).toBe(false);
  });
  it('a unit holds at most four, and older units without any still load', () => {
    const unit = { id: 'u1', type: 'unit', title: 'T', slug: 't', status: 'active', schema_version: 1, year_id: 'y', subject_id: 's', lesson_ids: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
    expect(UnitSchema.safeParse(unit).success).toBe(true);
    expect(UnitSchema.safeParse({ ...unit, deep_understandings: Array(DEEP_LIMITS.perUnit + 1).fill(du) }).success).toBe(false);
  });
  it('makes ids and tags', () => {
    expect(newDuId()).toMatch(/^du_[a-z0-9]{6}$/);
    expect(newPieceId()).toMatch(/^kp_[a-z0-9]{6}$/);
    expect(pieceTag('kp_aa11bb')).toBe('kp:kp_aa11bb');
    expect(stepTag('du_ab12cd', '2b')).toBe('du:du_ab12cd:2b');
  });
});
