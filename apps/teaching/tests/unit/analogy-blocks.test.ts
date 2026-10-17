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
  ANALOGY_TYPES,
  analogyType,
  fluidAnalogyContent
} from '@/toolkit/analogy';
import { ANALOGY_MOVE_TYPES, analogyMove, type AnalogyMoveBlock, type AnalogyMoveType } from '@/toolkit/analogy-moves';
import type { Lesson } from '@/schemas/lesson';

type Fluid = Extract<Block, { block_type: 'fluid_analogy' }>;

const MOVE_TYPES = [...ANALOGY_MOVE_TYPES];
const ANALOGY_BLOCK_TYPES = ['fluid_analogy', 'analogy_types', ...MOVE_TYPES] as const;
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
  return ANALOGY_BLOCK_TYPES.map((type, index) => withSentinel(createBlock(type, `an_${index}`)));
}

function fluid(id: string, kind: string, patch: Partial<Fluid['content']> = {}): Fluid {
  const block = createBlock('fluid_analogy', id) as Fluid;
  return { ...block, content: { ...fluidAnalogyContent(kind, id), ...patch } };
}

function shownTier(view: HTMLElement): HTMLElement {
  return [...view.querySelectorAll<HTMLElement>('.an-tier')].find((panel) => !panel.hidden)!;
}

beforeEach(() => {
  localStorage.clear();
});

