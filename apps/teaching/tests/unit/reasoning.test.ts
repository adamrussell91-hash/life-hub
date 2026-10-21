import { beforeEach, describe, expect, it } from 'vitest';
import { reasoningSteps, reasoningWrite, LOGIC_CARDS } from '@/blocks/reasoning/content';
import { renderReasoningChart } from '@/blocks/reasoning/chart';
import { createReasoningWalk, emptyWalkState, renderReasoningPrint, type WalkState } from '@/blocks/reasoning/walk';
import type { LensLevel } from '@/blocks/lenses/types';
import { createBlock } from '@/blocks/create-block';
import { withLens } from '@/blocks/lenses/attachments';
import { REASONING, REASONING_ID } from '@/blocks/lenses/reasoning';
import { STEPPED_LENSES } from '@/blocks/lenses/registry';
import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';
import { ReasoningConfigSchema } from '@/schemas/lens';
import { createBlockEditor } from '@/blocks/editors';
import { withFormat } from '@/blocks/formats/registry';
import { pickKitOption } from './kit-filter';

const ids = (logic: Parameters<typeof reasoningSteps>[0], level: LensLevel) => reasoningSteps(logic, level).map((s) => s.id);
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Reasoning steps', () => {
  it('walks each logic type through its own steps at every level', () => {
    expect(ids('inductive', 'support')).toEqual(['e1', 'e2', 'pt', 'so']);
    expect(ids('inductive', 'core')).toEqual(['e1', 'e2', 'e3', 'pt', 'so']);
    expect(ids('inductive', 'extend')).toEqual(['e1', 'e2', 'e3', 'pt', 'so', 'br']);
    expect(ids('abductive', 'support')).toEqual(['c1', 'c2', 'm1', 'be']);
    expect(ids('abductive', 'core')).toEqual(['c1', 'c2', 'c3', 'm1', 'm2', 'ts', 'be']);
    expect(ids('abductive', 'extend')).toEqual(['c1', 'c2', 'c3', 'm1', 'm2', 'ts', 'be', 'wr']);
    expect(ids('deductive', 'support')).toEqual(['r', 'cs', 'sm']);
    expect(ids('deductive', 'core')).toEqual(['r', 'cs', 'sm']);
    expect(ids('deductive', 'extend')).toEqual(['r', 'cs', 'sm', 'hp']);
  });
  it('chains All three in proof order with prefixed ids', () => {
    const chain = ids('all_three', 'core');
    expect(chain[0]).toBe('inductive.e1');
    expect(chain.indexOf('abductive.c1')).toBeGreaterThan(chain.indexOf('inductive.so'));
    expect(chain.indexOf('deductive.r')).toBeGreaterThan(chain.indexOf('abductive.be'));
  });
  it('gives every Support step an example and every writing step a starter, in plain words', () => {
    for (const logic of ['inductive', 'abductive', 'deductive'] as const) {
      for (const step of reasoningSteps(logic, 'support')) {
        expect(step.example, step.id).toMatch(/\w/);
        if (step.kind === 'text') expect(step.starter, step.id).toContain('___');
        expect(step.title).not.toMatch(/\bcase\b/i);
      }
    }
  });
  it('only checks steps that exist at that level', () => {
    for (const level of ['support', 'core', 'extend'] as const) {
      const steps = reasoningSteps('inductive', level);
      const pattern = steps.find((s) => s.id === 'pt')!;
      expect(pattern.checks).toEqual(steps.filter((s) => s.id.startsWith('e')).map((s) => s.id));
    }
  });
  it('gives a frame at Support and Core and a challenge at Extend', () => {
    for (const logic of ['inductive', 'abductive', 'deductive'] as const) {
      expect(reasoningWrite(logic, 'support').frame).toContain('___');
      expect(reasoningWrite(logic, 'core').frame).toContain('___');
      expect(reasoningWrite(logic, 'extend').frame).toBeUndefined();
      expect(reasoningWrite(logic, 'extend').challenge).toMatch(/sentences/);
    }
    expect(reasoningWrite('inductive', 'core').checklist).toContain('Uses probably, likely or possibly');
  });
  it('offers three cards from analytical to creative', () => {
    expect(LOGIC_CARDS.map((c) => c.value)).toEqual(['deductive', 'inductive', 'abductive']);
  });
});

