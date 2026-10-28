import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_GROUPS, createBlock } from '@/blocks/create-block';
import { buildBlockSchemaExamples, BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { withLens } from '@/blocks/lenses/attachments';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { attachedSleeves, canAddSleeve, SLEEVE_LENSES, sleeveById } from '@/blocks/lenses/registry';
import { attachCardSleeve, sleeveTarget } from '@/blocks/lenses/sleeve-convert';
import { storageKey } from '@/blocks/learning-activity';
import { renderBlock } from '@/blocks/render';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import type { Block } from '@/schemas/block';

// A second sleeve, so stacking can be tested whatever content has landed.
vi.mock('@/toolkit/sleeves/tools', async () => {
  const { VALUE_SLEEVES } = await vi.importActual<typeof import('@/toolkit/sleeves/values')>('@/toolkit/sleeves/values');
  const clarityText = VALUE_SLEEVES.find((item) => item.id === 'value:clarity')!;
  return { TOOL_SLEEVES: [{ ...clarityText, id: 'tool:distinction', goal: 'Show how two close ideas differ.' }] };
});

const CLARITY = 'sleeve:value:clarity';
const DISTINCTION = 'sleeve:tool:distinction';
const clarity = () => sleeveById(CLARITY)!;

function question(id = 'qset'): Block {
  const block = createBlock('question_set', id);
  if (block.block_type !== 'question_set') throw Error('wrong block');
  block.content.questions[0]!.prompt = 'How does Katniss show courage?';
  return block;
}
function sleeved(block: Block = question(), config = {}): Block {
  return clarity().write(block, { ...clarity().create(), ...config });
}
function oldCard(id = 'card'): Block {
  const card = createBlock('toolkit_value', id);
  (card.content as { item: string }).item = 'value:clarity';
  return card;
}
const click = (root: ParentNode, text: string): void => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  button!.click();
};

beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('sleeve lens', () => {
  it('registers only items with sleeve text, with lens ids under the attachment limit', () => {
    expect(SLEEVE_LENSES.map((lens) => lens.id)).toEqual(expect.arrayContaining([CLARITY, DISTINCTION]));
    // Library order: values before tools.
    expect(SLEEVE_LENSES.findIndex((lens) => lens.id === CLARITY)).toBeLessThan(SLEEVE_LENSES.findIndex((lens) => lens.id === DISTINCTION));
    for (const lens of SLEEVE_LENSES) expect(lens.id.length).toBeLessThanOrEqual(60);
  });

  it('reads, writes and removes through the shared lenses field, dropping blank overrides', () => {
    const block = sleeved(question(), { do: '  ', checks: ['', ' ', ''] });
    expect(block.lenses).toEqual([{ id: CLARITY, config: { level: 'support', student_level: true } }]);
    expect(clarity().read(block)).toEqual({ level: 'support', student_level: true });
    const custom = sleeved(question(), { level: 'extend', do: 'Read it aloud.', checks: ['', 'My own check', ''] });
    const text = clarity().content('extend', clarity().read(custom)!);
    expect(text.do).toBe('Read it aloud.');
    expect(text.checks[1]).toBe('My own check');
    expect(text.checks[0]).not.toBe('');
    // Overrides stay with the level they were written for.
    expect(clarity().content('support', clarity().read(custom)!).do).not.toBe('Read it aloud.');
    expect(clarity().remove(custom).lenses).toBeUndefined();
  });

  it('never attaches to the toolkit and thinking blocks themselves', () => {
    for (const type of ['toolkit_skill', 'toolkit_tool', 'toolkit_value', 'thinking_move', 'teacher_note', 'heading', 'section'] as const) {
      expect(clarity().canAttach(createBlock(type, `b_${type}`)), type).toBe(false);
    }
    expect(clarity().canAttach(question())).toBe(true);
    expect(clarity().canAttach(createBlock('callout', 'c'))).toBe(true);
  });

  it('holds at most two sleeves on one block, and the picker says so', () => {
    let block = sleeved();
    expect(canAddSleeve(block)).toBe(true);
    block = withLens(block, DISTINCTION, { level: 'support', student_level: true });
    expect(attachedSleeves(block).map((item) => item.lens.id)).toEqual([CLARITY, DISTINCTION]);
    expect(canAddSleeve(block)).toBe(false);
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    editor.querySelector<HTMLButtonElement>('.page-options__item')!.click();
    expect(editor.textContent).toContain('the most one block can hold');
    expect([...editor.querySelectorAll('.kaplan-lens-choice')].some((b) => b.textContent?.startsWith('Clarity'))).toBe(false);
  });
});

