import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, HOMEPAGE_BLOCK_GROUPS, LESSON_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { createCurriculumLinesEditor } from '@/blocks/curriculum-lines';
import {
  buildLinesModel,
  chooseOrientation,
  horizontalLayout,
  nextColour,
  strandColour,
  verticalLayout,
  type LinesContent
} from '@/blocks/curriculum-lines/model';

const lessons = [
  { id: 'lesson_1', title: 'Provocation', href: '/lessons/lesson_1' },
  { id: 'lesson_2', title: 'Thesis workshop', href: '/lessons/lesson_2' }
];

function content(overrides: Partial<LinesContent> = {}): LinesContent {
  return {
    weeks: 4,
    strands: [
      { id: 'a', name: 'Unseen texts', colour: 'amber' },
      { id: 'b', name: 'Concept', colour: 'green' },
      { id: 'c', name: 'Prescribed text', colour: 'wave' }
    ],
    stations: [
      { id: 's1', strand_id: 'a', week: 1, level: 'introduced', label: 'Cold read', lesson_id: 'lesson_1' },
      { id: 's2', strand_id: 'b', week: 1, level: 'introduced', label: 'Naming it', lesson_id: 'lesson_1' },
      { id: 's3', strand_id: 'c', week: 2, level: 'reinforced', label: 'Whole-text read' },
      { id: 's4', strand_id: 'a', week: 3, level: 'mastered', label: 'Timed answers', lesson_id: 'lesson_gone' },
      { id: 's5', strand_id: 'c', week: 9, level: 'mastered', label: 'Out of range' }
    ],
    checkpoints: [{ id: 'cp1', week: 3, label: 'Seminar', strand_ids: ['b', 'c'] }],
    terminus: { label: 'Assessment task', detail: 'Extended response' },
    ...overrides
  };
}

describe('Curriculum lines block', () => {
  it('is a unit plan block only, and its starter round-trips through the schema', () => {
    const block = createBlock('curriculum_lines', 'cl1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'curriculum_lines') throw new Error('Expected curriculum_lines');
    expect(parsed.content.strands.length).toBeGreaterThan(0);
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).toContain('curriculum_lines');
    expect(LESSON_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('curriculum_lines');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('curriculum_lines');
    expect(blockRegistry.curriculum_lines).toBeDefined();
    expect(() => BlockSchema.parse({ ...block, content: { ...parsed.content, strands: [] } })).toThrow();
  });

  it('links stations to lessons the viewer can open and falls back to the saved label', () => {
    const model = buildLinesModel(content(), lessons);
    const unseen = model.strands[0]!;
    expect(unseen.stations[0]!.target).toEqual({ text: 'Cold read', href: '/lessons/lesson_1' });
    const unlabelled = buildLinesModel(content({ stations: [{ id: 'x', strand_id: 'a', week: 1, level: 'introduced', label: '', lesson_id: 'lesson_2' }] }), lessons);
    expect(unlabelled.strands[0]!.stations[0]!.target).toEqual({ text: 'Thesis workshop', href: '/lessons/lesson_2' });
    expect(unseen.stations[1]!.target).toEqual({ text: 'Timed answers' });
    expect(unseen.firstWeek).toBe(1);
    expect(unseen.masteredWeek).toBe(3);
    expect(model.strands[2]!.stations.map((s) => s.week)).toEqual([2]);
  });

  it('shows text, not links, when there is no lesson context', () => {
    const model = buildLinesModel(content());
    expect(model.strands[0]!.stations[0]!.target).toEqual({ text: 'Cold read' });
  });

  it('joins strands that share a lesson in the same week into an interchange, plus hand-made checkpoints', () => {
    const model = buildLinesModel(content(), lessons);
    expect(model.interchanges).toEqual([
      { week: 1, from: 0, to: 1, target: { text: 'Provocation', href: '/lessons/lesson_1' }, kind: 'lesson' },
      { week: 3, from: 1, to: 2, target: { text: 'Seminar' }, kind: 'checkpoint' }
    ]);
  });

  it('does not double a checkpoint that names the same lesson as an automatic interchange', () => {
    const model = buildLinesModel(
      content({ checkpoints: [{ id: 'cp', week: 1, label: 'Dup', lesson_id: 'lesson_1', strand_ids: ['a', 'c'] }] }),
      lessons
    );
    expect(model.interchanges.filter((i) => i.week === 1)).toHaveLength(1);
  });

  it('uses the transit map line colours as tokens, deep shades mixed toward depth', () => {
    expect(strandColour('wave')).toBe('var(--wave, #376fb7)');
    expect(strandColour('green_deep')).toBe('color-mix(in srgb, var(--success, #2f7a4f) 70%, var(--depth, #0a1536))');
    expect(nextColour(['wave', 'green'])).toBe('amber');
  });

  it('turns horizontal when strands would not get readable columns', () => {
    expect(chooseOrientation(1100, 5)).toBe('vertical');
    expect(chooseOrientation(390, 5)).toBe('horizontal');
    expect(chooseOrientation(700, 5)).toBe('horizontal');
  });

  it('lays out to the real width without overflowing it', () => {
    const model = buildLinesModel(content(), lessons);
    const v = verticalLayout(model, 900);
    expect(v.width).toBe(900);
    expect(Math.max(...v.colX) + v.colStep / 2).toBeLessThanOrEqual(900);
    expect(v.rowY[2]!).toBeGreaterThan(v.rowY[1]!);
    expect(v.termY).toBeGreaterThan(v.rowY[4]!);
    const h = horizontalLayout(model);
    expect(h.termX).toBeGreaterThan(h.colX[4]!);
    expect(h.rowY).toHaveLength(3);
  });

  it('renders links for lesson stations and text for the rest', () => {
    const block = { ...createBlock('curriculum_lines', 'cl2'), content: content() } as Parameters<typeof renderBlock>[0];
    const el = renderBlock(block, 'print', { unitLessons: lessons });
    const links = [...el.querySelectorAll('a.cl-link')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/lessons/lesson_1');
    expect(links).not.toContain(null);
    expect(el.textContent).toContain('Timed answers');
    expect(el.querySelector('.cl-legend')).not.toBeNull();
  });

  it('edits a cell from the grid', () => {
    const block = createBlock('curriculum_lines', 'cl3');
    if (block.block_type !== 'curriculum_lines') throw new Error('Expected curriculum_lines');
    let latest = block;
    const editor = createCurriculumLinesEditor(block, (next) => (latest = next), lessons);
    const empty = [...editor.querySelectorAll<HTMLButtonElement>('.cl-editor__cell--empty')][0]!;
    empty.click();
    const mastered = [...editor.querySelectorAll<HTMLButtonElement>('.cl-editor__levels button')].find((b) => b.textContent?.includes('mastered'))!;
    mastered.click();
    expect(latest.content.stations.length).toBe(block.content.stations.length + 1);
    expect(latest.content.stations.some((s) => s.level === 'mastered')).toBe(true);
  });
});
