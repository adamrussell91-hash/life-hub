import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { createBlockEditor } from '@/blocks/editors';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { blocksToSearchText } from '@/blocks/search-text';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { INSERT_MENU_DESCRIPTION, blockIconSrc } from '@/blocks/block-meta';
import {
  COMMUNITY_SKILLS,
  DISTINCTION_PAIR_BANK,
  THINKING_MOVE_PRESETS,
  TOOLKIT_SKILLS,
  TOOLKIT_TOOLS,
  TOOLKIT_VALUES,
  libraryItem
} from '@/toolkit/library';
import { moveBasis, moveSentence, syncMoveSteps } from '@/toolkit/content';
import { collectLessonThinking } from '@/toolkit/render';
import { setToolkitClasses } from '@/toolkit/class-context';
import type { Lesson } from '@/schemas/lesson';

const TOOLKIT_TYPES = [
  'toolkit_skill',
  'toolkit_tool',
  'toolkit_value',
  'thinking_move',
  'question_quadrant',
  'concept_features',
  'thinking_intentions',
  'thinking_reflection'
] as const;

const NOTE_TYPES = TOOLKIT_TYPES.filter((type) => type !== 'thinking_intentions');

const SENTINEL = 'TOOLKIT_TEACHER_SENTINEL_unit';

function withSentinel(block: Block): Block {
  const content = block.content as Record<string, unknown>;
  if (!('teacher_note' in content)) return block;
  return {
    ...block,
    content: {
      ...content,
      teacher_note: { ...(content.teacher_note as object), what: SENTINEL, run: [SENTINEL] },
      teacher_jots: { '': SENTINEL, class_a: SENTINEL }
    }
  } as Block;
}

function allToolkitBlocks(): Block[] {
  return [...TOOLKIT_TYPES, 'teacher_note' as const].map((type, index) =>
    withSentinel(createBlock(type, `tk_${index}`))
  );
}

beforeEach(() => {
  localStorage.clear();
  setToolkitClasses([]);
});

describe('Thinking Toolkit library', () => {
  it('holds exactly the Newington framework page items', () => {
    expect(TOOLKIT_SKILLS.map((item) => item.label)).toEqual([
      'Apply', 'Assess', 'Analyse', 'Calculate', 'Classify', 'Compare', 'Deduce', 'Define',
      'Describe', 'Evaluate', 'Examine', 'Explain', 'Identify', 'Infer', 'Justify', 'Summarise'
    ]);
    expect(TOOLKIT_TOOLS.map((item) => item.label)).toEqual([
      'Analogy', 'Argument', 'Counterargument', 'Counterexample', 'Criteria', 'Distinction',
      'Example', 'Generalisation', 'Implication', 'Question', 'Reasons', 'Suggestion'
    ]);
    expect(TOOLKIT_VALUES.map((item) => item.label)).toEqual([
      'Clarity', 'Accuracy', 'Precision', 'Breadth', 'Depth', 'Relevance', 'Significance',
      'Coherence', 'Cogency'
    ]);
    expect(TOOLKIT_SKILLS.filter((item) => item.tetrad).map((item) => item.label).sort()).toEqual([
      'Analyse', 'Evaluate', 'Explain', 'Justify'
    ]);
    expect(COMMUNITY_SKILLS).toHaveLength(16);
  });

  it('every link and preset points at a framework item', () => {
    for (const skill of TOOLKIT_SKILLS) {
      for (const id of [...skill.tools, ...skill.values]) expect(libraryItem(id), `${skill.id} → ${id}`).toBeDefined();
    }
    for (const tool of TOOLKIT_TOOLS) {
      for (const id of [...tool.skills, ...tool.pairs]) expect(libraryItem(id), `${tool.id} → ${id}`).toBeDefined();
    }
    for (const preset of THINKING_MOVE_PRESETS) {
      expect(libraryItem(preset.skill)?.kind).toBe('skill');
      expect(libraryItem(preset.value)?.kind).toBe('value');
      for (const id of preset.tools) expect(libraryItem(id)?.kind).toBe('tool');
    }
    expect(Object.keys(DISTINCTION_PAIR_BANK)).toEqual(['level1', 'level2', 'level3', 'maths', 'inquiry']);
  });

  it('records a source for every definition and note', () => {
    for (const item of [...TOOLKIT_SKILLS, ...TOOLKIT_TOOLS, ...TOOLKIT_VALUES]) {
      expect(item.definition_source.trim(), item.id).not.toBe('');
      expect(item.note.source.trim(), item.id).not.toBe('');
    }
  });
});