describe('Fluid analogy library', () => {
  it('holds the seven types in order, easiest first', () => {
    expect(ANALOGY_TYPES.map((type) => [type.order, type.label])).toEqual([
      [1, 'Analogical Close Reading'],
      [2, 'Pattern Translation'],
      [3, 'Reverse Analogising'],
      [4, 'Analogical Problem Solving'],
      [5, 'Metaphorical Analysis'],
      [6, 'Conceptual Transfer'],
      [7, 'Analogical Chains']
    ]);
    expect(ANALOGY_LEVELS.map((level) => level.name)).toEqual(['Make it', 'Explain it', 'Use it']);
  });

  it('gives every type three complete levels', () => {
    for (const type of ANALOGY_TYPES) {
      expect(type.tiers, type.id).toHaveLength(3);
      type.tiers.forEach((tier, index) => {
        const where = `${type.id} level ${index + 1}`;
        expect(tier.task.trim(), where).not.toBe('');
        expect(tier.example.trim(), where).not.toBe('');
        expect(tier.steps.length, where).toBeGreaterThanOrEqual(2);
        expect(tier.steps.length, where).toBeLessThanOrEqual(3);
        for (const step of tier.steps) {
          expect(step.title.trim(), where).not.toBe('');
          expect(step.prompt.trim(), where).not.toBe('');
        }
      });
      expect(type.note.what.trim(), type.id).not.toBe('');
      expect(type.note.extra, type.id).toHaveLength(3);
    }
    expect(ANALOGY_CHECKS).toHaveLength(5);
    expect(ANALOGY_PROCESS).toHaveLength(5);
  });

  it('keeps each level short enough to sit well inside half a page', () => {
    for (const type of ANALOGY_TYPES) {
      type.tiers.forEach((tier, index) => {
        const words = [tier.task, ...tier.steps.flatMap((step) => [step.title, step.prompt])]
          .join(' ')
          .split(/\s+/).length;
        expect(words, `${type.id} level ${index + 1}`).toBeLessThanOrEqual(75);
      });
    }
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

describe('Fluid analogy blocks', () => {
  it('sit in their own picker group after the Thinking Toolkit', () => {
    const labels = BLOCK_GROUPS.map((group) => group.label);
    expect(labels.indexOf('Analogous Thinking')).toBe(labels.indexOf('Thinking Toolkit') + 1);
    expect(BLOCK_GROUPS.find((group) => group.label === 'Analogous Thinking')?.types).toEqual([
      'analogy_types',
      'analogy_close_reading',
      'analogy_pattern',
      'analogy_reverse',
      'analogy_problem',
      'analogy_metaphor',
      'analogy_transfer',
      'analogy_chains'
    ]);
    // The earlier one-block version still renders saved lessons but is no longer offered.
    expect(BLOCK_GROUPS.some((group) => (group.types as string[]).includes('fluid_analogy'))).toBe(false);
    expect(HOMEPAGE_BLOCK_GROUPS.some((group) => group.label === 'Analogous Thinking')).toBe(false);
    expect(MOVE_TYPES.map((type) => NEW_BLOCK_LABEL[type])).toEqual([
      'Close Reading',
      'Pattern Translation',
      'Reverse Analogising',
      'Problem Solving',
      'Metaphorical Analysis',
      'Conceptual Transfer',
      'Analogical Chains'
    ]);
    expect(NEW_BLOCK_LABEL.analogy_types).toBe('Analogy types');
    for (const type of ANALOGY_BLOCK_TYPES) {
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

  it('a new fluid analogy starts at Close Reading, Level 1, with all three levels filled', () => {
    const block = createBlock('fluid_analogy', 'fresh') as Fluid;
    const first = ANALOGY_TYPES[0]!;
    expect(block.content.kind).toBe(first.id);
    expect(block.content.level).toBe(1);
    expect(block.content.student_choice).toBe(true);
    expect(block.content.tiers.map((tier) => tier.task)).toEqual(first.tiers.map((tier) => tier.task));
    const ids = block.content.tiers.flatMap((tier) => tier.steps.map((step) => step.id));
    expect(new Set(ids).size).toBe(ids.length);
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

  it('the shared server fixture covers both blocks', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/toolkit-teacher-strip.json'), 'utf8')
    ) as { sentinel: string; blocks: Block[] };
    const types = fixture.blocks.map((block) => block.block_type);
    for (const type of ANALOGY_BLOCK_TYPES) expect(types).toContain(type);
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

  it('never shows raw ids or type names', () => {
    for (const block of allAnalogyBlocks()) {
      for (const mode of ['teacher', 'student', 'print'] as const) {
        const text = renderBlock(block, mode).textContent ?? '';
        expect(text, `${block.block_type} ${mode}`).not.toMatch(/analogy:[a-z]/);
        expect(text, `${block.block_type} ${mode}`).not.toMatch(/fluid_analogy|analogy_[a-z]/);
      }
    }
  });
});

describe('Fluid analogy block', () => {
  it('opens at the teacher’s level with its task and framed steps', () => {
    const view = renderBlock(fluid('lv_open', 'analogy:reverse', { level: 2 }), 'student');
    expect(view.querySelector('.an-eyebrow')?.textContent).toBe('Fluid analogy · Type 3 of 7');
    const pressed = view.querySelector('.an-levels__btn[aria-pressed="true"]');
    expect(pressed?.textContent).toContain('Level 2');
    const tier = shownTier(view);
    const level2 = analogyType('analogy:reverse')!.tiers[1]!;
    expect(tier.querySelector('.tk-guide')?.textContent).toContain(level2.task);
    expect([...tier.querySelectorAll('.an-step__title')].map((node) => node.textContent)).toEqual(
      level2.steps.map((step) => step.title)
    );
    expect(tier.querySelector('.an-step__frame')?.textContent).toBe(level2.steps[0]!.prompt);
    expect(view.querySelectorAll('.an-tier:not([hidden])')).toHaveLength(1);
  });

  it('lets students step between levels, and remembers where they were', () => {
    const block = fluid('lv_switch', 'analogy:chains');
    const view = renderBlock(block, 'student', { lessonId: 'lesson_x' });
    const buttons = [...view.querySelectorAll<HTMLButtonElement>('.an-levels__btn')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Level 1Make it', 'Level 2Explain it', 'Level 3Use it']);
    buttons[2]!.click();
    expect(shownTier(view).dataset.level).toBe('3');
    expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true');
    const again = renderBlock(block, 'student', { lessonId: 'lesson_x' });
    expect(shownTier(again).dataset.level).toBe('3');
  });

  it('shows a fixed level, with no switch, when the teacher locks it', () => {
    const view = renderBlock(fluid('lv_lock', 'analogy:pattern', { level: 3, student_choice: false }), 'student');
    expect(view.querySelector('.an-levels')).toBeNull();
    expect(view.querySelector('.an-level-badge')?.textContent).toBe('Level 3 · Use it');
    expect(view.querySelectorAll('.an-tier')).toHaveLength(1);
  });

  it('keeps the example and the check behind buttons; print shows only the check', () => {
    const block = fluid('lv_reveal', 'analogy:close_reading');
    const view = renderBlock(block, 'student');
    const tier = shownTier(view);
    const example = tier.querySelector<HTMLButtonElement>('.tk-reveal__btn');
    expect(example?.textContent).toBe('Show an example');
    const panel = tier.querySelector<HTMLElement>('.tk-reveal__body');
    expect(panel?.hidden).toBe(true);
    example!.click();
    expect(panel?.textContent).toContain('chess sacrifice');
    const check = [...view.querySelectorAll<HTMLButtonElement>('.tk-reveal__btn')].find(
      (button) => button.textContent === 'Check your analogy'
    );
    expect(check).toBeDefined();

    const printed = renderBlock(block, 'print');
    expect(printed.querySelector('.tk-reveal')).toBeNull();
    expect(printed.querySelector('.an-levels')).toBeNull();
    expect(printed.querySelectorAll('.an-tier')).toHaveLength(1);
    expect(printed.textContent).toContain('Check your analogy');
  });

  it('shows the deck card name only when asked, and the focus when set', () => {
    expect(renderBlock(fluid('c1', 'analogy:metaphor'), 'student').textContent).not.toContain('Glimmsprite');
    const view = renderBlock(fluid('c2', 'analogy:metaphor', { show_card: true, focus: 'The fruitless crown' }), 'student');
    expect(view.textContent).toContain('Card 5 · Glimmsprite');
    expect(view.querySelector('.an-focus')?.textContent).toContain('The fruitless crown');
  });

  it('changing the type keeps the focus, level settings and the teacher’s notes', () => {
    let latest = fluid('lv_edit', 'analogy:close_reading', {
      focus: 'The fruitless crown',
      level: 2,
      student_choice: false,
      teacher_jots: { '': 'Year 10 loved this' }
    });
    const editor = createBlockEditor(latest, (next) => {
      latest = next as Fluid;
    }, () => latest);
    editor.querySelector<HTMLButtonElement>('[data-kind="analogy:chains"]')!.click();
    expect(latest.content.kind).toBe('analogy:chains');
    expect(latest.content.label).toBe('Analogical Chains');
    expect(latest.content.tiers[2]!.task).toBe(analogyType('analogy:chains')!.tiers[2]!.task);
    expect(latest.content.focus).toBe('The fruitless crown');
    expect(latest.content.level).toBe(2);
    expect(latest.content.student_choice).toBe(false);
    expect(latest.content.teacher_jots).toEqual({ '': 'Year 10 loved this' });
  });

  it('edits the wording of each level separately', () => {
    let latest = fluid('lv_tier', 'analogy:pattern');
    const editor = createBlockEditor(latest, (next) => {
      latest = next as Fluid;
    }, () => latest);
    const levelToEdit = editor.querySelector('[aria-label="Level to edit"]')!;
    levelToEdit.querySelector<HTMLButtonElement>('[data-value="3"]')!.click();
    const task = [...editor.querySelectorAll<HTMLLabelElement>('label.tk-ed__field')]
      .find((label) => label.textContent?.startsWith('What to do'))!
      .querySelector('textarea')!;
    expect(task.value).toBe(analogyType('analogy:pattern')!.tiers[2]!.task);
    task.value = 'Find it in two fields.';
    task.dispatchEvent(new Event('input'));
    expect(latest.content.tiers[2]!.task).toBe('Find it in two fields.');
    expect(latest.content.tiers[0]!.task).toBe(analogyType('analogy:pattern')!.tiers[0]!.task);
  });
});

function move(type: AnalogyMoveType, id: string, patch: Partial<AnalogyMoveBlock['content']> = {}): AnalogyMoveBlock {
  const block = createBlock(type, id) as AnalogyMoveBlock;
  return { ...block, content: { ...block.content, ...patch } } as AnalogyMoveBlock;
}

function shownStage(view: HTMLElement): HTMLElement {
  return [...view.querySelectorAll<HTMLElement>('.an-stage')].find((panel) => !panel.hidden)!;
}

/** The organiser each block draws: one shape per type. */
const SHAPES: Record<AnalogyMoveType, string> = {
  analogy_close_reading: '.an-bridge',
  analogy_pattern: '.an-pattern',
  analogy_reverse: '.an-bench',
  analogy_problem: '.an-route',
  analogy_metaphor: '.an-ripple',
  analogy_transfer: '.an-transfer',
  analogy_chains: '.an-chain'
};

describe('The seven analogy blocks', () => {
  it('give each type its own block, in order, with three levels of boxes', () => {
    expect(MOVE_TYPES.map((type) => analogyMove(type).library.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const type of MOVE_TYPES) {
      const { stages } = analogyMove(type);
      expect(stages, type).toHaveLength(3);
      stages.forEach((stage, index) => {
        const where = `${type} level ${index + 1}`;
        expect(stage.task.trim(), where).not.toBe('');
        expect(stage.slots.length, where).toBeGreaterThanOrEqual(2);
        const keys = stage.slots.map((slot) => slot.key);
        expect(new Set(keys).size, where).toBe(keys.length);
        for (const slot of stage.slots) {
          expect(slot.label.trim(), `${where} ${slot.key}`).not.toBe('');
          expect(slot.frame.trim(), `${where} ${slot.key}`).not.toBe('');
          expect(slot.example.trim(), `${where} ${slot.key}`).not.toBe('');
        }
      });
    }
  });

  it('draw every library box somewhere in their organiser, at every level', () => {
    for (const type of MOVE_TYPES) {
      analogyMove(type).stages.forEach((stage, index) => {
        const view = renderBlock(move(type, `shape_${type}_${index}`, { level: index + 1, student_choice: false }), 'student');
        const organiser = view.querySelector(SHAPES[type]);
        expect(organiser, type).not.toBeNull();
        const drawn = [...organiser!.querySelectorAll<HTMLElement>('.an-box')].map((node) => node.dataset.slot);
        expect(drawn.sort(), `${type} level ${index + 1}`).toEqual(stage.slots.map((slot) => slot.key).sort());
      });
    }
  });

  it('shows the prompts, and fills the same boxes with the example on request', () => {
    const block = move('analogy_close_reading', 'mv_example');
    const view = renderBlock(block, 'student', { lessonId: 'lesson_mv' });
    const stage = shownStage(view);
    const organiser = stage.querySelector<HTMLElement>('.an-org')!;
    const toggle = stage.querySelector<HTMLButtonElement>('.an-stage__toggle')!;
    expect(toggle.textContent).toBe('Show an example');
    expect(organiser.classList.contains('is-example')).toBe(false);
    expect(organiser.querySelector('[data-slot="outside"] .an-box__frame')?.textContent).toBe('Something that works the same way');
    toggle.click();
    expect(organiser.classList.contains('is-example')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(organiser.querySelector('[data-slot="outside"] .an-box__example')?.textContent).toBe('A chess sacrifice');
    const again = renderBlock(block, 'student', { lessonId: 'lesson_mv' });
    expect(shownStage(again).querySelector('.an-org')?.classList.contains('is-example')).toBe(true);
  });

  it('lets students step between levels; the teacher can lock one', () => {
    const view = renderBlock(move('analogy_chains', 'mv_switch'), 'student');
    const buttons = [...view.querySelectorAll<HTMLButtonElement>('.an-levels__btn')];
    buttons[2]!.click();
    expect(shownStage(view).dataset.level).toBe('3');
    expect(shownStage(view).querySelectorAll('.an-node')).toHaveLength(5);
    expect(view.querySelectorAll('.an-stage:not([hidden])')).toHaveLength(1);

    const locked = renderBlock(move('analogy_pattern', 'mv_lock', { level: 2, student_choice: false }), 'student');
    expect(locked.querySelector('.an-levels')).toBeNull();
    expect(locked.querySelector('.an-level-badge')?.textContent).toBe('Level 2 · Explain it');
  });

  it('prints the empty organiser and the check, with no buttons', () => {
    const printed = renderBlock(move('analogy_transfer', 'mv_print', { level: 3 }), 'print');
    expect(printed.querySelector('button')).toBeNull();
    expect(printed.querySelectorAll('.an-stage')).toHaveLength(1);
    expect(printed.querySelectorAll('.an-test')).toHaveLength(3);
    expect(printed.textContent).toContain('Check your analogy');
  });

  it('marks the example’s verdict on the test bench', () => {
    const view = renderBlock(move('analogy_reverse', 'mv_verdict', { level: 3 }), 'student');
    const chips = [...view.querySelectorAll<HTMLElement>('.an-stage:not([hidden]) .an-verdict__chip')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Keep', 'Qualify', 'Drop']);
    expect(chips.filter((chip) => chip.classList.contains('is-example')).map((chip) => chip.textContent)).toEqual(['Qualify']);
  });

  it('hides a box the teacher cleared', () => {
    const block = move('analogy_close_reading', 'mv_clear', { level: 2, student_choice: false });
    block.content.levels[1]!.slots = block.content.levels[1]!.slots.map((slot) =>
      slot.key === 'limit' ? { ...slot, label: '', frame: '', example: '' } : slot
    );
    const view = renderBlock(block, 'student');
    expect(view.querySelector('[data-slot="limit"]')).toBeNull();
    expect(view.querySelector('[data-slot="insight"]')).not.toBeNull();
  });

  it('edits each level’s boxes separately and resets to the library', () => {
    let latest = move('analogy_metaphor', 'mv_edit', { focus: 'Argument', teacher_jots: { '': 'keep me' } });
    const editor = createBlockEditor(latest, (next) => {
      latest = next as AnalogyMoveBlock;
    }, () => latest);
    editor.querySelector('[aria-label="Level to edit"]')!.querySelector<HTMLButtonElement>('[data-value="3"]')!.click();
    const rival = [...editor.querySelectorAll<HTMLFieldSetElement>('fieldset.an-ed__slot')].find(
      (set) => set.querySelector('legend')?.textContent === 'A rival metaphor'
    )!;
    const example = [...rival.querySelectorAll<HTMLLabelElement>('label.tk-ed__field')]
      .find((label) => label.textContent?.startsWith('Example'))!
      .querySelector('textarea')!;
    example.value = 'A dance.';
    example.dispatchEvent(new Event('input'));
    expect(latest.content.levels[2]!.slots.find((slot) => slot.key === 'rival')?.example).toBe('A dance.');
    expect(latest.content.levels[0]!.slots.some((slot) => slot.example === 'A dance.')).toBe(false);
    expect(latest.block_type).toBe('analogy_metaphor');
  });

  it('shows the deck card name only when asked', () => {
    expect(renderBlock(move('analogy_metaphor', 'mv_c1'), 'student').textContent).not.toContain('Glimmsprite');
    const view = renderBlock(move('analogy_metaphor', 'mv_c2', { show_card: true, focus: 'The fruitless crown' }), 'student');
    expect(view.textContent).toContain('Card 5 · Glimmsprite');
    expect(view.querySelector('.an-eyebrow')?.textContent).toBe('Analogous Thinking · Type 5 of 7');
    expect(view.querySelector('.an-focus')?.textContent).toContain('The fruitless crown');
  });
});

describe('Analogy types block', () => {
  it('lists the seven types, the three levels, the process and the check', () => {
    const view = renderBlock(createBlock('analogy_types', 'types'), 'student');
    expect([...view.querySelectorAll('.an-types__name')].map((node) => node.textContent)).toEqual(
      ANALOGY_TYPES.map((type) => type.label)
    );
    expect([...view.querySelectorAll('.an-tiers__name')].map((node) => node.textContent)).toEqual([
      'Make it',
      'Explain it',
      'Use it'
    ]);
    expect(view.querySelectorAll('.an-process li')).toHaveLength(ANALOGY_PROCESS.length);
    expect(view.querySelectorAll('.an-checks li')).toHaveLength(ANALOGY_CHECKS.length);
    expect(view.textContent).toContain('Macbeth is like a lion because both are brave.');
  });

  it('marks the types chosen for this lesson', () => {
    const block = createBlock('analogy_types', 'types_hl') as Extract<Block, { block_type: 'analogy_types' }>;
    const chosen = { ...block, content: { ...block.content, types: ['analogy:reverse', 'analogy:chains'] } };
    const view = renderBlock(chosen, 'student');
    const marked = [...view.querySelectorAll('.an-types__item.is-chosen .an-types__name')].map((node) => node.textContent);
    expect(marked).toEqual(['Reverse Analogising', 'Analogical Chains']);
  });
});
