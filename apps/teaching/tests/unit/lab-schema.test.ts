import { describe, expect, it } from 'vitest';
import {
  LAB_EXPLAIN_BLOCK_ID,
  LabSettingsSchema,
  explainBlockCurrent,
  labDefaults,
  labIssues,
  notePrompt,
  publicLab,
  seedLab,
  withExplainBlock,
  type LabSettings
} from '@/lab/schema';
import { PublishableLessonSchema } from '@/schemas/lesson';
import { BlockSchema } from '@/schemas/block';

// Invented labs and an invented class.
const supplied = (): LabSettings => LabSettingsSchema.parse({
  ...labDefaults('supplied'), class_id: 'class1', question: 'Does the passive voice shrink the blame?', why: 'Your essay will claim that voice shapes blame.',
  same: 'The events and their order.', options: ['Active', 'Passive'], texts: ['The company dumped waste.', 'Waste was dumped.'],
  judge_question: 'How much is the company to blame?', debrief: 'Ask who is missing from each sentence.'
});
const students = (): LabSettings => LabSettingsSchema.parse({
  ...labDefaults('students'), class_id: 'class1', question: 'Which sense makes a storm feel most real?', options: ['Sight', 'Sound', 'Touch'],
  task: 'The moment the storm hits the house.', judge_question: 'Which one feels most real?'
});
const pairs = (): LabSettings => LabSettingsSchema.parse({
  ...labDefaults('pairs'), class_id: 'class1', question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.',
  control: 'I meant to tell you\nbut the words, I think,\nwere somewhere else.', judge_question: 'How hesitant does the speaker sound?',
  pairs: [{ id: 'p1', students: ['st_kt', 'st_rv'] }]
});

