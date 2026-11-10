import { describe, it, expect } from 'vitest';
import { BlockSchema, ComparativeJudgementBlockSchema, CJ_DEFAULT_CHIPS, CJ_DEFAULT_CRITERION } from '@/schemas/block';
import type { ComparativeJudgementBlock } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { blockRegistry } from '@/blocks/registry';
import { renderBlock } from '@/blocks/render';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { blocksToSearchText } from '@/blocks/search-text';
import { listPublishBlockWarnings } from '@/schemas/publish-block-issues';
import { mountStudent } from '@/blocks/comparative-judgement/student';
import { shortAnswerChoices } from '@/blocks/comparative-judgement/editor';
import type { StudentApi, StudentStatus } from '@/blocks/comparative-judgement/api';
import { filterBlocksForStudent as serverFilter } from '../../../../netlify/functions/_shared/teaching-student.mjs';

const frame = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Invented content only. */
function sample(): ComparativeJudgementBlock {
  const block = createBlock('comparative_judgement', 'cj1') as ComparativeJudgementBlock;
  return {
    ...block,
    content: {
      ...block.content,
      title: 'Which answer explains the lantern better?',
      source: { lesson_id: '', block_id: 'qs1', question_id: 'q1' },
      calibration: [
        { id: 'cal1', left: 'Calibration answer one.', right: 'Calibration answer two.', better: 'right', reason: 'TEACHER REASON quotes and explains.' }
      ],
      anchors: [{ id: 'anc1', text: 'ANCHOR TEXT about the lantern.', mark: 12 }],
      teacher_weight: 3,
      out_of: 25
    }
  };
}

describe('Comparative judgement block', () => {
  it('parses with defaults and is a lesson-only Learning block', () => {
    const parsed = ComparativeJudgementBlockSchema.parse({
      id: 'x', type: 'block', block_type: 'comparative_judgement', visibility: 'student_teacher', content: {},
      created_at: '2026-11-10T00:00:00.000Z', updated_at: '2026-11-10T00:00:00.000Z', schema_version: 1
    });
    expect(parsed.content).toMatchObject({
      criterion: CJ_DEFAULT_CRITERION,
      chips: CJ_DEFAULT_CHIPS,
      calibration: [],
      anchors: [],
      per_student: 8,
      show_third: false,
      teacher_weight: 2,
      downweight_misfits: true,
      out_of: 20,
      source: { lesson_id: '', block_id: '', question_id: '' }
    });
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('comparative_judgement');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('comparative_judgement');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('comparative_judgement');
    expect(blockRegistry.comparative_judgement).toBeDefined();
  });

  it('createBlock default parses, and the schema holds its limits', () => {
    const block = createBlock('comparative_judgement', 'cj0');
    expect(BlockSchema.safeParse(block).success).toBe(true);
    const bad = (patch: Record<string, unknown>) => BlockSchema.safeParse({ ...block, content: { ...block.content, ...patch } }).success;
    expect(bad({ chips: Array.from({ length: 9 }, (_, i) => `c${i}`) })).toBe(false);
    expect(bad({ per_student: 3 })).toBe(false);
    expect(bad({ teacher_weight: 4 })).toBe(false);
    expect(bad({ anchors: Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, text: '', mark: null })) })).toBe(false);
  });

  it('the student copy drops calibration picks and reasons, anchors and teacher settings (client and server alike)', () => {
    for (const filter of [filterBlocksForStudent, serverFilter as (b: unknown[]) => unknown[]]) {
      const [student] = filter([sample()]) as ComparativeJudgementBlock[];
      const c = student!.content as Record<string, unknown>;
      expect(c.calibration).toEqual([{ id: 'cal1', left: 'Calibration answer one.', right: 'Calibration answer two.' }]);
      expect(c).not.toHaveProperty('anchors');
      expect(c).not.toHaveProperty('teacher_weight');
      expect(c).not.toHaveProperty('downweight_misfits');
      expect(c).not.toHaveProperty('out_of');
      expect(c.chips).toEqual(CJ_DEFAULT_CHIPS);
      expect(JSON.stringify(student)).not.toContain('TEACHER REASON');
      expect(JSON.stringify(student)).not.toContain('ANCHOR TEXT');
    }
  });

  it('print shows the criterion, chips and practice pairs, and never the teacher’s pick, anchors or answers', () => {
    const root = renderBlock(sample(), 'print', { lessonId: 'lesson_x' });
    const text = root.textContent ?? '';
    expect(text).toContain(CJ_DEFAULT_CRITERION);
    expect(text).toContain('Precise quote');
    expect(text).toContain('Calibration answer one.');
    expect(text).toContain('Which is better? Why?');
    expect(text).not.toContain('TEACHER REASON');
    expect(text).not.toContain('ANCHOR TEXT');
  });

  it('search text includes the title, criterion and chips', () => {
    const text = blocksToSearchText([sample()]);
    expect(text).toContain('lantern');
    expect(text).toContain('Clear argument');
  });

  it('warns before publishing with no question picked', () => {
    const block = createBlock('comparative_judgement', 'cj2');
    expect(listPublishBlockWarnings([block]).map((w) => w.message)).toEqual(['No question picked, so there are no answers to judge']);
    expect(listPublishBlockWarnings([sample()])).toEqual([]);
  });

  it('the editor lists short-answer questions only', () => {
    const qs = createBlock('question_set', 'qs1');
    if (qs.block_type !== 'question_set') throw new Error('Expected question_set');
    qs.content.questions = [
      { id: 'q1', prompt: 'How does the lantern show loneliness?', kind: 'short_answer' },
      { id: 'q2', prompt: 'Pick one', kind: 'multiple_choice', options: ['a', 'b'] }
    ];
    expect(shortAnswerChoices([qs]).map((c) => c.value)).toEqual(['qs1::q1']);
  });

  it('the student view never shows a rank number or a name, even with a third', async () => {
    const judgingPair = { left: { id: 'a1', text: 'Synthetic answer one.' }, right: { id: 'a2', text: 'Synthetic answer two.' } };
    const states: StudentStatus[] = [
      { need: null, phase: 'judge', target: 8, done_count: 2, has_answer: true },
      { need: null, phase: 'done', target: 8, done_count: 8, has_answer: true, third: 'top' }
    ];
    for (const state of states) {
      const api: StudentApi = {
        status: async () => state,
        claim: async () => state,
        calibrate: async () => ({ ...state, teacher: 'left', reason: '' }),
        predict: async () => state,
        next: async () => ({ pair: judgingPair, done_count: 2, target: 8, phase: 'judge' }),
        judge: async () => state,
        reflect: async () => state
      };
      const root = mountStudent(sample(), { lessonId: 'lesson_x', classId: 'class_x', api });
      document.body.append(root);
      await frame(60);
      const text = root.textContent ?? '';
      if (state.phase === 'judge') {
        expect(text).toContain('Synthetic answer one.');
        expect(text).toContain('Pair 3 of 8');
        expect(root.querySelectorAll('button.cj-chip').length).toBe(CJ_DEFAULT_CHIPS.length * 2);
      } else {
        expect(text).toContain('top third');
      }
      expect(text).not.toMatch(/\b(rank|ranked)\b/i);
      expect(text).not.toMatch(/#\s?\d|\b\d+(st|nd|rd|th)\b/);
      root.remove();
    }
  });
});