describe('Reasoning chart', () => {
  const nodes = (chart: HTMLElement) => [...chart.querySelectorAll<HTMLElement>('.block-reasoning-chart__node')];
  it('draws one node per writing step, in columns, with the student’s words', () => {
    const steps = reasoningSteps('inductive', 'core');
    const chart = renderReasoningChart({ logic: 'inductive', steps, answers: { e1: 'Rue dies.' }, current: 'e2' });
    expect(chart.dataset.logic).toBe('inductive');
    const cols = [...chart.querySelectorAll('.block-reasoning-chart__col')].map((c) => c.querySelectorAll('.block-reasoning-chart__node').length);
    expect(cols).toEqual([3, 1, 1]);
    expect(nodes(chart)[0]!.classList.contains('block-reasoning-chart__node--done')).toBe(true);
    expect(nodes(chart)[0]!.textContent).toContain('Rue dies.');
    expect(nodes(chart)[1]!.classList.contains('block-reasoning-chart__node--now')).toBe(true);
    expect(nodes(chart)[2]!.classList.contains('block-reasoning-chart__node--ghost')).toBe(true);
    expect(chart.textContent).toContain('Specific');
  });
  it('marks examples the pattern fits', () => {
    const steps = reasoningSteps('inductive', 'support');
    const chart = renderReasoningChart({ logic: 'inductive', steps, answers: { e1: 'a', e2: 'b' }, fits: new Set(['e2']) });
    expect(nodes(chart)[1]!.textContent).toContain('✓ fits');
    expect(nodes(chart)[0]!.textContent).not.toContain('✓ fits');
  });
  it('links every clue to every maybe, and skips the test step', () => {
    const steps = reasoningSteps('abductive', 'core');
    const chart = renderReasoningChart({ logic: 'abductive', steps, answers: {} });
    expect(nodes(chart)).toHaveLength(6);
    const firstLinks = chart.querySelector('.block-reasoning-chart__links')!;
    expect(firstLinks.querySelectorAll('path')).toHaveLength(6);
  });
  it('prints empty nodes with ruled lines', () => {
    const steps = reasoningSteps('deductive', 'core');
    const chart = renderReasoningChart({ logic: 'deductive', steps, answers: { r: 'kept' }, print: true });
    expect(chart.textContent).not.toContain('kept');
    expect(chart.querySelectorAll('.block-reasoning-chart__line').length).toBeGreaterThan(0);
  });
});

