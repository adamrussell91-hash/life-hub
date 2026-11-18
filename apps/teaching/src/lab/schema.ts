import { z } from 'zod';

/** Who decides the change: the teacher's texts, each student's writing, or each pair's edit to a control. */
export const LAB_LEVELS = ['supplied', 'students', 'pairs'] as const;
export const LAB_JUDGE = ['pick', 'rate'] as const;
export const LAB_LANGUAGE_LEVELS = ['Form', 'Sentence', 'Word'] as const;
/** Every step a lab can have. `stepsFor(level)` in model.ts gives the ones a level runs, in order. */
export const LAB_STEPS = ['Question', 'Design', 'Predict', 'Make', 'Test', 'Result', 'Name it', 'Explain'] as const;

export type LabLevel = (typeof LAB_LEVELS)[number];
export type LabJudge = (typeof LAB_JUDGE)[number];
export type LabLanguageLevel = (typeof LAB_LANGUAGE_LEVELS)[number];
export type LabStep = (typeof LAB_STEPS)[number];

export const LAB_LEVEL_LABELS: Record<LabLevel, string> = {
  supplied: 'You supply it',
  students: 'Students write it',
  pairs: 'Pairs design it'
};

/** The written answer at the Explain step is this block in `lesson.blocks`, so it is marked like any handed-in question. */
export const LAB_EXPLAIN_BLOCK_ID = 'lab_explain';
export const LAB_EXPLAIN_QUESTION_ID = 'lab_explain_q';

export const LabFeatureSchema = z.object({
  name: z.string().min(1).max(60),
  level: z.enum(LAB_LANGUAGE_LEVELS)
});
export type LabFeature = z.infer<typeof LabFeatureSchema>;

export const LabPairSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  students: z.array(z.string().min(1).max(64)).min(1).max(4)
});
export type LabPair = z.infer<typeof LabPairSchema>;

/**
 * The Plan card's lines. A draft may be half filled (an empty question saves),
 * so the "must be there" rules are in `labIssues`, which publish runs.
 */
export const LabSettingsSchema = z.object({
  class_id: z.string().max(64).default(''),
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200).default(''),
  why: z.string().max(400).default(''),
  /** Pairs design it: the claim the class tests. */
  claim: z.string().max(200).optional(),
  /** The two supplied levels: what stays the same. */
  same: z.string().max(300).optional(),
  /** The two supplied levels: what changes, two to five options. */
  options: z.array(z.string().max(40)).max(5).optional(),
  /** You supply it: one text per option. */
  texts: z.array(z.string().max(4000)).max(5).optional(),
  /** Pairs design it: the text every pair changes. Line breaks are kept. */
  control: z.string().max(4000).optional(),
  /** Students write it: what to write. */
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200).default(''),
  /** Rate on a line: the two end labels. */
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  /** Counts as a win (pick: choices ahead) or a change (rate: points out of 10). Set before any data. */
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  pairs: z.array(LabPairSchema).max(20).optional(),
  /** Teacher only. */
  debrief: z.string().max(1200).default(''),
  explain_prompt: z.string().max(400).default('')
});
export type LabSettings = z.infer<typeof LabSettingsSchema>;

/**
 * What the published snapshot carries. Never the debrief notes, the pairs'
 * member lists, the supplied texts or the control: those reach a student
 * only through the round, when the step that shows them is open.
 */
export const PublicLabSchema = z.object({
  level: z.enum(LAB_LEVELS),
  question: z.string().max(200),
  why: z.string().max(400),
  claim: z.string().max(200).optional(),
  same: z.string().max(300).optional(),
  options: z.array(z.string().max(40)).max(5).optional(),
  task: z.string().max(300).optional(),
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().max(200),
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(20), z.string().max(200)).optional(),
  features: z.array(LabFeatureSchema).max(12).optional(),
  explain_prompt: z.string().max(400)
});
export type PublicLab = z.infer<typeof PublicLabSchema>;

export const LAB_DEFAULT_FEATURES: LabFeature[] = [
  { name: 'Line break (enjambment)', level: 'Form' },
  { name: 'Hedging (modality)', level: 'Sentence' },
  { name: 'Sentence type', level: 'Sentence' },
  { name: 'Punctuation (caesura)', level: 'Sentence' },
  { name: 'Repetition', level: 'Sentence' },
  { name: 'Word choice (connotation)', level: 'Word' }
];

export const LAB_DEFAULT_NOTE_PROMPTS: Record<string, string> = {
  Question: 'Where do you hear it? Quote it.',
  Design: 'Why this change? What is it doing in the original?',
  Predict: 'Because…',
  Test: 'Which version sounded most different? What had changed in it?',
  Result: 'What do the dots show? Look at the spread and the overlap.',
  'Name it': 'What does this feature do to the voice of the speaker?'
};

/** What a level starts with: how readers judge, the threshold, lab notes on for pairs only, the feature list. */
export function labDefaults(level: LabLevel): Pick<LabSettings, 'level' | 'judge' | 'threshold' | 'notes_on' | 'note_prompts'> & Partial<LabSettings> {
  const judge: LabJudge = level === 'students' ? 'pick' : 'rate';
  return {
    level,
    judge,
    threshold: judge === 'pick' ? 8 : 1,
    notes_on: level === 'pairs',
    note_prompts: { ...LAB_DEFAULT_NOTE_PROMPTS },
    ...(judge === 'rate' ? { ends: level === 'pairs' ? ['Not at all', 'Completely'] as [string, string] : ['A little', 'Completely'] as [string, string] } : {}),
    ...(level === 'pairs' ? { features: LAB_DEFAULT_FEATURES.map((f) => ({ ...f })) } : { options: ['', ''] }),
    ...(level === 'supplied' ? { texts: ['', ''] } : {})
  };
}