describe('Lab settings', () => {
  it('each level has a valid shape with nothing to fix', () => {
    for (const lab of [supplied(), students(), pairs()]) expect(labIssues(lab)).toEqual([]);
  });

  it('defaults: threshold 8 for pick and 1 for rate, lab notes on for pairs only, six features', () => {
    expect(labDefaults('students')).toMatchObject({ judge: 'pick', threshold: 8, notes_on: false });
    expect(labDefaults('supplied')).toMatchObject({ judge: 'rate', threshold: 1, notes_on: false });
    expect(labDefaults('pairs')).toMatchObject({ judge: 'rate', threshold: 1, notes_on: true });
    expect(labDefaults('pairs').features).toHaveLength(6);
    expect(Object.keys(labDefaults('pairs').note_prompts ?? {})).toEqual(['Question', 'Design', 'Predict', 'Make', 'Test', 'Result', 'Name it']);
  });

  it('a new lab saves before it is filled in, and says what is missing', () => {
    const fresh = seedLab('class1');
    expect(LabSettingsSchema.safeParse(fresh).success).toBe(true);
    expect(labIssues(fresh)).toContain('Write the lab’s question.');
    expect(labIssues(seedLab(''))).toContain('Choose the class this lab is for.');
  });

  it('pairs needs a claim, a control, features, rating on a line and pairs', () => {
    expect(labIssues({ ...pairs(), claim: '' })).toContain('Write the claim to test.');
    expect(labIssues({ ...pairs(), control: ' ' })).toContain('Paste the control text.');
    expect(labIssues({ ...pairs(), features: [] })).toContain('List at least one feature to name.');
    expect(labIssues({ ...pairs(), judge: 'pick' })).toContain('Pairs design it is judged by rating on a line.');
    expect(labIssues({ ...pairs(), pairs: [] })).toContain('Make the pairs.');
  });

  it('supplied needs one text per option', () => {
    expect(labIssues({ ...supplied(), texts: ['Only one.'] })).toContain('Paste one text for each option.');
    expect(labIssues({ ...supplied(), texts: ['One.', ''] })).toContain('Paste one text for each option.');
    expect(labIssues({ ...supplied(), options: ['Active'] , texts: ['One.'] })).toContain('Name at least two options under Changed.');
    expect(labIssues({ ...supplied(), options: ['Active', 'active'] })).toContain('Give each option under Changed its own name.');
  });

  it('students needs a task and pick one', () => {
    expect(labIssues({ ...students(), task: '' })).toContain('Say what students write.');
    expect(labIssues({ ...students(), judge: 'rate', ends: ['Low', 'High'] })).toContain('Students write it is judged by picking one.');
  });

  it('rating on a line needs both end labels', () => {
    expect(labIssues({ ...supplied(), ends: undefined })).toContain('Label both ends of the line readers rate on.');
    expect(labIssues({ ...supplied(), ends: ['A little', ''] })).toContain('Label both ends of the line readers rate on.');
  });

  it('the public subset never carries texts, the control, pairs or the debrief', () => {
    for (const lab of [supplied(), pairs()]) {
      const shown = publicLab(lab) as Record<string, unknown>;
      for (const key of ['texts', 'control', 'pairs', 'debrief', 'class_id']) expect(shown).not.toHaveProperty(key);
      expect(shown.question).toBe(lab.question);
    }
    expect(JSON.stringify(publicLab(supplied()))).not.toContain('dumped');
    expect(publicLab(pairs()).features).toHaveLength(6);
    expect(publicLab(supplied()).features).toBeUndefined();
  });

  it('the trait reaches students for a pairs lab only, and a note prompt falls back to the usual one', () => {
    expect(publicLab({ ...pairs(), trait: ' hesitant ' }).trait).toBe('hesitant');
    expect('trait' in publicLab({ ...pairs(), trait: '  ' })).toBe(false);
    expect('trait' in publicLab({ ...supplied(), trait: 'hesitant' })).toBe(false);
    expect(LabSettingsSchema.safeParse({ ...pairs(), trait: 'x'.repeat(41) }).success).toBe(false);
    expect(notePrompt({ note_prompts: { Question: 'Which line?', Design: ' ' } }, 'Question')).toBe('Which line?');
    expect(notePrompt({ note_prompts: { Question: 'Which line?', Design: ' ' } }, 'Design')).toBe('Why this change? What is it doing in the original?');
    expect(notePrompt({}, 'Make')).toBe('Which version was hardest to write? Why?');
  });

  it('the Explain block is a valid written question, seeded once and kept current', () => {
    const lab = supplied();
    const blocks = withExplainBlock([], lab);
    expect(blocks).toHaveLength(1);
    expect(BlockSchema.safeParse(blocks[0]).success).toBe(true);
    expect(blocks[0]!.id).toBe(LAB_EXPLAIN_BLOCK_ID);
    expect(explainBlockCurrent(blocks, lab)).toBe(true);
    const asked = { ...lab, explain_prompt: 'Why did the blame change?' };
    expect(explainBlockCurrent(blocks, asked)).toBe(false);
    const again = withExplainBlock(blocks, asked);
    expect(again).toHaveLength(1);
    expect(JSON.stringify(again)).toContain('Why did the blame change?');
  });

  it('a lab lesson publishes only with its card filled in, and never with quiz questions', () => {
    const base = {
      id: 'lesson1', type: 'lesson' as const, title: 'Passive voice lab', slug: 'passive-voice-lab', unit_id: 'unit1', sequence: 1, status: 'active' as const,
      created_at: '2026-11-19T00:00:00.000Z', updated_at: '2026-11-19T00:00:00.000Z', schema_version: 1 as const, pedagogical_mode: 'lab' as const,
      blocks: withExplainBlock([], supplied())
    };
    expect(PublishableLessonSchema.safeParse({ ...base, lab: supplied() }).success).toBe(true);
    const missing = PublishableLessonSchema.safeParse(base);
    expect(missing.success).toBe(false);
    const unfinished = PublishableLessonSchema.safeParse({ ...base, lab: { ...supplied(), question: '' } });
    expect(unfinished.success ? [] : unfinished.error.issues.map((i) => i.message)).toContain('Write the lab’s question.');
  });
});
