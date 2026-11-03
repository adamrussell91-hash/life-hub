import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { lessonPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import {
  BUILTIN_COMPOSITIONS,
  BUILTIN_LESSON_TEMPLATES,
  MARGE_PHASES,
  builtinLessonTemplate,
  margeCloseSection,
  margeLessonBlocks,
  margeOpenerSection
} from '@/marge/template';

type Section = Extract<Block, { block_type: 'section' }>;
type Continuum = Extract<Block, { block_type: 'continuum_line' }>;

const ids = () => {
  let n = 0;
  return () => `m${++n}`;
};
const children = (s: Block) => (s as Section).content.blocks as Block[];
const all = (blocks: Block[]): Block[] => blocks.flatMap((b) => (b.block_type === 'section' ? [b, ...all(children(b))] : [b]));

describe('MARGE lesson template', () => {
  it('builds five schema-valid sections in MARGE order, with unique ids', () => {
    const blocks = margeLessonBlocks(ids());
    expect(blocks.map((b) => (b as Section).content.title)).toEqual([...MARGE_PHASES]);
    for (const b of blocks) expect(() => BlockSchema.parse(b)).not.toThrow();
    const every = all(blocks).map((b) => b.id);
    expect(new Set(every).size).toBe(every.length);
  });

  it('turns on the right settings: predict line, starter board, independent hinge, return line', () => {
    const [m, a, , , e] = margeLessonBlocks(ids());
    const line = children(m!).find((b) => b.block_type === 'continuum_line') as Continuum;
    expect(line.content.mode).toBe('predict');
    expect(line.content.stimulus.kind).toBe('video');
    expect(line.content.replace).toBe(true);
    expect(children(m!).some((b) => b.block_type === 'callout')).toBe(true);
    expect(children(a!).map((b) => b.block_type)).toEqual(expect.arrayContaining(['thinking_intentions', 'whiteboard', 'brainstorm']));
    const back = children(e!).find((b) => b.block_type === 'continuum_line') as Continuum;
    expect(back.content.returns_to).toBe(line.id);
    expect(back.content.pace).toBe('self');
    const hinge = children(e!).find((b) => b.block_type === 'hinge_question') as Extract<Block, { block_type: 'hinge_question' }>;
    expect((hinge.content as { pace?: string }).pace).toBe('independent');
  });

  it('keeps every teaching note teacher-only, so students only see the activities', () => {
    for (const b of all(margeLessonBlocks(ids()))) if (b.block_type === 'teacher_note') expect(b.visibility).toBe('teacher_only');
  });

  it('survives being saved and reused as a template: the return line follows its source', () => {
    const copy = cloneBlocksWithNewIds(margeLessonBlocks(ids()));
    const lines = all(copy).filter((b): b is Continuum => b.block_type === 'continuum_line');
    expect(lines[1]!.content.returns_to).toBe(lines[0]!.id);
  });

  it('is offered as a built-in lesson template', () => {
    expect(BUILTIN_LESSON_TEMPLATES.map((t) => t.id)).toContain('builtin:marge');
    expect(builtinLessonTemplate('builtin:marge')?.build(ids())).toHaveLength(5);
    expect(builtinLessonTemplate('saved-template-id')).toBeNull();
  });

  it('phase kits: the opener stands alone; the close returns to a line only when given one', () => {
    const opener = margeOpenerSection(ids());
    expect(opener.content.title).toBe('Motivate');
    expect(() => BlockSchema.parse(opener)).not.toThrow();
    const lone = margeCloseSection(ids());
    expect(children(lone).some((b) => b.block_type === 'continuum_line')).toBe(false);
    const linked = margeCloseSection(ids(), 'lineX');
    expect((children(linked).find((b) => b.block_type === 'continuum_line') as Continuum).content.returns_to).toBe('lineX');
  });

  it('the kits have their own palette family, apart from saved compositions', () => {
    const families = lessonPaletteFamilies([{ id: 'c1', title: 'Saved one' }]);
    const kits = families.find((f) => f.id === 'Lesson kits')!;
    expect(kits.cards.map((c) => (c.kind === 'composition' ? c.id : ''))).toEqual(BUILTIN_COMPOSITIONS.map((c) => c.id));
    const saved = families.find((f) => f.id === 'Compositions')!;
    expect(saved.cards.map((c) => (c.kind === 'composition' ? c.id : ''))).toEqual(['c1']);
  });
});