describe('Reasoning walk', () => {
  const buttons = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>('button')];
  const press = (root: ParentNode, text: string | RegExp) => {
    const b = buttons(root).find((x) => (typeof text === 'string' ? x.textContent?.trim() === text : text.test(x.textContent ?? '')));
    expect(b, String(text)).toBeTruthy();
    b!.click();
  };
  const type = (root: ParentNode, value: string) => {
    const box = root.querySelector<HTMLTextAreaElement>('.block-reasoning__box')!;
    box.value = value;
    box.dispatchEvent(new Event('input'));
  };
  function walk(logic: 'inductive' | 'abductive' | 'deductive' | 'choice', level: LensLevel = 'core', state: WalkState = emptyWalkState()) {
    let saves = 0;
    const root = createReasoningWalk({ logic, level, state, persist: () => { saves += 1; }, preview: false });
    document.body.append(root);
    return { root, state, saves: () => saves };
  }

  it('refuses Next until the step is answered, and the starter alone does not count', () => {
    const { root, state } = walk('inductive', 'support');
    expect(root.querySelector<HTMLTextAreaElement>('.block-reasoning__box')!.value).toBe('In ___, ___ happens to ___.');
    press(root, 'Next: Example 2');
    expect(root.querySelector('.block-reasoning__error')!.textContent).toBe('Write your answer first.');
    expect(state.step).toBe(0);
    type(root, 'At the last Games both tributes died.');
    expect(root.querySelector('.block-reasoning-chart__node--now')!.textContent).toContain('both tributes died');
    press(root, 'Next: Example 2');
    expect(state.step).toBe(1);
  });
  it('locks later tabs until earlier steps are answered', () => {
    const { root } = walk('deductive');
    const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('.kaplan-progress__step')];
    expect(tabs().map((t) => t.textContent)).toEqual(['Rule', 'This one', 'So it must', 'Write it down']);
    expect(tabs()[1]!.disabled).toBe(true);
    type(root, 'Every girl must go.');
    expect(tabs()[1]!.disabled).toBe(true);
    press(root, 'Next: This one');
    expect(tabs()[1]!.disabled).toBe(false);
  });
  it('ticks the pattern against each example and shows the fit on the chart', () => {
    const state = { ...emptyWalkState(), step: 2, answers: { e1: 'one', e2: 'two', pt: 'Every time.' } };
    const { root, saves } = walk('inductive', 'support', state);
    const ticks = root.querySelectorAll<HTMLInputElement>('.block-reasoning__checks input');
    expect(ticks).toHaveLength(2);
    ticks[1]!.click();
    expect(state.ticks['fit.pt.e2']).toBe(true);
    expect(saves()).toBeGreaterThan(0);
    const example2 = root.querySelector('[data-step="e2"]')!;
    expect(example2.textContent).toContain('✓ fits');
  });
  it('tests each maybe against each clue and counts what it explains', () => {
    const answers = { c1: 'drunk', c2: 'mocks', c3: 'helps', m1: 'cruel', m2: 'grief' };
    const { root, state } = walk('abductive', 'core', { ...emptyWalkState(), step: 5, answers });
    const grid = root.querySelector('.block-reasoning__grid')!;
    expect(grid.querySelectorAll('input')).toHaveLength(6);
    grid.querySelector<HTMLInputElement>('[aria-label="Maybe 2 explains Clue 3"]')!.click();
    expect(state.ticks['test.c3.m2']).toBe(true);
    expect(grid.textContent).toContain('Explains 1 of 3');
  });
  it('starts from the three cards when students choose', () => {
    const { root, state } = walk('choice');
    expect(root.querySelectorAll('.block-reasoning__card')).toHaveLength(3);
    root.querySelector<HTMLButtonElement>('.block-reasoning__card--abductive')!.click();
    expect(state.choice).toBe('abductive');
    expect(root.querySelector('.block-reasoning-chart')!.getAttribute('data-logic')).toBe('abductive');
  });
  it('shows the example at Support, behind a click at Core, and not at Extend', () => {
    expect(walk('inductive', 'support').root.querySelector('div.block-reasoning__example')).toBeTruthy();
    expect(walk('inductive', 'core').root.querySelector('details.block-reasoning__example')).toBeTruthy();
    expect(walk('inductive', 'extend').root.querySelector('.block-reasoning__example')).toBeNull();
  });
  it('ends in Write it down with the frame, the handover and a done button', () => {
    const answers = { r: 'rule', cs: 'case', sm: 'so' };
    let done = false;
    const state = { ...emptyWalkState(), step: 3, answers };
    const root = createReasoningWalk({ logic: 'deductive', level: 'core', state, persist: () => {}, preview: false, onDone: () => { done = true; } });
    expect(root.querySelector('.lens-frame')!.textContent).toContain('it must be that ___');
    expect(root.textContent).toContain('This page won’t keep your answer');
    press(root, 'I’ve written it down');
    expect(state.done).toBe(true);
    expect(done).toBe(true);
  });
  it('prints the empty chart, the questions and ruled lines', () => {
    const sheet = renderReasoningPrint('abductive', 'support');
    expect(sheet.querySelector('.block-reasoning-chart')).toBeTruthy();
    expect(sheet.textContent).toContain('For example');
    expect(sheet.querySelectorAll('.lens-lines__line').length).toBeGreaterThan(0);
    expect(renderReasoningPrint('choice', 'core').textContent).toContain('Circle one');
  });
});

