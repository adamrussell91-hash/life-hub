import { createBlock, createWhiteboardWithStarter } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

/**
 * Shimamura's MARGE model (Motivate, Attend, Relate, Generate, Evaluate) as a
 * lesson scaffold. MARGE describes how learning happens rather than a fixed
 * running order, so the five sections are a planning frame: move, cut or
 * repeat them. Every word here is original; nothing comes from the WalkThrus
 * book.
 *
 * The opening continuum line predicts, and the Evaluate section's return line
 * brings the same line back so students see where they first stood.
 */

type Section = Extract<Block, { block_type: 'section' }>;
type Continuum = Extract<Block, { block_type: 'continuum_line' }>;

export const MARGE_TEMPLATE_ID = 'builtin:marge';
export const MARGE_OPENER_ID = 'builtin:marge-opener';
export const MARGE_CLOSE_ID = 'builtin:marge-close';

export const MARGE_PHASES = ['Motivate', 'Attend', 'Relate', 'Generate', 'Evaluate'] as const;

function section(id: string, title: string, blocks: Block[]): Section {
  const s = createBlock('section', id) as Section;
  return { ...s, content: { ...s.content, title, blocks: blocks as Section['content']['blocks'] } };
}

function note(id: string, title: string, html: string): Block {
  const b = createBlock('teacher_note', id) as Extract<Block, { block_type: 'teacher_note' }>;
  return { ...b, content: { ...b.content, title, html } };
}

function bigQuestion(id: string): Block {
  const b = createBlock('callout', id) as Extract<Block, { block_type: 'callout' }>;
  return { ...b, content: { ...b.content, style: 'important', title: 'Big question', body: '' } };
}

/** The opening line: predict mode, a video stimulus, a re-place round after each reveal. */
function predictLine(id: string): Continuum {
  const b = createBlock('continuum_line', id) as Continuum;
  return {
    ...b,
    content: {
      ...b.content,
      stimulus: { kind: 'video', text: '', url: '', alt_text: '' },
      scale: { left: 'Very likely', right: 'Very unlikely', stops: [] },
      mode: 'predict',
      replace: true
    }
  };
}

/** The same line again at the end: students work through it on their own. */
function returnLine(id: string, sourceId: string): Continuum {
  const b = createBlock('continuum_line', id) as Continuum;
  return { ...b, content: { ...b.content, statements: [], pace: 'self', replace: false, returns_to: sourceId } };
}

function brainstorm(id: string, question: string): Block {
  const b = createBlock('brainstorm', id) as Extract<Block, { block_type: 'brainstorm' }>;
  return { ...b, content: { ...b.content, question, per_student: 1 } };
}

function noteCue(id: string, kind: 'own_words' | 'question', prompt: string): Block {
  const b = createBlock('note_cue', id) as Extract<Block, { block_type: 'note_cue' }>;
  return { ...b, content: { ...b.content, kind, prompt } };
}

/** A hinge question students answer alone: say why, get feedback by how close they were, retry on the back-up. */
function independentHinge(id: string): Block {
  const b = createBlock('hinge_question', id) as Extract<Block, { block_type: 'hinge_question' }>;
  return { ...b, content: { ...b.content, pace: 'independent' } } as Block;
}

function motivate(nextId: () => string, lineId: string): Section {
  return section(nextId(), 'Motivate', [
    note(nextId(), 'Motivate: why should they care?', '<p>Open with the big question and a short clip or image. Students predict on the line before they learn anything, so they want to find out whether they were right. Keep the answer hidden until later in the lesson.</p>'),
    bigQuestion(nextId()),
    predictLine(lineId)
  ]);
}

function attend(nextId: () => string): Section {
  return section(nextId(), 'Attend', [
    note(nextId(), 'Attend: give attention a job', '<p>Set what to focus on, then give students something to do while they watch or read: sort into groups, compare, or contrast. Break the input into short chunks and refocus between them.</p>'),
    createBlock('thinking_intentions', nextId()),
    createWhiteboardWithStarter(nextId(), 'same_different'),
    brainstorm(nextId(), 'What matters most so far?')
  ]);
}

function relate(nextId: () => string): Section {
  return section(nextId(), 'Relate', [
    note(nextId(), 'Relate: link it to what they know', '<p>Connect the new idea to earlier learning. Ask how and why, use an analogy, and have students place the new idea on the map with labelled links.</p>'),
    createBlock('concept_map', nextId())
  ]);
}

function generate(nextId: () => string): Section {
  return section(nextId(), 'Generate', [
    note(
      nextId(),
      'Generate: think it, say it, teach it',
      '<p>Pick one. <b>Think it:</b> own-words notes, a faded example, a concept map from memory. <b>Say it:</b> a recorded spoken answer, a class brainstorm. <b>Teach it:</b> students write a quiz question, or explain it to a partner with peer feedback. Swap the cue below for the block that fits.</p>'
    ),
    noteCue(nextId(), 'own_words', 'Without looking back, explain the big idea in your own words.')
  ]);
}

function evaluate(nextId: () => string, lineId: string | null): Section {
  const blocks: Block[] = [
    note(nextId(), 'Evaluate: what do they really know?', '<p>Come back to the big question. Students place on the line again and see where they started. The hinge runs on its own: students say why, get feedback by how close they were, and retry on the back-up question. The finish questions after the done tick give you the exit ticket.</p>')
  ];
  if (lineId) blocks.push(returnLine(nextId(), lineId));
  blocks.push(independentHinge(nextId()));
  return section(nextId(), 'Evaluate', blocks);
}

/** The whole MARGE lesson: five sections, with the right settings already on. */
export function margeLessonBlocks(nextId: () => string): Block[] {
  const lineId = nextId();
  return [motivate(nextId, lineId), attend(nextId), relate(nextId), generate(nextId), evaluate(nextId, lineId)];
}

/** The Motivate section on its own, for any lesson: big question and a prediction line. */
export function margeOpenerSection(nextId: () => string): Section {
  return motivate(nextId, nextId());
}

/**
 * The Evaluate section on its own. Given the lesson's blocks, its return line
 * points at the lesson's first continuum line; with none, it has no return line.
 */
export function margeCloseSection(nextId: () => string, sourceLineId: string | null = null): Section {
  return evaluate(nextId, sourceLineId);
}

export type BuiltinComposition = { id: string; title: string };

/** Ready-made sections offered beside saved compositions. They insert as copies only. */
export const BUILTIN_COMPOSITIONS: readonly BuiltinComposition[] = [
  { id: MARGE_OPENER_ID, title: 'MARGE: big question opener' },
  { id: MARGE_CLOSE_ID, title: 'MARGE: evaluate close' }
];

export const isBuiltinComposition = (id: string): boolean => BUILTIN_COMPOSITIONS.some((c) => c.id === id);

export type BuiltinLessonTemplate = { id: string; title: string; build: (nextId: () => string) => Block[] };

/** Lesson templates that ship with the hub, listed before saved templates. */
export const BUILTIN_LESSON_TEMPLATES: readonly BuiltinLessonTemplate[] = [
  { id: MARGE_TEMPLATE_ID, title: 'MARGE lesson (Motivate, Attend, Relate, Generate, Evaluate)', build: margeLessonBlocks }
];

export const builtinLessonTemplate = (id: string): BuiltinLessonTemplate | null => BUILTIN_LESSON_TEMPLATES.find((t) => t.id === id) ?? null;
