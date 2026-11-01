import { describe, expect, it } from 'vitest';
import { kindOf, tagLabel } from '@/evidence/tags';
import { answerEvidence } from '@/quiz/evidence';
import { splitQuestion, QuizQuestionSchema } from '@/quiz/core';

const ctx = {
  table: null, outcomes: [], skills: null,
  deep: [{ id: 'du_ab12cd', claim: 'A borrowed form turned back', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' as const }], shared_piece_ids: [], steps: [] }]
};

describe('deep understanding tags', () => {
  it('knows the kinds', () => {
    expect(kindOf('kp:kp_aa11bb')).toBe('kp');
    expect(kindOf('du:du_ab12cd:2a')).toBe('du');
  });
  it('labels pieces and steps, and falls back to the raw value', () => {
    expect(tagLabel('kp:kp_aa11bb', ctx)).toBe('The form began as a warning story');
    expect(tagLabel('du:du_ab12cd:2b', ctx)).toBe('DU 1 · Step 2B');
    expect(tagLabel('kp:kp_zz99zz', ctx)).toBe('kp_zz99zz');
  });
  it('a quiz question tagged with pieces gives kp: evidence', () => {
    const q = QuizQuestionSchema.parse({ id: 'q1', kind: 'short_answer', prompt: 'Where did the form begin?', marks: 1, accepted: ['a warning story'], pieces: ['kp_aa11bb'] });
    const { question, key } = splitQuestion(q);
    const [item] = answerEvidence({ question, key, response: { text: 'a warning story' }, awarded: 1 });
    expect(item!.tags).toContain('kp:kp_aa11bb');
  });
});