describe('Reasoning lens', () => {
  function questionBlock(): Block {
    const block = createBlock('question_set', 'qset');
    if (block.block_type !== 'question_set') throw Error('wrong block');
    block.content.questions[0]!.prompt = 'Will Katniss survive the Games?';
    return block;
  }
  const attach = (config: Record<string, unknown>) => withLens(questionBlock(), REASONING_ID, config);

  it('is in the registry and defaults to Student’s choice at Core', () => {
    expect(STEPPED_LENSES).toContain(REASONING);
    const c = ReasoningConfigSchema.parse({});
    expect(c.logic).toBe('choice');
    expect(c.level).toBe('core');
    expect(REASONING.canAttach(createBlock('peer_feedback', 'pf'))).toBe(false);
  });
  it('saves on the block and reads back', () => {
    const block = REASONING.write(questionBlock(), REASONING.create(questionBlock()));
    expect(BlockSchema.safeParse(block).success).toBe(true);
    expect(REASONING.read(block)?.logic).toBe('choice');
  });
  it('opens the walk from the chip and keeps answers on this device', () => {
    const view = renderBlock(attach({ logic: 'inductive', level: 'support' }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector('.block-reasoning-chart')!.getAttribute('data-logic')).toBe('inductive');
    const box = view.querySelector<HTMLTextAreaElement>('.block-reasoning__box')!;
    box.value = 'Both tributes died.';
    box.dispatchEvent(new Event('input'));
    expect(JSON.stringify(localStorage)).toContain('Both tributes died.');
  });
  it('rebuilds the walk at the level the student picks', () => {
    const view = renderBlock(attach({ logic: 'abductive' }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelectorAll('.kaplan-progress__step')).toHaveLength(8);
    [...view.querySelectorAll<HTMLButtonElement>('.lens-levels__option')].find((b) => b.textContent === 'More help')!.click();
    expect(view.querySelectorAll('.kaplan-progress__step')).toHaveLength(5);
  });
  it('uses the teacher’s wording of a step', () => {
    const view = renderBlock(attach({ logic: 'deductive', prompts: { 'core.r': 'What law of Panem always applies?' } }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector('.block-reasoning .kaplan-workspace__step-title')!.textContent).toBe('What law of Panem always applies?');
  });
  it('prints the chart and ruled lines', () => {
    const sheet = renderBlock(attach({ logic: 'inductive' }), 'print');
    expect(sheet.querySelector('.block-reasoning-chart')).toBeTruthy();
    expect(sheet.querySelectorAll('.lens-lines__line').length).toBeGreaterThan(0);
  });
});

describe('Reasoning chart format', () => {
  function chartSet(): Extract<Block, { block_type: 'question_set' }> {
    const block = createBlock('question_set', 'qset');
    if (block.block_type !== 'question_set') throw Error('wrong block');
    const first = block.content.questions[0]!;
    return {
      ...block,
      content: {
        ...block.content,
        format: 'reasoning_chart',
        reasoning: { level: 'core', student_level: true },
        questions: [
          { ...first, id: 'q1', prompt: 'Will Katniss survive?', logic: 'inductive' },
          { ...first, id: 'q2', prompt: 'Why is Haymitch cruel?', logic: 'abductive' },
          { ...first, id: 'q3', prompt: 'Your pick.' }
        ]
      }
    };
  }
  it('keeps logic per question and the level through the schema and a format switch', () => {
    const block = chartSet();
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'question_set') throw Error('wrong block');
    expect(parsed.content.questions.map((q) => q.logic)).toEqual(['inductive', 'abductive', undefined]);
    const back = withFormat(withFormat(block, 'standard'), 'reasoning_chart');
    expect(back.content.reasoning).toEqual({ level: 'core', student_level: true });
    expect(back.content.questions[1]!.logic).toBe('abductive');
  });
  it('opens the first question’s walk and shows the others as charts to come back to', () => {
    const view = renderBlock(chartSet(), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    const questions = view.querySelectorAll('.block-question-set__question');
    expect(questions).toHaveLength(3);
    expect(questions[0]!.querySelector('.block-reasoning')).toBeTruthy();
    expect(questions[0]!.querySelector('.block-reasoning-chart')!.getAttribute('data-logic')).toBe('inductive');
    expect(questions[1]!.querySelector('.block-reasoning')).toBeNull();
    expect(questions[1]!.querySelector('.block-reasoning-chart')!.getAttribute('data-logic')).toBe('abductive');
    [...questions[2]!.querySelectorAll('button')].find((b) => b.textContent === 'Work on this question')!.click();
    expect(view.querySelector('[data-question-id="q3"] .block-reasoning__card')).toBeTruthy();
  });
  it('saves each question’s answers apart, on this device only', () => {
    const view = renderBlock(chartSet(), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    const box = view.querySelector<HTMLTextAreaElement>('.block-reasoning__box')!;
    box.value = 'District 12 lost again.';
    box.dispatchEvent(new Event('input'));
    const keys = Object.keys(localStorage).filter((k) => k.includes('reasoning_chart'));
    expect(keys.some((k) => k.endsWith('.q1'))).toBe(true);
    const teacher = renderBlock(chartSet(), 'teacher', {});
    expect(teacher.textContent).not.toContain('District 12 lost again.');
  });
  it('prints every question with its empty chart', () => {
    const sheet = renderBlock(chartSet(), 'print');
    expect(sheet.querySelectorAll('.block-reasoning-chart')).toHaveLength(2);
    expect(sheet.textContent).toContain('Circle one');
  });
  it('lets the teacher set each question’s logic in the editor', () => {
    let block: Block = chartSet();
    const editor = createBlockEditor(block, (next) => { block = next; }, () => block);
    document.body.append(editor);
    expect(editor.querySelector<HTMLElement>('.block-editor__fields')!.dataset.format).toBe('reasoning_chart');
    expect(editor.querySelector<HTMLElement>('.block-editor__reasoning-settings')!.hidden).toBe(false);
    pickKitOption(editor.querySelectorAll('.block-editor__question-logic')[2] as HTMLElement, 'deductive');
    pickKitOption(editor.querySelector('.block-editor__reasoning-level'), 'extend');
    if (block.block_type !== 'question_set') throw Error('wrong block');
    expect(block.content.questions.map((q) => q.logic)).toEqual(['inductive', 'abductive', 'deductive']);
    expect(block.content.reasoning?.level).toBe('extend');
  });
});
