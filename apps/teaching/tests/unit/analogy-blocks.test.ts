import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, NEW_BLOCK_LABEL, createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { createBlockEditor } from '@/blocks/editors';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { blocksToSearchText } from '@/blocks/search-text';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { INSERT_MENU_DESCRIPTION, blockIconSrc } from '@/blocks/block-meta';
import {
  ANALOGY_CHECKS,
  ANALOGY_LEVELS,
  ANALOGY_PROCESS,
  analogyLevel,
  analogyLevelContent
} from '@/toolkit/analogy';
import type { Lesson } from '@/schemas/lesson';

const ANALOGY_TYPES = ['analogy_level', 'analogy_ladder'] as const;
const SENTINEL = 'ANALOGY_TEACHER_SENTINEL_unit';

function withSentinel(block: Block): Block {
  const content = block.content as Record<string, unknown>;
  return {
    ...block,
    content: {
      ...content,
      teacher_note: { ...(content.teacher_note as object), what: SENTINEL, run: [SENTINEL] },
      teacher_jots: { '': SENTINEL }
    }
  } as Block;
}

function allAnalogyBlocks(): Block[] {
  return ANALOGY_TYPES.map((type, index) => withSentinel(createBlock(type, `an_${index}`)));
}

function levelBlock(id: string, level: string): Extract<Block, { block_type: 'analogy_level' }> {
  const block = createBlock('analogy_level', id) as Extract<Block, { block_type: 'analogy_level' }>;
  return { ...block, content: analogyLevelContent(level) };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Analogous Thinking library', () => {
  it('holds the seven levels in order, from close reading to chains', () => {
    expect(ANALOGY_LEVELS.map((level) => [level.level, level.label])).toEqual([
      [1, 'Analogical Close Reading'],
      [2, 'Pattern Translation'],
      [3, 'Reverse Analogising'],
      [4, 'Analogical Problem Solving'],
      [5, 'Metaphorical Analysis'],
      [6, 'Conceptual Transfer'],
      [7, 'Analogical Chains']
    ]);
  });

  it('gives every level student wording, a frame, an example and a teacher note', () => {
    for (const level of ANALOGY_LEVELS) {
      for (const key of ['definition', 'guide', 'frame', 'example', 'helps', 'card_prompt', 'card', 'tag'] as const) {
        expect(level[key].trim(), `${level.id}.${key}`).not.toBe('');
      }
      expect(level.note.what.trim(), level.id).not.toBe('');
      expect(level.note.run.length, level.id).toBeGreaterThan(0);
      expect(level.note.say.length, level.id).toBeGreaterThan(0);
      expect(level.note.watch.length, level.id).toBeGreaterThan(0);
    }
    expect(ANALOGY_CHECKS).toHaveLength(5);
    expect(ANALOGY_PROCESS).toHaveLength(5);
  });

  it('never marks an analogy right or wrong', () => {
    const library = readFileSync(resolve(process.cwd(), 'src/toolkit/analogy.ts'), 'utf8');
    expect(library).not.toMatch(/\b(correct|answer|is_correct|isCorrect)\s*:/);
  });

  it('carries no student names or source tags', () => {
    const library = readFileSync(resolve(process.cwd(), 'src/toolkit/analogy.ts'), 'utf8');
    expect(library).not.toMatch(/Notion|\(p\d|Vin\b|Vincent|Declan|Ono\b/);
  });
});