describe('Thinking Toolkit blocks', () => {
  it('every new block parses against the block schema', () => {
    for (const block of allToolkitBlocks()) {
      const parsed = BlockSchema.safeParse(block);
      expect(parsed.success, `${block.block_type}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('Teacher note blocks are always teacher-only, whatever is stored', () => {
    const block = createBlock('teacher_note', 'note_1');
    expect(block.visibility).toBe('teacher_only');
    const parsed = BlockSchema.parse({ ...block, visibility: 'student_teacher' });
    expect(parsed.visibility).toBe('teacher_only');
  });

  it('sits in its own picker group above Learning, with Teacher note in Basic', () => {
    const labels = BLOCK_GROUPS.map((group) => group.label);
    expect(labels.indexOf('Thinking Toolkit')).toBeLessThan(labels.indexOf('Learning'));
    expect(BLOCK_GROUPS.find((group) => group.label === 'Thinking Toolkit')?.types).toEqual([
      'thinking_intentions', 'toolkit_skill', 'toolkit_tool', 'toolkit_value', 'thinking_move',
      'question_quadrant', 'concept_features', 'thinking_reflection'
    ]);
    expect(BLOCK_GROUPS.find((group) => group.label === 'Basic')?.types).toContain('teacher_note');
    expect(HOMEPAGE_BLOCK_GROUPS.some((group) => group.label === 'Thinking Toolkit')).toBe(false);
    for (const type of [...TOOLKIT_TYPES, 'teacher_note' as const]) {
      expect(INSERT_MENU_DESCRIPTION[type].trim()).not.toBe('');
      const file = resolve(process.cwd(), 'public', blockIconSrc(type).replace(/^.*\/assets\//, 'assets/'));
      expect(() => readFileSync(file), file).not.toThrow();
    }
  });
});

describe('teacher content never reaches students (W2)', () => {
  it('filterBlocksForStudent strips notes and drops Teacher note blocks, nested too', () => {
    const blocks = allToolkitBlocks();
    const section = { ...createBlock('section', 'sec_1'), content: { title: 'S', blocks: allToolkitBlocks().map((block, i) => ({ ...block, id: `nested_${i}` })) } } as Block;
    const out = filterBlocksForStudent([...blocks, section]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain('"teacher_note"');
    expect(json).not.toContain('"teacher_jots"');
    expect(out.some((block) => block.block_type === ('teacher_note' as string))).toBe(false);
  });

  it('a stale draft Teacher note set to students is still dropped', () => {
    const stale = { ...createBlock('teacher_note', 'stale'), visibility: 'student_teacher' } as unknown as Block;
    expect(filterBlocksForStudent([stale])).toEqual([]);
  });

  it('the shared server fixture strips the same way on the client', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'fixtures/toolkit-teacher-strip.json'), 'utf8')
    ) as { sentinel: string; blocks: Block[] };
    const json = JSON.stringify(filterBlocksForStudent(fixture.blocks));
    expect(json).not.toContain(fixture.sentinel);
  });

  it('print never carries teacher notes', () => {
    const lesson = {
      id: 'lesson_tk',
      title: 'Toolkit',
      blocks: allToolkitBlocks()
    } as unknown as Lesson;
    const printed = renderPrintLesson(lesson);
    expect(printed.textContent).not.toContain(SENTINEL);
    expect(printed.querySelector('.tk-note')).toBeNull();
  });

  it('search text never indexes teacher notes or class notes', () => {
    const text = blocksToSearchText(allToolkitBlocks());
    expect(text).not.toContain(SENTINEL);
    expect(text).toContain('Justify');
  });

  it('student render has no teacher panel; teacher render does', () => {
    for (const block of allToolkitBlocks()) {
      const student = renderBlock(block, 'student');
      expect(student.querySelector('.tk-note:not([hidden])'), block.block_type).toBeNull();
      expect(student.textContent, block.block_type).not.toContain(SENTINEL);
    }
    for (const block of allToolkitBlocks().filter((b) => NOTE_TYPES.includes(b.block_type as never))) {
      const teacher = renderBlock(block, 'teacher');
      const note = teacher.querySelector('.tk-note');
      expect(note, block.block_type).not.toBeNull();
      expect(note?.textContent).toContain('Only you see this');
      expect(note?.textContent).toContain(SENTINEL);
    }
  });
});

describe('rendering', () => {
  it('never shows raw item ids or type names (D12)', () => {
    for (const block of allToolkitBlocks()) {
      for (const mode of ['teacher', 'student', 'print'] as const) {
        const text = renderBlock(block, mode).textContent ?? '';
        expect(text, `${block.block_type} ${mode}`).not.toMatch(/\b(skill|tool|value):[a-z]/);
        expect(text, `${block.block_type} ${mode}`).not.toContain('toolkit_');
      }
    }
  });

  it('reveals are real buttons whose label and hidden state follow aria-expanded (V1, V11, I2)', () => {
    const block = createBlock('toolkit_skill', 'skill_1');
    const el = renderBlock(block, 'student');
    const button = el.querySelector<HTMLButtonElement>('.tk-reveal__btn')!;
    expect(button.tagName).toBe('BUTTON');
    const panel = el.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toMatch(/^Show /);
    expect(panel.hidden).toBe(true);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toMatch(/^Hide /);
    expect(panel.hidden).toBe(false);
    button.click();
    expect(panel.hidden).toBe(true);
  });

  it('the distinction fork fills when its worked example is revealed', () => {
    const el = renderBlock(createBlock('toolkit_tool', 'tool_1'), 'student');
    const kind = el.querySelector('.tk-fork__slot[data-part="kind"] .tk-fork__slot-value')!;
    expect(kind.textContent).toBe('');
    const worked = [...el.querySelectorAll<HTMLButtonElement>('.tk-reveal__btn')].find((b) =>
      b.textContent?.includes('worked example')
    )!;
    worked.click();
    expect(kind.textContent).toBe('places of learning');
  });

  it('stress-test verdicts toggle aria-pressed and persist per device', () => {
    const block = createBlock('toolkit_tool', 'tool_g');
    const generalisation = {
      ...block,
      content: { ...(block.content as object), ...createToolContent('tool:generalisation') }
    } as Block;
    const el = renderBlock(generalisation, 'student', { lessonId: 'l1' });
    const pill = el.querySelector<HTMLButtonElement>('.tk-stress__pills [data-verdict="fails"]')!;
    pill.click();
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    const again = renderBlock(generalisation, 'student', { lessonId: 'l1' });
    expect(again.querySelector('.tk-stress__pills [data-verdict="fails"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('the value block lights its own value in the nine-value row', () => {
    const el = renderBlock(createBlock('toolkit_value', 'value_1'), 'student');
    const items = el.querySelectorAll('.tk-values__item');
    expect(items).toHaveLength(9);
    expect(el.querySelector('.tk-values__item.is-current')?.textContent).toBe('Precision');
  });

  it('Thinking move reads as the handbook phrase', () => {
    expect(moveSentence('skill:justify', ['tool:reasons', 'tool:example'], 'value:relevance')).toBe(
      'Justifying using reasons and example, judged for relevance.'
    );
    const el = renderBlock(createBlock('thinking_move', 'move_1'), 'student');
    expect(el.querySelectorAll('.tk-mini')).toHaveLength(3);
  });
});

describe('Thinking reflection (I3)', () => {
  it('fills chips from the page toolkit blocks', () => {
    const page = [createBlock('toolkit_tool', 'a'), createBlock('toolkit_value', 'b'), createBlock('thinking_reflection', 'c')];
    expect(collectLessonThinking(page)).toEqual({
      tools: ['tool:distinction'],
      values: ['value:precision'],
      community: []
    });
    const el = renderBlock(page[2]!, 'student', { pageBlocks: page });
    expect(el.textContent).toContain('Distinction');
    expect(el.textContent).toContain('Precision');
  });

  it('with no toolkit blocks, shows only the questions and no empty chip rows', () => {
    const block = createBlock('thinking_reflection', 'r');
    const el = renderBlock(block, 'student', { pageBlocks: [block] });
    expect(el.querySelector('.tk-links__row')).toBeNull();
    expect(el.textContent).toContain('Were our contributions clear, relevant, precise');
  });
});

describe('editors', () => {
  it('every toolkit editor mounts without a native select for small choices (I5)', () => {
    for (const block of allToolkitBlocks()) {
      const editor = createBlockEditor(block, () => {});
      const selects = [...editor.querySelectorAll('select')].filter(
        (select) => !select.classList.contains('block-editor__visibility')
      );
      expect(selects, block.block_type).toHaveLength(0);
    }
  });

  it('Teacher note editor has no visibility picker', () => {
    const editor = createBlockEditor(createBlock('teacher_note', 'n'), () => {});
    expect(editor.querySelector('.block-editor__visibility')).toBeNull();
  });

  it('class notes are saved per class', () => {
    setToolkitClasses([
      { id: 'class_a', label: '7A' },
      { id: 'class_b', label: '7B' }
    ]);
    let latest = createBlock('toolkit_skill', 'jot_1');
    const editor = createBlockEditor(latest, (next) => {
      latest = next;
    }, () => latest);
    const classB = [...editor.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find((b) => b.textContent === '7B')!;
    classB.click();
    const jot = editor.querySelector<HTMLTextAreaElement>('.tk-ed__jot')!;
    jot.value = 'Ran long with 7B';
    jot.dispatchEvent(new Event('input'));
    const jots = (latest.content as { teacher_jots?: Record<string, string> }).teacher_jots;
    expect(jots).toEqual({ class_b: 'Ran long with 7B' });
  });

  it('Thinking move keeps an edited note and offers a rebuild after the move changes', () => {
    const block = createBlock('thinking_move', 'move_e') as Extract<Block, { block_type: 'thinking_move' }>;
    const edited = {
      ...block,
      content: {
        ...block.content,
        tools: ['tool:reasons', 'tool:example'],
        steps: syncMoveSteps(['tool:reasons', 'tool:example'], block.content.steps, 'move_e'),
        teacher_note: { ...block.content.teacher_note!, what: 'My own words', edited: true },
        note_basis: moveBasis('skill:justify', ['tool:reasons'], 'value:relevance')
      }
    } as Block;
    const editor = createBlockEditor(edited, () => {});
    expect(editor.textContent).toContain('Rebuild note from library');
    expect(editor.querySelector<HTMLTextAreaElement>('.tk-ed__field textarea')).not.toBeNull();
  });

  it('syncMoveSteps keeps edited steps for tools still in the chain', () => {
    const block = createBlock('thinking_move', 'move_s') as Extract<Block, { block_type: 'thinking_move' }>;
    const steps = [{ ...block.content.steps[0]!, prompt: 'Edited' }];
    const next = syncMoveSteps(['tool:example', 'tool:reasons'], steps, 'move_s');
    expect(next.map((step) => step.tool)).toEqual(['tool:example', 'tool:reasons']);
    expect(next[1]!.prompt).toBe('Edited');
  });
});

describe('styles (S1/S4)', () => {
  it('every tk-* class the blocks emit has a rule in toolkit.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/toolkit.css'), 'utf8');
    const classes = new Set<string>();
    for (const block of allToolkitBlocks()) {
      for (const mode of ['teacher', 'student'] as const) {
        renderBlock(block, mode, { pageBlocks: allToolkitBlocks() })
          .querySelectorAll<HTMLElement>('[class]')
          .forEach((node) => node.classList.forEach((name) => name.startsWith('tk-') && classes.add(name)));
      }
    }
    const missing = [...classes].filter((name) => !new RegExp(`\\.${name}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });

  it('index.html loads the toolkit stylesheet', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('/src/styles/toolkit.css');
  });
});

import { toolContent } from '@/toolkit/content';
function createToolContent(id: string) {
  return toolContent(id, 'test');
}
