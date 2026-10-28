import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, NEW_BLOCK_LABEL } from '@/blocks/create-block';
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
  COMMUNITY_SKILL_DESCRIPTION,
  libraryItem
} from '@/toolkit/library';
import { cleanNote, moveBasis, moveSentence, syncMoveSteps } from '@/toolkit/content';
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
      for (const id of preset.tools) expect(libraryItem(id)?.kind).toBe('tool');
    }
    expect(Object.keys(DISTINCTION_PAIR_BANK)).toEqual(['level1', 'level3', 'maths', 'inquiry']);
  });

  it('loads a saved distinction block that chose the retired abstract pairs', () => {
    const block = createBlock('toolkit_tool', 'legacy_1');
    const saved = { ...block, content: { ...(block.content as object), pair_level: 'level2' } };
    const parsed = BlockSchema.parse(saved);
    expect((parsed.content as { pair_level: string }).pair_level).toBe('none');
  });

  it('renders a saved distinction block that still holds the retired abstract pairs', () => {
    const block = createBlock('toolkit_tool', 'legacy_2');
    const saved = { ...block, content: { ...(block.content as object), pair_level: 'level2' } } as typeof block;
    const el = renderBlock(saved, 'student');
    expect(el.querySelector('.block-unavailable')).toBeNull();
    expect(el.querySelector('.tk-fork')).not.toBeNull();
    expect(el.textContent).not.toContain('Pairs to try');
  });

  it('gives every item a plain description and something students can use', () => {
    for (const item of [...TOOLKIT_SKILLS, ...TOOLKIT_TOOLS, ...TOOLKIT_VALUES]) {
      expect(item.definition.trim(), item.id).not.toBe('');
    }
    for (const skill of TOOLKIT_SKILLS) expect(skill.steps.length, skill.id).toBeGreaterThan(0);
    for (const tool of TOOLKIT_TOOLS) {
      expect(tool.prompt.trim(), tool.id).not.toBe('');
      expect(tool.sentence.trim(), tool.id).not.toBe('');
    }
    for (const value of TOOLKIT_VALUES) expect(value.probes.length, value.id).toBeGreaterThan(0);
    for (const skill of COMMUNITY_SKILLS) expect(COMMUNITY_SKILL_DESCRIPTION[skill], skill).toBeTruthy();
  });

  it('shows no page references, source tags or outside frameworks', () => {
    const citation = /\(p\d|Handwritten|Notion|Philosothon|handbook|Cam \(|NESA|Paul|Elder \(|UQ Critical/i;
    const library = readFileSync(resolve(process.cwd(), 'src/toolkit/library.ts'), 'utf8');
    expect(library).not.toMatch(citation);
    for (const block of [...TOOLKIT_TYPES, 'teacher_note' as const].map((type, index) => createBlock(type, `src_${index}`))) {
      expect(JSON.stringify(block.content), block.block_type).not.toMatch(citation);
      const note = (block.content as { teacher_note?: { source: string; time: string } }).teacher_note;
      if (note) {
        expect(note.source).toBe('');
        expect(note.time).toBe('');
      }
    }
    for (const item of [...TOOLKIT_SKILLS, ...TOOLKIT_TOOLS, ...TOOLKIT_VALUES]) {
      expect(JSON.stringify(item), item.id).not.toMatch(citation);
    }
  });

  it('strips source tags from notes saved by the first release', () => {
    const old = {
      what: 'Tools in Use (p9): "Justifying a claim using reasons".',
      run: [],
      say: ['What makes a good one?'],
      watch: ['Teach these more explicitly. (Handwritten note, framework p10.)', 'Ask for counterexamples. (Notion workshop notes)'],
      extra_label: 'Strong participants (Philosothon 2026 marking guide)',
      extra: ['Allow others to speak.'],
      time: '',
      source: 'Workshop handbook p9',
      edited: false
    };
    const clean = cleanNote(old);
    expect(clean.what).toBe('');
    expect(clean.watch).toEqual(['Ask for counterexamples.']);
    expect(clean.extra_label).toBe('Strong participants');
    expect(clean.source).toBe('');
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

  it('sits in its own picker group above Learning, without the retired skill, tool and value cards, with Teacher note in Basic', () => {
    const labels = BLOCK_GROUPS.map((group) => group.label);
    expect(labels.indexOf('Thinking Toolkit')).toBeLessThan(labels.indexOf('Learning'));
    expect(BLOCK_GROUPS.find((group) => group.label === 'Thinking Toolkit')?.types).toEqual([
      'thinking_intentions', 'thinking_move',
      'question_quadrant', 'concept_features', 'continuum_line', 'thinking_reflection'
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
    const block = createBlock('toolkit_tool', 'reveal_1');
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
    const base = createBlock('toolkit_tool', 'tool_1') as Extract<Block, { block_type: 'toolkit_tool' }>;
    const withExample = {
      ...base,
      content: { ...base.content, worked: { kind: 'K', marker: 'M', a: 'A', b: 'B' }, worked_note: 'Note' }
    } as Block;
    const el = renderBlock(withExample, 'student');
    const kind = el.querySelector('.tk-fork__slot[data-part="kind"] .tk-fork__slot-value')!;
    expect(kind.textContent).toBe('');
    const worked = [...el.querySelectorAll<HTMLButtonElement>('.tk-reveal__btn')].find((b) =>
      b.textContent?.includes('worked example')
    )!;
    worked.click();
    expect(kind.textContent).toBe('K');
  });

  it('stress-test verdicts toggle aria-pressed and persist per device', () => {
    const block = createBlock('toolkit_tool', 'tool_g');
    const generalisation = {
      ...block,
      content: {
        ...(block.content as object),
        ...createToolContent('tool:generalisation'),
        frame: 'stress',
        statements: [{ id: 'g1', text: 'All swans are white.', verdict: 'fails', reason: 'R' }]
      }
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

describe('link chips', () => {
  it('open what a linked tool is, one at a time, and close on a second click', () => {
    const el = renderBlock(createBlock('toolkit_skill', 'skill_1'), 'student');
    const chips = [...el.querySelectorAll<HTMLButtonElement>('button.tk-chip')];
    expect(chips.length).toBeGreaterThan(1);
    const panel = el.querySelector<HTMLElement>('.tk-links__detail')!;
    expect(panel.hidden).toBe(true);
    expect(chips[0]!.getAttribute('aria-controls')).toBe(panel.id);

    chips[0]!.click();
    expect(chips[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.tk-links__detail-title')?.textContent).toBe(chips[0]!.textContent);
    expect(panel.querySelector('.tk-links__detail-text')?.textContent?.trim()).not.toBe('');

    chips[1]!.click();
    expect(chips[0]!.getAttribute('aria-expanded')).toBe('false');
    expect(panel.querySelector('.tk-links__detail-title')?.textContent).toBe(chips[1]!.textContent);

    chips[1]!.click();
    expect(panel.hidden).toBe(true);
    expect(chips[1]!.getAttribute('aria-expanded')).toBe('false');
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

  it('keeps one My notes box per block, and still shows older per-class notes', () => {
    setToolkitClasses([{ id: 'class_b', label: '7B' }]);
    let latest = createBlock('toolkit_skill', 'jot_1');
    const editor = createBlockEditor(latest, (next) => {
      latest = next;
    }, () => latest);
    expect(editor.querySelectorAll('.tk-ed__jot')).toHaveLength(1);
    const jot = editor.querySelector<HTMLTextAreaElement>('.tk-ed__jot textarea')!;
    jot.value = 'Ran long last time';
    jot.dispatchEvent(new Event('input'));
    expect((latest.content as { teacher_jots?: Record<string, string> }).teacher_jots).toEqual({ '': 'Ran long last time' });

    const legacy = { ...latest, content: { ...latest.content, teacher_jots: { '': 'Mine', class_b: 'Old 7B note' } } } as Block;
    const legacyEditor = createBlockEditor(legacy, () => {});
    expect(legacyEditor.querySelectorAll('.tk-ed__jot')).toHaveLength(2);
    expect(legacyEditor.textContent).toContain('My notes: 7B');
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
    expect(editor.textContent).toContain('Rebuild the note for this move');
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

describe('usable in a lesson', () => {
  it('names the picker items without a "Toolkit" prefix', () => {
    expect(NEW_BLOCK_LABEL.toolkit_skill).toBe('Skill');
    expect(NEW_BLOCK_LABEL.toolkit_tool).toBe('Tool');
    expect(NEW_BLOCK_LABEL.toolkit_value).toBe('Value');
    const text = renderBlock(createBlock('toolkit_skill', 'eyebrow_1'), 'student').textContent ?? '';
    expect(text).not.toContain('Thinking Toolkit');
  });

  it('every student-facing block opens with a "What to do" line', () => {
    for (const type of NOTE_TYPES) {
      const el = renderBlock(createBlock(type, `guide_${type}`), 'student');
      expect(el.querySelector('.tk-guide')?.textContent, type).toMatch(/^What to do\S/);
    }
  });

  it('a skill shows its question above "What to do"', () => {
    const block = createBlock('toolkit_skill', 'question_1');
    if (block.block_type !== 'toolkit_skill') throw new Error('expected a skill');
    block.content.context = 'Explain how the poem treats renewal.';
    const el = renderBlock(block, 'student');
    const question = el.querySelector('.tk-question')!;
    expect(question.querySelector('.tk-question__text')?.textContent).toBe('Explain how the poem treats renewal.');
    expect(question.compareDocumentPosition(el.querySelector('.tk-guide')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the teacher note starts closed and opens on click', () => {
    const el = renderBlock(createBlock('toolkit_skill', 'closed_1'), 'teacher');
    const toggle = el.querySelector<HTMLButtonElement>('.tk-note__toggle')!;
    const body = el.querySelector<HTMLElement>('.tk-note__body')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    toggle.click();
    expect(body.hidden).toBe(false);
  });

  it('Features of a Concept and Question Quadrant start empty, with an example to load', () => {
    const concept = createBlock('concept_features', 'lean_1') as Extract<Block, { block_type: 'concept_features' }>;
    expect(concept.content.concepts).toEqual([]);
    expect(concept.content.game.cards).toEqual([]);
    expect(concept.content.criteria).toEqual([]);
    let latest: Block = concept;
    const editor = createBlockEditor(concept, (next) => {
      latest = next;
    }, () => latest);
    const load = [...editor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Load the worked example'))!;
    load.click();
    expect((latest as typeof concept).content.concepts.length).toBeGreaterThan(0);

    const quadrant = createBlock('question_quadrant', 'lean_2') as Extract<Block, { block_type: 'question_quadrant' }>;
    expect(quadrant.content.stimulus).toBe('');
    expect(quadrant.content.questions).toEqual([]);
  });

  it('Thinking intentions explains every skill, tool, value and community skill it lists', () => {
    const base = createBlock('thinking_intentions', 'intent_1') as Extract<Block, { block_type: 'thinking_intentions' }>;
    const block = {
      ...base,
      content: {
        ...base.content,
        skills: ['skill:justify'],
        tools: ['tool:analogy'],
        values: ['value:clarity'],
        community: ['Actively listening']
      }
    } as Block;
    const el = renderBlock(block, 'student');
    const items = [...el.querySelectorAll('.tk-described__item')];
    expect(items).toHaveLength(4);
    for (const item of items) expect(item.querySelector('.tk-described__text')?.textContent?.trim()).toBeTruthy();
    expect(el.textContent).not.toContain('★');
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
