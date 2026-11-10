import type { Block } from '@/schemas/block';
import { blocksToSearchText } from '@/blocks/search-text';

/**
 * Learning conditions for one lesson, read from its blocks in reading order.
 *
 * Each condition comes from the well established end of Mind, Brain and
 * Education science (Tokuhama-Espinosa): new learning builds on what students
 * already know, attention and memory need small chunks and retrieval, and a
 * lesson should end with students producing something. Nothing here scores a
 * lesson. A condition is present, missing, not relevant to this lesson's
 * blocks, or set aside by the teacher.
 */

export const CONDITION_IDS = ['activate', 'chunks', 'check', 'worked', 'close', 'levels'] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];
export type ConditionState = 'present' | 'missing' | 'not_relevant' | 'off';

export type Condition = {
  id: ConditionId;
  label: string;
  /** One line on why it matters, in plain words. */
  why: string;
  state: ConditionState;
  /** What the check found, e.g. "Starts with a video". */
  detail: string;
  /** The block to jump to, when the finding points at one. */
  blockId?: string;
  /** The message sent to the lesson agent by Suggest a block. */
  ask: string;
};

/** Blocks that bring back earlier learning. */
const RETRIEVAL = new Set(['hinge_question', 'quiz_question', 'flashcards', 'cloze', 'self_check', 'question_drop']);
/** Blocks where students show what they understood. */
const CHECKS = new Set(['hinge_question', 'question_set', 'quiz_question', 'self_check', 'question_drop', 'cloze']);
/** Blocks that put new material in front of students. */
const CONTENT = new Set([
  'rich_text', 'explainer', 'video', 'audio', 'definition', 'diagram', 'concept_map', 'mind_map', 'timeline',
  'quote', 'chart', 'equation', 'code', 'embed', 'annotation', 'anthology', 'accordion', 'table', 'callout'
]);
/** Blocks where students write or recall at the end. */
const CLOSERS = new Set(['done', 'self_check', 'question_set', 'flashcards', 'quiz_question', 'cloze', 'brainstorm', 'peer_feedback']);
/** Structure only: never counted as something students do or read. */
const STRUCTURE = new Set(['heading', 'divider', 'spacer', 'section', 'columns', 'tabs', 'teacher_note', 'countdown', 'classroom_tools', 'outcomes', 'curriculum_lines']);
/** Question set formats that already carry support, core and extend. */
const LEVELLED_FORMATS = new Set(['question_levels', 'because_but_so', 'reasoning_chart']);
/** Lesson types the check does not apply to: a test is not a teaching sequence. */
const SKIP_MODES = new Set(['assessment', 'quiz']);

/** More new-content blocks in a row than this, with no check between, is a long stretch. */
export const MAX_CONTENT_RUN = 3;
/** A stretch of new content longer than this many words is a long stretch too. */
export const MAX_CONTENT_WORDS = 600;

const CONDITION_TEXT: Record<ConditionId, { label: string; why: string; ask: string }> = {
  activate: {
    label: 'Brings back what students know',
    why: 'New learning sticks to what is already there. A short retrieval start gives it something to stick to.',
    ask: 'Suggest one short retrieval activity for the start of this lesson that brings back the prior knowledge this lesson builds on. Propose it as a block at the top.'
  },
  chunks: {
    label: 'New content in small chunks',
    why: 'Attention and working memory are limited. A check between chunks stops new material piling up.',
    ask: 'Find the longest stretch of new content in this lesson with no check in it, and propose one quick check (a hinge question or self check) to break it up.'
  },
  check: {
    label: 'A check point mid-lesson',
    why: 'Retrieving something just learnt strengthens it, and shows the teacher who needs help before moving on.',
    ask: 'Propose one quick check point for the middle of this lesson, after the main new content, that shows who has understood it.'
  },
  worked: {
    label: 'A worked example before practice',
    why: 'Seeing the thinking modelled before trying it alone lowers the load of independent work.',
    ask: 'Propose a faded worked example to sit before the first independent questions in this lesson, modelling the same kind of thinking.'
  },
  close: {
    label: 'Ends with writing or recall',
    why: 'Producing something at the end turns the lesson into memory. Reading alone fades fast.',
    ask: 'Propose a short closing block for this lesson where students write or recall the main idea from memory.'
  },
  levels: {
    label: 'Support and extend',
    why: 'Every brain arrives differently prepared. A support and an extend level let each student start where they are.',
    ask: 'Pick the main thinking task in this lesson and suggest how to offer it at support, core and extend levels, ideally with a lens.'
  }
};

