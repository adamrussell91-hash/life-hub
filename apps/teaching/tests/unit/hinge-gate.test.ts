import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from '@/schemas/block';
import { BlockSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { applyHingeGates, gatedHingeIds, gatesRest, HINGE_DONE, GATE_CHANGE } from '@/blocks/hinge-question/gate';
import type { HingeBlock } from '@/blocks/hinge-question/shared';
import { mountLessonMap } from '@/student/lesson-map';
import { apiPost } from '@/api/client';

vi.mock('@/api/client', async (real) => ({ ...(await real<typeof import('@/api/client')>()), apiPost: vi.fn() }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const hinge = (id: string, extra: Partial<HingeBlock['content']> = {}): HingeBlock => {
  const block = createBlock('hinge_question', id) as HingeBlock;
  const options = block.content.options.map((o, i) => ({ ...o, text: ['Recording 1', 'Recording 2', 'Both the same', 'Can’t tell'][i]! }));
  return { ...block, content: { ...block.content, prompt: 'Which recording is the A?', options, correct_id: options[0]!.id, ...extra } };
};
const text = (id: string) => ({ id, type: 'block', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Read this.</p>' } });
const section = (id: string, title: string, blocks: unknown[]) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title, blocks } });

/** A page shaped like the student lesson view: `.block` wrappers, sections holding their own. */
function page(blocks: unknown[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lesson-blocks';
  const build = (into: HTMLElement, list: unknown[]) => {
    for (const raw of list) {
      const b = raw as { id: string; content: { blocks?: unknown[] } };
      const wrap = document.createElement('div');
      wrap.className = 'block';
      wrap.dataset.blockId = b.id;
      if (Array.isArray(b.content.blocks)) {
        const inner = document.createElement('div');
        build(inner, b.content.blocks);
        wrap.append(inner);
      }
      into.append(wrap);
    }
  };
  build(root, blocks);
  document.body.append(root);
  return root;
}
const byId = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.block[data-block-id="${id}"]`)!;
const shown = (node: HTMLElement) => !node.closest('[data-gated-by]');
const done = (from: HTMLElement, blockId: string) => from.dispatchEvent(new CustomEvent(HINGE_DONE, { bubbles: true, detail: { blockId } }));

beforeEach(() => {
  vi.mocked(apiPost).mockReset();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('Hinge gate on a plain lesson', () => {
  it('is opt-in, independent only, and survives the schema and the student filter', () => {
    expect(gatesRest(hinge('h').content)).toBe(false);
    expect(gatesRest(hinge('h', { gate: true }).content)).toBe(false);
    expect(gatesRest(hinge('h', { pace: 'independent' }).content)).toBe(false);
    const gated = hinge('h', { pace: 'independent', gate: true });
    expect(gatesRest(gated.content)).toBe(true);
    const parsed = BlockSchema.parse(gated) as HingeBlock;
    expect(parsed.content.gate).toBe(true);
    const [student] = filterBlocksForStudent([parsed]) as HingeBlock[];
    expect(gatesRest(student!.content)).toBe(true);
  });

  it('finds gated hinges inside sections and columns', () => {
    const blocks = [
      text('t0'),
      section('s1', 'Listen', [hinge('h1', { pace: 'independent', gate: true }), hinge('h2', { pace: 'independent' })]),
      { id: 'c1', type: 'block', block_type: 'columns', content: { preset: 'halves', columns: [{ width: 6, blocks: [hinge('h3', { pace: 'independent', gate: true })] }] } }
    ];
    expect(gatedHingeIds(blocks)).toEqual(['h1', 'h3']);
  });

  it('hides what follows the hinge, in its section and after it, until the student finishes', () => {
    const blocks = [
      section('s1', 'Listen and compare', [text('a'), hinge('h1', { pace: 'independent', gate: true }), text('b')]),
      section('s2', 'The reveal', [text('c')]),
      text('d')
    ];
    const root = page(blocks);
    const changes = vi.fn();
    root.addEventListener(GATE_CHANGE, changes);
    applyHingeGates(root, blocks);
    expect(shown(byId(root, 'a'))).toBe(true);
    expect(shown(byId(root, 'h1'))).toBe(true);
    expect(shown(byId(root, 's1'))).toBe(true);
    expect(shown(byId(root, 'b'))).toBe(false);
    expect(shown(byId(root, 's2'))).toBe(false);
    expect(shown(byId(root, 'd'))).toBe(false);
    expect(root.querySelector('.hq-gate-note')!.textContent).toContain('rest of the lesson opens');
    expect(changes).toHaveBeenCalledTimes(1);

    // Some other block's finish changes nothing.
    done(byId(root, 'a'), 'zz');
    expect(shown(byId(root, 's2'))).toBe(false);

    done(byId(root, 'h1'), 'h1');
    for (const id of ['b', 's2', 'd']) {
      expect(shown(byId(root, id))).toBe(true);
      expect(byId(root, id).hidden).toBe(false);
    }
    expect(root.querySelector('.hq-gate-note')).toBeNull();
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('stacks gates, and leaves anything hidden for its own reasons hidden', () => {
    const blocks = [hinge('h1', { pace: 'independent', gate: true }), text('a'), hinge('h2', { pace: 'independent', gate: true }), text('b')];
    const root = page(blocks);
    byId(root, 'b').hidden = true;
    applyHingeGates(root, blocks);
    done(root, 'h1');
    expect(shown(byId(root, 'a'))).toBe(true);
    expect(shown(byId(root, 'h2'))).toBe(true);
    // Still behind the second gate.
    expect(shown(byId(root, 'b'))).toBe(false);
    done(root, 'h2');
    expect(shown(byId(root, 'b'))).toBe(true);
    expect(byId(root, 'b').hidden).toBe(true);
  });

  it('does nothing on a page with no gated hinge', () => {
    const blocks = [hinge('h1', { pace: 'independent' }), text('a')];
    const root = page(blocks);
    applyHingeGates(root, blocks);
    expect(root.querySelector('[data-gated-by], .hq-gate-note')).toBeNull();
  });

  it('the student block reports done once the server says they have finished', async () => {
    const block = hinge('h1', { pace: 'independent', gate: true });
    const [published] = filterBlocksForStudent([block]) as HingeBlock[];
    vi.mocked(apiPost).mockResolvedValueOnce({ phase: 'independent', first: null, retry: null, done: false });
    const node = renderBlock(published!, 'student', { lessonId: 'L1' });
    const heard = vi.fn();
    document.body.addEventListener(HINGE_DONE, (e) => heard((e as CustomEvent).detail.blockId));
    document.body.append(node);
    await flush();
    expect(heard).not.toHaveBeenCalled();

    node.querySelectorAll<HTMLButtonElement>('.hq-choice')[1]!.click();
    const reason = node.querySelector<HTMLTextAreaElement>('.hq-ind__reason')!;
    reason.value = 'It sounded more confident';
    reason.dispatchEvent(new Event('input'));
    vi.mocked(apiPost).mockResolvedValueOnce({
      phase: 'independent',
      first: { pick: block.content.options[1]!.id, sure: null, tier: 'mixup', note: '' },
      retry: null,
      done: true,
      correct_id: block.content.options[0]!.id
    });
    [...node.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Check my answer')!.click();
    await flush();
    await flush();
    expect(heard).toHaveBeenCalledWith('h1');
  });

  it('a student whose question will not load can carry on', async () => {
    const block = hinge('h1', { pace: 'independent', gate: true });
    const [published] = filterBlocksForStudent([block]) as HingeBlock[];
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('offline'));
    const node = renderBlock(published!, 'student', { lessonId: 'L1' });
    const heard = vi.fn();
    document.body.addEventListener(HINGE_DONE, heard);
    document.body.append(node);
    await flush();
    const carry = node.querySelector<HTMLButtonElement>('.hq-ind__carry')!;
    expect(carry.textContent).toBe('Carry on without answering');
    carry.click();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('an ungated independent hinge offers no carry-on', async () => {
    const [published] = filterBlocksForStudent([hinge('h1', { pace: 'independent' })]) as HingeBlock[];
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('offline'));
    const node = renderBlock(published!, 'student', { lessonId: 'L1' });
    document.body.append(node);
    await flush();
    expect(node.querySelector('.hq-ind__carry')).toBeNull();
  });

  it('the editor shows the gate tick only in independent mode and saves it', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(hinge('h1'), changed);
    const gate = editor.querySelector<HTMLElement>('.hq-editor__gate')!;
    expect(gate.hidden).toBe(true);
    [...editor.querySelectorAll<HTMLButtonElement>('.hq-editor__pace button')].find((b) => b.dataset.value === 'independent')!.click();
    expect(gate.hidden).toBe(false);
    const box = gate.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const content = changed.mock.calls.at(-1)![0].content;
    expect(content.gate).toBe(true);
    expect(content.pace).toBe('independent');
  });

  it('the teacher sees the gate is on', () => {
    vi.mocked(apiPost).mockResolvedValue({ phase: 'independent', students: [] });
    const node = renderBlock(hinge('h1', { pace: 'independent', gate: true }), 'teacher', { lessonId: 'L1' });
    expect(node.querySelector('.hq-gate-flag')!.textContent).toContain('Gate on');
  });

  it('the lesson map leaves gated parts off until the gate opens', () => {
    const blocks = [
      section('s1', 'Listen and compare', [hinge('h1', { pace: 'independent', gate: true })]),
      section('s2', 'Mark each one', [text('a')]),
      section('s3', 'The reveal', [text('b')])
    ] as unknown as Block[];
    const root = page(blocks);
    const content = document.createElement('div');
    root.replaceWith(content);
    content.append(root);
    const footer = document.createElement('nav');
    content.append(footer);
    applyHingeGates(root, blocks);
    const map = mountLessonMap({ lessonId: 'L1', classId: 'c1', blocks, content, before: footer, quiz: () => null, written: () => new Map(), headerOffset: () => 56 });
    const row = (id: string) => map.card!.querySelector<HTMLLIElement>(`.lm-check__row[data-section="${id}"]`)!;
    expect(row('s1').hidden).toBe(false);
    expect(row('s2').hidden).toBe(true);
    expect(row('s3').hidden).toBe(true);
    done(root, 'h1');
    expect(row('s2').hidden).toBe(false);
    expect(row('s3').hidden).toBe(false);
    map.dispose();
  });
});