describe('Analogous Thinking blocks', () => {
  it('sit in their own picker group after the Thinking Toolkit', () => {
    const labels = BLOCK_GROUPS.map((group) => group.label);
    expect(labels.indexOf('Analogous Thinking')).toBe(labels.indexOf('Thinking Toolkit') + 1);
    expect(BLOCK_GROUPS.find((group) => group.label === 'Analogous Thinking')?.types).toEqual([
      'analogy_ladder',
      'analogy_level'
    ]);
    expect(HOMEPAGE_BLOCK_GROUPS.some((group) => group.label === 'Analogous Thinking')).toBe(false);
    expect(NEW_BLOCK_LABEL.analogy_level).toBe('Analogy level');
    expect(NEW_BLOCK_LABEL.analogy_ladder).toBe('Analogy ladder');
    for (const type of ANALOGY_TYPES) {
      expect(INSERT_MENU_DESCRIPTION[type].trim()).not.toBe('');
      const file = resolve(process.cwd(), 'public', blockIconSrc(type).replace(/^.*\/assets\//, 'assets/'));
      expect(() => readFileSync(file), file).not.toThrow();
    }
  });

  it('every new block parses against the block schema', () => {
    for (const block of allAnalogyBlocks()) {
      const parsed = BlockSchema.safeParse(block);
      expect(parsed.success, `${block.block_type}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('a new level block starts at Level 1 with the library wording', () => {
    const block = createBlock('analogy_level', 'fresh') as Extract<Block, { block_type: 'analogy_level' }>;
    const first = ANALOGY_LEVELS[0]!;
    expect(block.content.level).toBe(first.id);
    expect(block.content.guide).toBe(first.guide);
    expect(block.content.frame).toBe(first.frame);
    expect(block.content.checks).toEqual([...ANALOGY_CHECKS]);
  });

  it('strips teacher notes for students, print and search', () => {
    const blocks = allAnalogyBlocks();
    expect(JSON.stringify(filterBlocksForStudent(blocks))).not.toContain(SENTINEL);
    expect(blocksToSearchText(blocks)).not.toContain(SENTINEL);
    expect(blocksToSearchText(blocks)).toContain('Analogical Close Reading');
    const printed = renderPrintLesson({ id: 'l_an', title: 'Analogy', blocks } as unknown as Lesson);
    expect(printed.textContent).not.toContain(SENTINEL);
    expect(printed.querySelector('.tk-note')).toBeNull();
  });

  it('the shared server fixture covers the analogy blocks', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/toolkit-teacher-strip.json'), 'utf8')
    ) as { sentinel: string; blocks: Block[] };
    const types = fixture.blocks.map((block) => block.block_type);
    for (const type of ANALOGY_TYPES) expect(types).toContain(type);
    expect(JSON.stringify(filterBlocksForStudent(fixture.blocks))).not.toContain(fixture.sentinel);
  });

  it('teacher render shows the teacher note; student render never does', () => {
    for (const block of allAnalogyBlocks()) {
      const student = renderBlock(block, 'student');
      expect(student.querySelector('.tk-note'), block.block_type).toBeNull();
      expect(student.textContent).not.toContain(SENTINEL);
      const teacher = renderBlock(block, 'teacher');
      expect(teacher.querySelector('.tk-note')?.textContent).toContain(SENTINEL);
    }
  });

  it('never shows raw level ids or type names', () => {
    for (const block of allAnalogyBlocks()) {
      for (const mode of ['teacher', 'student', 'print'] as const) {
        const text = renderBlock(block, mode).textContent ?? '';
        expect(text, `${block.block_type} ${mode}`).not.toMatch(/analogy:[a-z]/);
        expect(text, `${block.block_type} ${mode}`).not.toMatch(/analogy_(level|ladder)/);
      }
    }
  });
});

describe('Analogy level block', () => {
  it('shows where the level sits on the seven-step ladder', () => {
    const block = levelBlock('lv3', 'analogy:reverse');
    const view = renderBlock(block, 'student');
    expect(view.querySelector('.an-eyebrow')?.textContent).toContain('Level 3 of 7');
    const steps = [...view.querySelectorAll('.an-steps__step')];
    expect(steps).toHaveLength(7);
    expect(steps.filter((step) => step.classList.contains('is-reached'))).toHaveLength(3);
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
    expect(view.textContent).toContain('Reverse Analogising');
    expect(view.textContent).toContain('However, the analogy stops working when');
  });

  it('keeps the worked example behind a reveal and leaves it out of print', () => {
    const block = levelBlock('lv1', 'analogy:close_reading');
    const view = renderBlock(block, 'student');
    const button = view.querySelector<HTMLButtonElement>('.tk-reveal__btn');
    expect(button?.textContent).toBe('Show an example');
    const panel = view.querySelector<HTMLElement>('.tk-reveal__body');
    expect(panel?.hidden).toBe(true);
    button?.click();
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain('chess sacrifice');
    const printed = renderBlock(block, 'print');
    expect(printed.querySelector('.tk-reveal')).toBeNull();
    expect(printed.textContent).toContain('Check your analogy');
  });

  it('points to the next level, except at Level 7', () => {
    const second = renderBlock(levelBlock('lv2', 'analogy:pattern'), 'student');
    expect(second.querySelector('.an-next')?.textContent).toContain('Level 3: Reverse Analogising');
    const seventh = renderBlock(levelBlock('lv7', 'analogy:chains'), 'student');
    expect(seventh.querySelector('.an-next')).toBeNull();
  });

  it('shows the deck card name only when asked', () => {
    const block = levelBlock('lv5', 'analogy:metaphor');
    expect(renderBlock(block, 'student').textContent).not.toContain('Glimmsprite');
    const withCard = { ...block, content: { ...block.content, show_card: true } };
    expect(renderBlock(withCard, 'student').textContent).toContain('Card 5 · Glimmsprite');
  });

  it('shows the focus students work with', () => {
    const block = levelBlock('lv1f', 'analogy:close_reading');
    const focused = { ...block, content: { ...block.content, focus: 'Macbeth’s ambition' } };
    expect(renderBlock(focused, 'student').querySelector('.an-focus')?.textContent).toContain('Macbeth’s ambition');
  });

  it('changing the level keeps an edited focus and the teacher’s notes', () => {
    let latest = levelBlock('lv_edit', 'analogy:close_reading');
    latest = { ...latest, content: { ...latest.content, focus: 'The fruitless crown', teacher_jots: { '': 'Year 10 loved this' } } };
    const editor = createBlockEditor(latest, (next) => {
      latest = next as typeof latest;
    }, () => latest);
    const picker = editor.querySelector<HTMLButtonElement>('[data-level="analogy:chains"]');
    expect(picker).not.toBeNull();
    picker!.click();
    expect(latest.content.level).toBe('analogy:chains');
    expect(latest.content.label).toBe('Analogical Chains');
    expect(latest.content.frame).toBe(analogyLevel('analogy:chains')!.frame);
    expect(latest.content.focus).toBe('The fruitless crown');
    expect(latest.content.teacher_jots).toEqual({ '': 'Year 10 loved this' });
  });

  it('can swap in the short card wording for an on-the-spot task', () => {
    let latest = levelBlock('lv_card', 'analogy:chains');
    const editor = createBlockEditor(latest, (next) => {
      latest = next as typeof latest;
    }, () => latest);
    const button = [...editor.querySelectorAll('button')].find((b) => b.textContent === 'Use the short card wording');
    button!.click();
    expect(latest.content.guide).toBe(analogyLevel('analogy:chains')!.card_prompt);
  });
});

describe('Analogy ladder block', () => {
  it('lists all seven levels and the process and check students follow', () => {
    const view = renderBlock(createBlock('analogy_ladder', 'ladder'), 'student');
    const rungs = [...view.querySelectorAll('.an-ladder__rung')];
    expect(rungs.map((rung) => rung.querySelector('.an-ladder__name')?.textContent)).toEqual(
      ANALOGY_LEVELS.map((level) => level.label)
    );
    expect(view.querySelectorAll('.an-process li')).toHaveLength(ANALOGY_PROCESS.length);
    expect(view.querySelectorAll('.an-checks li')).toHaveLength(ANALOGY_CHECKS.length);
    expect(view.textContent).toContain('Macbeth is like a lion because both are brave.');
  });

  it('marks the levels chosen for this lesson', () => {
    const block = createBlock('analogy_ladder', 'ladder_hl') as Extract<Block, { block_type: 'analogy_ladder' }>;
    const chosen = { ...block, content: { ...block.content, levels: ['analogy:reverse', 'analogy:chains'] } };
    const view = renderBlock(chosen, 'student');
    const marked = [...view.querySelectorAll('.an-ladder__rung.is-chosen .an-ladder__name')].map((node) => node.textContent);
    expect(marked).toEqual(['Reverse Analogising', 'Analogical Chains']);
  });
});