/** A new lab's settings: valid to save, with the question still to write. */
export function seedLab(classId: string, level: LabLevel = 'supplied'): LabSettings {
  return LabSettingsSchema.parse({ class_id: classId, ...labDefaults(level) });
}

const filled = (text: string | undefined): boolean => typeof text === 'string' && text.trim().length > 0;

/** Why this lab can't be published yet, in the teacher's words. Empty when it can. */
export function labIssues(settings: LabSettings): string[] {
  const out: string[] = [];
  if (!filled(settings.class_id)) out.push('Choose the class this lab is for.');
  if (!filled(settings.question)) out.push('Write the lab’s question.');
  if (!filled(settings.judge_question)) out.push('Write the question readers answer.');
  if (settings.judge === 'rate' && !(settings.ends && filled(settings.ends[0]) && filled(settings.ends[1]))) out.push('Label both ends of the line readers rate on.');
  if (settings.level === 'pairs') {
    if (!filled(settings.claim)) out.push('Write the claim to test.');
    if (!filled(settings.control)) out.push('Paste the control text.');
    if (!settings.features?.length) out.push('List at least one feature to name.');
    if (settings.judge !== 'rate') out.push('Pairs design it is judged by rating on a line.');
    if (!settings.pairs?.length) out.push('Make the pairs.');
  } else {
    const options = settings.options ?? [];
    if (options.length < 2 || options.some((o) => !filled(o))) out.push('Name at least two options under Changed.');
    else if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) out.push('Give each option under Changed its own name.');
  }
  if (settings.level === 'supplied') {
    const texts = settings.texts ?? [];
    if (texts.length !== (settings.options ?? []).length || texts.some((t) => !filled(t))) out.push('Paste one text for each option.');
  }
  if (settings.level === 'students') {
    if (!filled(settings.task)) out.push('Say what students write.');
    if (settings.judge !== 'pick') out.push('Students write it is judged by picking one.');
  }
  return out;
}

/** The Explain step's prompt as the seeded block carries it. The player shows the fuller question once the result is in. */
export function explainPrompt(settings: Pick<LabSettings, 'level' | 'explain_prompt'>): string {
  if (filled(settings.explain_prompt)) return settings.explain_prompt.trim();
  return settings.level === 'pairs' ? 'Does the evidence support the claim? Write one analytical paragraph.' : 'Explain the result.';
}

type AnyBlock = { id: string; block_type: string; content?: unknown; created_at?: string };

/** The written-question block the Explain answer is saved and handed in under. */
export function labExplainBlock(settings: Pick<LabSettings, 'level' | 'explain_prompt'>, now: string = new Date().toISOString(), createdAt: string = now) {
  return {
    id: LAB_EXPLAIN_BLOCK_ID,
    type: 'block' as const,
    block_type: 'question_set' as const,
    variant: 'medium',
    visibility: 'student_teacher' as const,
    content: { questions: [{ id: LAB_EXPLAIN_QUESTION_ID, prompt: explainPrompt(settings), kind: 'short_answer' as const }] },
    created_at: createdAt,
    updated_at: now,
    schema_version: 1 as const
  };
}

/** The lesson's blocks with the Explain block in place and its prompt up to date. Other blocks are kept as they are. */
export function withExplainBlock<B extends AnyBlock>(blocks: readonly B[], settings: Pick<LabSettings, 'level' | 'explain_prompt'>, now: string = new Date().toISOString()): B[] {
  const had = blocks.find((b) => b.id === LAB_EXPLAIN_BLOCK_ID);
  const fresh = labExplainBlock(settings, now, had?.created_at ?? now) as unknown as B;
  return had ? blocks.map((b) => (b.id === LAB_EXPLAIN_BLOCK_ID ? fresh : b)) : [...blocks, fresh];
}

/** True when the blocks already hold the Explain block with this prompt. */
export function explainBlockCurrent(blocks: readonly AnyBlock[], settings: Pick<LabSettings, 'level' | 'explain_prompt'>): boolean {
  const block = blocks.find((b) => b.id === LAB_EXPLAIN_BLOCK_ID) as { block_type: string; content?: { questions?: Array<{ prompt?: string }> } } | undefined;
  return block?.block_type === 'question_set' && block.content?.questions?.length === 1 && block.content.questions[0]?.prompt === explainPrompt(settings);
}

/** The part of the settings a published lesson may show anyone. */
export function publicLab(settings: LabSettings): PublicLab {
  return PublicLabSchema.parse({
    level: settings.level,
    question: settings.question,
    why: settings.why,
    ...(settings.level === 'pairs' && settings.claim ? { claim: settings.claim } : {}),
    ...(settings.level !== 'pairs' && settings.same ? { same: settings.same } : {}),
    ...(settings.level !== 'pairs' && settings.options ? { options: settings.options } : {}),
    ...(settings.level === 'students' && settings.task ? { task: settings.task } : {}),
    judge: settings.judge,
    judge_question: settings.judge_question,
    ...(settings.judge === 'rate' && settings.ends ? { ends: settings.ends } : {}),
    threshold: settings.threshold,
    notes_on: settings.notes_on,
    ...(settings.notes_on && settings.note_prompts ? { note_prompts: settings.note_prompts } : {}),
    ...(settings.level === 'pairs' && settings.features ? { features: settings.features } : {}),
    explain_prompt: settings.explain_prompt
  });
}