export const conditionText = (id: ConditionId) => CONDITION_TEXT[id];

const typeOf = (b: Block): string => b.block_type;
const studentFacing = (b: Block): boolean => (b as { visibility?: string }).visibility !== 'teacher_only';

function containerChildren(block: Block): Block[] | null {
  const content = block.content as Record<string, unknown> | undefined;
  if (!content) return null;
  if (block.block_type === 'section' && Array.isArray(content.blocks)) return content.blocks as Block[];
  if (block.block_type === 'columns' && Array.isArray(content.columns)) return (content.columns as Array<{ blocks?: Block[] }>).flatMap((c) => c.blocks ?? []);
  if (block.block_type === 'tabs' && Array.isArray(content.tabs)) return (content.tabs as Array<{ blocks?: Block[] }>).flatMap((t) => t.blocks ?? []);
  return null;
}

/** Leaf blocks students see, in reading order: inside sections, columns and tabs too. */
export function studentSequence(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      if (!studentFacing(block)) continue;
      const nested = containerChildren(block);
      if (nested) walk(nested);
      else if (!STRUCTURE.has(typeOf(block))) out.push(block);
    }
  };
  walk(blocks);
  return out;
}

const hasLens = (b: Block): boolean => {
  const lenses = (b as { lenses?: unknown[] }).lenses;
  const qualifiers = (b as { qualifiers?: unknown[] }).qualifiers;
  return (Array.isArray(lenses) && lenses.length > 0) || (Array.isArray(qualifiers) && qualifiers.length > 0);
};
const levelled = (b: Block): boolean =>
  hasLens(b) || (typeOf(b) === 'question_set' && LEVELLED_FORMATS.has(String((b.content as { format?: unknown }).format ?? '')));

const words = (b: Block): number => blocksToSearchText([b]).split(/\s+/).filter(Boolean).length;

function shortName(b: Block): string {
  const text = blocksToSearchText([b]).replace(/\s+/g, ' ').trim();
  const label = TYPE_NAME[typeOf(b)] ?? typeOf(b).replace(/_/g, ' ');
  return text ? `${label} “${text.length > 40 ? `${text.slice(0, 39).trim()}…` : text}”` : label;
}

const TYPE_NAME: Record<string, string> = {
  rich_text: 'Text', explainer: 'Explainer', video: 'Video', audio: 'Audio', definition: 'Definition', diagram: 'Diagram',
  hinge_question: 'Hinge question', quiz_question: 'Quiz question', question_set: 'Question set', self_check: 'Self check',
  flashcards: 'Flashcards', cloze: 'Cloze', faded_example: 'Faded example', done: 'Done tick', callout: 'Callout'
};

/** The longest stretch of new content with no check in it. */
export function longestContentRun(seq: readonly Block[]): { blocks: Block[]; words: number } {
  let best: { blocks: Block[]; words: number } = { blocks: [], words: 0 };
  let run: Block[] = [];
  let runWords = 0;
  const close = () => {
    if (run.length > best.blocks.length || (run.length === best.blocks.length && runWords > best.words)) best = { blocks: run, words: runWords };
    run = [];
    runWords = 0;
  };
  for (const b of seq) {
    if (CONTENT.has(typeOf(b))) {
      run.push(b);
      runWords += words(b);
    } else close();
  }
  close();
  return best;
}