describe('sleeve view', () => {
  it('sits above the prompt and tints the host', () => {
    const view = renderBlock(sleeved(), 'student', { lessonId: 'lesson' });
    expect(view.classList.contains('has-sleeve')).toBe(true);
    expect(view.classList.contains('has-sleeve--value')).toBe(true);
    const sleeves = view.querySelector('.sleeves')!;
    const prompt = view.querySelector('.block-question-set__prompt')!;
    expect(sleeves.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.firstElementChild).toBe(sleeves);
    const bar = view.querySelector<HTMLButtonElement>('.sleeve__bar')!;
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    expect(bar.textContent).toContain('Clarity');
    expect(bar.textContent).toContain('Show how');
  });

  it('opens one sleeve at a time; each keeps its own colour', () => {
    const both = renderBlock(withLens(sleeved(), DISTINCTION, { level: 'support', student_level: true }), 'student');
    expect(both.classList.contains('has-sleeve--value')).toBe(true);
    expect(both.querySelector('.sleeve--tool')).toBeTruthy();
    const [a, b] = [...both.querySelectorAll<HTMLButtonElement>('.sleeve__bar')];
    a!.click();
    expect(a!.getAttribute('aria-expanded')).toBe('true');
    b!.click();
    expect(a!.getAttribute('aria-expanded')).toBe('false');
    expect(b!.getAttribute('aria-expanded')).toBe('true');
    expect([...both.querySelectorAll<HTMLElement>('.sleeve__body')].filter((body) => !body.hidden)).toHaveLength(1);
    b!.click();
    expect(b!.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the level switch with student labels, and hides it when the teacher turns it off', () => {
    const view = renderBlock(sleeved(), 'student');
    view.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    const pills = [...view.querySelectorAll<HTMLButtonElement>('.sleeve__level-option')];
    expect(pills.map((p) => p.textContent)).toEqual(['More help', 'Stretch']);
    expect(pills[0]!.getAttribute('aria-pressed')).toBe('true');
    pills[1]!.click();
    expect(view.querySelector('.sleeve__level-option[aria-pressed="true"]')!.textContent).toBe('Stretch');
    const locked = renderBlock(sleeved(question(), { student_level: false }), 'student');
    locked.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect(locked.querySelector('.sleeve__level')).toBeNull();
  });

  it('sends writing to the book: starters are text to copy, never typed into the answer box', () => {
    const view = renderBlock(sleeved(), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect(view.querySelector('button.sleeve__starter')).toBeNull();
    expect(view.querySelectorAll('span.sleeve__starter').length).toBeGreaterThan(1);
    expect([...view.querySelectorAll('.sleeve__book')].map((p) => p.textContent)).toEqual([
      'Write it in your book. Start with:', 'Tick what your book shows.'
    ]);
  });

  it('keeps ticks and the chosen level across a reload', () => {
    const first = renderBlock(sleeved(), 'student', { lessonId: 'lesson' });
    document.body.append(first);
    first.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    const boxes = [...first.querySelectorAll<HTMLInputElement>('.sleeve__checks input')];
    expect(boxes).toHaveLength(3);
    boxes[0]!.click();
    boxes[2]!.click();
    expect(first.querySelector('.sleeve__progress')!.textContent).toBe('2/3 checked');
    const again = renderBlock(sleeved(), 'student', { lessonId: 'lesson' });
    expect(again.querySelector('.sleeve__progress')!.textContent).toBe('2/3 checked');
    again.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect([...again.querySelectorAll<HTMLInputElement>('.sleeve__checks input')].map((b) => b.checked)).toEqual([true, false, true]);
    expect(localStorage.getItem(`${storageKey('lesson', 'qset')}.sleeve.value:clarity`)).toContain('"ticks"');
    click(again, 'Stretch');
    const third = renderBlock(sleeved(), 'student', { lessonId: 'lesson' });
    third.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect(third.querySelector('.sleeve__level-option[aria-pressed="true"]')!.textContent).toBe('Stretch');
  });

  it('prints the strip and three empty tick boxes', () => {
    const view = renderBlock(sleeved(), 'print');
    expect(view.querySelector('.sleeve--print .sleeve__chip')!.textContent).toBe('Clarity');
    expect(view.querySelectorAll('.sleeve--print .sleeve__box')).toHaveLength(3);
    expect(view.querySelector('.sleeve__body')).toBeNull();
  });

  it('gives teachers the library notes and students none', () => {
    const teacher = renderBlock(sleeved(), 'teacher');
    teacher.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect(teacher.querySelector('.sleeve__teacher')!.textContent).toContain('Easy to understand');
    const student = renderBlock(sleeved(), 'student');
    student.querySelector<HTMLButtonElement>('.sleeve__bar')!.click();
    expect(student.querySelector('.sleeve__teacher')).toBeNull();
    expect(student.textContent).not.toContain('Easy to understand');
  });
});

describe('teacher setup', () => {
  it('lists the Thinking toolkit in the lens picker and saves a sleeve', () => {
    let block = question();
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    editor.querySelector<HTMLButtonElement>('.page-options__item')!.click();
    expect([...editor.querySelectorAll('.kaplan-lens-group')].map((h) => h.textContent)).toContain('Thinking toolkit');
    expect(editor.querySelector('.kaplan-lens-subgroup')!.textContent).toBe('Values');
    const pick = [...editor.querySelectorAll<HTMLButtonElement>('.kaplan-lens-choice')].find((b) => b.textContent?.startsWith('Clarity'))!;
    pick.click();
    const move = editor.querySelector<HTMLTextAreaElement>('.kaplan-setup textarea')!;
    expect(move.placeholder).toBe(clarity().content('support', clarity().create()).do);
    move.value = 'Name the text.';
    move.dispatchEvent(new Event('input'));
    click(editor, 'Add sleeve');
    expect(clarity().read(block)).toMatchObject({ level: 'support', do: 'Name the text.' });
    expect(editor.querySelector('.kaplan-author__attached')!.textContent).toContain('Clarity');
  });
});

describe('retiring the old toolkit cards', () => {
  it('leaves the insert menu and Ann’s examples', () => {
    const offered = BLOCK_GROUPS.flatMap((group) => group.types);
    for (const type of ['toolkit_skill', 'toolkit_tool', 'toolkit_value']) {
      expect(offered).not.toContain(type);
      expect(buildBlockSchemaExamples()).not.toContain(`"block_type":"${type}"`);
    }
    expect(BLOCK_BUILD_RECIPES).toContain('sleeve:value:clarity');
  });

  it('still renders an old card, with Turn into a sleeve for the teacher only', () => {
    const card = oldCard();
    expect(renderBlock(card, 'student').querySelector('.sleeve-convert')).toBeNull();
    const teacher = renderBlock(card, 'teacher', { pageBlocks: [card] });
    click(teacher, 'Turn into a sleeve');
    expect(teacher.querySelector('.sleeve-convert__status')!.textContent).toBe('Add a question below this card first.');
  });

  it('finds the next block below that can wear the sleeve', () => {
    const blocks = [question('before'), oldCard(), createBlock('heading', 'h'), question('after')];
    expect(sleeveTarget(blocks, 'card')?.id).toBe('after');
    const result = attachCardSleeve(blocks, 'card')!;
    expect(clarity().read(result.blocks[3]!)).toBeTruthy();
    expect(clarity().read(result.blocks[0]!)).toBeUndefined();
  });

  it('attaches on the canvas and removes the card once the teacher confirms', () => {
    vi.stubGlobal('confirm', () => true);
    let blocks: Block[] = [oldCard(), question('after')];
    const host = document.createElement('div');
    document.body.append(host);
    mountBlockCanvas(host, { blocks, onChange: (next) => { blocks = next; }, idFactory: () => 'new' });
    click(host, 'Turn into a sleeve');
    expect(blocks.map((b) => b.id)).toEqual(['after']);
    expect(clarity().read(blocks[0]!)).toBeTruthy();
  });

  it('keeps the card when the teacher says no', () => {
    vi.stubGlobal('confirm', () => false);
    let blocks: Block[] = [oldCard(), question('after')];
    const host = document.createElement('div');
    document.body.append(host);
    mountBlockCanvas(host, { blocks, onChange: (next) => { blocks = next; }, idFactory: () => 'new' });
    click(host, 'Turn into a sleeve');
    expect(blocks.map((b) => b.id)).toEqual(['card', 'after']);
    expect(clarity().read(blocks[1]!)).toBeTruthy();
  });
});
