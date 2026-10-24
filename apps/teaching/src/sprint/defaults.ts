import type { Block } from '@/schemas/block';
import { moveSentence } from '@/toolkit/content';
import { libraryTool } from '@/toolkit/library';
import { createBlock } from '@/blocks/create-block';
import { SPRINT_PHASES, PHASE_LABELS, type SprintPhaseKey, type SprintSettings } from './schema';

/**
 * The Kit a new sprint starts with, so the teacher edits rather than builds.
 * All thinking language comes from the Thinking Toolkit library.
 */

export const DEFAULT_CHECKLIST = [
  'It answers our group question.',
  'It meets the criteria.',
  'It uses evidence from what we’ve studied, and names the source, text or quote.',
  'Our group could build it before the deadline.',
  'It does something of its own, beyond the model.'
];

export const DEFAULT_MODEL = {
  topic: 'The Great Wall',
  text: 'One brick’s story: what if the panel followed one brick from the kiln to the wall? It makes a huge wall feel human, using the maker’s stamp on a Ming-era brick.',
  notes: ['Answers the question: makes a huge thing feel human', 'Grabs the visitor: one object, one story', 'Names its source: the maker’s stamp']
};

export const HMW_FRAME = { lead: 'How might we', parts: ['[action]', 'for [who]', 'so that [result]?'] };
export const DEFAULT_REFLECTION_CRITERION = 'Explains what the test showed and what to change next';
export const DEFAULT_REFLECTION_PROMPTS = ['What did the feedback show your idea does well?', 'What would you change next, and why?'];

export const SKETCH_STARTERS = { idea: 'Our idea is…', answers: 'It answers our question because…', evidence: 'The evidence it uses is…' };
export const FEEDBACK_STARTERS = { worked: 'It works because…', next: 'Try…' };

const WHERE: Record<SprintPhaseKey, 'class' | 'home'> = { understand: 'class', sketch: 'home', decide: 'class', prototype: 'home', test: 'class' };

export function newSprintSettings(classId: string): SprintSettings {
  return {
    class_id: classId,
    decider: 'teacher',
    support: 'standard',
    lock_hours: 2,
    criteria: [],
    reflection_criteria: [{ id: 'reflect', text: DEFAULT_REFLECTION_CRITERION }],
    reflection_prompts: [...DEFAULT_REFLECTION_PROMPTS],
    requirements: [],
    idea_guide: { checklist: [...DEFAULT_CHECKLIST], model: { ...DEFAULT_MODEL, notes: [...DEFAULT_MODEL.notes] } },
    phases: SPRINT_PHASES.map((key) => ({
      key,
      where: WHERE[key],
      due_date: '',
      due_time: '15:00',
      ends_at: '',
      instruction: '',
      stretch: '',
      ...(key === 'understand' || key === 'sketch' ? { ideas: 3 } : {})
    })),
    groups: [],
    columns: {}
  };
}

const section = (id: string, key: SprintPhaseKey, blocks: Block[]): Block => {
  const base = createBlock('section', id);
  return { ...base, content: { title: PHASE_LABELS[key], blocks, sprint_phase: key } } as Block;
};

/** One phase's section, empty: the teacher builds each phase page. */
function phaseSection(key: SprintPhaseKey, newId: () => string): Block {
  return section(newId(), key, []);
}

/** One section per phase. */
export function newSprintBlocks(newId: () => string): Block[] {
  return SPRINT_PHASES.map((key) => phaseSection(key, newId));
}

/** The blocks with a section added for each phase that has none, so every phase tab has somewhere to put new blocks. Unchanged blocks come back as the same array. */
export function withPhaseSections(blocks: Block[], newId: () => string): Block[] {
  const have = new Set(blocks.map((b) => (b.block_type === 'section' ? b.content.sprint_phase : undefined)));
  const missing = SPRINT_PHASES.filter((key) => !have.has(key));
  return missing.length ? [...blocks, ...missing.map((key) => phaseSection(key, newId))] : blocks;
}

type Move = { skill: string; tools: string[]; value: string };

/** The first Thinking move in a phase's section, or null. */
export function phaseMove(blocks: readonly Block[], key: SprintPhaseKey): Move | null {
  const sec = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === key);
  if (!sec || sec.block_type !== 'section') return null;
  const move = (sec.content.blocks as Block[]).find((b) => b.block_type === 'thinking_move');
  return move && move.block_type === 'thinking_move' ? { skill: move.content.skill, tools: move.content.tools, value: move.content.value } : null;
}

/** "We will think by applying …, judged for breadth." */
export function phaseIntention(move: Move | null): string {
  if (!move) return '';
  const sentence = moveSentence(move.skill, move.tools, move.value).replace(/\.$/, '');
  return `We will think by ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;
}

/** The tools' sentence frames, in the move's order. */
export function toolFrames(move: Move | null): string[] {
  return (move?.tools ?? []).map((id) => libraryTool(id)?.sentence ?? '').filter(Boolean);
}

/** A lesson set to Design Sprint gets the default Kit if it has none, and a section for any phase that is missing one. */
export function seedSprint<L extends { sprint?: SprintSettings; blocks: Block[] }>(lesson: L, classId: string, newId: () => string): L {
  const blocks = withPhaseSections(lesson.blocks, newId);
  if (lesson.sprint && blocks === lesson.blocks) return lesson;
  return { ...lesson, sprint: lesson.sprint ?? newSprintSettings(classId), blocks };
}