export type ConditionsInput = {
  blocks: readonly Block[];
  pedagogicalMode?: string | null;
  /** Conditions the teacher set aside for this lesson. */
  off?: readonly string[];
};

/** The lesson type is one the check does not apply to (a quiz or an assessment). */
export const conditionsApply = (mode?: string | null): boolean => !SKIP_MODES.has(mode ?? '');

export function lessonConditions(input: ConditionsInput): Condition[] {
  const seq = studentSequence(input.blocks);
  const off = new Set(input.off ?? []);
  const firstContent = seq.findIndex((b) => CONTENT.has(typeOf(b)));
  const make = (id: ConditionId, state: ConditionState, detail: string, blockId?: string): Condition => ({
    id,
    ...CONDITION_TEXT[id],
    state: off.has(id) && state !== 'not_relevant' ? 'off' : state,
    detail,
    ...(blockId ? { blockId } : {})
  });

  const out: Condition[] = [];

  // Brings back what students know: retrieval before the first new content.
  if (firstContent < 0) out.push(make('activate', 'not_relevant', 'No new content in this lesson.'));
  else {
    const before = seq.slice(0, firstContent).find((b) => RETRIEVAL.has(typeOf(b)));
    out.push(before
      ? make('activate', 'present', `Opens with ${shortName(before)}.`, before.id)
      : make('activate', 'missing', `Starts with ${shortName(seq[firstContent]!)}.`, seq[firstContent]!.id));
  }

  // Small chunks: no long run of new content without a check.
  const run = longestContentRun(seq);
  if (!run.blocks.length) out.push(make('chunks', 'not_relevant', 'No new content in this lesson.'));
  else if (run.blocks.length > MAX_CONTENT_RUN || run.words > MAX_CONTENT_WORDS) {
    out.push(make('chunks', 'missing', `${run.blocks.length} content blocks in a row (about ${run.words} words) from ${shortName(run.blocks[0]!)}.`, run.blocks[0]!.id));
  } else out.push(make('chunks', 'present', `Longest stretch: ${run.blocks.length} ${run.blocks.length === 1 ? 'block' : 'blocks'}, about ${run.words} words.`));

  // A check point after new content, before the end.
  if (firstContent < 0) out.push(make('check', 'not_relevant', 'No new content in this lesson.'));
  else {
    const middle = seq.slice(firstContent + 1, Math.max(firstContent + 1, seq.length - 1));
    const check = middle.find((b) => CHECKS.has(typeOf(b)));
    out.push(check ? make('check', 'present', `${shortName(check)}.`, check.id) : make('check', 'missing', 'No check between the new content and the end.'));
  }

  // A worked example before independent practice.
  const practice = seq.findIndex((b) => typeOf(b) === 'question_set');
  if (practice < 0) out.push(make('worked', 'not_relevant', 'No independent question set in this lesson.'));
  else {
    const example = seq.slice(0, practice).find((b) => typeOf(b) === 'faded_example');
    out.push(example
      ? make('worked', 'present', `${shortName(example)} before the questions.`, example.id)
      : make('worked', 'missing', `${shortName(seq[practice]!)} has no worked example before it.`, seq[practice]!.id));
  }

  // Ends with writing or recall.
  const last = seq[seq.length - 1];
  if (!last) out.push(make('close', 'not_relevant', 'No student blocks yet.'));
  else if (CLOSERS.has(typeOf(last)) || hasLens(last)) out.push(make('close', 'present', `Ends with ${shortName(last)}.`, last.id));
  else out.push(make('close', 'missing', `Ends with ${shortName(last)}.`, last.id));

  // Support and extend.
  if (!seq.length) out.push(make('levels', 'not_relevant', 'No student blocks yet.'));
  else {
    const lens = seq.find(levelled);
    out.push(lens ? make('levels', 'present', `${shortName(lens)} has levels.`, lens.id) : make('levels', 'missing', 'No lens or levelled format in this lesson.'));
  }

  return out;
}
