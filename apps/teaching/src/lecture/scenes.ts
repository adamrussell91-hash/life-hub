// apps/teaching/src/lecture/scenes.ts
import type { Block, Narration } from '@/schemas/block';
import { shortLabel } from '@/teacher/focus/steps';

/**
 * A lecture plays one scene at a time. The teacher controls the cut through
 * how the lesson is built:
 *
 * - a section is a chapter; it gets an intro scene when it has narration or
 *   when blocks come before its first heading;
 * - a heading starts a scene, and everything up to the next heading belongs
 *   to it (unlike focus view, a second main block does not split a scene:
 *   tap to reveal handles long scenes);
 * - each block is one beat, and a column row is one block;
 * - hinge, cloze and self-check are gates unless switched off; a section
 *   marked `side_path` right after a hinge or cloze is that gate's second
 *   look, played only after a wrong answer;
 * - a chapter ends with a takeaway note cue unless switched off.
 */

type SectionBlock = Extract<Block, { block_type: 'section' }>;
export type GateBlock = Extract<Block, { block_type: 'hinge_question' | 'cloze' | 'self_check' }>;

export type Beat = { block: Block; gate: boolean; sidePath: SectionBlock | null };

export type LectureScene = {
  id: string;
  label: string;
  chapter: { id: string; label: string } | null;
  /** The heading that starts the scene; null for openings and chapter intros. */
  heading: Block | null;
  intro: boolean;
  narration: Narration | null;
  reveal: 'all' | 'one';
  beats: Beat[];
};

const GATE_TYPES = new Set<Block['block_type']>(['hinge_question', 'cloze', 'self_check']);
const SKIPPED = new Set<Block['block_type']>(['spacer', 'divider', 'teacher_note']);

export function isGate(block: Block): block is GateBlock {
  return GATE_TYPES.has(block.block_type) && (block.content as { gate?: boolean }).gate !== false;
}

export function takesSidePath(block: Block): boolean {
  return block.block_type === 'hinge_question' || block.block_type === 'cloze';
}

export function isSidePath(block: Block): boolean {
  return block.block_type === 'section' && (block.content as { side_path?: boolean }).side_path === true;
}

export const DEFAULT_TAKEAWAY = (chapter: string): string =>
  `In your book: the one idea from ${chapter} you’d tell a friend.`;

export function takeawayCue(section: SectionBlock): Block | null {
  const takeaway = section.content.takeaway;
  if (takeaway?.enabled === false) return null;
  const chapter = section.content.title.trim() || 'this chapter';
  return {
    id: `${section.id}__takeaway`,
    type: 'block',
    block_type: 'note_cue',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { kind: 'own_words', prompt: takeaway?.prompt?.trim() || DEFAULT_TAKEAWAY(chapter) }
  } as Block;
}

export function lectureScenes(blocks: readonly Block[]): LectureScene[] {
  const scenes: LectureScene[] = [];
  const cursor: { open: LectureScene | null } = { open: null };

  const start = (scene: Omit<LectureScene, 'beats'>): LectureScene => {
    const next: LectureScene = { ...scene, beats: [] };
    scenes.push(next);
    cursor.open = next;
    return next;
  };

  function walk(list: readonly Block[], chapter: LectureScene['chapter']): void {
    list.forEach((block, i) => {
      if (isSidePath(block) || SKIPPED.has(block.block_type)) return;
      if (block.block_type === 'section') return chapterOf(block);
      if (block.block_type === 'heading') {
        start({
          id: block.id,
          label: shortLabel(block.content.text, `Part ${scenes.length + 1}`),
          chapter,
          heading: block,
          intro: false,
          narration: block.content.narration ?? null,
          reveal: block.content.reveal ?? 'one'
        });
        return;
      }
      const scene: LectureScene =
        cursor.open ??
        start({
          id: block.id,
          label: chapter?.label ?? (scenes.length === 0 ? 'Opening' : `Part ${scenes.length + 1}`),
          chapter,
          heading: null,
          intro: false,
          narration: null,
          reveal: 'one'
        });
      const gate = isGate(block);
      const next = list[i + 1];
      scene.beats.push({ block, gate, sidePath: gate && takesSidePath(block) && next && isSidePath(next) ? (next as SectionBlock) : null });
    });
  }

  function chapterOf(section: SectionBlock): void {
    const chapter = { id: section.id, label: shortLabel(section.content.title, `Chapter ${scenes.length + 1}`) };
    cursor.open = null;
    const children = section.content.blocks as Block[];
    if (section.content.narration || children[0]?.block_type !== 'heading') {
      start({ id: section.id, label: chapter.label, chapter, heading: null, intro: true, narration: section.content.narration ?? null, reveal: 'one' });
    }
    walk(children, chapter);
    const cue = takeawayCue(section);
    const last = cursor.open as LectureScene | null;
    if (cue && last) last.beats.push({ block: cue, gate: false, sidePath: null });
    cursor.open = null;
  }

  walk(blocks, null);
  return scenes;
}

/** Every note cue in play order, takeaways included, for the recap. */
export function noteCues(scenes: readonly LectureScene[]): Array<{ block: Block; scene: LectureScene }> {
  return scenes.flatMap((scene) => scene.beats.filter((beat) => beat.block.block_type === 'note_cue').map((beat) => ({ block: beat.block, scene })));
}
